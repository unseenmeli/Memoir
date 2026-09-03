import { Asset } from "expo-asset";
import { uploadPinPhoto } from "./cloudinary";
import { invalidatePins } from "./data";
import { INITIAL_REGION } from "./mapRegion";
import { supabase } from "./supabase";

/**
 * Sample pins dropped into a brand-new guest session.
 *
 * Two reasons this exists. App Review needs to see a working app rather than
 * an empty map — "we were unable to locate any features" is a standard 2.1
 * rejection, and with private pins a fresh account has nothing in it. And for
 * a real person tapping "Look around first", an empty map teaches nothing
 * about what the app is for.
 *
 * Named and tagged so they can never be mistaken for the user's own memories.
 *
 * The artwork in `assets/examples` is generated placeholder scenery — swap in
 * real photographs you own the rights to and nothing else here has to change,
 * as long as the filenames still resolve.
 */
const EXAMPLES = [
  {
    name: "Example — the lookout",
    description:
      "This is a sample pin. Open it to see how a place looks with a photo, or delete it and drop your own.",
    tags: ["example", "views"],
    offset: { lat: 0.006, lng: 0.004 },
    image: require("../../assets/examples/lookout.png"),
  },
  {
    name: "Example — golden hour",
    description:
      "Long-press anywhere on the map to add a place of your own, with photos and labels.",
    tags: ["example", "golden hour"],
    offset: { lat: -0.005, lng: 0.007 },
    image: require("../../assets/examples/goldenhour.png"),
  },
  {
    name: "Example — the long way home",
    description:
      "Pins are private to you. Search them by name, description or label from the Find tab.",
    tags: ["example", "walks"],
    offset: { lat: 0.003, lng: -0.008 },
    image: require("../../assets/examples/walk.png"),
  },
];

/**
 * Uploads one bundled image and attaches it to a pin. Returns quietly on any
 * failure — a sample photo is never worth failing a sign-in over.
 *
 * Goes to Cloudinary like any other pin photo — these are real rows on a real
 * pin, and routing them anywhere else would make `provider` a record of which
 * code path wrote a row rather than of where its bytes are. Index 0 because
 * that prefix is how `sortPhotos` in PinDetails recovers photo order.
 */
async function attachExamplePhoto(
  userId: string,
  pinId: string,
  image: number,
): Promise<void> {
  try {
    // A bundled asset isn't a readable file until it's been resolved: in a
    // release build it lives in the app bundle, in dev it's served by Metro.
    const asset = Asset.fromModule(image);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return;

    const uploaded = await uploadPinPhoto(pinId, 0, {
      uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      fileName: "example",
    });

    await supabase.from("pin_photos").insert({
      pin_id: pinId,
      owner_id: userId,
      provider: "cloudinary",
      path: uploaded.publicId,
      url: uploaded.url,
    });
  } catch {
    // Ignored on purpose — see above.
  }
}

/**
 * Creates the sample pins, then attaches their photos.
 *
 * Deliberately two steps. The pins are written first and awaited, so the map
 * has something on it the moment the guest lands; the uploads then run in the
 * background and each photo appears as it finishes, which the realtime
 * subscription folds into whatever screen is open. Blocking sign-in behind
 * three image uploads would make the friendliest button in the app the
 * slowest one.
 */
export async function seedExamplePins(userId: string): Promise<void> {
  const now = Date.now();

  const { data, error } = await supabase
    .from("pins")
    .insert(
      EXAMPLES.map((example, index) => ({
        owner_id: userId,
        name: example.name,
        description: example.description,
        tags: example.tags,
        latitude: INITIAL_REGION.latitude + example.offset.lat,
        longitude: INITIAL_REGION.longitude + example.offset.lng,
        // Staggered so "Recent" gives them a stable, sensible order.
        created_at: new Date(now - index * 1000).toISOString(),
      })),
    )
    .select("id,name");
  if (error) throw new Error(error.message);

  invalidatePins();

  // Matched by name rather than by position: a multi-row insert's RETURNING
  // order is not something to bet three photos on, and the sample names are
  // unique among themselves.
  const seeds = (data ?? []).flatMap((row) => {
    const example = EXAMPLES.find((entry) => entry.name === row.name);
    return example ? [{ pinId: row.id as string, image: example.image }] : [];
  });

  // Not awaited on purpose — see the note above. Caught so a failure can't
  // surface as an unhandled rejection after the screen has moved on.
  attachExamplePhotos(userId, seeds).catch(() => {});
}

async function attachExamplePhotos(
  userId: string,
  seeds: { pinId: string; image: number }[],
): Promise<void> {
  for (const seed of seeds) {
    // Sequential, matching createPin: a handful of small images on a phone
    // connection is kinder one at a time than as three parallel PUTs.
    await attachExamplePhoto(userId, seed.pinId, seed.image);
  }
  invalidatePins();
}
