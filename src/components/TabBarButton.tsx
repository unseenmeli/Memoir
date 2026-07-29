import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useEffect } from "react";
import { type GestureResponderEvent, Pressable, View } from "react-native";
import {
  HOLD,
  IN_DURATION,
  NAV_AT,
  OUT_DURATION,
  useCurtain,
} from "@/lib/curtain";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

// The icon/label ease is synced to the curtain's fade-out: it starts when the
// white begins lifting and finishes exactly as it clears. `focused` flips at
// NAV_AT; fade-out starts at IN_DURATION + HOLD — so wait out the difference,
// then ease over OUT_DURATION.
const SYNC_DELAY = Math.max(0, IN_DURATION + HOLD - NAV_AT);
const EASING = Easing.inOut(Easing.ease);

export type TabIconName = "home" | "search" | "person";

/**
 * Fully custom tab button. React Navigation's default button hard-swaps icon
 * opacity with no animation, so we replace it entirely: one instance per tab
 * (no double-render), reading focus from aria-selected, and easing icon
 * color/fill + label color in sync with the curtain's fade-out.
 */
export function makeTabBarButton(config: {
  name: TabIconName;
  label: string;
  activeColor: string;
  inactiveColor: string;
}) {
  return function TabBarButton(props: BottomTabBarButtonProps) {
    const { name, label, activeColor, inactiveColor } = config;
    const { runTransition } = useCurtain();
    // bottom-tabs 7.x passes focus as the `aria-selected` prop (not via
    // accessibilityState), so read that.
    const focused = Boolean(
      (props as { "aria-selected"?: boolean })["aria-selected"],
    );

    const progress = useSharedValue(focused ? 1 : 0);

    useEffect(() => {
      // Delay so the icon eases as the curtain lifts, not while it's rising.
      progress.value = withDelay(
        SYNC_DELAY,
        withTiming(focused ? 1 : 0, { duration: OUT_DURATION, easing: EASING }),
      );
    }, [focused, progress]);

    // Cross-fade the outline (inactive) and filled (active) glyphs.
    const outlineStyle = useAnimatedStyle(() => ({
      opacity: 1 - progress.value,
    }));
    const filledStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
    }));
    const labelStyle = useAnimatedStyle(() => ({
      color: interpolateColor(
        progress.value,
        [0, 1],
        [inactiveColor, activeColor],
      ),
    }));

    function handlePress(e: GestureResponderEvent) {
      // Already on this tab — no curtain, no navigation.
      if (focused) return;
      // Play the white/theme curtain, running the real navigation while the
      // screen is fully covered.
      runTransition(() => props.onPress?.(e));
    }

    return (
      <Pressable
        onPress={handlePress}
        onLongPress={props.onLongPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={props["aria-label"]}
        testID={props.testID}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}
      >
        <View style={{ width: 24, height: 24 }}>
          <Animated.View style={[{ position: "absolute" }, outlineStyle]}>
            <Ionicons name={`${name}-outline`} size={24} color={inactiveColor} />
          </Animated.View>
          <Animated.View style={[{ position: "absolute" }, filledStyle]}>
            <Ionicons name={name} size={24} color={activeColor} />
          </Animated.View>
        </View>
        <Animated.Text
          style={[
            { fontSize: 11, fontFamily: "Outfit_500Medium" },
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    );
  };
}
