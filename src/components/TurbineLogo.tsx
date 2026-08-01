import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

const VIEW_BOX_W = 32;
const VIEW_BOX_H = 36;
// The hub sits at (16, 15) in the 32x36 viewBox — expressed as a percentage
// so `transformOrigin` can pivot the rotor around it regardless of `size`.
// RN requires exactly 3 values (x, y, z).
const HUB_ORIGIN = ["50%", `${(15 / VIEW_BOX_H) * 100}%`, 0] as const;

/**
 * Ported from designexample/NewEraApp.tsx's TurbineLogo mark: a slowly
 * spinning wind turbine.
 *
 * The rotor is animated with a plain RN `transform: rotate` + `transformOrigin`
 * on its own wrapping View, not react-native-svg's animated `G`/`transform`
 * props — those didn't reliably pick up live updates from Reanimated here, so
 * this sidesteps it entirely and rotates a whole (small, isolated) SVG layer
 * instead, which is a core RN style property and always animates.
 */
export function TurbineLogo({ size = 32 }: { size?: number }) {
  const { scheme } = useTheme();
  const p = getPalette(scheme);
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const rotorStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const height = (size * VIEW_BOX_H) / VIEW_BOX_W;
  const blade = "M16.8 15.5 L13.1 3.4 L15.2 0.2 L17.6 12.8 Z";

  return (
    <View
      style={{
        width: size,
        height,
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 5,
      }}
    >
      {/* Static mast, drawn first (bottom layer). */}
      <Svg
        width={size}
        height={height}
        viewBox={`0 0 ${VIEW_BOX_W} ${VIEW_BOX_H}`}
        fill="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Path d="M15.1 17L14 36h4l-1.1-19h-1.8z" fill={p.textDim} />
      </Svg>

      {/* Spinning rotor — isolated in its own view so only the blades turn. */}
      <Animated.View
        style={[
          { position: "absolute", top: 0, left: 0, width: size, height },
          { transformOrigin: [...HUB_ORIGIN] },
          rotorStyle,
        ]}
      >
        <Svg
          width={size}
          height={height}
          viewBox={`0 0 ${VIEW_BOX_W} ${VIEW_BOX_H}`}
          fill="none"
        >
          <Defs>
            <LinearGradient id="ne-blade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.accent2} />
              <Stop offset="1" stopColor={p.accent} />
            </LinearGradient>
          </Defs>
          <Path d={blade} fill="url(#ne-blade)" />
          <Path d={blade} fill="url(#ne-blade)" rotation={120} origin="16, 15" />
          <Path d={blade} fill="url(#ne-blade)" rotation={240} origin="16, 15" />
        </Svg>
      </Animated.View>

      {/* Static hub, drawn last (top layer) so it covers the blade roots. */}
      <Svg
        width={size}
        height={height}
        viewBox={`0 0 ${VIEW_BOX_W} ${VIEW_BOX_H}`}
        fill="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Path
          d="M16 12.4l2.3 1.3v2.6L16 17.6l-2.3-1.3v-2.6L16 12.4z"
          fill={p.text}
        />
      </Svg>
    </View>
  );
}
