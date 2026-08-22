# Privacy Policy — New Era

**Last updated: TODO — set this to the date you publish.**

> **Before publishing:** replace every `TODO` below, host this at a public URL,
> and paste that URL into App Store Connect. Apple will not accept a submission
> without a reachable privacy policy. Nothing here is legal advice — it
> describes what the app actually does as of this version, which is the part
> only you can get wrong.

New Era is a private map diary. You save places you care about, with your own
notes and photos. **Your pins are visible only to you.** There is no sharing,
no feed, no following, and no way for another user of the app to see anything
you save.

Contact: **TODO — support email address.**

## What we collect and why

| What | Why | Where it goes |
|---|---|---|
| Email address | To sign you in. We email you a one-time code; there is no password. | Stored by InstantDB, our backend provider. |
| Display name | Shown on your own profile screen. Defaults to the part of your email before the `@`, and you can change it at any time. | Stored by InstantDB. |
| Photos you add to a pin, and your profile picture | So your places look like your places. | Stored by InstantDB Storage, readable only by your account. Images are resized and re-encoded before upload. |
| Pin contents — name, description, labels, and the map coordinates you chose | This is the app. | Stored by InstantDB, private to your account. |
| Approximate country, derived from your IP address | To rank place-search results in your own country first. | Your IP address is sent to **ipapi.co**, a third-party service, which returns a two-letter country code. Only that country code is stored. See ipapi.co's own privacy policy. |
| Text you type into place search | To search OpenStreetMap for real-world places. | Sent to **nominatim.openstreetmap.org**, operated by the OpenStreetMap Foundation. See their privacy policy. |

## Your device's location

If you allow location access, the app uses your position to sort places by how
far away they are and to show where you are on the map.

**Your device location is never uploaded and never stored.** All distance
calculations happen on your phone. If you decline location access, the app
works normally — it just doesn't show distances.

Note that this is different from the coordinates *of a pin*, which you choose
by pressing a spot on the map. Those are saved, because they are the pin.

## What we do not do

- We do not sell your data.
- We do not use it for advertising, and we do not track you across other apps
  or websites.
- We do not run analytics or advertising SDKs.
- No other user of the app can see your pins, photos, notes, or location.

## Deleting your account

Settings → **Delete account** permanently erases your pins, their photos, your
profile picture, and your profile. This cannot be undone.

**TODO — one of these two must be true before you publish, and you must say
which:** either account deletion also removes your account record and frees
your email address for re-use, or it erases all of your content while an empty
account record holding your email address remains. The app as written does the
second unless you have added the server-side step. Say plainly which one it is,
and if it is the second, give people an email address they can write to in
order to have the remaining record removed.

## Children

New Era is not directed at children under 13, and we do not knowingly collect
information from them.

## Data retention

Your content is kept until you delete it or delete your account. Sign-in codes
are short-lived and expire on their own.

## Service providers

- **InstantDB** — database, file storage, and authentication.
- **ipapi.co** — IP-to-country lookup.
- **OpenStreetMap Foundation (Nominatim)** — place search.
- **Apple** — app distribution.

## Changes

If this policy changes materially, we'll update the date at the top and post
the new version at this URL.
