import type { InstantRules } from "@instantdb/react-native";

/**
 * Pins are PRIVATE. A pin, its photos, and a profile are visible only to the
 * user who owns them — this is a personal map diary, not a shared feed.
 * (Friends-visible pins are a later version; when that lands, `view` is the
 * rule that opens up, and Apple's user-generated-content requirements — report,
 * block, filtering, published contact info — apply from that release onward.)
 *
 * Two things are load-bearing here:
 *
 * 1. These rules, not the client queries, are what actually enforces privacy.
 *    The `$: { where: { "owner.id": ... } }` clauses in the app are defence in
 *    depth and intent-documentation; a modified client can drop them.
 *
 * 2. File ownership lives in the storage PATH. Instant exposes no metadata on
 *    `$files` except `data.path` — no link traversal — so `pins/<id>/...`
 *    could not be tied back to an owner at all. Every upload is therefore
 *    written under `<auth.id>/...` (see `uploadPhoto` in src/lib/pins.ts and
 *    `updateAvatar` in src/lib/profile.ts) and the prefix is the rule.
 */
const rules = {
  // Deny by default, so adding an entity to the schema can never silently ship
  // as world-readable — a new namespace is locked until it is named below.
  $default: {
    allow: { $default: "false" },
  },

  pins: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('owner.id')"],
  },

  profiles: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('user.id')"],
  },

  // `update` was previously absent entirely, and an unlisted action defaults
  // permissive — that plus `delete: "auth.id != null"` is what let any signed-in
  // account delete or overwrite every photo and avatar in the app.
  $files: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && data.path.startsWith(auth.id + '/')"],
  },
} satisfies InstantRules;

export default rules;
