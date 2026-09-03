# Privacy Policy — New Era

**Last updated: 3 September 2026**

New Era is a private map diary. You save places you care about, with your own
notes and photos. **Your pins are visible only to you.** There is no sharing,
no feed, no following, and no way for another user of the app to see anything
you save.

Contact: **bnachkebia27@gmail.com** or **unseenmeli@gmail.com**.

## What we collect and why

| What | Why | Where it goes |
|---|---|---|
| Email address and password | To sign you in. Your password is stored only as a salted hash — nobody, including us, can read it back. | Stored by Supabase, our backend provider. **We never email you** — the app sends no mail at all, so there is nothing to unsubscribe from. |
| Display name | Shown on your own profile screen. Defaults to the part of your email before the `@`, and you can change it at any time. | Stored by Supabase. |
| Photos you add to a pin | So your places look like your places. | Stored by **Cloudinary**, a third-party image host, as *authenticated* assets: each one is reachable only through a signed URL that we generate and keep attached to your private pin. Images are resized and re-encoded before upload. |
| Your profile picture | To show on your own profile screen. | Stored by Supabase Storage in a private bucket, readable only by your account. |
| Pin contents — name, description, labels, and the map coordinates you chose | This is the app. | Stored by Supabase, private to your account. |
| Approximate country, derived from your IP address | To rank place-search results in your own country first. | Your IP address is sent to **ipapi.co**, a third-party service, which returns a two-letter country code. Only that country code is stored. See ipapi.co's own privacy policy. |
| The country a pin is in | To rank saved-pin search results, and to show how many countries you've pinned on your profile. | When you save a pin, **that pin's coordinates** — the spot you pressed on the map, not your device's location — are sent to **nominatim.openstreetmap.org**, operated by the OpenStreetMap Foundation, which returns the country they fall in. Only the two-letter country code is stored on the pin. See their privacy policy. |
| Text you type into place search | To search OpenStreetMap for real-world places. | Sent to **nominatim.openstreetmap.org**, operated by the OpenStreetMap Foundation. See their privacy policy. |

## Your device's location

If you allow location access, the app uses your position to sort places by how
far away they are and to show where you are on the map.

**Your device location is never uploaded and never stored.** All distance
calculations happen on your phone. If you decline location access, the app
works normally — it just doesn't show distances.

Note that this is different from the coordinates *of a pin*, which you choose
by pressing a spot on the map. Those are saved, because they are the pin — and
they are the only coordinates that ever leave your phone: once, when you save
the pin, to look up which country it's in (see the table above).

## What we do not do

- We do not sell your data.
- We do not use it for advertising, and we do not track you across other apps
  or websites.
- We do not run analytics or advertising SDKs.
- No other user of the app can see your pins, photos, notes, or location.

## Deleting your account

Settings → **Delete account** permanently erases your pins, their photos (at
Cloudinary), your profile picture, your profile, and your account record itself
— including your email address, which is then free to be used again. This
cannot be undone.

In the rare case that the deletion service is unreachable, the app still
erases all of the above — every pin, photo, your profile picture and your
profile — but the empty account record holding your email address can survive.
Nothing of yours is left in it, but that address stays claimed. Write to either
contact address above and we will remove it.

## Children

New Era is not directed at children under 13, and we do not knowingly collect
information from them.

## Data retention

Your content is kept until you delete it or delete your account.

Pin photo links do not expire on their own. A signed Cloudinary URL stays valid
for as long as the photo exists, so anyone who obtained one — which requires
access to your account — could keep using it until you delete that photo.
Deleting the photo, the pin, or your account removes the image itself, at which
point the link stops resolving.

## Service providers

- **Supabase** — database, authentication, and profile-picture storage.
- **Cloudinary** — pin photo storage and delivery. See Cloudinary's own privacy
  policy.
- **ipapi.co** — IP-to-country lookup.
- **OpenStreetMap Foundation (Nominatim)** — place search, and looking up which
  country a pin's coordinates fall in.
- **Apple** — app distribution.

## Changes

If this policy changes materially, we'll update the date at the top and post
the new version at this URL.
