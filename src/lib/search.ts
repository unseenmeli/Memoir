import { useEffect, useState } from "react";
import { fetchCountry, getCachedCountry, type CountryCode } from "./country";
import { distanceKm, type Coords } from "./distance";
import { pinTags } from "./tags";

/**
 * The viewer's country, for search ranking. Reads the cached value first so
 * results can rank immediately, then refreshes from the network in the
 * background. Never throws — a failed lookup just leaves this null.
 */
export function useViewerCountry(): CountryCode {
  const [country, setCountry] = useState<CountryCode>(null);

  useEffect(() => {
    let active = true;
    getCachedCountry().then((cached) => {
      if (active && cached) setCountry(cached);
    });
    fetchCountry().then((fresh) => {
      if (active && fresh) setCountry(fresh);
    });
    return () => {
      active = false;
    };
  }, []);

  return country;
}

export type SearchablePin = {
  id: string;
  name: string;
  description: string;
  country?: string | null;
  latitude?: number;
  longitude?: number;
  tags?: unknown;
};

/** Normalizes for accent- and case-insensitive matching. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Strip combining marks so "Tbilisi" matches "Tbilisí".
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/**
 * Scores one pin against a query. Higher is better; 0 means "no match".
 *
 * Name matches outrank description matches, and a prefix match outranks a
 * match buried mid-string, so typing "tbi" surfaces "Tbilisi" above "Old Tbilisi
 * Cafe" above something merely mentioning it in its description.
 */
function scoreMatch(pin: SearchablePin, query: string): number {
  const name = normalize(pin.name);
  const description = normalize(pin.description);

  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  // Match at a word boundary ("old TBIlisi") beats mid-word ("isTBIlisi").
  if (new RegExp(`\\b${escapeRegExp(query)}`).test(name)) return 60;
  if (name.includes(query)) return 40;
  // An exact tag hit ("brunch") is a strong signal — someone deliberately
  // labelled this place that — so it outranks a passing description mention.
  const tags = pinTags(pin);
  if (tags.includes(query)) return 50;
  if (tags.some((tag) => tag.startsWith(query))) return 30;
  if (description.includes(query)) return 20;
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Distance from the viewer to a pin, or null if either position is unknown. */
export function pinDistanceKm(
  pin: SearchablePin,
  viewer: Coords | null,
): number | null {
  if (!viewer) return null;
  if (typeof pin.latitude !== "number" || typeof pin.longitude !== "number") {
    return null;
  }
  return distanceKm(viewer, {
    latitude: pin.latitude,
    longitude: pin.longitude,
  });
}

export type SearchOptions = {
  /** Viewer position, for distance ranking. Null falls back to name order. */
  viewer?: Coords | null;
  /** Only keep pins carrying every one of these (already-normalized) tags. */
  tags?: string[];
};

/**
 * Filters and ranks pins for a query.
 *
 * Ranking is match quality first, then real distance — so the thing you typed
 * still wins, but among comparable matches the closest one leads. Distance is
 * measured from GPS rather than compared by country, which was far too coarse
 * to distinguish "down the street" from "400km away".
 */
export function searchPins<T extends SearchablePin>(
  pins: T[],
  query: string,
  options: SearchOptions = {},
): T[] {
  const { viewer = null, tags: required = [] } = options;
  const normalized = normalize(query);

  const pool = required.length
    ? pins.filter((pin) => {
        const own = pinTags(pin);
        return required.every((tag) => own.includes(tag));
      })
    : pins;

  // No query + a tag filter is a browse, not a search: keep everything that
  // matched the tags and just order it by distance.
  if (!normalized) {
    if (!required.length) return [];
    return sortByDistance(pool, viewer);
  }

  const scored: { pin: T; score: number; km: number | null }[] = [];
  for (const pin of pool) {
    const score = scoreMatch(pin, normalized);
    if (score === 0) continue;
    scored.push({ pin, score, km: pinDistanceKm(pin, viewer) });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // Unknown distance sorts last rather than pretending to be at zero.
    const aKm = a.km ?? Number.POSITIVE_INFINITY;
    const bKm = b.km ?? Number.POSITIVE_INFINITY;
    if (aKm !== bKm) return aKm - bKm;
    return a.pin.name.localeCompare(b.pin.name);
  });

  return scored.map((entry) => entry.pin);
}

/** Nearest-first, with unknown positions last and a stable name tiebreak. */
export function sortByDistance<T extends SearchablePin>(
  pins: T[],
  viewer: Coords | null,
): T[] {
  return [...pins].sort((a, b) => {
    const aKm = pinDistanceKm(a, viewer) ?? Number.POSITIVE_INFINITY;
    const bKm = pinDistanceKm(b, viewer) ?? Number.POSITIVE_INFINITY;
    if (aKm !== bKm) return aKm - bKm;
    return a.name.localeCompare(b.name);
  });
}
