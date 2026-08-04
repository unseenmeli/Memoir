import { useSafeAreaInsets } from "react-native-safe-area-context";

// Tab bar geometry — kept here so the layout and any screen padding under the
// floating glass pill stay in sync.
/** The pill's own height (icon + label + vertical padding), not counting insets. */
export const TAB_BAR_PILL_HEIGHT = 68;
/** Gap between the pill's bottom edge and the safe-area bottom inset. */
export const TAB_BAR_BOTTOM_GAP = 14;

/** How far the pill's bottom edge floats above the screen's bottom edge. */
export function useTabBarBottomOffset(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_BOTTOM_GAP;
}

/** Total floor clearance the floating pill occupies — for screen content padding. */
export function useTabBarHeight(): number {
  return TAB_BAR_PILL_HEIGHT + useTabBarBottomOffset();
}
