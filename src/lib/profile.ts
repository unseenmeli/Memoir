import { id } from "@instantdb/react-native";
import type { ImagePickerAsset } from "expo-image-picker";
import { db } from "./db";
import { withTimeout } from "./timeout";

export type ProfileRecord = {
  id: string;
  displayName: string;
  createdAt: number;
  avatar?: { id: string; url: string } | null;
};

/**
 * First-guess display name. Guests have no email, and `displayName` is unique
 * schema-wide — so falling back to a constant would put every guest in a race
 * for the same name. Seed theirs from their user id instead.
 */
function defaultDisplayName(userId: string, email: string): string {
  return email.split("@")[0] || `guest-${userId.slice(0, 6)}`;
}

/**
 * Ensures the signed-in user has a profile row, creating one if missing.
 * `displayName` is unique, so a colliding default gets a short suffix.
 * Returns the profile id.
 */
export async function ensureProfile(
  userId: string,
  email: string,
  existing: ProfileRecord | null | undefined,
): Promise<string> {
  if (existing) return existing.id;

  const profileId = id();
  const base = defaultDisplayName(userId, email);

  // Try the clean name first; on a uniqueness clash, fall back to a suffixed
  // one derived from the user id so the create can't loop forever.
  const candidates = [base, `${base}-${userId.slice(0, 4)}`];

  let lastError: unknown;
  for (const displayName of candidates) {
    try {
      await db.transact(
        db.tx.profiles[profileId]
          .update({ displayName, createdAt: Date.now() })
          .link({ user: userId }),
      );
      return profileId;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Could not create profile.");
}

/**
 * Renames the profile. Throws if the name is already taken (unique constraint),
 * which the caller surfaces to the user.
 */
export async function updateDisplayName(
  profileId: string,
  displayName: string,
): Promise<void> {
  await db.transact(
    db.tx.profiles[profileId].update({ displayName: displayName.trim() }),
  );
}

/**
 * Uploads a picked image as the profile avatar and links it, replacing any
 * previous avatar file so old blobs don't pile up in storage.
 */
export async function updateAvatar(
  userId: string,
  profileId: string,
  asset: ImagePickerAsset,
  previousAvatarId?: string | null,
): Promise<void> {
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const contentType = asset.mimeType ?? blob.type ?? "image/jpeg";
  const extension = contentType.split("/")[1] ?? "jpg";
  // Keyed by the owner's auth id, not the profile id: `$files` rules can only
  // compare `data.path` against `auth.id`, so the path prefix is what makes
  // this avatar un-deletable and un-overwritable by anyone else.
  const path = `${userId}/avatar.${extension}`;

  const { data } = await db.storage.uploadFile(path, blob, { contentType });

  await db.transact([
    db.tx.profiles[profileId].link({ avatar: data.id }),
    ...(previousAvatarId && previousAvatarId !== data.id
      ? [db.tx.$files[previousAvatarId].delete()]
      : []),
  ]);
}

/**
 * How many transaction operations to send at once when deleting an account.
 * A user at the 400-pin cap with a handful of photos each is several thousand
 * ops; one transaction that size is a good way to hit a server limit and fail
 * halfway with no idea what survived.
 */
const DELETE_CHUNK = 100;

export type DeletionSummary = { pins: number; files: number };

/**
 * Erases everything this user owns: pin photos, pins, avatar, profile row.
 *
 * Apple requires in-app account deletion for any app that supports account
 * creation (App Review Guideline 5.1.1(v)).
 *
 * IMPORTANT — this does NOT delete the `$users` record itself. Instant's
 * client SDK exposes no delete-user call and its runtime API has no endpoint
 * for one, so removing the account row (and freeing the email for re-use)
 * needs `@instantdb/admin` running somewhere trusted. Until that exists, a
 * deleted account leaves behind an empty user row holding only the email.
 * Everything the user actually created is gone.
 */
export async function deleteAccountData(
  userId: string,
): Promise<DeletionSummary> {
  // `queryOnce` rejects rather than hanging when the socket is down, which is
  // what we want: deleting half an account offline would be worse than saying
  // "not now".
  const { data } = await withTimeout(
    db.queryOnce({
      pins: { $: { where: { "owner.id": userId } }, photos: {} },
      profiles: { $: { where: { "user.id": userId } }, avatar: {} },
    }),
    "Looking up your data",
  );

  const pins = (data?.pins ?? []) as { id: string; photos?: { id: string }[] }[];
  const profiles = (data?.profiles ?? []) as {
    id: string;
    avatar?: { id: string } | null;
  }[];

  const fileIds = [
    ...pins.flatMap((pin) => (pin.photos ?? []).map((photo) => photo.id)),
    ...profiles.flatMap((p) => (p.avatar ? [p.avatar.id] : [])),
  ];

  // Same order deletePin uses: files first, then the rows that pointed at them.
  const ops = [
    ...fileIds.map((fileId) => db.tx.$files[fileId].delete()),
    ...pins.map((pin) => db.tx.pins[pin.id].delete()),
    ...profiles.map((profile) => db.tx.profiles[profile.id].delete()),
  ];

  for (let i = 0; i < ops.length; i += DELETE_CHUNK) {
    await withTimeout(
      db.transact(ops.slice(i, i + DELETE_CHUNK)),
      "Deleting your data",
    );
  }

  // Read back rather than trusting the writes — a partial failure must surface
  // as an error the user can retry, not as a cheerful "account deleted".
  const { data: leftover } = await withTimeout(
    db.queryOnce({
      pins: { $: { where: { "owner.id": userId } } },
      profiles: { $: { where: { "user.id": userId } } },
    }),
    "Confirming deletion",
  );
  const remaining =
    (leftover?.pins?.length ?? 0) + (leftover?.profiles?.length ?? 0);
  if (remaining > 0) {
    throw new Error(
      "Some of your data couldn't be deleted. Please try again.",
    );
  }

  return { pins: pins.length, files: fileIds.length };
}
