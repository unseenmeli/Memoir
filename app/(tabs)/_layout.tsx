import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeTabBarButton } from "@/components/TabBarButton";
import {
  TAB_BAR_PADDING_BOTTOM,
  TAB_BAR_PADDING_TOP,
  useTabBar,
  useTabBarHeight,
} from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

/**
 * The stock bar, wrapped so it can slide down off-screen instead of being
 * hard-switched with `display: none` — a display flip mid-transition is what
 * made the full-screen toggle look like a jump cut.
 */
function AnimatedTabBar(props: BottomTabBarProps) {
  const { hideProgress } = useTabBar();
  const barHeight = useTabBarHeight();

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: hideProgress.value * barHeight }],
    opacity: 1 - hideProgress.value,
    // Once it's off-screen it must not swallow taps meant for the map.
    pointerEvents: hideProgress.value > 0.5 ? "none" : "auto",
  }));

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, right: 0, bottom: 0 },
        style,
      ]}
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const dark = scheme === "dark";

  const activeColor = dark ? "#fafafa" : "#18181b";
  const inactiveColor = dark ? "#71717a" : "#a1a1aa";

  const barHeight = useTabBarHeight();
  const colors = { activeColor, inactiveColor };

  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // Absolute so screen content (the map) renders full-height *under*
          // the bar instead of stopping above it.
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: dark ? "#09090b" : "#ffffff",
          borderTopWidth: 0.5,
          borderTopColor: dark ? "#27272a" : "#e4e4e7",
          height: barHeight,
          paddingTop: TAB_BAR_PADDING_TOP,
          paddingBottom: insets.bottom + TAB_BAR_PADDING_BOTTOM,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarButton: makeTabBarButton({
            name: "home",
            label: "Home",
            ...colors,
          }),
        }}
      />
      <Tabs.Screen
        name="find"
        options={{
          tabBarButton: makeTabBarButton({
            name: "search",
            label: "Find",
            ...colors,
          }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarButton: makeTabBarButton({
            name: "person",
            label: "Profile",
            ...colors,
          }),
        }}
      />
    </Tabs>
  );
}
