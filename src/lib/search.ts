import { useEffect, useState } from "react";
import { fetchCountry, getCachedCountry, type CountryCode } from "./country";

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
  if (description.includes(query)) return 20;
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Filters and ranks pins for a query.
 *
 * Pins in the viewer's own country are ranked above everything else — that's
 * the "locations from your country pop up first" rule. Within each group the
 * ordering is by match quality, then alphabetical so results are stable rather
 * than shuffling between renders.
 */
export function searchPins<T extends SearchablePin>(
  pins: T[],
  query: string,
  viewerCountry: CountryCode,
): T[] {
  const normalized = normalize(query);
  if (!normalized) return [];

  const scored: { pin: T; score: number; local: boolean }[] = [];
  for (const pin of pins) {
    const score = scoreMatch(pin, normalized);
    if (score === 0) continue;
    scored.push({
      pin,
      score,
      // Unknown country is never "local" — better to under-promote than to
      // wrongly float a foreign pin to the top.
      local: Boolean(viewerCountry && pin.country === viewerCountry),
    });
  }

  scored.sort((a, b) => {
    if (a.local !== b.local) return a.local ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return a.pin.name.localeCompare(b.pin.name);
  });

  return scored.map((entry) => entry.pin);
}
