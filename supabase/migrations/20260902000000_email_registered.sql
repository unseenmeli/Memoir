-- ============================================================================
-- email_registered — does this address already have an account?
--
-- The login screen asks for an email first and then shows either "enter your
-- password" or "choose a password", so it has to know which one before the
-- person types anything. Supabase deliberately exposes no client API for this
-- (see below), so the check has to be a function we own.
--
-- TRADE-OFF, stated plainly: this is an email enumeration oracle. Anyone
-- holding the publishable key — which ships inside the app binary and is meant
-- to be public — can ask whether a given address has an account here. That is
-- the unavoidable cost of a two-step form that branches before the password
-- field; Supabase omits this endpoint precisely to avoid handing it out.
--
-- It is a deliberate call, not an oversight. What leaks is only "this address
-- uses this app" — never a pin, a photo, or a profile, all of which stay
-- behind the row level security policies in the init migration. If that ever
-- stops being an acceptable trade, the fix is a single-step form: ask for
-- email and password together and let a failed sign-in stay ambiguous.
-- ============================================================================

create or replace function public.email_registered(check_email text)
returns boolean
-- `stable` because it reads the database but changes nothing, which lets the
-- planner cache it within a statement.
language sql
stable
-- SECURITY DEFINER is the whole point: `auth.users` is not readable by `anon`,
-- and this function is the one narrow window into it. It returns a bare
-- boolean and nothing else — no id, no timestamps, no metadata.
security definer
-- Empty search_path so a caller cannot shadow `auth.users` with their own
-- table and change what this function reads. Everything below is
-- schema-qualified because of it.
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.email = lower(trim(check_email))
      -- Soft-deleted accounts shouldn't send someone to a password prompt
      -- they can never satisfy.
      and u.deleted_at is null
  );
$$;

-- `public` includes roles we never want holding this. Grant it back to exactly
-- the two that reach it: `anon` for the login screen (no session yet) and
-- `authenticated` for a guest upgrading their account from Settings.
revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;

comment on function public.email_registered(text) is
  'True if the address already has an account. Deliberate email enumeration '
  'oracle — see the migration that created it before widening this.';
