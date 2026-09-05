# Memoire

iOS app — Expo (SDK 54) + Expo Router + NativeWind + Supabase.

A private map diary: drop a pin on a place, give it a name, photos and labels,
and find it again later. Pins are visible only to the person who made them.

## Setup

1. Copy `.env.example` to `.env` and fill in your project URL and publishable
   key from **Project Settings → API Keys** in the Supabase dashboard.

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Only the *publishable* key belongs in `.env` — anything prefixed
   `EXPO_PUBLIC_` is compiled into the shipped bundle and can be read out of
   the binary. The secret key lives in `supabase/.env`; see "Backend" below.

2. Apply the backend (once per project) — see "Backend".

3. Install and run:

   ```bash
   npm install
   npx expo run:ios
   ```

   This project uses `react-native-maps` and `expo-haptics`, both native
   modules, so it needs a **development build** — Expo Go cannot load them.
   `npx expo run:ios` compiles the app into the simulator; the first build
   takes a few minutes. Haptics need a real device to be felt at all.

   After that, `npm start` and hot reload work as normal. You only need to
   re-run `expo run:ios` when native dependencies change. The Supabase client
   is pure JavaScript, so nothing in this backend needs a rebuild.

## Screens

- `app/login.tsx` — email + password auth, plus guest sign-in
- `app/(tabs)/index.tsx` — Home: full-bleed map, long-press to place a pin
- `app/(tabs)/find.tsx` — Find: search your pins, plus live OpenStreetMap places
- `app/(tabs)/profile.tsx` — Profile: pin collage, avatar, stats
- `app/settings.tsx` — Appearance, display name, password, account (sign out,
  delete), privacy policy

Signed-out users are redirected to login by `src/components/AuthGate.tsx`.

## Backend

Everything server-side lives under `supabase/`.

### Database, policies and storage

`supabase/migrations/` is the source of truth for tables, row level security,
the storage bucket, and the realtime publication. Apply it with the CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste the migration into the dashboard's SQL editor if you'd rather not
link the project.

**Row level security is what enforces privacy**, not the `.eq("owner_id", …)`
filters in the app — those mirror the policy and document intent, but a
modified client can drop them. Storage policies can only see an object's name,
so file ownership is encoded in the path (`<user id>/…`); see `uploadImage` in
`src/lib/storage.ts` and never write a path that doesn't start with the owner's
id.

The `media` bucket is **private**. What is left in it — profile pictures, and
pin photos predating the Cloudinary move — is read through short-lived signed
URLs minted per path (`signPaths`), never through public URLs.

### Pin photos live in Cloudinary

Supabase Storage is 1 GB on the free plan, and several photos across up to 400
pins per user is what exhausts it first. Cloudinary's free plan is 25 credits a
month, a credit being a gigabyte of storage or of delivery.

Photos upload as `type=authenticated`, so both the original and any derived
version require a signature — an unsigned URL 404s. The signature is computed
in the Edge Function at upload time and stored on the row as `pin_photos.url`,
which is why reads need no signing round-trip.

**These URLs do not expire.** Cloudinary's expiring URLs are token-based and
gated behind the Advanced plan, so on this plan the signature is the whole
control. That is a real step down from storage's 24-hour signed URLs and is
disclosed in PRIVACY.md; the mitigation is that a URL is unguessable, useless
without its signature, and only ever stored on a row RLS already protects.

The app holds no Cloudinary credential. `CLOUDINARY_API_SECRET` can sign an
upload to any path in the account, so it lives only in the Edge Function
environment — the client asks `cloudinary-sign` for a signature scoped to one
asset, then posts the bytes to Cloudinary directly. Public ids are built
server-side from the caller's verified user id (`memoire/<user id>/pins/<pin
id>/<index>-<stem>`), which is the Cloudinary equivalent of the storage prefix
rule and the only thing keeping one account out of another's namespace.

Rows carry `provider`: `'cloudinary'` (`path` is the public id, `url` is the
signed URL) or `'supabase'` (`path` is a storage key, `url` is null). Both read
paths stay live, so photos taken before the move still render.

### Edge Functions

`supabase/functions/cloudinary-sign` mints Cloudinary signatures — one per
upload, scoped to a path built from the caller's verified id — and deletes
assets the caller owns. It needs the Cloudinary credentials, which are the one
thing on this project that is *not* auto-provisioned:

```bash
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy cloudinary-sign
```

`supabase/functions/delete-account` removes the caller's `auth.users` row —
the one thing a client can never do for itself, and what makes in-app account
deletion actually complete (App Review Guideline 5.1.1(v)). Deploy it:

```bash
npx supabase functions deploy delete-account
```

It needs no Supabase secrets — on the hosted platform `@supabase/server` picks
up the auto-provisioned environment — but it does read the Cloudinary
credentials, to purge the user's photos along with their account. For local
runs, copy `supabase/.env.example` to `supabase/.env` and use `npx supabase
functions serve --env-file supabase/.env`.

If the function isn't deployed the app still deletes all of a user's content
via RLS-scoped writes — it just leaves the empty account row behind.

### Auth settings

`supabase/config.toml` holds the auth settings sign-in depends on. Push them:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase config push
```

Two of those are load-bearing:

- **Anonymous sign-ins** (`enable_anonymous_sign_ins`) power "Look around
  first", and give an App Review tester a way in without credentials.
- **`enable_confirmations = false`.** This is what makes the app send no email
  at all, and it is not a preference — the project is on Supabase's built-in
  email service, which delivers only to pre-authorized org members and caps at
  2 messages an hour. Any flow that mails a real user is broken on it by
  construction. Setting this confirms signups instantly, so nothing is ever
  mailed.

  It is also what lets a guest keep their pins: Auth applies an email change
  without mailing only when the user is anonymous *and* autoconfirm is on, so
  `linkEmailToGuest` works and a "change my email" screen for an existing
  account would not. Don't add one without setting up SMTP first.

### Two things to know

Worth knowing before you build on top of it:

**There is no password reset.** A forgotten password is an unrecoverable
account, and the sign-up screen says so out loud rather than letting people
find out later. Deliberate scope call for v1 -- see "Adding password recovery"
below for what lifting it costs.

Changing a password *does* work, needs no email, and is unaffected: Settings ->
Password. It requires the current password, which Auth has no endpoint to
verify, so `changePassword` proves it with a sign-in as the same user --
`reauthenticate()` would mail a nonce and is therefore unavailable here.

### Adding password recovery

Recovery needs **custom SMTP**, for two independent reasons. Both are hard
blocks, and knowing them saves rediscovering them:

1. **Delivery.** Supabase's built-in email provider delivers only to
   pre-authorized members of your Supabase org, capped at 2 messages an hour.
   `resetPasswordForEmail` returns success regardless, so a real user simply
   waits for mail that never arrives.
2. **Templates.** Only projects with custom SMTP may edit the auth email
   templates. Without it you get the stock recovery mail, which contains
   `{{ .ConfirmationURL }}` -- a link -- and nothing else.

That second one decides the shape of the whole feature:

- **With a custom template**, put `{{ .Token }}` in it and the mail carries a
  six-digit code. The app asks for the code and a new password on one screen,
  calls `verifyOtp({ email, token, type: 'recovery' })`, then `updateUser`.
  Nothing leaves the app. This is much the simpler build.
- **Without one**, you are stuck redeeming a link, and a link cannot point at
  `memoire://` -- mail opens in a browser, and a browser refuses to *redirect*
  into a custom scheme (Safari: "the address is invalid"). That needs a hosted
  hand-off page that navigates to the scheme, plus `site_url`,
  `additional_redirect_urls`, and a provider watching the launch URL for
  tokens in the fragment.

So: set up SMTP first, then build the code version. Both were built and
removed in this repo's history if you want the diff.

Whichever provider you pick, keep `enable_confirmations = false`. Recovery
mail is separate from signup confirmation, and turning confirmations on breaks
the guest upgrade (see "Auth settings" above).

Two provider notes worth having: **Resend** needs a fully verified domain
before it will send to anyone but you. **Brevo** needs no domain -- it
verifies a single sender address by emailing it a code -- but it cannot
DKIM-sign a `@gmail.com` sender, so it rewrites the From address to
`@brevosend.com` until you authenticate a domain. Gmail's own SMTP
(`smtp.gmail.com` with an app password) also works, needs no domain, and keeps
a real From address, at 500/day.

Also: **`config push` overwrites keys you didn't write.** It sends the fully
resolved config, so omitting `site_url` pushes the CLI default
(`http://127.0.0.1:3000`) over the project's value -- which is how reset
emails once came to point at localhost. And templates do *not* appear to push
to a hosted project at all; Supabase documents them as a Dashboard feature.
Expect to paste the template into the Dashboard by hand.

**`email_registered` is an email enumeration oracle.** The login form asks for
an address and then branches to either "enter your password" or "choose a
password", which means it has to know which before showing a field. Supabase
exposes no client API for that on purpose, so
`supabase/migrations/*_email_registered.sql` adds a `security definer` function
that answers it. Anyone with the publishable key — which ships in the app
binary — can ask whether an address has an account here. No pin, photo or
profile is reachable through it; row level security still covers all of those.
If that trade ever stops being acceptable, the fix is a one-step form that asks
for email and password together and lets a failed sign-in stay ambiguous.

## Layout

- `src/lib/supabase.ts` — the Supabase client
- `src/lib/auth.tsx` — `AuthProvider` / `useAuth`, and every auth action
- `src/lib/data.ts` — the app's two live queries (`usePins`, `useProfile`)
- `src/lib/store.ts` — the small subscribe-and-refetch primitive behind them
- `src/lib/cloudinary.ts` — pin photo uploads and deletes, via signed requests
- `src/lib/storage.ts` — avatar uploads and signed URLs for the media bucket
- `src/lib/haptics.ts` — the app's haptic vocabulary; don't call expo-haptics directly
- `src/components/AuthGate.tsx` — redirects signed-out users to `/login`
- `src/components/Map.tsx` — Apple Maps on iOS, Google Maps on Android
- `supabase/migrations/` — schema, RLS, storage, realtime
- `supabase/functions/` — Edge Functions

## Before submitting to the App Store

See the placeholders that must be filled in first:

- `eas.json` — Apple ID, App Store Connect app id, team id. **Still
  placeholders.** `eas submit` will also prompt for these interactively.
- Enable Pages once, so the privacy policy URL resolves: repo Settings →
  Pages → Source: **GitHub Actions**.
- Confirm `delete-account` is deployed. Without it `deleteAccountData` falls
  back to erasing every pin, photo and the profile — but the `auth.users` row
  survives, so the email stays claimed. PRIVACY.md documents that outcome and
  points people at the support addresses, but deploying the function is what
  actually satisfies Guideline 5.1.1(v).

Done: `src/lib/places.ts` `CONTACT`, the `ios.privacyManifests` block, and
PRIVACY.md's placeholders.

### The privacy policy is published from PRIVACY.md

`.github/workflows/pages.yml` renders PRIVACY.md to HTML with
`scripts/build-privacy-page.py` and deploys it to
`https://unseenmeli.github.io/Memoire/` on every push to `main` that
touches the policy. That URL goes in App Store Connect under App Privacy
-> Privacy Policy URL.

The policy is rendered from PRIVACY.md rather than hand-maintained, so the
published version cannot drift from the one in the repo — which matters,
because it has to keep describing what the app actually does. The workflow
fails the build if a placeholder survives into the rendered page. Build it
locally with:

```bash
pip install markdown
python scripts/build-privacy-page.py --out _site
```

**Keep PRIVACY.md in step with the code.** It is a factual description of the
app's data flows, so any change to what leaves the device belongs in that
table — the reverse-geocode lookup on pin save is one such row.

### The iOS privacy manifest

`ios.privacyManifests` in app.json is not optional and Expo does not generate
it for you. Apple rejects uploads that touch a "required reason" API without
declaring it (`ITMS-91053`), and several dependencies here do.

The declared set is the union of the manifests our own dependencies ship, so
it is derived rather than guessed. Re-derive it after adding any native
dependency:

```bash
find node_modules -name PrivacyInfo.xcprivacy
```

| Category | Reasons | Comes from |
|---|---|---|
| `FileTimestamp` | `C617.1` | react-native, async-storage, react-native-maps |
| `FileTimestamp` | `0A2A.1`, `3B52.1` | expo-file-system |
| `DiskSpace` | `E174.1`, `85F4.1` | expo-file-system |
| `UserDefaults` | `CA92.1` | react-native, expo-constants |

`NSPrivacyTracking` is `false`: the app has no analytics or advertising SDK
and does no cross-app tracking.

### Why `expo-location` is deliberately not in `plugins`

The iOS location usage string is set by hand in `ios.infoPlist` instead. This
is on purpose — do not "fix" it by adding the plugin. `withLocation` applies
its permission defaults over *all three* iOS location keys, and any you don't
explicitly pass `false` get written with a generic fallback string. Adding the
plugin the obvious way therefore puts `NSLocationAlwaysUsageDescription` and
`NSLocationAlwaysAndWhenInUseUsageDescription` into Info.plist, telling App
Review the app wants background location when it only ever asks for
when-in-use (`useViewerLocation` in `src/lib/distance.ts`). Fewer keys is the
better answer here.
