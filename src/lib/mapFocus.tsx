import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type FocusTarget = {
  latitude: number;
  longitude: number;
  pinId: string;
  /** Bumped on every request so the map re-focuses even on the same pin. */
  ts: number;
};

type MapFocusContextValue = {
  target: FocusTarget | null;
  focusPin: (t: { latitude: number; longitude: number; pinId: string }) => void;
  clear: () => void;
};

const MapFocusContext = createContext<MapFocusContextValue | null>(null);

/**
 * Shared "fly to this pin" signal. Lives above the tab navigator so the profile
 * tab can ask the map tab to pan/select a pin — router params don't reliably
 * cross an already-mounted tab, but shared state does.
 */
export function MapFocusProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<FocusTarget | null>(null);
  const counter = useRef(0);

  const focusPin = useCallback(
    (t: { latitude: number; longitude: number; pinId: string }) => {
      counter.current += 1;
      setTarget({ ...t, ts: counter.current });
    },
    [],
  );

  const clear = useCallback(() => setTarget(null), []);

  return (
    <MapFocusContext.Provider value={{ target, focusPin, clear }}>
      {children}
    </MapFocusContext.Provider>
  );
}

export function useMapFocus(): MapFocusContextValue {
  const ctx = useContext(MapFocusContext);
  if (!ctx) {
    throw new Error("useMapFocus must be used within a MapFocusProvider");
  }
  return ctx;
}
