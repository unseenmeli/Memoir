import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useEffect, useState } from "react";

/**
 * The viewer's position, and distances from it.
 *
 * This replaces country-code comparison as the "near/far" signal. Country was
 * far too coarse to be useful — every pin in the country read as NEARBY, so a
 * place 400km away looked as close as one down the street.
 */

export type Coords = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in km (haversine). Accurate enough at city scale. */
export function distanceKm(from: Coords, to: Coords): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Human-readable distance. Metres below 1km (people think in blocks at that
 * scale), one decimal below 10km, whole numbers above.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km / 1000)}k km`;
}

/** Distance bands, for coloring/grouping rather than raw numbers. */
export type Proximity = "here" | "near" | "city" | "far";

export function proximityOf(km: number | null): Proximity | null {
  if (km === null || !Number.isFinite(km)) return null;
  if (km < 0.5) return "here";
  if (km < 3) return "near";
  if (km < 50) return "city";
  return "far";
}

export const PROXIMITY_LABEL: Record<Proximity, string> = {
  here: "HERE",
  near: "NEARBY",
  city: "IN TOWN",
  far: "FAR",
};

/**
 * Where we assume someone is until their device tells us otherwise: central
 * Tbilisi. This app is a Tbilisi city guide first, so that assumption is right
 * far more often than `null` is useful — a null viewer means every distance
 * renders blank and search loses its nearest-first ordering, which is a worse
 * default than being slightly wrong for an out-of-town user for one second.
 *
 * Matches `INITIAL_REGION` in mapRegion.ts, which frames the map on the same
 * spot for the same reason.
 */
export const DEFAULT_COORDS: Coords = {
  latitude: 41.7151,
  longitude: 44.8271,
};

/**
 * The viewer's current coordinates.
 *
 * Starts at `DEFAULT_COORDS` (central Tbilisi), then upgrades to the device's
 * last known position and finally to a fresh fix. Permission denial is a
 * normal outcome, not an error — it just means the default stands.
 */
/**
 * Has the viewer been asked about location yet, and what did they say?
 *
 * Stored locally rather than derived from the OS because iOS reports
 * "undetermined" both before we ask and after a user resets privacy settings,
 * and because the OS dialog can only ever be shown once — we need our own
 * record of having shown the priming screen.
 */
const ASKED_KEY = "location:asked";

/**
 * Notifies mounted hooks that permission changed. Without this, granting from
 * the primer wouldn't reach a Map that mounted underneath it — the map would
 * sit on the Tbilisi default until the next remount.
 */
const permissionListeners = new Set<() => void>();

function notifyPermissionChanged(): void {
  for (const listener of permissionListeners) listener();
}

export async function hasBeenAskedForLocation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markLocationAsked(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => {});
}

/**
 * Triggers the OS location prompt and returns whether it was granted.
 *
 * Call this from a deliberate user action — a button on the priming screen —
 * never on mount. iOS shows its dialog exactly once per install, so spending
 * it before the person understands what it's for is how you get a permanent
 * "Don't Allow".
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    await markLocationAsked();
    notifyPermissionChanged();
    return status === "granted";
  } catch {
    await markLocationAsked();
    return false;
  }
}

/** Reads the current position without ever prompting. */
async function readPosition(): Promise<Coords | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;

    // Cached fix: instant, avoids a cold GPS wait before anything ranks.
    const last = await Location.getLastKnownPositionAsync();
    const current = last
      ? last
      : await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
  } catch {
    // Location services off, permission revoked mid-flight, timeout — all
    // non-fatal. The Tbilisi default stands.
    return null;
  }
}

/**
 * The viewer's coordinates.
 *
 * Starts at `DEFAULT_COORDS` (central Tbilisi) and upgrades to the device's
 * real position *only if permission was already granted*. This never prompts:
 * asking is the priming screen's job (see `requestLocationPermission`), so a
 * screen mounting can't burn the one dialog iOS gives us.
 */
export function useViewerLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(DEFAULT_COORDS);
  const { granted } = useLocationPermission();

  useEffect(() => {
    if (!granted) return;
    let active = true;
    readPosition().then((position) => {
      if (active && position) setCoords(position);
    });
    return () => {
      active = false;
    };
  }, [granted]);

  return coords;
}

/**
 * Live view of whether location is granted, so screens can re-read the
 * position after the priming screen resolves without remounting.
 */
export function useLocationPermission(): {
  granted: boolean;
  refresh: () => void;
} {
  const [granted, setGranted] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    const check = () => {
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          if (active) setGranted(status === "granted");
        })
        .catch(() => {});
    };

    check();
    // Re-check when the primer resolves, so a grant reaches screens that were
    // already mounted behind it.
    const listener = () => check();
    permissionListeners.add(listener);
    return () => {
      active = false;
      permissionListeners.delete(listener);
    };
  }, [nonce]);

  return { granted, refresh: () => setNonce((n) => n + 1) };
}
