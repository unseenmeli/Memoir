import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { CountryCode } from "./country";

/**
 * Live POI search via OpenStreetMap's Nominatim — free, no API key. Used for
 * "search for a restaurant" style queries; data is © OpenStreetMap
 * contributors, so results must stay attributed wherever they're shown.
 */

export type PlaceResult = {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2, uppercase, or null if Nominatim didn't return one. */
  countryCode: string | null;
};

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
// Debounced well under Nominatim's 1-request/second usage policy — this is a
// deliberate "you paused typing" search, not per-keystroke autocomplete.
const DEBOUNCE_MS = 500;
const TIMEOUT_MS = 6000;
const RESULT_LIMIT = 8;

// Nominatim's usage policy requires identifying the calling app via
// User-Agent (or Referer) AND giving their operators a way to reach whoever
// runs it — a bundle id alone doesn't let anyone contact you before they
// throttle or block you. Browsers refuse to let scripts set User-Agent, so
// this only applies on native, where fetch has no such restriction.
//
// TODO(before submitting): replace the placeholder with a real contact address
// or project URL you actually monitor.
const CONTACT = "REPLACE_WITH_CONTACT_EMAIL_OR_URL";
const HEADERS =
  Platform.OS === "web"
    ? undefined
    : { "User-Agent": `NewEra/1.0 (com.newera.app; ${CONTACT})` };

type NominatimHit = {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: { country_code?: string };
};

function toPlaceResult(hit: NominatimHit): PlaceResult {
  return {
    id: String(hit.place_id),
    name: hit.name?.trim() || hit.display_name.split(",")[0].trim(),
    displayName: hit.display_name,
    latitude: parseFloat(hit.lat),
    longitude: parseFloat(hit.lon),
    countryCode: hit.address?.country_code
      ? hit.address.country_code.toUpperCase()
      : null,
  };
}

async function searchNominatim(
  query: string,
  opts: { countryCode?: string; signal: AbortSignal },
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(RESULT_LIMIT),
  });
  if (opts.countryCode) {
    params.set("countrycodes", opts.countryCode.toLowerCase());
  }

  const response = await fetch(`${ENDPOINT}?${params}`, {
    signal: opts.signal,
    headers: HEADERS,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = (await response.json()) as NominatimHit[];
  return body.map(toPlaceResult);
}

/**
 * Searches real-world places by name, debounced and cancellable.
 *
 * Runs two searches per query — one scoped to the viewer's own country, one
 * worldwide — and lists the local matches first, mirroring how saved-pin
 * search ranks same-country results first. A failed or superseded request
 * never clobbers newer results; it just leaves the previous ones in place.
 */
export function usePlaceSearch(
  query: string,
  viewerCountry: CountryCode,
): { results: PlaceResult[]; loading: boolean } {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    controllerRef.current?.abort();

    if (!trimmed) {
      controllerRef.current = null;
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;

    const debounce = setTimeout(() => {
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      (async () => {
        try {
          // One request per search, not two. This used to fire a
          // country-scoped and a worldwide query in parallel, which made the
          // "well under 1 request/second" claim above false — two concurrent
          // requests per debounce is ~4/s while someone is actively typing,
          // and Nominatim's policy is read as no-concurrent-requests. Local
          // relevance is recovered by ranking rather than by a second call.
          const found = await searchNominatim(trimmed, {
            signal: controller.signal,
          }).catch(() => []);

          // A newer keystroke started a fresh request — don't overwrite it.
          if (controllerRef.current !== controller) return;

          const seen = new Set<string>();
          const merged: PlaceResult[] = [];
          // Same-country hits first: cheaper than a second round-trip and it
          // answers the same "places near me" intent.
          const ranked = viewerCountry
            ? [
                ...found.filter((p) => p.countryCode === viewerCountry),
                ...found.filter((p) => p.countryCode !== viewerCountry),
              ]
            : found;
          for (const place of ranked) {
            if (seen.has(place.id)) continue;
            seen.add(place.id);
            merged.push(place);
          }
          setResults(merged.slice(0, RESULT_LIMIT));
        } finally {
          clearTimeout(timeout);
          if (controllerRef.current === controller) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [query, viewerCountry]);

  return { results, loading };
}
