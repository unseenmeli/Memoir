import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme";

const LOGO = require("../../assets/memoire.png");

/**
 * The Memoire wordmark, legible on either background.
 *
 * The artwork is near-black ink (#1f1f1f), which all but disappears on the
 * dark theme's #09090b. In dark mode we overlay a white-tinted copy drawn from
 * the same alpha channel. The red accent over the "i" is lost to the tint —
 * an acceptable trade for a logo you can actually see.
 */
export function Wordmark({
  width,
  height,
  style,
}: {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme } = useTheme();
  const size = { width, height };

  return (
    <View style={[size, style]}>
      <Image
        source={LOGO}
        style={size}
        resizeMode="contain"
        accessibilityLabel="Memoire"
      />
      {scheme === "dark" ? (
        <Image
          source={LOGO}
          style={[StyleSheet.absoluteFill, size]}
          resizeMode="contain"
          tintColor="#fafafa"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
    </View>
  );
}
