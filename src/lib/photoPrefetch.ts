import { useEffect } from "react";
import { Image } from "react-native";

/**
 * Warms the image cache for photos the user is likely to open next.
 *
 * Opening a pin from the map used to show an empty frame for a beat: the
 * details sheet was the very first thing to ask for that photo, so the fetch
 * only started once the sheet was already on screen. The Find and Profile tabs
 * never had the problem, because their rows render the same URL as a thumbnail
 * and the cache is warm by the time you tap through.
 *
 * `Image.prefetch` fills that same cache ahead of time, so the sheet paints
 * from memory instead of from the network.
 */

/**
 * Ceiling on how many photos to pull down speculatively. Prefetching is a bet
 * that the user will open something; making that bet across hundreds of pins
 * spends their data on photos they'll never look at.
 */
const MAX_PREFETCH = 40;

/**
 * URLs already requested this session. Signed URLs are cached by path (see
 * `signPaths` in lib/storage.ts), so a refetch hands back the identical string
 * and without this the whole list would be re-requested on every realtime
 * event — `Image.prefetch` would dedupe against its own cache, but there's no
 * reason to make the call at all.
 */
const requested = new Set<string>();

export function usePrefetchPhotos(urls: string[]): void {
  // Depend on the contents rather than the array identity: a new array with
  // the same URLs arrives on every render, and re-running per render would
  // defeat the point.
  const key = urls.join("|");

  useEffect(() => {
    for (const url of urls.slice(0, MAX_PREFETCH)) {
      if (!url || requested.has(url)) continue;
      requested.add(url);
      // Best-effort by definition — a failed prefetch just means the photo
      // loads the ordinary way when the sheet opens.
      Image.prefetch(url).catch(() => {
        requested.delete(url);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
