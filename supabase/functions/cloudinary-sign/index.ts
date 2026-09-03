/**
 * Authorizes the app's Cloudinary work, one signature at a time.
 *
 * Pin photos live in Cloudinary rather than Supabase Storage (see the
 * migration that added `pin_photos.provider` for why), and every Cloudinary
 * operation worth doing needs the API secret. The secret cannot ship in the
 * app — anything in the bundle can be read out of the binary — so the client
 * never talks to Cloudinary's API directly. It asks here, gets back a
 * signature scoped to exactly one asset it is allowed to touch, and uses that.
 *
 * `auth: 'user'` — the caller's own JWT is the authorization, and the user id
 * comes from the verified token rather than the request body. That is the
 * whole access model: a public id is built server-side from the caller's id,
 * so no request can name a path belonging to somebody else.
 */
import { withSupabase } from 'npm:@supabase/server'
import {
  cloudinaryConfigured,
  cloudName,
  apiKey,
  DELIVERY_TYPE,
  destroyAsset,
  ownsPublicId,
  PHOTO_FORMAT,
  signParams,
  signedDeliveryUrl,
  userFolder,
} from '../_shared/cloudinary.ts'

/** Pin ids are database uuids; anything else is not a pin this app made. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Matches `MAX_PHOTOS_PER_PIN` headroom in the client, with room to spare. */
const MAX_INDEX = 999

/** One request should never be able to queue an unbounded number of deletes. */
const MAX_DESTROY = 100

/**
 * Public ids are URL path segments, so a filename off the camera roll has to
 * be flattened the same way storage keys were. Mirrors `safeFileStem` in
 * src/lib/storage.ts — but re-done here, because a client-supplied stem is
 * request input and validating it is this function's job, not the caller's.
 */
function safeStem(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const cleaned = raw
    .replace(/\.[^./\\]*$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
  return cleaned || fallback
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id
    if (!userId) {
      return Response.json({ error: 'Not signed in.' }, { status: 401 })
    }

    // A missing secret is a deployment mistake, not a user error, and it would
    // otherwise surface as an unsigned upload Cloudinary rejects for reasons
    // that point nowhere near the cause.
    if (!cloudinaryConfigured()) {
      return Response.json(
        { error: 'Cloudinary is not configured for this project.' },
        { status: 503 },
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return badRequest('Expected a JSON body.')
    }

    const { action } = body as { action?: unknown }

    // ---------------------------------------------------------------------
    // upload — authorize one photo, at one path, for one pin.
    // ---------------------------------------------------------------------
    if (action === 'upload') {
      const { pinId, index, stem } = body as {
        pinId?: unknown
        index?: unknown
        stem?: unknown
      }

      if (typeof pinId !== 'string' || !UUID.test(pinId)) {
        return badRequest('Expected a pin id.')
      }
      if (
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index > MAX_INDEX
      ) {
        return badRequest('Expected a photo index.')
      }

      // `ctx.supabase` carries the caller's own JWT, so this select is subject
      // to the same row level security as the app's. A row coming back is
      // proof the pin is theirs — the folder prefix already makes cross-user
      // writes impossible, and this stops photos accumulating under a pin id
      // the caller invented.
      const { data: pin, error } = await ctx.supabase
        .from('pins')
        .select('id')
        .eq('id', pinId)
        .maybeSingle()
      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }
      if (!pin) {
        return Response.json({ error: 'No such pin.' }, { status: 404 })
      }

      const publicId =
        `${userFolder(userId)}/pins/${pinId}/` +
        `${index}-${safeStem(stem, `photo-${index}`)}`

      // Cloudinary verifies the signature against the parameters actually
      // posted, so the signed set and the sent set have to be identical. They
      // are built together here and handed over as one object precisely so the
      // client cannot drift from it.
      const params: Record<string, string | number> = {
        format: PHOTO_FORMAT,
        public_id: publicId,
        timestamp: Math.floor(Date.now() / 1000),
        type: DELIVERY_TYPE,
      }
      const signature = await signParams(params)

      return Response.json({
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName()}/image/upload`,
        // Everything but the file itself. The client appends `file` and posts.
        fields: { ...params, api_key: apiKey(), signature },
        publicId,
        // Signed here rather than read off the upload response: the format and
        // path are both fixed above, so the delivery URL is knowable before
        // the bytes move and the client needs no second round-trip for it.
        url: await signedDeliveryUrl(publicId),
      })
    }

    // ---------------------------------------------------------------------
    // destroy — remove assets the caller owns.
    // ---------------------------------------------------------------------
    if (action === 'destroy') {
      const { publicIds } = body as { publicIds?: unknown }
      if (!Array.isArray(publicIds)) {
        return badRequest('Expected publicIds.')
      }
      if (publicIds.length > MAX_DESTROY) {
        return badRequest(`At most ${MAX_DESTROY} photos at a time.`)
      }

      // Ownership is a prefix check against the verified user id. A request
      // naming somebody else's asset is refused outright rather than
      // partially applied, so a caller can't learn what exists by watching
      // which ids come back deleted.
      const wanted = publicIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
      if (wanted.some((id) => !ownsPublicId(userId, id))) {
        return Response.json({ error: 'Not yours to delete.' }, { status: 403 })
      }

      let deleted = 0
      for (const publicId of wanted) {
        if (await destroyAsset(publicId)) deleted++
      }

      return Response.json({ ok: true, deleted })
    }

    return badRequest('Unknown action.')
  }),
}
