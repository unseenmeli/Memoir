/**
 * Cloudinary signing and REST calls, shared by the Edge Functions that need
 * them.
 *
 * Everything here needs `CLOUDINARY_API_SECRET`, which is exactly why it lives
 * server-side. The secret can mint an upload signature for any path in the
 * account and a delivery URL for any asset in it — it is the whole security
 * boundary, so it must never be given an `EXPO_PUBLIC_` prefix or referenced
 * from anything under src/.
 *
 * Both signature algorithms are implemented by hand rather than by pulling in
 * the Cloudinary SDK. They are twenty lines between them, and a Node SDK that
 * reaches for `https`, `fs` and `querystring` is a large bet to place on the
 * edge runtime's compatibility shims for the sake of two hashes.
 */

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";

/** Every asset this app owns sits under one root, so a stray prefix can never
 * reach assets belonging to something else sharing the Cloudinary account. */
export const ROOT_FOLDER = "newera";

/** Photos are re-encoded to JPEG before upload, so the format is knowable up
 * front — which is what lets a delivery URL be signed before the bytes move. */
export const PHOTO_FORMAT = "jpg";

/** `authenticated` protects the original *and* every derived version. Plain
 * `private` would leave transformed copies world-readable. */
export const DELIVERY_TYPE = "authenticated";

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export function cloudName(): string {
  return CLOUD_NAME;
}

export function apiKey(): string {
  return API_KEY;
}

async function sha1(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The signature for an Upload/Admin API request.
 *
 * Cloudinary's rule: take every parameter you intend to send except `file`,
 * `api_key`, `cloud_name` and `resource_type`, render them as `name=value`,
 * sort by name, join with `&`, append the API secret with no separator, and
 * SHA-1 the result to hex.
 *
 * The caller has to pass exactly the parameters it will send — a signed set
 * that doesn't match the posted set is rejected, and the error Cloudinary
 * returns for it just says the signature is invalid.
 */
export async function signParams(
  params: Record<string, string | number>,
): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return toHex(await sha1(toSign + API_SECRET));
}

/**
 * A signed delivery URL for an authenticated asset.
 *
 * Different algorithm from the one above, and the difference is easy to miss:
 * this one is base64 rather than hex, truncated to 8 characters, and only then
 * made URL-safe. Truncating after the substitution would produce a different
 * string. There is no transformation in the signed payload because the app
 * requests none — if one is ever added it joins the public id as
 * `<transformation>/<public_id>` and must be signed with it.
 *
 * These URLs carry no expiry. Cloudinary's time-limited URLs are token-based
 * and gated behind the Advanced plan; on this plan the signature is the whole
 * control, which is why the URL is only ever stored on a row that row level
 * security already protects.
 */
export async function signedDeliveryUrl(publicId: string): Promise<string> {
  const source = `${publicId}.${PHOTO_FORMAT}`;
  const digest = await sha1(source + API_SECRET);
  const signature = toBase64(digest)
    .slice(0, 8)
    .replace(/\//g, "_")
    .replace(/\+/g, "-");
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/${DELIVERY_TYPE}/s--${signature}--/${source}`;
}

/**
 * Where one user's photos live.
 *
 * Callers derive this from a verified JWT and never from request input — it is
 * the Cloudinary equivalent of the `<auth.uid()>/…` prefix rule that storage
 * policies enforce, and the only thing keeping one account's uploads out of
 * another's namespace.
 */
export function userFolder(userId: string): string {
  return `${ROOT_FOLDER}/${userId}`;
}

/** True if `publicId` belongs to `userId`. Guards every delete. */
export function ownsPublicId(userId: string, publicId: string): boolean {
  return publicId.startsWith(`${userFolder(userId)}/`);
}

/** Deletes one asset. Returns false if Cloudinary refused or never had it. */
export async function destroyAsset(publicId: string): Promise<boolean> {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    invalidate: "true",
    public_id: publicId,
    timestamp,
    type: DELIVERY_TYPE,
  };
  const signature = await signParams(params);

  const body = new FormData();
  for (const [key, value] of Object.entries(params)) {
    body.append(key, String(value));
  }
  body.append("api_key", API_KEY);
  body.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`,
    { method: "POST", body },
  );
  if (!response.ok) return false;

  const result = await response.json().catch(() => null);
  // "not found" is a success for our purposes: the asset is gone either way,
  // and a delete that retries forever over an already-deleted photo is worse
  // than one that moves on.
  return result?.result === "ok" || result?.result === "not found";
}

/**
 * Deletes every asset under a prefix, used when an account goes away.
 *
 * Basic auth rather than a signature: this is the Admin API, which
 * authenticates with the key pair directly. Cloudinary caps a single call at
 * 1000 assets and sets `partial` when it stopped early, so this loops until it
 * doesn't — a busy account would otherwise silently keep most of its photos.
 */
export async function destroyByPrefix(prefix: string): Promise<number> {
  const credentials = btoa(`${API_KEY}:${API_SECRET}`);
  let deleted = 0;

  // Bounded rather than `while (true)`: 20 rounds is 20k assets, far past any
  // real account, and a prefix that somehow never drains must not spin here
  // until the function times out.
  for (let round = 0; round < 20; round++) {
    const url =
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image/${DELIVERY_TYPE}` +
      `?prefix=${encodeURIComponent(prefix)}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!response.ok) break;

    const result = await response.json().catch(() => null);
    const count = Object.keys(result?.deleted ?? {}).length;
    deleted += count;

    if (!result?.partial || count === 0) break;
  }

  return deleted;
}
