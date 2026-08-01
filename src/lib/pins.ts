import { id } from "@instantdb/react-native";
import type { ImagePickerAsset } from "expo-image-picker";
import { fetchCountry } from "./country";
import { db } from "./db";

/** Per-user cap on how many pins someone can create. */
export const MAX_PINS_PER_USER = 400;

export type NewPinInput = {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  photos: ImagePickerAsset[];
};

/**
 * Uploads one picked image to Instant Storage and returns its $files id.
 * The file is stored under the pin's folder so a pin's photos stay grouped.
 */
async function uploadPhoto(
  pinId: string,
  asset: ImagePickerAsset,
  index: number,
): Promise<string> {
  // RN can turn a local file:// URI into a Blob via fetch.
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const contentType = asset.mimeType ?? blob.type ?? "image/jpeg";
  const extension = contentType.split("/")[1] ?? "jpg";
  const name = asset.fileName ?? `photo-${index}.${extension}`;
  const path = `pins/${pinId}/${index}-${name}`;

  const { data } = await db.storage.uploadFile(path, blob, { contentType });
  return data.id;
}

/**
 * Creates a pin: uploads its photos, then writes the pin and links it to its
 * owner and photos in a single transaction. Returns the new pin's id.
 */
export async function createPin(
  userId: string,
  input: NewPinInput,
): Promise<string> {
  const pinId = id();

  // Upload sequentially so a slow connection doesn't fire many large PUTs at
  // once; a pin rarely has more than a handful of photos.
  const fileIds: string[] = [];
  for (let i = 0; i < input.photos.length; i++) {
    fileIds.push(await uploadPhoto(pinId, input.photos[i], i));
  }

  // Stamp the pin with the creator's country so search can rank same-country
  // results first. Best-effort: if the lookup fails the pin is still saved,
  // just without the boost. Usually resolves from cache instantly.
  const country = await fetchCountry();

  await db.transact(
    db.tx.pins[pinId]
      .update({
        name: input.name.trim(),
        description: input.description.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        ...(country ? { country } : {}),
        createdAt: Date.now(),
      })
      .link({ owner: userId, photos: fileIds }),
  );

  return pinId;
}

export type EditPinInput = {
  name: string;
  description: string;
  /** Newly picked photos to upload and attach. */
  newPhotos: ImagePickerAsset[];
  /** File ids of existing photos the user removed while editing. */
  removedPhotoIds: string[];
  /**
   * The path index new uploads should start from (see `nextPhotoIndex` in
   * PinDetails.tsx) — one past the highest index already on this pin, so a
   * new photo can never collide with (and outrank) an existing one.
   */
  startPhotoIndex: number;
};

/**
 * Updates a pin's name, description, and photo set. Location isn't editable —
 * a pin's coordinate is fixed at creation. Removed photos are deleted outright
 * (their $files rows), new ones are uploaded and linked, in one transaction.
 */
export async function updatePin(
  pinId: string,
  input: EditPinInput,
): Promise<void> {
  const fileIds: string[] = [];
  for (let i = 0; i < input.newPhotos.length; i++) {
    fileIds.push(
      await uploadPhoto(pinId, input.newPhotos[i], input.startPhotoIndex + i),
    );
  }

  await db.transact([
    ...input.removedPhotoIds.map((fileId) => db.tx.$files[fileId].delete()),
    db.tx.pins[pinId]
      .update({
        name: input.name.trim(),
        description: input.description.trim(),
      })
      .link({ photos: fileIds }),
  ]);
}

/**
 * Deletes a pin and its photo files. Deleting the $files rows also removes the
 * stored blobs from Instant Storage.
 */
export async function deletePin(
  pinId: string,
  fileIds: string[],
): Promise<void> {
  await db.transact([
    ...fileIds.map((fileId) => db.tx.$files[fileId].delete()),
    db.tx.pins[pinId].delete(),
  ]);
}
