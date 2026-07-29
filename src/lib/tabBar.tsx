import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Tab bar geometry — kept here so the layout and any screen padding under the
// (now-floating) bar stay in sync.
export const TAB_BAR_PADDING_TOP = 10;
export const TAB_BAR_PADDING_BOTTOM = 8;
const TAB_BAR_BASE = 56;

/** Full height of the floating tab bar, including the home-indicator inset. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_BASE + insets.bottom + TAB_BAR_PADDING_TOP;
}

type TabBarContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  /**
   * 0 = bar fully shown, 1 = fully hidden. Screens drive this so the bar can
   * slide out in step with their own animation instead of popping.
   */
  hideProgress: SharedValue<number>;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

/**
 * Lets a screen hide the bottom tab bar (e.g. full-screen map) without the
 * tab layout losing its computed height/colors — it slides out on a shared
 * value, and `hidden` only flips the `display` once it's fully off-screen.
 */
export function TabBarProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);
  const hideProgress = useSharedValue(0);
  const setHidden = useCallback((h: boolean) => setHiddenState(h), []);
  return (
    <TabBarContext.Provider value={{ hidden, setHidden, hideProgress }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar(): TabBarContextValue {
  const ctx = useContext(TabBarContext);
  if (!ctx) {
    throw new Error("useTabBar must be used within a TabBarProvider");
  }
  return ctx;
}
