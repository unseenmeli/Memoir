import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const DURATION = 200;
const EASING = Easing.inOut(Easing.ease);

export type TabIconName = "home" | "search" | "person";

/**
 * Fully custom tab button. React Navigation's default button hard-swaps icon
 * opacity with no animation, so we replace it entirely: one instance per tab
 * (no double-render), reading focus from aria-selected, and easing icon
 * color/fill + label color as soon as focus changes — navigation itself is
 * instant, no page-transition wipe.
 */
export function makeTabBarButton(config: {
  name: TabIconName;
  label: string;
  activeColor: string;
  inactiveColor: string;
}) {
  return function TabBarButton(props: BottomTabBarButtonProps) {
    const { name, label, activeColor, inactiveColor } = config;
    // bottom-tabs 7.x passes focus as the `aria-selected` prop (not via
    // accessibilityState), so read that.
    const focused = Boolean(
      (props as { "aria-selected"?: boolean })["aria-selected"],
    );

    const progress = useSharedValue(focused ? 1 : 0);

    useEffect(() => {
      progress.value = withTiming(focused ? 1 : 0, {
        duration: DURATION,
        easing: EASING,
      });
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

    return (
      <Pressable
        onPress={props.onPress}
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
