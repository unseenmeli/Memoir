import { id } from "@instantdb/react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import { getCachedCountry } from "./country";
import { normalizeTags } from "./tags";
import { db } from "./db";
import { withTimeout } from "./timeout";

/**
 * Per-user cap on how many pins someone can create.
 *
 * NOTE: this is a UI affordance only. Instant's rule language has no aggregate
 * or count primitive, so a total-pin cap cannot be enforced server-side — a
 * modified client calling `createPin` directly can exceed it. If abuse ever
 * matters, the available lever is a `$rateLimits` bucket on `pins.create`,
 * which caps the *rate* rather than the total.
 */
export const MAX_PINS_PER_USER = 400;

export type NewPinInput = {
  name: string;
  description: string;
  /** Free-form labels; normalized before write. */
  tags?: string[];
  latitude: number;
  longitude: number;
  photos: ImagePickerAsset[];
};

/**
 * Longest edge a stored photo is allowed. Camera originals run 3-8MB each,
 * which is far more than a phone-sized view ever displays and slow enough to
 * blow past the backend's transaction window on a mobile connection.
 */
const MAX_PHOTO_EDGE = 1600;
const PHOTO_QUALITY = 0.75;

/** Downscales and re-encodes a picked image so uploads stay quick. */
async function compressPhoto(asset: ImagePickerAsset): Promise<string> {
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  if (!longest || longest <= MAX_PHOTO_EDGE) return asset.uri;

  try {
    const context = ImageManipulator.manipulate(asset.uri);
    // Resize by the longer edge so portrait and landscape both land within
    // the cap without distorting the aspect ratio.
    if ((asset.width ?? 0) >= (asset.height ?? 0)) {
      context.resize({ width: MAX_PHOTO_EDGE });
    } else {
      context.resize({ height: MAX_PHOTO_EDGE });
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      compress: PHOTO_QUALITY,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    // Compression is an optimization, never a hard requirement — fall back to
    // the original rather than failing the whole save.
    return asset.uri;
  }
}

/**
 * Uploads one picked image to Instant Storage and returns its $files id.
 * The file is stored under the owner's folder, then the pin's, so a pin's
 * photos stay grouped and the whole tree is covered by one ownership rule.
 */
async function uploadPhoto(
  userId: string,
  pinId: string,
  asset: ImagePickerAsset,
  index: number,
): Promise<string> {
  const uri = await compressPhoto(asset);

  // RN can turn a local file:// URI into a Blob via fetch.
  const response = await fetch(uri);
  const blob = await response.blob();

  const contentType = asset.mimeType ?? blob.type ?? "image/jpeg";
  const extension = contentType.split("/")[1] ?? "jpg";
  const name = asset.fileName ?? `photo-${index}.${extension}`;
  // Every path starts with the owner's auth id because that prefix IS the
  // access rule: `$files` permissions can only see `data.path` (no link
  // traversal), so `data.path.startsWith(auth.id + '/')` is the only way to
  // stop one user deleting or overwriting another user's photos.
  const path = `${userId}/pins/${pinId}/${index}-${name}`;

  // Uploads get their own ceiling — a stalled upload would otherwise hang the
  // save before the transaction is even reached.
  const { data } = await withTimeout(
    db.storage.uploadFile(path, blob, { contentType }),
    `Uploading ${name}`,
  );
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
    fileIds.push(await uploadPhoto(userId, pinId, input.photos[i], i));
  }

  // Stamp the pin with the creator's country so search can rank same-country
  // results first. Strictly best-effort: read the cached value only, never
  // block a save on a network call. The IP service is rate-limited and can
  // hang, and a missing country just costs a ranking boost — it is never
  // worth making someone wait to save their pin.
  const country = await getCachedCountry().catch(() => null);

  // NOTE: not awaited against a wall-clock timeout the way uploads are.
  // Instant is local-first: `transact` writes to the local store immediately
  // and syncs in the background, so the pin exists and renders the moment
  // this resolves locally. Its own server round-trip has a hard 6s window
  // (see Reactor's timeoutMs), which a slow connection blows through even
  // though the write is already safe — surfacing that as a save failure was
  // wrong. Errors still propagate; we just don't hold the UI hostage.
  await db.transact(
    db.tx.pins[pinId]
      .update({
        name: input.name.trim(),
        description: input.description.trim(),
        tags: normalizeTags(input.tags ?? []),
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
  /** Free-form labels; normalized before write. */
  tags?: string[];
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
  userId: string,
  pinId: string,
  input: EditPinInput,
): Promise<void> {
  const fileIds: string[] = [];
  for (let i = 0; i < input.newPhotos.length; i++) {
    fileIds.push(
      await uploadPhoto(
        userId,
        pinId,
        input.newPhotos[i],
        input.startPhotoIndex + i,
      ),
    );
  }

  // Local-first, same as createPin — see the note there.
  await db.transact([
    ...input.removedPhotoIds.map((fileId) => db.tx.$files[fileId].delete()),
    db.tx.pins[pinId]
      .update({
        name: input.name.trim(),
        description: input.description.trim(),
        tags: normalizeTags(input.tags ?? []),
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
