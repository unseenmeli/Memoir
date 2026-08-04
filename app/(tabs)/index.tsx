import { Feather } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassView } from "@/components/GlassView";
import { Map } from "@/components/Map";
import { TurbineLogo } from "@/components/TurbineLogo";
import { useBootBlocker } from "@/lib/loading";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

const HEADER_HEIGHT = 88;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
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

  return (
    <AuthGate>
      {(user) => (
        <View className="flex-1 bg-white dark:bg-zinc-950">
          {/* Full-bleed map — fills the screen and never resizes. */}
          <Map user={user} onReady={handleMapReady} />

          {/* Logo header floats OVER the map, below the status bar. */}
          <View
            pointerEvents="box-none"
            style={[styles.header, { top: insets.top, height: HEADER_HEIGHT }]}
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
          </View>
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
