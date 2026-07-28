import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Pressable } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { Map } from "@/components/Map";
import { useTabBar } from "@/lib/tabBar";

const HEADER_HEIGHT = 88;
const CORNER_RADIUS = 66;
const SIDE_BLEED = 16; // matches the -mx-4 bleed of the normal layout
const DURATION = 340;
const EASING = Easing.inOut(Easing.cubic);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { setHidden } = useTabBar();
  const [fullScreen, setFullScreen] = useState(false);

  // Must match the tab bar height computed in (tabs)/_layout.tsx.
  const tabBarHeight = 56 + insets.bottom + 10;

  const progress = useSharedValue(0); // 0 = normal, 1 = full-screen
  // 1 while the tab bar is hidden, so the container can hold its place with a
  // bottom margin and animate into the reclaimed space instead of jumping.
  const barHidden = useSharedValue(0);

  function enterFull() {
    setFullScreen(true);
    setHidden(true);
    barHidden.value = 1;
    progress.value = withTiming(1, { duration: DURATION, easing: EASING });
  }

  function exitFull() {
    setFullScreen(false);
    progress.value = withTiming(
      0,
      { duration: DURATION, easing: EASING },
      (finished) => {
        // Bring the tab bar back only once the map has animated all the way
        // down, so it slots into the space the margin was holding.
        if (finished) runOnJS(revealTabBar)();
      },
    );
  }

  function revealTabBar() {
    setHidden(false);
    barHidden.value = 0;
  }

  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [HEADER_HEIGHT, 0]),
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
  }));

  const containerStyle = useAnimatedStyle(() => ({
    marginLeft: interpolate(progress.value, [0, 1], [-SIDE_BLEED, 0]),
    marginRight: interpolate(progress.value, [0, 1], [-SIDE_BLEED, 0]),
    marginBottom:
      barHidden.value * interpolate(progress.value, [0, 1], [tabBarHeight, 0]),
    borderTopLeftRadius: interpolate(progress.value, [0, 1], [CORNER_RADIUS, 0]),
    borderTopRightRadius: interpolate(
      progress.value,
      [0, 1],
      [CORNER_RADIUS, 0],
    ),
  }));

  return (
    <AuthGate>
      {(user) => (
        <SafeAreaView
          className="flex-1 bg-white dark:bg-zinc-950"
          edges={["top"]}
        >
          {/* Logo header — collapses/fades as the map goes full-screen. */}
          <Animated.View style={[{ marginLeft: -24, overflow: "hidden" }, headerStyle]}>
            <Image
              source={require("../../assets/newera.png")}
              style={{ width: 240, height: 64 }}
              resizeMode="contain"
              accessibilityLabel="NewEra"
            />
          </Animated.View>

          {/* Map container: side bleed + rounded top corners animate away. */}
          <Animated.View style={[{ flex: 1, overflow: "hidden" }, containerStyle]}>
            <Map user={user} />

            <Pressable
              onPress={fullScreen ? exitFull : enterFull}
              accessibilityRole="button"
              accessibilityLabel={
                fullScreen ? "Exit full screen map" : "Full screen map"
              }
              className="absolute left-11 top-9 h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:opacity-70"
            >
              <Feather
                name={fullScreen ? "minimize-2" : "maximize-2"}
                size={17}
                color="#18181b"
              />
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      )}
    </AuthGate>
  );
}
