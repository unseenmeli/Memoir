import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBar } from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const { hidden } = useTabBar();
  const dark = scheme === "dark";

  // insets.bottom is the home-indicator strip (0 on older, ~34 on notched
  // devices). Pad above it so labels clear the bar without crowding the
  // swipe-up indicator.
  const BAR_PADDING_TOP = 10;
  const BAR_PADDING_BOTTOM = 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? "#fafafa" : "#18181b",
        tabBarInactiveTintColor: dark ? "#71717a" : "#a1a1aa",
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Outfit_500Medium" },
        tabBarItemStyle: { paddingTop: 4 },
        tabBarStyle: {
          // Hidden (display:none) for full-screen map; keeps all other styling.
          display: hidden ? "none" : "flex",
          backgroundColor: dark ? "#09090b" : "#ffffff",
          borderTopWidth: 0.5,
          borderTopColor: dark ? "#27272a" : "#e4e4e7",
          height: 56 + insets.bottom + BAR_PADDING_TOP,
          paddingTop: BAR_PADDING_TOP,
          paddingBottom: insets.bottom + BAR_PADDING_BOTTOM,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
