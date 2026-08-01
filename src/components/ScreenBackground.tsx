import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { getPalette, withAlpha } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * The design's "weather gradient" page background (designexample/NewEraApp.tsx
 * `pageBackground`): a vertical base gradient plus a top mist highlight and
 * two soft accent-tinted corner blooms. The original uses CSS radial
 * gradients, which expo-linear-gradient can't do — approximated here with
 * angled linear gradients fading to transparent, layered the same way.
 *
 * Not used on the Home tab: the map is full-bleed and opaque there, so the
 * background would never be visible (and the design explicitly leaves the
 * map area unstyled).
 */
export function ScreenBackground({ children }: { children: ReactNode }) {
  const { scheme } = useTheme();
  const p = getPalette(scheme);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={p.pageGradient as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[p.mistColor, "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[withAlpha(p.accent, 0.14), "transparent"]}
        start={{ x: 0.1, y: 1 }}
        end={{ x: 0.65, y: 0.35 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[withAlpha(p.accent2, 0.12), "transparent"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
