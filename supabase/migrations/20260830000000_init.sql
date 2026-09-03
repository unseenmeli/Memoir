-- ============================================================================
-- New Era — initial schema.
--
-- This is the Supabase equivalent of the old `instant.schema.ts` +
-- `instant.perms.ts` pair (deleted in the migration commit — read them in git
-- history if you want the full reasoning; the parts that still apply are
-- repeated inline below).
--
-- Pins are PRIVATE. A pin, its photos, and a profile are visible only to the
-- user who owns them — this is a personal map diary, not a shared feed.
-- (Friends-visible pins are a later version; when that lands, the `select`
-- policies are what open up, and Apple's user-generated-content requirements —
-- report, block, filtering, published contact info — apply from that release
-- onward.)
--
-- Two things are load-bearing here:
--
--  1. These policies, not the client queries, are what actually enforces
--     privacy. The `.eq("owner_id", …)` filters in the app are defence in
--     depth and intent-documentation; a modified client can drop them.
--
--  2. File ownership lives in the storage PATH. Every upload is written under
--     `<auth.uid()>/…` (see `uploadImage` in src/lib/storage.ts) and the prefix
--     is the rule — `(storage.foldername(name))[1] = auth.uid()::text`. This
--     carried over verbatim from the Instant rules, so existing path
--     conventions still hold.
-- ============================================================================

-- gen_random_uuid() lives here on older projects; a no-op on newer ones.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles — public-facing identity for a signed-in user. One per auth user.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  -- One profile per account, and deleting the account takes the profile with
  -- it. This cascade is what makes account deletion a single admin call.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Unique handle shown on the profile page.
  display_name text not null unique
    constraint profiles_display_name_length
    check (char_length(display_name) between 2 and 40),
  -- Storage object path of the avatar, or null. Not a foreign key: storage
  -- objects live in another schema and are removed out-of-band.
  avatar_path text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

-- ---------------------------------------------------------------------------
-- pins — a saved place.
-- ---------------------------------------------------------------------------
create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    constraint pins_name_length check (char_length(name) between 1 and 200),
  description text not null default ''
    constraint pins_description_length check (char_length(description) <= 2000),
  latitude double precision not null
    constraint pins_latitude_range check (latitude between -90 and 90),
  longitude double precision not null
    constraint pins_longitude_range check (longitude between -180 and 180),
  -- ISO 3166-1 alpha-2 (e.g. "GE"), resolved when the pin is created.
  -- Indexed so search can rank same-country pins first. Nullable because the
  -- lookup is best-effort and must never block a save.
  country text
    constraint pins_country_format check (country is null or country ~ '^[A-Z]{2}$'),
  -- Free-form labels ("brunch", "rooftop"), stored normalized (lowercase,
  -- trimmed, deduped) by the client so filtering and counting don't need to
  -- re-clean them. `text[]` rather than json: it maps straight to a JS
  -- string[] and Postgres can index and filter it if search ever moves
  -- server-side.
  tags text[] not null default '{}'
    constraint pins_tags_count check (cardinality(tags) <= 8),
  created_at timestamptz not null default now()
);

-- Covers the app's only pin query shape: this user's pins, newest first.
create index if not exists pins_owner_created_idx
  on public.pins (owner_id, created_at desc);
create index if not exists pins_country_idx
  on public.pins (country) where country is not null;

-- ---------------------------------------------------------------------------
-- pin_photos — one row per uploaded image, pointing at a storage object.
--
-- `owner_id` is denormalized off `pins` on purpose: it lets every policy and
-- the storage path prefix agree on one value without a join on the hot path.
-- ---------------------------------------------------------------------------
create table if not exists public.pin_photos (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Storage object path, `<owner>/pins/<pin>/<index>-<name>`. The `<index>-`
  -- prefix on the basename is how the client recovers photo order (see
  -- `sortPhotos` in src/components/PinDetails.tsx) — nothing else guarantees
  -- the order rows come back in.
  path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists pin_photos_pin_idx on public.pin_photos (pin_id);
create index if not exists pin_photos_owner_idx on public.pin_photos (owner_id);

-- ---------------------------------------------------------------------------
-- Per-user pin cap.
--
-- Instant's rule language had no aggregate or count primitive, so this cap
-- could only ever be a UI affordance there — a modified client calling the
-- write path directly could sail past it. Postgres can actually enforce it,
-- so it is enforced. Keep the number in step with `MAX_PINS_PER_USER` in
-- src/lib/pins.ts, which is what the UI reads.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_pin_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing int;
begin
  select count(*) into existing from public.pins where owner_id = new.owner_id;
  if existing >= 400 then
    raise exception 'Pin limit reached: a user may have at most 400 pins.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pins_enforce_limit on public.pins;
create trigger pins_enforce_limit
  before insert on public.pins
  for each row execute function public.enforce_pin_limit();

-- ---------------------------------------------------------------------------
-- ensure_profile — create this user's profile if they don't have one yet.
--
-- Lives in the database rather than the client because `display_name` is
-- unique account-wide: picking a free name is a read-then-write race, and
-- doing it in one statement is the only way it's actually correct. Guests have
-- no email to derive a name from, hence the user-id fallback.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_profile(desired_name text default null)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  base text;
  candidate text;
  result public.profiles;
  attempts int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select * into result from public.profiles where user_id = uid;
  if found then
    return result;
  end if;

  base := nullif(btrim(coalesce(desired_name, '')), '');
  -- A guest has no email, and the display name must be unique — so falling
  -- back to a constant would put every guest in a race for the same name.
  -- Seed theirs from their user id instead.
  if base is null or char_length(base) < 2 then
    base := 'guest-' || substr(uid::text, 1, 6);
  end if;
  base := left(base, 40);

  candidate := base;
  loop
    begin
      insert into public.profiles (user_id, display_name)
      values (uid, candidate)
      returning * into result;
      return result;
    exception when unique_violation then
      -- Another session got there first with this user's profile: take theirs
      -- rather than fighting over the name.
      select * into result from public.profiles where user_id = uid;
      if found then
        return result;
      end if;

      -- Otherwise the *name* was taken. Suffix and retry.
      attempts := attempts + 1;
      if attempts > 20 then
        raise;
      end if;
      candidate := left(base, 35) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- Deny by default: RLS on with no policy means no access at all, so a table
-- added later is locked until it is named here. `auth.uid()` is wrapped in a
-- scalar subquery so the planner evaluates it once per statement rather than
-- once per row.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.pins enable row level security;
alter table public.pin_photos enable row level security;

drop policy if exists "profiles are private to their owner" on public.profiles;
create policy "profiles are private to their owner"
  on public.profiles
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pins are private to their owner" on public.pins;
create policy "pins are private to their owner"
  on public.pins
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "pin photos are private to their owner" on public.pin_photos;
create policy "pin photos are private to their owner"
  on public.pin_photos
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  -- The `exists` clause is not redundant with the owner check: without it a
  -- client could attach a photo row it owns to somebody else's pin.
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.pins p
      where p.id = pin_id and p.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Storage.
--
-- One private bucket. Nothing in it is world-readable — the app reads photos
-- through short-lived signed URLs (see `signPaths` in src/lib/storage.ts).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  10485760, -- 10 MB; photos are downscaled to a 1600px edge before upload
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment IS the access rule. Every write goes to
-- `<auth.uid()>/…`, so this one predicate covers pin photos and avatars alike
-- and is what stops one user reading, overwriting, or deleting another's.
drop policy if exists "media: owners read their own objects" on storage.objects;
create policy "media: owners read their own objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "media: owners write their own objects" on storage.objects;
create policy "media: owners write their own objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "media: owners update their own objects" on storage.objects;
create policy "media: owners update their own objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "media: owners delete their own objects" on storage.objects;
create policy "media: owners delete their own objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Realtime.
--
-- Instant was a sync engine — `useQuery` was a live subscription and screens
-- updated on their own. Publishing these tables keeps that behaviour: the
-- client subscribes to changes and refetches (see src/lib/store.ts).
--
-- `replica identity full` is required for DELETE events to carry enough of the
-- old row for RLS and the `owner_id` filter to match. Without it a delete on
-- another device would never reach this one.
-- ---------------------------------------------------------------------------
alter table public.pins replica identity full;
alter table public.pin_photos replica identity full;
alter table public.profiles replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.pins;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.pin_photos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end;
$$;
