import { Image } from "react-native";
import type { PinPhoto } from "./data";

/**
 * The sample pins a brand-new guest session starts with.
 *
 * Kept apart from `demo.ts` because two sides need them: `demo.ts` writes the
 * pin rows, and `data.ts` gives those rows their photos back on every read.
 * Importing `demo.ts` from `data.ts` would be a require cycle, since the
 * seeding half needs `invalidatePins`.
 *
 * The artwork in `assets/examples` is generated placeholder scenery — swap in
 * real photographs you own the rights to and nothing else here has to change,
 * as long as the filenames still resolve.
 */
export const EXAMPLES = [
  {
    name: "Example — the lookout",
    description:
      "This is a sample pin. Open it to see how a place looks with a photo, or delete it and drop your own.",
    tags: ["example", "views"],
    offset: { lat: 0.006, lng: 0.004 },
    image: require("../../assets/examples/lookout.png"),
    // A fixed, well-formed uuid that no `pin_photos` row will ever have. If a
    // guest removes the photo while editing, `deletePhotoRows` queries for it,
    // matches nothing and carries on; any other shape would fail the uuid cast.
    photoId: "00000000-0000-4000-8000-000000000001",
  },
  {
    name: "Example — golden hour",
    description:
      "Long-press anywhere on the map to add a place of your own, with photos and labels.",
    tags: ["example", "golden hour"],
    offset: { lat: -0.005, lng: 0.007 },
    image: require("../../assets/examples/goldenhour.png"),
    photoId: "00000000-0000-4000-8000-000000000002",
  },
  {
    name: "Example — the long way home",
    description:
      "Pins are private to you. Search them by name, description or label from the Find tab.",
    tags: ["example", "walks"],
    offset: { lat: 0.003, lng: -0.008 },
    image: require("../../assets/examples/walk.png"),
    photoId: "00000000-0000-4000-8000-000000000003",
  },
];

/**
 * The bundled photo for a sample pin, or nothing for any other pin.
 *
 * Sample photos are never uploaded or given a `pin_photos` row: every guest
 * would otherwise add the same three images to Cloudinary and the database.
 * They are attached here at read time, straight from the app bundle, instead.
 *
 * Matched on name and description together, which nobody types by accident.
 * Editing either turns the pin into an ordinary one without a photo, which is
 * the honest outcome for a sample that has been rewritten.
 *
 * The path follows the `{index}-{name}` shape `sortPhotos` reads, at index 0,
 * so the bundled photo sorts first and a guest's own uploads on the same pin
 * get indices after it.
 */
export function examplePhotos(pin: {
  name: string;
  description: string;
}): PinPhoto[] {
  const example = EXAMPLES.find(
    (entry) =>
      entry.name === pin.name && entry.description === pin.description,
  );
  if (!example) return [];

  // Resolves to Metro's dev server in development and to the file inside the
  // app bundle in a release build; `<Image source={{ uri }}>` loads both.
  const { uri } = Image.resolveAssetSource(example.image);
  return [{ id: example.photoId, path: "example/0-example", url: uri }];
}
