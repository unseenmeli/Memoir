import { useCallback, useRef, useState } from "react";
import { useAuth } from "./auth";
import { refreshAll } from "./data";
import { haptics } from "./haptics";
import { withTimeout } from "./timeout";

/**
 * Pull-to-refresh for the pin lists.
 *
 * Under Instant this gesture was mostly theatre: `useQuery` held a live
 * subscription, there was no "fetch again" call to make, and all the handler
 * could honestly do was wait for a dropped socket to come back. Against
 * Supabase it does the obvious thing — it refetches. Realtime still pushes
 * changes on its own, so this is the recovery path for when it hasn't: a
 * missed event, a subscription that dropped while the phone was asleep.
 *
 * The spinner is held for a short floor so it reads as a deliberate action
 * rather than a flicker, and capped so a dead connection can't spin forever.
 */

/** Spinner stays at least this long, so the gesture feels acknowledged. */
const MIN_SPIN_MS = 550;
/** Hard stop, so an offline pull still ends. */
const MAX_WAIT_MS = 6000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRefresh(): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const onRefresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    // The pull crossing its threshold is the moment the gesture commits —
    // same tick every list in iOS gives you there.
    haptics.tap();
    setRefreshing(true);

    (async () => {
      const startedAt = Date.now();
      try {
        if (userId) {
          // Swallowed: the list on screen is still the last good answer, and a
          // failed refresh has nowhere sensible to report itself from inside a
          // pull gesture.
          await withTimeout(
            refreshAll(userId),
            "Refreshing",
            MAX_WAIT_MS,
          ).catch(() => {});
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);
      } finally {
        setRefreshing(false);
        busy.current = false;
      }
    })();
  }, [userId]);

  return { refreshing, onRefresh };
}
