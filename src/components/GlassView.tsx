import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * The design's "liquid glass" panel: a blurred backdrop, a hairline border,
 * and a thin top highlight to fake the beveled-edge shine. Used anywhere the
 * design shows a frosted surface — tab bar, search bar, chips, header
 * buttons, the settings sheet.
 */
export function GlassView({
  radius = 20,
  intensity = 40,
  style,
  children,
}: {
  radius?: number;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { scheme } = useTheme();
  const p = getPalette(scheme);

  return (
    <View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
      <BlurView
        intensity={intensity}
        tint={scheme === "dark" ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: p.glassBg }]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: p.glassBorder,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: radius * 0.4,
          right: radius * 0.4,
          height: 1,
          backgroundColor: p.glassShine,
          opacity: 0.55,
        }}
      />
      {children}
    </View>
  );
}
