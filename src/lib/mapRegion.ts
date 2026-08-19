import type { Region } from "react-native-maps";

/**
 * Home-screen chrome geometry. Shared so the map's floating controls can line
 * up beneath the header's buttons instead of both sides guessing at offsets.
 */
export const HINT_HEIGHT = 26;
export const HEADER_HEIGHT = 88;

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

/**
 * The zoom level a dropped pin is framed at (~1.1km of ground). Close enough
 * to see exactly where the pin landed, wide enough to keep the surrounding
 * streets for context — zooming to a single building loses your bearings.
 */
export const PLACEMENT_DELTA = 0.01;

/** One press of the +/− buttons halves or doubles the visible span. */
const ZOOM_STEP = 2;
/** Closest allowed zoom — roughly a single building. */
const MIN_DELTA = 0.0005;
/** Widest allowed zoom — well past continent scale, so the globe stays sane. */
const MAX_DELTA = 60;

/**
 * The region one zoom step in or out from `current`, clamped so repeated
 * presses can't run past a usable scale in either direction.
 */
export function zoomedRegion(current: Region, direction: "in" | "out"): Region {
  const factor = direction === "in" ? 1 / ZOOM_STEP : ZOOM_STEP;
  const latitudeDelta = Math.min(
    Math.max(current.latitudeDelta * factor, MIN_DELTA),
    MAX_DELTA,
  );
  // Preserve the aspect ratio so the viewport doesn't visibly distort.
  const aspect =
    current.longitudeDelta && current.latitudeDelta
      ? current.longitudeDelta / current.latitudeDelta
      : 1;

  return {
    latitude: current.latitude,
    longitude: current.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta * aspect,
  };
}

/**
 * How far the placement zoom is allowed to travel from where you already are.
 * Without these, long-pressing while zoomed way out slams the camera through
 * several orders of magnitude, which is disorienting.
 */
const MAX_ZOOM_IN_FACTOR = 40; // never close in by more than 40×
const MAX_ZOOM_OUT_FACTOR = 3; // never pull back by more than 3×
/** Never end up wider than this — past it the new pin is an invisible speck. */
const WIDEST_USEFUL_DELTA = 0.05;

/**
 * Frames a newly-placed pin.
 *
 * Rather than snapping to a fixed zoom, this moves *toward* the placement
 * zoom from wherever the camera already is, capped in both directions:
 *
 *  - held while zoomed far out → zooms in, but only so far per step
 *  - held while already very close → eases back out for context
 *  - held near the target zoom → barely moves at all
 *
 * The result is a camera that always ends up in a comfortable middle ground
 * instead of jumping the full distance.
 */
export function placementRegion(
  coordinate: { latitude: number; longitude: number },
  current: Region = lastRegion,
): Region {
  // Work off latitudeDelta: longitudeDelta varies with latitude, so it isn't
  // a stable measure of "how zoomed in am I".
  const currentDelta = current.latitudeDelta || PLACEMENT_DELTA;

  const floor = currentDelta / MAX_ZOOM_IN_FACTOR;
  const ceiling = currentDelta * MAX_ZOOM_OUT_FACTOR;
  // Move toward the placement zoom, but never further than the caps allow…
  const eased = Math.min(Math.max(PLACEMENT_DELTA, floor), ceiling);
  // …and never so wide that the pin you just dropped is invisible.
  const delta = Math.min(eased, WIDEST_USEFUL_DELTA);

  // Keep the viewport's aspect ratio so the map doesn't visibly stretch.
  const aspect =
    current.longitudeDelta && current.latitudeDelta
      ? current.longitudeDelta / current.latitudeDelta
      : 1;

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta * aspect,
  };
}
