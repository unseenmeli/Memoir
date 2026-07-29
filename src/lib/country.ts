import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Resolves the viewer's country (ISO 3166-1 alpha-2) from their IP address, so
 * search can rank places in their own country first.
 *
 * IP geolocation is a best-effort signal: it's wrong behind a VPN, unavailable
 * offline, and depends on a third party staying up. Everything here is built
 * so a failure degrades to "no country" — search still works, it just doesn't
 * apply the same-country boost.
 */

const STORAGE_KEY = "country:code";
const ENDPOINT = "https://ipapi.co/json/";
const TIMEOUT_MS = 4000;

/** ISO 3166-1 alpha-2, uppercase — or null if we couldn't determine it. */
export type CountryCode = string | null;

let inFlight: Promise<CountryCode> | null = null;

function isValidCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

/** Last known country, read from disk. Instant, and works offline. */
export async function getCachedCountry(): Promise<CountryCode> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return isValidCode(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Looks up the country by IP. Falls back to the cached value on any failure
 * (offline, timeout, rate limit, malformed response) so callers always get the
 * best answer available rather than an exception.
 */
export async function fetchCountry(): Promise<CountryCode> {
  // Collapse concurrent callers onto one request — several screens may ask at
  // once on startup, and the service rate-limits by IP.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const body = (await response.json()) as { country_code?: unknown };
      const code = String(body.country_code ?? "").toUpperCase();
      if (!isValidCode(code)) throw new Error("no country_code in response");

      await AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
      return code;
    } catch {
      // Offline / blocked / rate-limited — last known country beats nothing.
      return getCachedCountry();
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}
