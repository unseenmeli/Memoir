import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Wordmark } from "@/components/Wordmark";
import { useLoading } from "@/lib/loading";
import { useTheme } from "@/lib/theme";

const SPIN_DURATION = 900; // one revolution of the ring
const INTRO_DURATION = 520; // logo settling in on first paint
const FADE_DURATION = 380; // layer lifting once everything is ready

const LOGO_WIDTH = 250;
const LOGO_HEIGHT = 68; // matches the wordmark's ~2:1 art

const RING_SIZE = 26;
const RING_BORDER = 2.5;
// Sampled from the accent circle over the "i" in the NewEra wordmark.
const ACCENT = "#cd3f2d";

/**
 * Startup splash: the wordmark holds still while a small accent ring spins
 * beneath it, then the whole layer fades out to reveal the app.
 *
 * The logo itself deliberately does NOT rotate — it's hand-lettered type, and
 * spinning it just turns it into an illegible smear. The ring echoes the red
 * circle over the "i", so the only thing moving is the thing that's round.
 */
export function LoadingScreen() {
  const { booting } = useLoading();
  const { scheme } = useTheme();
  const [visible, setVisible] = useState(true);

  const spin = useSharedValue(0);
  const intro = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    // Logo eases up into place, then the ring starts turning.
    intro.value = withTiming(1, {
      duration: INTRO_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    spin.value = withDelay(
      INTRO_DURATION * 0.5,
      withRepeat(
        withTiming(1, { duration: SPIN_DURATION, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(intro);
    };
  }, [spin, intro]);

  // When boot finishes, fade the whole layer out, then unmount.
  useEffect(() => {
    if (booting) return;
    fade.value = withTiming(
      0,
      { duration: FADE_DURATION, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(setVisible)(false);
      },
    );
  }, [booting, fade]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [
      { translateY: (1 - intro.value) * 10 },
      { scale: 0.98 + intro.value * 0.02 },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  if (!visible) return null;

  const background = scheme === "dark" ? "#09090b" : "#ffffff";
  // The ring's "track" — the faint part the accent arc travels around.
  const track = scheme === "dark" ? "#27272a" : "#e4e4e7";

  return (
    <Animated.View
      pointerEvents={booting ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        { backgroundColor: background },
        layerStyle,
      ]}
    >
      <Animated.View style={logoStyle}>
        <Wordmark width={LOGO_WIDTH} height={LOGO_HEIGHT} />
      </Animated.View>

      <View style={styles.ringSlot}>
        <Animated.View
          style={[
            styles.ring,
            // Only the top edge takes the accent color, so the ring reads as a
            // single arc chasing its own tail rather than a solid circle.
            { borderColor: track, borderTopColor: ACCENT },
            ringStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    alignItems: "center",
    justifyContent: "center",
    // Highest in the tree so nothing can paint over the splash.
    zIndex: 10000,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  // Fixed-height slot so the ring can't shift the logo as it appears.
  ringSlot: {
    height: RING_SIZE,
    marginTop: 28,
    justifyContent: "center",
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_BORDER,
  },
});
