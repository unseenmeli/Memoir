import { id } from "@instantdb/react-native";
import type { ImagePickerAsset } from "expo-image-picker";
import { db } from "./db";

export type ProfileRecord = {
  id: string;
  displayName: string;
  createdAt: number;
  avatar?: { id: string; url: string } | null;
};

/** Local part of an email, used as a first-guess display name. */
function emailLocalPart(email: string): string {
  return email.split("@")[0] || "explorer";
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
  const base = emailLocalPart(email);

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
  profileId: string,
  asset: ImagePickerAsset,
  previousAvatarId?: string | null,
): Promise<void> {
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const contentType = asset.mimeType ?? blob.type ?? "image/jpeg";
  const extension = contentType.split("/")[1] ?? "jpg";
  const path = `avatars/${profileId}.${extension}`;

  const { data } = await db.storage.uploadFile(path, blob, { contentType });

  await db.transact([
    db.tx.profiles[profileId].link({ avatar: data.id }),
    ...(previousAvatarId && previousAvatarId !== data.id
      ? [db.tx.$files[previousAvatarId].delete()]
      : []),
  ]);
}
