import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { LocationPrimer } from "@/components/LocationPrimer";
import { Map } from "@/components/Map";
import { TurbineLogo } from "@/components/TurbineLogo";
import { hasBeenAskedForLocation } from "@/lib/distance";
import { useBootBlocker } from "@/lib/loading";
import { HEADER_HEIGHT, HINT_HEIGHT } from "@/lib/mapRegion";
import { getPalette, mix } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * How far the logo sits above where the header block would otherwise start.
 *
 * The header is a fixed-height box with the logo centred in it, so the lift is
 * applied to the box rather than the logo — nudging the box keeps the logo's
 * own alignment intact. Sized to stay clear of the hint line above it: the
 * logo's top edge still lands below the hint band, so the two never collide.
 */
const LOGO_LIFT = 18;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [mapReady, setMapReady] = useState(false);
  // `null` while we're reading the stored answer — the primer must not flash
  // for someone who already chose.
  const [needsPrimer, setNeedsPrimer] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    hasBeenAskedForLocation().then((asked) => {
      if (active) setNeedsPrimer(!asked);
    });
    return () => {
      active = false;
    };
  }, []);

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
          <Map
            user={user}
            onReady={handleMapReady}
            locationSettled={needsPrimer === false}
          />

          {/* Logo header floats OVER the map, below the hint line. */}
          <View
            pointerEvents="box-none"
            style={[
              styles.header,
              { top: insets.top + HINT_HEIGHT - LOGO_LIFT, height: HEADER_HEIGHT },
            ]}
          >
            <View className="flex-1 flex-row items-center px-5">
              <TurbineLogo size={32} />
            </View>
          </View>

          {/* Hint for the map's one non-obvious interaction — long-pressing
              empty map to drop a pin. Sits at the very top, directly under
              the status bar / notch, above the logo header. */}
          <View pointerEvents="none" style={[styles.hint, { top: insets.top }]}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "600",
                // A paler grey than textDim so the hint recedes without the
                // weight having to drop. Lightens in both themes — mixing
                // toward `surface` would darken this in dark mode, which is
                // the wrong direction.
                color: mix(palette.textDim, "#ffffff", 0.35),
              }}
            >
              Hold to place a pin
            </Text>
          </View>

          {/* First launch: explain location before the OS dialog burns its one
              chance. Sits over the map and hides the chrome behind it. */}
          {needsPrimer ? (
            <LocationPrimer onDone={() => setNeedsPrimer(false)} />
          ) : null}
        </View>
      )}
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HINT_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
  },
});
