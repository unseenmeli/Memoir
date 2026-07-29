import type { InstantRules } from "@instantdb/react-native";

// Pins form a shared "dictionary of places": anyone signed in can view every
// pin, but only the pin's owner can edit or delete it. The owner link is set
// in the same transaction as the create, so create only checks that the user
// is signed in.
const rules = {
  pins: {
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('owner.id')"],
  },
  // Profiles are public to read; only the profile's own user can change it.
  // The user link is set in the create transaction, so create only checks auth.
  profiles: {
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('user.id')"],
  },
  $files: {
    allow: {
      view: "true",
      create: "auth.id != null",
      delete: "auth.id != null",
    },
  },
} satisfies InstantRules;

export default rules;
