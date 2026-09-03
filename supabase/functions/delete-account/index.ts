/**
 * Deletes the calling user's account, for real.
 *
 * Apple requires in-app account deletion for any app that supports account
 * creation (App Review Guideline 5.1.1(v)). Under Instant this could only ever
 * be half-done: the client SDK exposed no delete-user call, so the app erased
 * everything a user had made and left an empty account row behind holding
 * their email — which also meant that email could never be reused.
 *
 * With a secret-key client that limitation is gone. Deleting the `auth.users`
 * row cascades through `profiles`, `pins`, and `pin_photos` (see the foreign
 * keys in the initial migration), so the only things that need doing by hand
 * are the bytes, which live outside Postgres: pin photos at Cloudinary, and
 * the avatar — plus any pre-Cloudinary photo — in Supabase Storage.
 *
 * `auth: 'user'` — the caller's own JWT is the authorization. There is no user
 * id in the request body on purpose: the only account this endpoint can ever
 * delete is the one whose token was presented.
 */
import { withSupabase } from 'npm:@supabase/server'
import type { SupabaseClient } from 'npm:@supabase/server/peer/supabase-js'
import {
  cloudinaryConfigured,
  destroyByPrefix,
  userFolder,
} from '../_shared/cloudinary.ts'

const BUCKET = 'media'

/** Storage's remove() takes a list; keep each call to a sane size. */
const REMOVE_CHUNK = 100

/** One page of `list()`. The API caps this at 1000. */
const PAGE_SIZE = 1000

/**
 * Every object path under `prefix`, walked depth-first.
 *
 * Storage has no recursive list, and it reports folders as rows with a null
 * `id` — that null is the only thing separating "a directory" from "a file"
 * in the response.
 */
async function listAllPaths(
  admin: SupabaseClient,
  prefix: string,
): Promise<string[]> {
  const found: string[] = []
  let offset = 0

  for (;;) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset })

    // A missing prefix is not a failure — it just means nothing was uploaded.
    if (error || !data || data.length === 0) break

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) {
        found.push(...(await listAllPaths(admin, path)))
      } else {
        found.push(path)
      }
    }

    if (data.length < PAGE_SIZE) break
    offset += data.length
  }

  return found
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (_req, ctx) => {
    const userId = ctx.userClaims?.id
    if (!userId) {
      return Response.json({ error: 'Not signed in.' }, { status: 401 })
    }

    const admin = ctx.supabaseAdmin

    // Storage first. Every path this app writes starts with the owner's id
    // (that prefix is also the storage RLS rule), so one walk covers pin
    // photos and the avatar alike.
    const paths = await listAllPaths(admin, userId)
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
      const { error } = await admin.storage
        .from(BUCKET)
        .remove(paths.slice(i, i + REMOVE_CHUNK))
      if (error) {
        return Response.json(
          { error: `Could not delete your photos: ${error.message}` },
          { status: 500 },
        )
      }
    }

    // Then Cloudinary, where pin photos actually live. Same prefix rule as
    // storage: everything this user uploaded sits under one folder derived
    // from their id, so one call covers all of it.
    //
    // Deliberately not fatal. An unreachable CDN must not be what stops
    // someone deleting their account — Apple requires that deletion work
    // (Guideline 5.1.1(v)), and the account record is the part that carries
    // their identity. Orphaned image bytes are a cleanup problem; a refused
    // deletion is a compliance one.
    let photos = 0
    if (cloudinaryConfigured()) {
      photos = await destroyByPrefix(`${userFolder(userId)}/`).catch(() => 0)
    }

    // Then the account itself, which takes the rows with it.
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) {
      return Response.json(
        { error: `Could not delete your account: ${error.message}` },
        { status: 500 },
      )
    }

    return Response.json({ ok: true, files: paths.length, photos })
  }),
}
