import { useCallback, useRef, useState } from "react";
import { db } from "./db";
import { haptics } from "./haptics";

/**
 * Pull-to-refresh for Instant-backed lists.
 *
 * Instant is a realtime sync engine: `db.useQuery` holds a live subscription,
 * so data already arrives without asking. There is no "fetch again" call to
 * make, and pretending otherwise would be theatre.
 *
 * What this actually does is useful anyway:
 *  - gives the familiar gesture and a definite "I checked" acknowledgement
 *  - waits for the socket to be live again when it had dropped, which is the
 *    one case where a refresh genuinely recovers something
 *
 * The spinner is held for a short floor so it reads as a deliberate action
 * rather than a flicker, and capped so a dead connection can't spin forever.
 */

/** Spinner stays at least this long, so the gesture feels acknowledged. */
const MIN_SPIN_MS = 550;
/** Hard stop, so an offline pull still ends. */
const MAX_WAIT_MS = 6000;
/** How often to re-check the socket while waiting for it to come back. */
const POLL_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRefresh(): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);
  const status = db.useConnectionStatus();
  // Read through a ref so the polling loop sees the live value instead of the
  // one captured when the pull started.
  const statusRef = useRef(status);
  statusRef.current = status;
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
        // If the socket dropped, this is the case worth waiting on — the
        // subscription re-syncs on reconnect and the list fills back in.
        while (
          statusRef.current !== "authenticated" &&
          Date.now() - startedAt < MAX_WAIT_MS
        ) {
          await sleep(POLL_MS);
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);
      } finally {
        setRefreshing(false);
        busy.current = false;
      }
    })();
  }, []);

  return { refreshing, onRefresh };
}
