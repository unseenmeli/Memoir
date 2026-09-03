import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

/**
 * Pin photos, stored in Cloudinary.
 *
 * Supabase Storage on the free plan is 1 GB, which several photos across up to
 * 400 pins runs through quickly; Cloudinary's free plan is 25 GB-equivalents a
 * month. Avatars stay in Supabase Storage — one small image per account is not
 * what fills a bucket. See `src/lib/storage.ts` for that half.
 *
 * Nothing here holds a Cloudinary credential. The API secret can sign an
 * upload to any path in the account, so it lives only in the `cloudinary-sign`
 * Edge Function; this module asks that function for a signature scoped to one
 * asset, then posts the bytes straight to Cloudinary. The upload itself does
 * not pass through Supabase, which is the point — the photo takes one hop
 * instead of two.
 */

/** Longest edge a stored photo is allowed. Camera originals run 3-8MB. */
const MAX_PHOTO_EDGE = 1600;
const PHOTO_QUALITY = 0.75;

/**
 * Everything is re-encoded to JPEG on the way up.
 *
 * One format is one fewer thing that can render as a grey box — the camera
 * roll hands over HEIC among other things. It is also what makes the delivery
 * URL predictable enough to sign before the upload happens, since the file
 * extension is half of what gets signed.
 */
const PHOTO_CONTENT_TYPE = "image/jpeg";

export type UploadedPhoto = {
  /** Cloudinary public id. Stored as `pin_photos.path`. */
  publicId: string;
  /** Signed delivery URL. Stored as `pin_photos.url`. */
  url: string;
};

type SignedUpload = {
  uploadUrl: string;
  fields: Record<string, string | number>;
  publicId: string;
  url: string;
};

/**
 * Resizes and re-encodes a picked image, returning a local file URI.
 *
 * Deliberately not the base64 path `readImageBytes` takes for avatars: this
 * hands the URI straight to `FormData`, so a multi-megabyte photo is streamed
 * off disk by the networking layer instead of being materialized as a base64
 * string a third larger than the image and then decoded back into bytes.
 */
async function encodePhoto(
  uri: string,
  width: number,
  height: number,
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);

  // Resize by the longer edge so portrait and landscape both land within the
  // cap without distorting the aspect ratio.
  const longest = Math.max(width, height);
  if (longest > MAX_PHOTO_EDGE) {
    if (width >= height) {
      context.resize({ width: MAX_PHOTO_EDGE });
    } else {
      context.resize({ height: MAX_PHOTO_EDGE });
    }
  }

  const image = await context.renderAsync();
  const result = await image.saveAsync({
    compress: PHOTO_QUALITY,
    format: SaveFormat.JPEG,
  });
  return result.uri;
}

/** Asks the Edge Function to authorize one upload. */
async function signUpload(
  pinId: string,
  index: number,
  stem: string | null,
): Promise<SignedUpload> {
  const { data, error } = await supabase.functions.invoke("cloudinary-sign", {
    body: { action: "upload", pinId, index, stem },
  });
  if (error) throw new Error(await readFunctionError(error));
  if (!data?.uploadUrl || !data?.publicId || !data?.url) {
    throw new Error("Could not authorize that upload.");
  }
  return data as SignedUpload;
}

/**
 * Uploads one picked photo and returns what the database row needs.
 *
 * The signed fields are posted back exactly as they arrived. Cloudinary checks
 * the signature against the parameters it actually receives, so adding or
 * dropping one here would fail the upload with an error that says only that
 * the signature is invalid.
 */
export async function uploadPinPhoto(
  pinId: string,
  index: number,
  asset: { uri: string; width: number; height: number; fileName?: string | null },
): Promise<UploadedPhoto> {
  const signed = await signUpload(pinId, index, asset.fileName ?? null);
  const uri = await encodePhoto(asset.uri, asset.width, asset.height);

  const form = new FormData();
  for (const [key, value] of Object.entries(signed.fields)) {
    form.append(key, String(value));
  }
  // React Native's FormData takes this shape for a file and streams it from
  // disk; a Blob would be posted with bytes RN never materializes.
  form.append("file", {
    uri,
    name: `${signed.publicId.split("/").pop()}.jpg`,
    type: PHOTO_CONTENT_TYPE,
  } as unknown as Blob);

  const response = await fetch(signed.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error?.message ?? "Could not upload that photo.");
  }

  return { publicId: signed.publicId, url: signed.url };
}

/**
 * Deletes photos from Cloudinary.
 *
 * Best-effort by design, and the caller is expected to carry on if it throws:
 * the database row is the thing that decides whether a photo exists as far as
 * the app is concerned, so a failed destroy leaves bytes behind but never a
 * broken pin. The alternative — refusing to delete a pin because a CDN call
 * failed — is worse for the person holding the phone.
 */
export async function destroyPinPhotos(publicIds: string[]): Promise<void> {
  const wanted = publicIds.filter(Boolean);
  if (!wanted.length) return;

  const { error } = await supabase.functions.invoke("cloudinary-sign", {
    body: { action: "destroy", publicIds: wanted },
  });
  if (error) throw new Error(await readFunctionError(error));
}

/**
 * Pulls the message out of a Functions error.
 *
 * `FunctionsHttpError` keeps the body on a `context` Response that has to be
 * read to get at the `error` field the functions above return; without this,
 * every failure surfaces as the generic "Edge Function returned a non-2xx
 * status code" and none of them say what went wrong.
 */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    const body = await context.json().catch(() => null);
    const detail = (body as { error?: unknown } | null)?.error;
    if (typeof detail === "string" && detail) return detail;
  }
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message
    ? message
    : "Could not reach the photo service.";
}
