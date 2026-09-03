import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { getPalette, withAlpha } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * Frosted-glass backdrop for sheets presented as a transparent overlay on
 * top of whatever screen was already showing (pin details, settings) —
 * instead of `ScreenBackground`'s opaque gradient, this blurs the real
 * content behind the sheet and lays a translucent tint over it, so it reads
 * as liquid glass over the app rather than a new opaque page.
 */
export function GlassSheetBackground({ children }: { children: ReactNode }) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);

  return (
    <View style={{ flex: 1 }}>
      <BlurView
        intensity={70}
        tint={scheme === "dark" ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(palette.bg, 0.55) }]}
      />
      {children}
    </View>
  );
}
