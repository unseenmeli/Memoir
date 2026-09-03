-- ============================================================================
-- Pin photos move to Cloudinary.
--
-- Supabase Storage on the free plan is 1 GB. A pin can carry several photos
-- and the per-user cap is 400 pins, so the bucket is the first thing that runs
-- out — well before rows or bandwidth do. Cloudinary's free plan is 25 credits
-- a month, where a credit is a gigabyte of storage or a gigabyte of delivery,
-- which is the headroom this app actually needs.
--
-- Avatars deliberately stay in Supabase Storage: one small image per account
-- is not what fills a bucket, and leaving them put keeps `signPaths` and the
-- storage policies in play rather than half-retired.
--
-- Rows are therefore one of two shapes, and `provider` is what says which:
--
--   supabase   `path` is a storage object key, read via a signed URL minted
--              per session. `url` is null.
--   cloudinary `path` is the Cloudinary public_id and `url` is its signed
--              delivery URL, computed once at upload.
--
-- Storing the delivery URL is the whole reason there is no read-time signing
-- round-trip. Cloudinary's signed URLs do not expire on this plan — the
-- expiring kind is a token-based Advanced-plan feature — so there is nothing
-- to refresh and no benefit to re-signing per session. The URL is unguessable
-- and useless without the signature, and the row it sits on is behind the
-- same row level security as everything else.
-- ============================================================================

alter table public.pin_photos
  add column if not exists provider text not null default 'supabase',
  add column if not exists url text;

-- Existing rows predate Cloudinary and are all storage objects, which the
-- default above already covers. Constrain the column now that it is populated.
alter table public.pin_photos
  drop constraint if exists pin_photos_provider_check;
alter table public.pin_photos
  add constraint pin_photos_provider_check
  check (provider in ('supabase', 'cloudinary'));

-- A Cloudinary row without its signed URL is unrenderable, and a storage row
-- with one would be read from the wrong place. Make both states unreachable
-- rather than something the client has to remember.
alter table public.pin_photos
  drop constraint if exists pin_photos_url_matches_provider;
alter table public.pin_photos
  add constraint pin_photos_url_matches_provider
  check (
    (provider = 'cloudinary' and url is not null)
    or (provider = 'supabase' and url is null)
  );

comment on column public.pin_photos.provider is
  'Where the bytes live: ''supabase'' (path = storage key) or ''cloudinary'' '
  '(path = public_id, url = signed delivery URL).';
comment on column public.pin_photos.url is
  'Signed Cloudinary delivery URL, computed at upload. Null for storage rows.';
