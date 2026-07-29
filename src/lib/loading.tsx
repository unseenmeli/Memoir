import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Tracks whether the app is still booting. Any screen or provider can register
 * a named blocker while it loads; the splash stays up until every blocker
 * clears (and never comes back once dismissed — this is startup-only, not a
 * spinner for later refetches).
 */
type LoadingContextValue = {
  /** True until every registered blocker has reported ready. */
  booting: boolean;
  /** Register/clear a named boot blocker. Safe to call on every render. */
  setBlocker: (key: string, blocking: boolean) => void;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

/**
 * Hard ceiling on the splash. If something never reports ready (offline map
 * tiles, a hung query), show the app anyway rather than spinning forever —
 * the screens all handle their own empty/loading states.
 */
const MAX_BOOT_MS = 12000;

/**
 * How long the blocker list must stay empty before we call boot done. Bridges
 * the gap between one screen clearing and the next one mounting to register.
 */
const SETTLE_MS = 150;

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [blockers, setBlockers] = useState<string[]>([]);
  // Once boot finishes we latch it — a later query going pending must not
  // pull the whole app back behind the splash.
  const [booted, setBooted] = useState(false);

  const setBlocker = useCallback((key: string, blocking: boolean) => {
    setBlockers((prev) => {
      const has = prev.includes(key);
      if (blocking === has) return prev;
      return blocking ? [...prev, key] : prev.filter((k) => k !== key);
    });
  }, []);

  // Blockers register in waves: fonts clear, THEN auth mounts and clears, and
  // only then does the map mount and register. An empty list is therefore not
  // proof we're done — it's usually just the gap before the next wave. So wait
  // for the list to be empty and stay empty for a beat before lifting.
  useEffect(() => {
    if (booted || blockers.length > 0) return;
    const timer = setTimeout(() => setBooted(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [blockers, booted]);

  useEffect(() => {
    if (booted) return;
    const timer = setTimeout(() => setBooted(true), MAX_BOOT_MS);
    return () => clearTimeout(timer);
  }, [booted]);

  const value = useMemo(
    () => ({ booting: !booted, setBlocker }),
    [booted, setBlocker],
  );

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
}

export function useLoading(): LoadingContextValue {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return ctx;
}

/**
 * Declare that `key` is still loading. Clears itself when `blocking` flips to
 * false or the screen unmounts, so a page that never finishes can't wedge the
 * splash open forever after navigating away.
 */
export function useBootBlocker(key: string, blocking: boolean) {
  const { setBlocker } = useLoading();
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    setBlocker(key, blocking);
  }, [key, blocking, setBlocker]);

  useEffect(() => {
    return () => setBlocker(keyRef.current, false);
  }, [setBlocker]);
}
