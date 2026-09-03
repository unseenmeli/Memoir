import { SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import {
  invalidateProfile,
  invalidatePins,
  type ProfileRecord,
} from "./data";
import { deleteStoredPhotos, type StoredPhoto } from "./pins";
import { readImageBytes, removeFiles, uploadImage } from "./storage";
import { supabase } from "./supabase";
import { withTimeout } from "./timeout";

export type { ProfileRecord };

/** Avatars render at 90pt; anything past this is bytes nobody sees. */
const AVATAR_EDGE = 512;
const AVATAR_QUALITY = 0.8;

/**
 * Ensures the signed-in user has a profile row, creating one if missing.
 *
 * The work happens in Postgres (`public.ensure_profile`) rather than here.
 * `display_name` is unique account-wide, so picking a free one is a
 * read-then-write race that only a single statement can actually win — the old
 * client-side "try the clean name, then a suffixed one" dance could hand two
 * devices the same name at the same moment and fail both.
 *
 * The email is only a *suggestion* for the name: guests don't have one, and
 * the function falls back to a user-id-derived handle for them.
 */
export async function ensureProfile(email: string): Promise<void> {
  const desired = email.split("@")[0] || null;
  const { error } = await withTimeout(
    supabase.rpc("ensure_profile", { desired_name: desired }),
    "Setting up your profile",
  );
  if (error) throw new Error(error.message);
  invalidateProfile();
}

/**
 * Renames the profile. Throws if the name is already taken, which the caller
 * surfaces to the user.
 */
export async function updateDisplayName(
  profileId: string,
  displayName: string,
): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", profileId),
    "Saving your name",
  );
  if (error) {
    // 23505 is Postgres' unique violation. Its raw message names the index,
    // which is not something to put in front of somebody renaming themselves.
    throw new Error(
      error.code === "23505"
        ? "That name is taken — try another."
        : error.message,
    );
  }
  invalidateProfile();
}

/**
 * Uploads a picked image as the profile avatar, replacing any previous one so
 * old blobs don't pile up in storage.
 *
 * The object path carries a timestamp rather than being a fixed
 * `<user>/avatar.jpg`. Overwriting one stable key would leave the device's
 * image cache — which is keyed on the URL — happily showing the old face until
 * something evicted it.
 */
export async function updateAvatar(
  userId: string,
  profileId: string,
  asset: ImagePickerAsset,
  previousPath?: string | null,
): Promise<void> {
  // Keyed by the owner's id, not the profile id: storage policies compare the
  // object's first path segment against `auth.uid()`, so this prefix is what
  // makes the avatar un-deletable and un-overwritable by anyone else.
  const path = `${userId}/avatar/${Date.now()}.jpg`;

  const bytes = await readImageBytes(asset.uri, {
    maxEdge: AVATAR_EDGE,
    width: asset.width,
    height: asset.height,
    compress: AVATAR_QUALITY,
    format: SaveFormat.JPEG,
  });

  await withTimeout(
    uploadImage(path, bytes, "image/jpeg"),
    "Uploading your photo",
  );

  const { error } = await withTimeout(
    supabase.from("profiles").update({ avatar_path: path }).eq("id", profileId),
    "Saving your photo",
  );
  if (error) throw new Error(error.message);

  // Only after the row points at the new object — deleting first would leave a
  // profile with no picture at all if the update then failed.
  if (previousPath && previousPath !== path) {
    await removeFiles([previousPath]).catch(() => {});
  }

  invalidateProfile();
}

export type DeletionSummary = { pins: number; files: number };

/**
 * Erases the account and everything in it.
 *
 * Apple requires in-app account deletion for any app that supports account
 * creation (App Review Guideline 5.1.1(v)).
 *
 * The real work happens in the `delete-account` Edge Function, which runs with
 * a secret key and can do the one thing a client never can: remove the
 * `auth.users` row itself. That row is the root of every foreign key here, so
 * deleting it takes the profile, the pins and the photo rows with it. Under
 * Instant this was impossible from the app and a deleted account left an empty
 * user record behind holding the email.
 *
 * If the function isn't reachable, the client deletes everything it is allowed
 * to — which is all of the user's actual content, and exactly what the old
 * backend managed — rather than failing outright.
 */
export async function deleteAccountData(
  userId: string,
): Promise<DeletionSummary> {
  // Counted before anything is removed, so the caller can say what went.
  const summary = await countOwned(userId);

  const { error } = await withTimeout(
    supabase.functions.invoke("delete-account"),
    "Deleting your account",
  );
  // No invalidation on success: the account is gone, so a refetch would only
  // fire a doomed request with a JWT that no longer resolves to a user. The
  // caller signs out immediately after, which clears the cache outright.
  if (!error) return summary;

  await deleteOwnedData(userId);
  return summary;
}

async function countOwned(userId: string): Promise<DeletionSummary> {
  const [pins, files] = await Promise.all([
    supabase
      .from("pins")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
    supabase
      .from("pin_photos")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
  ]);
  return { pins: pins.count ?? 0, files: files.count ?? 0 };
}

/**
 * The fallback path: delete everything row level security lets this client
 * reach. Leaves the `auth.users` row, which only a secret key can remove.
 */
async function deleteOwnedData(userId: string): Promise<void> {
  const [photos, profile] = await Promise.all([
    withTimeout(
      // `provider` is load-bearing: pin photos live at Cloudinary now, and a
      // Cloudinary row's `path` is a public id rather than a storage key.
      // Selecting only `path` and pushing the lot through `removeFiles` — as
      // this did before the Cloudinary move — deletes nothing at Cloudinary
      // and raises no error, so every photo survived a deletion that reported
      // success.
      supabase.from("pin_photos").select("provider,path").eq("owner_id", userId),
      "Looking up your data",
    ),
    withTimeout(
      supabase
        .from("profiles")
        .select("avatar_path")
        .eq("user_id", userId)
        .maybeSingle(),
      "Looking up your data",
    ),
  ]);
  if (photos.error) throw new Error(photos.error.message);
  if (profile.error) throw new Error(profile.error.message);

  // Objects first, then the rows that name them — the other order loses track
  // of what to delete if it fails halfway.
  await withTimeout(
    deleteStoredPhotos((photos.data ?? []) as StoredPhoto[]),
    "Deleting your photos",
  );

  // The avatar is the one image still in Supabase Storage, so it goes direct.
  if (profile.data?.avatar_path) {
    await withTimeout(
      removeFiles([profile.data.avatar_path as string]),
      "Deleting your profile picture",
    );
  }

  // `pin_photos` goes with the pins on its own; the foreign key cascades.
  const deletedPins = await withTimeout(
    supabase.from("pins").delete().eq("owner_id", userId),
    "Deleting your pins",
  );
  if (deletedPins.error) throw new Error(deletedPins.error.message);

  const deletedProfile = await withTimeout(
    supabase.from("profiles").delete().eq("user_id", userId),
    "Deleting your profile",
  );
  if (deletedProfile.error) throw new Error(deletedProfile.error.message);

  // Read back rather than trusting the writes — a partial failure must surface
  // as an error the user can retry, not as a cheerful "account deleted".
  const leftover = await countOwned(userId);
  if (leftover.pins > 0 || leftover.files > 0) {
    throw new Error("Some of your data couldn't be deleted. Please try again.");
  }

  invalidatePins();
  invalidateProfile();
}
