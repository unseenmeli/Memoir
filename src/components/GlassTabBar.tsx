import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";
import { GlassView } from "@/components/GlassView";
import {
  TAB_BAR_PILL_HEIGHT,
  useTabBar,
  useTabBarBottomOffset,
  useTabBarHeight,
} from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";
import { getPalette } from "@/lib/palette";

const PILL_WIDTH = 240;
const INDICATOR_INSET = 6;
const SETTLE = { duration: 220, easing: Easing.out(Easing.cubic) };

const ICON_BY_ROUTE: Record<string, "home" | "search" | "person"> = {
  index: "home",
  find: "search",
  profile: "person",
};
const LABEL_BY_ROUTE: Record<string, string> = {
  index: "Home",
  find: "Find",
  profile: "Profile",
};

/** One tab's icon (cross-fading outline/filled glyph) + label. */
function TabGlyph({
  routeName,
  focused,
  activeColor,
  inactiveColor,
}: {
  routeName: string;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused, progress]);

  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const name = ICON_BY_ROUTE[routeName] ?? "home";

  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <View style={{ width: 24, height: 24 }}>
        <Animated.View style={[{ position: "absolute" }, outlineStyle]}>
          <Ionicons name={`${name}-outline`} size={24} color={inactiveColor} />
        </Animated.View>
        <Animated.View style={[{ position: "absolute" }, filledStyle]}>
          <Ionicons name={name} size={24} color={activeColor} />
        </Animated.View>
      </View>
      <Animated.Text style={[{ fontSize: 11, fontFamily: "Outfit_500Medium" }, labelStyle]}>
        {LABEL_BY_ROUTE[routeName] ?? routeName}
      </Animated.Text>
    </View>
  );
}

/**
 * Instagram-style tab bar: same floating glass pill as before, but with a
 * single sliding selector behind the active tab instead of independent
 * per-tab highlighting. Switches tabs by tapping one directly (a Pressable
 * per tab) or by swiping anywhere on the pill (a Pan gesture with a real
 * minDistance, so it only activates once a touch has clearly moved).
 */
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const { hideProgress } = useTabBar();
  const barHeight = useTabBarHeight();
  const bottomOffset = useTabBarBottomOffset();

  const slotWidth = PILL_WIDTH / state.routes.length;
  // The selector's settled position (snaps to the active tab) plus a live
  // drag offset that follows the finger while swiping — added together for
  // the actual rendered position.
  const baseX = useSharedValue(state.index * slotWidth);
  const dragX = useSharedValue(0);

  useEffect(() => {
    baseX.value = withTiming(state.index * slotWidth, SETTLE);
  }, [state.index, slotWidth, baseX]);

  function goToIndex(index: number) {
    const clamped = Math.max(0, Math.min(state.routes.length - 1, index));
    if (clamped === state.index) return;
    navigation.navigate(state.routes[clamped].name);
  }

  // Taps are handled by a plain Pressable per tab (below) — reliable, no
  // worklet/JS-thread round trip involved. This Pan only handles swiping
  // anywhere on the pill; a real minDistance means a quick tap never
  // activates it, so the Pressable underneath still gets the touch.
  const gesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      // The indicator directly follows the finger (see `indicatorStyle`
      // below), so this must match: dragging left moves it left, right moves
      // it right. Snap to whichever slot the drag actually landed closest to
      // — not just one step — so a long swipe across multiple tabs selects
      // the one under the finger instead of only ever moving by one.
      const slotsMoved = Math.round(e.translationX / slotWidth);
      if (slotsMoved !== 0) {
        runOnJS(goToIndex)(state.index + slotsMoved);
      }
    })
    .onFinalize(() => {
      dragX.value = withTiming(0, SETTLE);
    });

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: baseX.value + dragX.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hideProgress.value * barHeight }],
    opacity: 1 - hideProgress.value,
    // Once it's off-screen it must not swallow taps meant for the map.
    pointerEvents: hideProgress.value > 0.5 ? "none" : "auto",
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: "50%",
          bottom: bottomOffset,
          width: PILL_WIDTH,
          marginLeft: -PILL_WIDTH / 2,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        },
        barStyle,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={{
            width: PILL_WIDTH,
            height: TAB_BAR_PILL_HEIGHT,
            borderRadius: TAB_BAR_PILL_HEIGHT / 2,
            overflow: "hidden",
          }}
        >
          <GlassView radius={TAB_BAR_PILL_HEIGHT / 2} style={StyleSheet.absoluteFill} />

          {/* Sliding selector — a brighter glass patch (not a color fill),
              one slot wide, follows the finger while dragging and settles
              on the active tab otherwise. */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: INDICATOR_INSET,
                bottom: INDICATOR_INSET,
                left: INDICATOR_INSET,
                width: slotWidth - INDICATOR_INSET * 2,
              },
              indicatorStyle,
            ]}
          >
            <GlassView
              radius={(TAB_BAR_PILL_HEIGHT - INDICATOR_INSET * 2) / 2}
              intensity={70}
              style={{ flex: 1 }}
            />
          </Animated.View>

          <View style={{ flex: 1, flexDirection: "row" }}>
            {state.routes.map((route, index) => (
              <Pressable
                key={route.key}
                onPress={() => goToIndex(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: index === state.index }}
                accessibilityLabel={LABEL_BY_ROUTE[route.name] ?? route.name}
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                <TabGlyph
                  routeName={route.name}
                  focused={index === state.index}
                  activeColor={palette.text}
                  inactiveColor={palette.textDim}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
