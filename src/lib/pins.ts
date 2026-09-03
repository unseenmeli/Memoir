import type { ImagePickerAsset } from "expo-image-picker";
import {
  destroyPinPhotos,
  uploadPinPhoto,
  type UploadedPhoto,
} from "./cloudinary";
import { invalidatePins } from "./data";
import { reverseGeocodeCountry } from "./places";
import { removeFiles } from "./storage";
import { supabase } from "./supabase";
import { normalizeTags } from "./tags";
import { withTimeout } from "./timeout";

/**
 * Per-user cap on how many pins someone can create.
 *
 * This value is the UI's copy of the rule; the rule itself is a trigger on
 * `pins` (see the initial migration). Under Instant the cap could only ever be
 * an affordance — its rule language had no count primitive, so a modified
 * client calling the write path directly sailed straight past it. Postgres can
 * count, so it now genuinely holds. Keep the two numbers in step.
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
 * Uploads one picked image and returns what its row needs.
 *
 * The bytes go to Cloudinary, not Supabase Storage — see `src/lib/cloudinary.ts`
 * for why, and the migration that added `pin_photos.provider` for how the two
 * kinds of row differ. The index still leads the basename, because that prefix
 * is how `sortPhotos` in PinDetails recovers photo order.
 *
 * Uploads get their own ceiling — a stalled upload would otherwise hang the
 * save with no way out.
 */
async function uploadPhoto(
  pinId: string,
  asset: ImagePickerAsset,
  index: number,
): Promise<UploadedPhoto> {
  return withTimeout(
    uploadPinPhoto(pinId, index, asset),
    `Uploading photo ${index + 1}`,
  );
}

/** A photo row, reduced to what deciding where its bytes live requires. */
export type StoredPhoto = { provider: string | null; path: string };

/**
 * Removes the bytes behind a set of photo rows, wherever they live.
 *
 * Rows written before photos moved to Cloudinary still point at storage
 * objects — `provider` defaults to `'supabase'` for exactly that reason — so
 * both paths stay live and a row is routed by what it says about itself.
 */
/**
 * Deletes photo bytes, routing each row to wherever its bytes actually live.
 *
 * Exported because account deletion needs the same rule (see
 * `deleteOwnedData` in profile.ts). `provider` is the whole reason this can't
 * be a single `removeFiles` call: a Cloudinary row's `path` is a public id,
 * not a storage key, so handing it to Storage deletes nothing and reports no
 * error — the bytes just quietly survive.
 */
export async function deleteStoredPhotos(rows: StoredPhoto[]): Promise<void> {
  const publicIds: string[] = [];
  const paths: string[] = [];
  for (const row of rows) {
    if (!row.path) continue;
    (row.provider === "cloudinary" ? publicIds : paths).push(row.path);
  }

  if (paths.length) await removeFiles(paths);
  if (publicIds.length) {
    // Deliberately swallowed. The row is what decides whether a photo exists
    // as far as the app is concerned, so bytes left behind at the CDN cost
    // storage; a throw here would cost someone the ability to delete a pin.
    await destroyPinPhotos(publicIds).catch(() => {});
  }
}

/** Attaches uploaded photos to a pin as `pin_photos` rows. */
async function linkPhotos(
  userId: string,
  pinId: string,
  photos: UploadedPhoto[],
): Promise<void> {
  if (!photos.length) return;
  const { error } = await withTimeout(
    supabase.from("pin_photos").insert(
      photos.map((photo) => ({
        pin_id: pinId,
        owner_id: userId,
        provider: "cloudinary",
        // `path` holds the public id for a Cloudinary row; `url` is its signed
        // delivery URL, signed once at upload rather than per session.
        path: photo.publicId,
        url: photo.url,
      })),
    ),
    "Saving your photos",
  );
  if (error) throw new Error(error.message);
}

/**
 * Deletes photo rows and the objects behind them.
 *
 * Paths come from the database rather than from whatever the caller happened
 * to be rendering, so a photo the UI had already dropped (a signed URL that
 * failed to mint, say) still gets its bytes cleaned up instead of being
 * orphaned in the bucket forever.
 */
async function deletePhotoRows(photoIds: string[]): Promise<void> {
  if (!photoIds.length) return;

  const { data, error } = await supabase
    .from("pin_photos")
    .select("provider,path")
    .in("id", photoIds);
  if (error) throw new Error(error.message);

  await deleteStoredPhotos((data ?? []) as StoredPhoto[]);

  const { error: deleteError } = await supabase
    .from("pin_photos")
    .delete()
    .in("id", photoIds);
  if (deleteError) throw new Error(deleteError.message);
}

/**
 * Writes the resolved country onto a pin that has already been saved.
 *
 * Swallows everything. The pin exists and is complete without this; the
 * country only feeds search ranking and the profile's country tally, so a
 * failed stamp leaves the column null — the same state the schema already
 * allows for a pin dropped mid-ocean or saved offline.
 */
async function stampCountry(
  pinId: string,
  countryPromise: Promise<string | null>,
): Promise<void> {
  try {
    const country = await countryPromise;
    if (!country) return;
    await supabase.from("pins").update({ country }).eq("id", pinId);
  } catch {
    // Non-fatal by design — see above.
  }
}

/**
 * Creates a pin: writes the row, uploads its photos, then attaches them.
 *
 * The row goes first — it's what mints the id the photo paths are keyed on,
 * and it means the per-user cap is checked before any bytes move rather than
 * after three slow uploads. If the photo half then fails, the pin is rolled
 * back so a failed save doesn't leave a half-made memory on the map.
 */
export async function createPin(
  userId: string,
  input: NewPinInput,
): Promise<string> {
  // Which country the pin is *in* — resolved from its own coordinates, not
  // from the phone's IP. Started here but deliberately not awaited: the row
  // has to exist before anything else can happen, and this lookup overlaps
  // with the photo uploads below instead of delaying the save.
  const countryPromise = reverseGeocodeCountry(
    input.latitude,
    input.longitude,
  ).catch(() => null);

  const { data, error } = await withTimeout(
    supabase
      .from("pins")
      .insert({
        owner_id: userId,
        name: input.name.trim(),
        description: input.description.trim(),
        tags: normalizeTags(input.tags ?? []),
        latitude: input.latitude,
        longitude: input.longitude,
      })
      .select("id")
      .single(),
    "Saving your pin",
  );
  if (error) throw new Error(error.message);

  const pinId = data.id as string;

  try {
    // Upload sequentially so a slow connection doesn't fire many large PUTs at
    // once; a pin rarely has more than a handful of photos.
    const uploaded: UploadedPhoto[] = [];
    for (let i = 0; i < input.photos.length; i++) {
      uploaded.push(await uploadPhoto(pinId, input.photos[i], i));
    }
    await linkPhotos(userId, pinId, uploaded);
  } catch (err) {
    // Best-effort rollback: if this fails too, the user is left with a
    // photoless pin they can delete, which beats an error they can't act on.
    await supabase.from("pins").delete().eq("id", pinId);
    throw err;
  }

  // Deliberately after the rollback block: the pin is saved either way, and a
  // country we couldn't resolve is not a reason to throw away someone's memory.
  await stampCountry(pinId, countryPromise);

  invalidatePins();
  return pinId;
}

export type EditPinInput = {
  name: string;
  description: string;
  /** Free-form labels; normalized before write. */
  tags?: string[];
  /** Newly picked photos to upload and attach. */
  newPhotos: ImagePickerAsset[];
  /** Row ids of existing photos the user removed while editing. */
  removedPhotoIds: string[];
  /**
   * The path index new uploads should start from (see `nextPhotoIndex` in
   * PinDetails.tsx) — one past the highest index already on this pin, so a
   * new photo can never collide with (and outrank) an existing one.
   */
  startPhotoIndex: number;
};

/**
 * Updates a pin's name, description, tags, and photo set. Location isn't
 * editable — a pin's coordinate is fixed at creation.
 */
export async function updatePin(
  userId: string,
  pinId: string,
  input: EditPinInput,
): Promise<void> {
  // Uploads first: they are the part that can fail slowly, and failing before
  // the text is committed leaves the pin exactly as it was.
  const uploaded: UploadedPhoto[] = [];
  for (let i = 0; i < input.newPhotos.length; i++) {
    uploaded.push(
      await uploadPhoto(pinId, input.newPhotos[i], input.startPhotoIndex + i),
    );
  }

  const { error } = await withTimeout(
    supabase
      .from("pins")
      .update({
        name: input.name.trim(),
        description: input.description.trim(),
        tags: normalizeTags(input.tags ?? []),
      })
      .eq("id", pinId),
    "Saving your changes",
  );
  if (error) throw new Error(error.message);

  await deletePhotoRows(input.removedPhotoIds);
  await linkPhotos(userId, pinId, uploaded);

  invalidatePins();
}

/**
 * Deletes a pin and every photo on it.
 *
 * The `pin_photos` rows go with the pin on their own (the foreign key
 * cascades), but the bytes live outside Postgres — at Cloudinary, or in
 * storage for rows that predate the move — and have to be removed explicitly.
 * So they are read back and deleted first, before the rows that name them are
 * gone.
 */
export async function deletePin(pinId: string): Promise<void> {
  const { data, error } = await supabase
    .from("pin_photos")
    .select("provider,path")
    .eq("pin_id", pinId);
  if (error) throw new Error(error.message);

  await deleteStoredPhotos((data ?? []) as StoredPhoto[]);

  const { error: deleteError } = await withTimeout(
    supabase.from("pins").delete().eq("id", pinId),
    "Deleting the pin",
  );
  if (deleteError) throw new Error(deleteError.message);

  invalidatePins();
}
