import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTabBar, useTabBarHeight } from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

// Exported so tab icons can sync their ease to the curtain's fade-out phase.
export const IN_DURATION = 200; // curtain fades in
export const HOLD = 100; // page swaps behind the curtain
export const OUT_DURATION = 200; // curtain fades out
// Navigation (and thus the tab's focus flip) fires at this offset from press.
export const NAV_AT = IN_DURATION + HOLD / 2;

type CurtainContextValue = {
  /**
   * Play the white/theme curtain: fade it in (0.3s), run `navigate` while the
   * screen is fully covered, hold 0.1s, then fade out (0.3s). Ignores repeat
   * calls while a transition is already running.
   */
  runTransition: (navigate: () => void) => void;
};

const CurtainContext = createContext<CurtainContextValue | null>(null);

export function CurtainProvider({ children }: { children: ReactNode }) {
  const { scheme } = useTheme();
  const { hidden } = useTabBar();
  const barHeight = useTabBarHeight();
  const opacity = useSharedValue(0);

  // Leave the tab bar uncovered — the curtain stops at its top edge. When the
  // bar is hidden (full-screen map), cover the whole screen instead.
  const tabBarHeight = hidden ? 0 : barHeight;
  const busy = useRef(false);

  const release = useCallback(() => {
    busy.current = false;
  }, []);

  const runTransition = useCallback(
    (navigate: () => void) => {
      if (busy.current) return;
      busy.current = true;

      // Swap the page at the moment the curtain is fully opaque, so the
      // change is hidden. Then fade out and release the lock.
      opacity.value = withSequence(
        withTiming(1, { duration: IN_DURATION, easing: Easing.out(Easing.ease) }),
        withDelay(
          HOLD,
          withTiming(
            0,
            { duration: OUT_DURATION, easing: Easing.in(Easing.ease) },
            (finished) => {
              if (finished) runOnJS(release)();
            },
          ),
        ),
      );

      // Navigate right as the cover completes (in + a hair of the hold).
      setTimeout(navigate, IN_DURATION + HOLD / 2);
    },
    [opacity, release],
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    // pointerEvents follows opacity so the curtain only blocks touches while
    // visible; below 0.01 it lets taps through to the page underneath.
    pointerEvents: opacity.value > 0.01 ? "auto" : "none",
  }));

  const curtainColor = scheme === "dark" ? "#09090b" : "#ffffff";

  return (
    <CurtainContext.Provider value={{ runTransition }}>
      {children}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          // Stop at the tab bar's top so the nav stays uncovered.
          { bottom: tabBarHeight, backgroundColor: curtainColor, zIndex: 9999 },
          style,
        ]}
      />
    </CurtainContext.Provider>
  );
}

export function useCurtain(): CurtainContextValue {
  const ctx = useContext(CurtainContext);
  if (!ctx) {
    throw new Error("useCurtain must be used within a CurtainProvider");
  }
  return ctx;
}
