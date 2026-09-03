import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

/**
 * The app's private bucket.
 *
 * Holds profile pictures, plus any pin photo uploaded before photos moved to
 * Cloudinary (see `src/lib/cloudinary.ts`). Both read paths stay live, so old
 * rows keep rendering.
 *
 * Nothing in it is world-readable. Under Instant, `$files` handed back a `url`
 * the permission rules had already vetted; here the equivalent is a signed URL
 * minted per path — see `signPaths` below.
 *
 * Object keys are always `<userId>/…`, because that first path segment IS the
 * access rule (`(storage.foldername(name))[1] = auth.uid()::text`). Storage
 * policies can only see the object's name, so the prefix is the only thing
 * that can stop one account reading or deleting another's photos. Never write
 * a path that doesn't start with the owner's id.
 */
export const MEDIA_BUCKET = "media";

/**
 * How long a signed URL stays good for.
 *
 * Long enough that scrolling a collage doesn't re-sign constantly, and that
 * the OS image cache — which is keyed on the full URL, token and all — keeps
 * paying off for a whole session. Short enough that a URL which escapes (a
 * screenshot of a debugger, a shared log) stops working the next day.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

/** Re-sign this far ahead of expiry, so a URL never dies mid-render. */
const SIGN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Storage's batch endpoints are happier with bounded lists. */
const BATCH = 100;

type SignedEntry = { url: string; expiresAt: number };

const signedUrls = new Map<string, SignedEntry>();

/**
 * Signed URLs for storage paths, minted in as few round-trips as possible and
 * cached until they are close to expiring.
 *
 * Paths that no longer resolve (a deleted object, a path from a stale row) are
 * simply absent from the result rather than throwing — one missing photo
 * should cost that photo, not the whole screen.
 */
export async function signPaths(
  paths: string[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];

  for (const path of new Set(paths)) {
    if (!path) continue;
    const cached = signedUrls.get(path);
    if (cached && cached.expiresAt - SIGN_REFRESH_MARGIN_MS > now) {
      resolved.set(path, cached.url);
    } else {
      missing.push(path);
    }
  }

  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);
    if (error) throw new Error(error.message);

    for (const entry of data ?? []) {
      // Each entry carries its own error — a batch is not all-or-nothing.
      if (entry.error || !entry.signedUrl || !entry.path) continue;
      signedUrls.set(entry.path, {
        url: entry.signedUrl,
        expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000,
      });
      resolved.set(entry.path, entry.signedUrl);
    }
  }

  return resolved;
}

/** Drops cached URLs for paths that have just been deleted or replaced. */
export function forgetSignedPaths(paths: string[]): void {
  for (const path of paths) signedUrls.delete(path);
}

/** Wipes the whole cache — on sign-out, so nothing leaks into the next session. */
export function clearSignedUrls(): void {
  signedUrls.clear();
}

export type EncodeOptions = {
  /** Cap on the longer edge. Needs `width`/`height` to know which one that is. */
  maxEdge?: number;
  width?: number;
  height?: number;
  /** JPEG quality, 0–1. 1 means no compression. */
  compress?: number;
  format?: SaveFormat;
};

/**
 * Reads a local image into the bytes to upload, resizing on the way through.
 *
 * Camera originals run 3–8MB each, which is far more than a phone-sized view
 * ever displays and slow enough to be painful on a mobile connection — so the
 * resize and the re-encode happen in the same single pass rather than as two
 * trips through the manipulator.
 *
 * Base64 is the intermediate because it's the one binary representation
 * ImageManipulator will hand back, and React Native's networking layer accepts
 * an ArrayBuffer body. `fetch(uri).blob()` — what the Instant SDK took — is not
 * usable here: Supabase's storage client would post a Blob whose bytes React
 * Native never actually materializes.
 */
export async function readImageBytes(
  uri: string,
  options: EncodeOptions = {},
): Promise<ArrayBuffer> {
  const {
    maxEdge,
    width = 0,
    height = 0,
    compress = 0.75,
    format = SaveFormat.JPEG,
  } = options;

  const context = ImageManipulator.manipulate(uri);

  // Resize by the longer edge so portrait and landscape both land within the
  // cap without distorting the aspect ratio.
  const longest = Math.max(width, height);
  if (maxEdge && longest > maxEdge) {
    if (width >= height) {
      context.resize({ width: maxEdge });
    } else {
      context.resize({ height: maxEdge });
    }
  }

  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress, format, base64: true });
  if (!result.base64) throw new Error("Could not read that image.");
  return base64ToArrayBuffer(result.base64);
}

/** Uploads bytes to a path in the media bucket. */
export async function uploadImage(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  // A replaced object at a known path must not keep serving the old URL.
  forgetSignedPaths([path]);
}

/** Deletes objects, in batches, and forgets their signed URLs. */
export async function removeFiles(paths: string[]): Promise<void> {
  const wanted = paths.filter(Boolean);
  if (!wanted.length) return;

  for (let i = 0; i < wanted.length; i += BATCH) {
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove(wanted.slice(i, i + BATCH));
    if (error) throw new Error(error.message);
  }
  forgetSignedPaths(wanted);
}

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const B64_LOOKUP = (() => {
  // 255 marks "not a base64 character", which is how padding, newlines and
  // any stray whitespace get skipped rather than decoded into garbage.
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    table[B64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Hand-rolled rather than `atob`: this runs on every uploaded photo, and
 * decoding straight into a typed array skips building a multi-megabyte
 * intermediate JS string that would have to be walked a second time anyway.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let end = base64.length;
  while (end > 0 && base64[end - 1] === "=") end--;

  const bytes = new Uint8Array(Math.floor((end * 3) / 4));
  let out = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < end; i++) {
    const value = B64_LOOKUP[base64.charCodeAt(i)];
    if (value === 255) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }

  // Short only if the input carried whitespace; slice rather than hand back
  // trailing zero bytes that would corrupt the image.
  return out === bytes.length
    ? bytes.buffer
    : bytes.slice(0, out).buffer;
}
