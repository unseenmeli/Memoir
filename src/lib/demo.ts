import { id } from "@instantdb/react-native";
import { Asset } from "expo-asset";
import { db } from "./db";
import { INITIAL_REGION } from "./mapRegion";

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
 * Uploads one bundled image and returns its `$files` id, or null if anything
 * goes wrong. A sample photo is never worth failing a sign-in over.
 *
 * The path has to start with the owner's auth id — that prefix is what the
 * `$files` permission rule checks (see instant.perms.ts) — and the basename
 * has to start with `{index}-`, which is how `photoPathIndex` in PinDetails
 * recovers photo order.
 */
async function uploadExamplePhoto(
  userId: string,
  pinId: string,
  image: number,
): Promise<string | null> {
  try {
    // A bundled asset isn't a readable file until it's been resolved: in a
    // release build it lives in the app bundle, in dev it's served by Metro.
    const asset = Asset.fromModule(image);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return null;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { data } = await db.storage.uploadFile(
      `${userId}/pins/${pinId}/0-example.png`,
      blob,
      { contentType: "image/png" },
    );
    return data.id;
  } catch {
    return null;
  }
}

/**
 * Creates the sample pins, then attaches their photos.
 *
 * Deliberately two steps. The pins are written first and awaited, so the map
 * has something on it the moment the guest lands; the uploads then run in the
 * background and the photos appear as they finish, which Instant syncs into
 * the open screen on its own. Blocking sign-in behind three image uploads
 * would make the friendliest button in the app the slowest one.
 */
export async function seedExamplePins(userId: string): Promise<void> {
  const now = Date.now();
  const seeds = EXAMPLES.map((example) => ({ ...example, pinId: id() }));

  await db.transact(
    seeds.map((seed, index) =>
      db.tx.pins[seed.pinId]
        .update({
          name: seed.name,
          description: seed.description,
          tags: seed.tags,
          latitude: INITIAL_REGION.latitude + seed.offset.lat,
          longitude: INITIAL_REGION.longitude + seed.offset.lng,
          // Staggered so "Recent" gives them a stable, sensible order.
          createdAt: now - index * 1000,
        })
        .link({ owner: userId }),
    ),
  );

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
    const fileId = await uploadExamplePhoto(userId, seed.pinId, seed.image);
    if (!fileId) continue;
    await db.transact(
      db.tx.pins[seed.pinId].link({ photos: [fileId] }),
    ).catch(() => {});
  }
}
