import { Feather } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassView } from "@/components/GlassView";
import { Map } from "@/components/Map";
import { TurbineLogo } from "@/components/TurbineLogo";
import { useBootBlocker } from "@/lib/loading";
import { getPalette } from "@/lib/palette";
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
  const palette = getPalette(scheme);
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
            <View className="flex-1 flex-row items-center justify-between px-5">
              <TurbineLogo size={32} />

              {/* Decorative only — this app has no notification system yet. */}
              <GlassView
                radius={20}
                intensity={30}
                style={{ width: 40, height: 40 }}
              >
                <View className="flex-1 items-center justify-center">
                  <Feather name="bell" size={17} color={palette.text} />
                  <View
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 9,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: palette.accent,
                    }}
                  />
                </View>
              </GlassView>
            </View>
          </Animated.View>

          {/* Full-screen toggle. */}
          <AnimatedPressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={
              fullScreen ? "Exit full screen map" : "Full screen map"
            }
            // Sits below the header band so it never overlaps the logo —
            // it floats on the map itself.
            style={[
              { top: insets.top + HEADER_HEIGHT + 24 },
              { position: "absolute", left: 20 },
              toggleStyle,
            ]}
            className="active:opacity-70"
          >
            <GlassView radius={13} intensity={35} style={{ width: 44, height: 44 }}>
              <View className="flex-1 items-center justify-center">
                <Feather
                  name={fullScreen ? "minimize-2" : "maximize-2"}
                  size={17}
                  color={palette.text}
                />
              </View>
            </GlassView>
          </AnimatedPressable>
        </View>
      )}
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
  },
});
