/**
 * Strips the "Always" location purpose strings from the generated Info.plist.
 *
 * `expo-location` contributes all three location keys through autolinking —
 * WhenInUse, Always, and AlwaysAndWhenInUse — whether or not the package is
 * listed in `plugins`. Setting them to `false` in app.json does not remove
 * them; the autolinked values win the merge.
 *
 * Memoire only ever calls `requestForegroundPermissionsAsync`
 * (src/lib/distance.ts), so shipping Always keys would tell App Review the app
 * wants background location it never asks for — an easy way to draw questions,
 * or a rejection, over a capability we don't use.
 *
 * This runs after the plist is assembled and deletes the two unused keys.
 */
const { withInfoPlist } = require("expo/config-plugins");

const UNUSED_KEYS = [
  "NSLocationAlwaysUsageDescription",
  "NSLocationAlwaysAndWhenInUseUsageDescription",
];

module.exports = function withWhenInUseLocationOnly(config) {
  return withInfoPlist(config, (cfg) => {
    for (const key of UNUSED_KEYS) {
      delete cfg.modResults[key];
    }
    return cfg;
  });
};
