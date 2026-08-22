# new_era

iOS app — Expo (SDK 54) + Expo Router + NativeWind + InstantDB.

A private map diary: drop a pin on a place, give it a name, photos and labels,
and find it again later. Pins are visible only to the person who made them.

## Setup

1. Create an app at [instantdb.com/dash](https://instantdb.com/dash) and copy the App ID.
2. Add it to `.env`:

   ```
   EXPO_PUBLIC_INSTANT_APP_ID=your-app-id
   ```

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
   re-run `expo run:ios` when native dependencies change.

## Screens

- `app/login.tsx` — magic-code auth (email → 6-digit code), plus guest sign-in
- `app/(tabs)/index.tsx` — Home: full-bleed map, long-press to place a pin
- `app/(tabs)/find.tsx` — Find: search your pins, plus live OpenStreetMap places
- `app/(tabs)/profile.tsx` — Profile: pin collage, avatar, stats
- `app/settings.tsx` — Appearance, display name, account (sign out, delete)

Signed-out users are redirected to login by `src/components/AuthGate.tsx`.

## Instant schema & permissions

`instant.schema.ts` and `instant.perms.ts` are the source of truth. Push changes with:

```bash
npx instant-cli@latest push
```

**Permissions are what enforce privacy**, not the `where` clauses in the app.
Note that `$files` rules can only see `data.path`, so file ownership is encoded
in the storage path (`<auth.id>/...`) — see `uploadPhoto` in `src/lib/pins.ts`.

## Layout

- `src/lib/db.ts` — the Instant client (`db`), typed against the schema
- `src/lib/haptics.ts` — the app's haptic vocabulary; don't call expo-haptics directly
- `src/components/AuthGate.tsx` — redirects signed-out users to `/login`
- `src/components/Map.tsx` — Apple Maps on iOS, Google Maps on Android
- `instant.schema.ts` — entities and links
- `instant.perms.ts` — permission rules

## Before submitting to the App Store

See the placeholders that must be filled in first:

- `eas.json` — Apple ID, App Store Connect app id, team id, Instant app ids
- `src/lib/places.ts` — `CONTACT`, required by Nominatim's usage policy
- A hosted privacy policy URL (required by App Store Connect)
