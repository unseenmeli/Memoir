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
 * The viewer's current coordinates, or null if unavailable.
 *
 * Uses the last known position first — it returns instantly and is plenty
 * accurate for ranking — then upgrades to a fresh fix. Permission denial is a
 * normal outcome, not an error: callers fall back to unranked distance.
 */
export function useViewerLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active || status !== "granted") return;

        // Cached fix: instant, avoids a cold GPS wait before anything ranks.
        const last = await Location.getLastKnownPositionAsync();
        if (active && last) {
          setCoords({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
          });
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (active) {
          setCoords({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }
      } catch {
        // Location services off, permission revoked mid-flight, timeout —
        // all non-fatal. Distance simply stays unavailable.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return coords;
}
