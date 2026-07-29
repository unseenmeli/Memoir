import { Feather } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { Map } from "@/components/Map";
import { Wordmark } from "@/components/Wordmark";
import { useBootBlocker } from "@/lib/loading";
import { useTabBar } from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

const HEADER_HEIGHT = 88;
const DURATION = 340;
const EASING = Easing.inOut(Easing.cubic);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { setHidden, hideProgress } = useTabBar();
  const { scheme } = useTheme();
  const [fullScreen, setFullScreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Hold the boot splash until the map has drawn, so the first thing the user
  // sees is a painted map rather than a blank tile grid.
  //
  // Registered HERE rather than inside <AuthGate> on purpose: this runs on the
  // screen's very first render, so the blocker is already in place while auth
  // resolves. Registering it below the gate would leave a window where nothing
  // is blocking and the splash would lift before the map ever mounted.
  useBootBlocker("map", !mapReady);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  // 0 = normal (header showing), 1 = full-screen (header gone, tab bar hidden).
  // The MAP NEVER RESIZES — it fills the whole screen in both states. Only the
  // header fades and the tab bar toggles, so the map keeps its exact region and
  // never re-lays-out (which was the glitch).
  const progress = useSharedValue(0);

  function toggle() {
    const next = !fullScreen;
    setFullScreen(next);
    setHidden(next);
    const timing = { duration: DURATION, easing: EASING };
    progress.value = withTiming(next ? 1 : 0, timing);
    // Same value, same curve — the bar slides out exactly as the header does,
    // instead of blinking out of existence on the first frame.
    hideProgress.value = withTiming(next ? 1 : 0, timing);
  }

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -HEADER_HEIGHT]) },
    ],
  }));

  // The separator band fades straight out without sliding — sliding it would
  // briefly reveal the map edge above it mid-animation.
  const separatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
  }));

  // The toggle stays visible in full-screen (it's the only way back out), but
  // rides up into the space the header vacates so it isn't left stranded.
  const toggleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -HEADER_HEIGHT]) },
    ],
  }));

  return (
    <AuthGate>
      {(user) => (
        <View className="flex-1 bg-white dark:bg-zinc-950">
          {/* FIXED full-screen map — fills everything, never resizes. */}
          <Map user={user} onReady={handleMapReady} />

          {/* Solid band separating the header from the map. The map is
              full-bleed underneath, so this is what actually hides its top
              edge; it fades away with the header when going full-screen. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.separator,
              { height: insets.top + HEADER_HEIGHT },
              separatorStyle,
            ]}
            className="bg-white dark:bg-zinc-950"
          />

          {/* Logo header floats OVER the map, below the status bar. Fades and
              slides up when going full-screen; the map underneath is untouched. */}
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.header,
              { top: insets.top, height: HEADER_HEIGHT },
              headerStyle,
            ]}
          >
            <Wordmark width={240} height={64} style={{ marginLeft: -24 }} />
          </Animated.View>

          {/* Full-screen toggle. */}
          <AnimatedPressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={
              fullScreen ? "Exit full screen map" : "Full screen map"
            }
            // Sits below the header band so it never overlaps the wordmark —
            // it floats on the map itself, just under the separator's edge.
            style={[{ top: insets.top + HEADER_HEIGHT + 24 }, toggleStyle]}
            className="absolute left-5 h-11 w-11 items-center justify-center rounded-md bg-white shadow-sm active:opacity-70 dark:bg-zinc-900"
          >
            <Feather
              name={fullScreen ? "minimize-2" : "maximize-2"}
              size={17}
              color={scheme === "dark" ? "#fafafa" : "#18181b"}
            />
          </AnimatedPressable>
        </View>
      )}
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  separator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // Soft edge where the band meets the map.
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
  },
});
