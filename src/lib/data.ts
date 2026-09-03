import type { RealtimeChannel } from "@supabase/supabase-js";
import { clearSignedUrls, signPaths } from "./storage";
import { Query, useQuery } from "./store";
import { supabase } from "./supabase";

/**
 * The app's two live queries — "my pins" and "my profile" — plus the realtime
 * wiring that keeps them fresh.
 *
 * Both are scoped to the signed-in user, and both mirror what row level
 * security already enforces. The `.eq("owner_id", …)` filters here are defence
 * in depth and intent-documentation, not the actual boundary: a modified
 * client can drop them and still see nothing but its own rows.
 */

export type PinPhoto = {
  /** `pin_photos` row id. */
  id: string;
  /** Storage object path — also what encodes the photo's display order. */
  path: string;
  /** Short-lived signed URL. Never persist this; re-sign instead. */
  url: string;
};

type PinOwner = { id: string };

export type PinRecord = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2. Null when the lookup didn't resolve at save time. */
  country?: string | null;
  /** Free-form labels, stored normalized. */
  tags?: string[] | null;
  /** Epoch milliseconds, converted from the row's `timestamptz`. */
  createdAt: number;
  photos: PinPhoto[];
  owner?: PinOwner | null;
};

export type ProfileRecord = {
  id: string;
  displayName: string;
  createdAt: number;
  avatar?: { path: string; url: string } | null;
};

type PinRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  country: string | null;
  tags: string[] | null;
  created_at: string;
  pin_photos:
    | {
        id: string;
        /** Storage key, or a Cloudinary public id — `provider` says which. */
        path: string;
        provider: string | null;
        /** Signed Cloudinary delivery URL. Null on storage rows. */
        url: string | null;
      }[]
    | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  created_at: string;
};

const PIN_COLUMNS =
  "id,owner_id,name,description,latitude,longitude,country,tags,created_at,pin_photos(id,path,provider,url)";

const PROFILE_COLUMNS = "id,display_name,avatar_path,created_at";

async function fetchPins(userId: string): Promise<PinRecord[]> {
  const { data, error } = await supabase
    .from("pins")
    .select(PIN_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as PinRow[];

  // Cloudinary rows carry their own signed URL, signed once when the photo was
  // uploaded, so they need no round-trip at all. Only storage rows — photos
  // that predate the move to Cloudinary — have to be signed here, and they are
  // signed in one batch: a hundred pins would otherwise be a hundred requests.
  const urls = await signPaths(
    rows.flatMap((row) =>
      (row.pin_photos ?? [])
        .filter((photo) => photo.provider !== "cloudinary")
        .map((photo) => photo.path),
    ),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    country: row.country,
    tags: row.tags ?? [],
    createdAt: Date.parse(row.created_at),
    owner: { id: row.owner_id },
    photos: (row.pin_photos ?? [])
      .map((photo) => ({
        id: photo.id,
        path: photo.path,
        url:
          photo.provider === "cloudinary"
            ? (photo.url ?? "")
            : (urls.get(photo.path) ?? ""),
      }))
      // A row whose object has gone missing would render as a broken frame;
      // dropping it costs that one photo instead.
      .filter((photo) => photo.url),
  }));
}

async function fetchProfile(userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as ProfileRow;
  const url = row.avatar_path
    ? (await signPaths([row.avatar_path])).get(row.avatar_path)
    : undefined;

  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: Date.parse(row.created_at),
    avatar: row.avatar_path && url ? { path: row.avatar_path, url } : null,
  };
}

type Session = {
  userId: string;
  pins: Query<PinRecord[]>;
  profile: Query<ProfileRecord | null>;
  channel: RealtimeChannel;
};

let session: Session | null = null;

/**
 * The queries for one user, created on first use and reused after.
 *
 * Keyed on the user id so signing in as somebody else can never hand the new
 * account the old one's rows — the whole session, realtime channel included,
 * is torn down and rebuilt.
 */
function sessionFor(userId: string): Session {
  if (session?.userId === userId) return session;
  if (session) teardown(session);

  const pins = new Query(() => fetchPins(userId));
  const profile = new Query(() => fetchProfile(userId));

  // One channel carries all three tables. Every event just triggers a refetch
  // rather than trying to patch the payload into local state: the rows are
  // small, the query is indexed, and reconciling a photo insert against an
  // already-signed URL list by hand is a bug factory.
  const channel = supabase
    .channel(`user:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pins",
        filter: `owner_id=eq.${userId}`,
      },
      () => pins.invalidate(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pin_photos",
        filter: `owner_id=eq.${userId}`,
      },
      () => pins.invalidate(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `user_id=eq.${userId}`,
      },
      () => profile.invalidate(),
    )
    .subscribe();

  session = { userId, pins, profile, channel };
  return session;
}

function teardown(target: Session): void {
  target.pins.reset();
  target.profile.reset();
  void supabase.removeChannel(target.channel);
}

/**
 * Drops every cached row and signed URL. Called on sign-out — without it the
 * next account to sign in on this device briefly renders the last one's pins.
 */
export function resetData(): void {
  if (session) teardown(session);
  session = null;
  clearSignedUrls();
}

export function usePins(userId: string): {
  pins: PinRecord[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery(sessionFor(userId).pins);
  return { pins: data ?? [], isLoading, error };
}

export function useProfile(userId: string): {
  profile: ProfileRecord | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery(sessionFor(userId).profile);
  return { profile: data ?? null, isLoading, error };
}

/**
 * Mark the pin list stale after a local write.
 *
 * Realtime would get there on its own, but not reliably fast enough: the
 * composer closes the instant the write resolves, and waiting on a round-trip
 * through the replication stream to repaint is exactly the lag Instant's
 * local-first writes never had. This closes that gap.
 */
export function invalidatePins(): void {
  session?.pins.invalidate();
}

export function invalidateProfile(): void {
  session?.profile.invalidate();
}

/** Refetch everything and wait for it — what pull-to-refresh actually does. */
export async function refreshAll(userId: string): Promise<void> {
  const active = sessionFor(userId);
  await Promise.all([active.pins.refetch(), active.profile.refetch()]);
}
