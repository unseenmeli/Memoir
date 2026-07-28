import type { Region } from "react-native-maps";

// Tbilisi, Georgia — the first-launch view.
export const INITIAL_REGION: Region = {
  latitude: 41.7151,
  longitude: 44.8271,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// Remembered across map remounts (e.g. entering/leaving full-screen) so the
// map always reopens where the user left off instead of jumping home.
let lastRegion: Region = INITIAL_REGION;

export function getLastRegion(): Region {
  return lastRegion;
}

export function setLastRegion(region: Region): void {
  lastRegion = region;
}
