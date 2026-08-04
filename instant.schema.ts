import { i } from "@instantdb/react-native";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    // System entity managed by Instant Storage; uploaded files show up here
    // with a `url` and `path`. Declared so pin photos can link to it below.
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    // A saved place in the shared "dictionary of places".
    pins: i.entity({
      name: i.string(),
      description: i.string(),
      latitude: i.number(),
      longitude: i.number(),
      // ISO 3166-1 alpha-2 (e.g. "GE"), resolved when the pin is created.
      // Indexed so search can rank same-country pins first. Optional because
      // pins created before this field existed won't have it.
      country: i.string().indexed().optional(),
      // Free-form labels ("brunch", "rooftop"), stored normalized (lowercase,
      // trimmed, deduped) so filtering and counting don't need to re-clean
      // them. Optional because pins predate the field.
      tags: i.json<string[]>().optional(),
      createdAt: i.number().indexed(),
    }),
    // Public profile for a signed-in user. One per $user.
    profiles: i.entity({
      // Unique handle shown on the profile page.
      displayName: i.string().unique().indexed(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    // Each pin belongs to one user; a user has many pins.
    pinOwner: {
      forward: { on: "pins", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "pins" },
    },
    // Each pin has many photos; a photo belongs to one pin.
    pinPhotos: {
      forward: { on: "pins", has: "many", label: "photos" },
      reverse: { on: "$files", has: "one", label: "pin" },
    },
    // Each profile belongs to exactly one user, and vice versa.
    profileUser: {
      forward: { on: "profiles", has: "one", label: "user" },
      reverse: { on: "$users", has: "one", label: "profile" },
    },
    // Each profile has one avatar file (optional).
    profileAvatar: {
      forward: { on: "profiles", has: "one", label: "avatar" },
      reverse: { on: "$files", has: "one", label: "profileOf" },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Instant's pattern: keeps "AppSchema" in type errors instead of the inferred shape.
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
