import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassView } from "@/components/GlassView";
import {
  markLocationAsked,
  requestLocationPermission,
} from "@/lib/distance";
import { haptics } from "@/lib/haptics";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * Shown once, over the map, the first time someone reaches the app.
 *
 * The OS location dialog can only be presented once per install, so this
 * explains what location is for and lets the person choose to see it — rather
 * than firing cold on mount and spending that one chance before they know why
 * we're asking. Declining is a real option, not a dead end: the app works from
 * a Tbilisi default, which is what the second button says out loud.
 */
export function LocationPrimer({ onDone }: { onDone: () => void }) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [pending, setPending] = useState(false);

  async function share() {
    if (pending) return;
    setPending(true);
    const granted = await requestLocationPermission();
    if (granted) haptics.success();
    setPending(false);
    onDone();
  }

  async function skip() {
    if (pending) return;
    // Record the ask either way — otherwise this screen returns on every
    // launch for someone who has already made their choice.
    await markLocationAsked();
    onDone();
  }

  // A Modal, not an absolutely-positioned overlay: the tab bar is a sibling of
  // the whole screen in the navigator, so no zIndex inside a screen can ever
  // paint above it. That left the buttons covered by Home/Find/Profile.
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-8 px-8">
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.accent,
            }}
          >
            <Feather name="map-pin" size={36} color={palette.accentFg} />
          </View>

          <View className="gap-3">
            <Text
              className="text-center text-3xl font-outfit-semibold tracking-tight"
              style={{ color: palette.text }}
            >
              Where are you?
            </Text>
            <Text
              className="text-center text-base font-outfit"
              style={{ color: palette.textDim }}
            >
              Sharing your location puts you on the map and sorts places by how
              far away they actually are.
            </Text>
          </View>

          <View style={{ borderRadius: 16, overflow: "hidden" }}>
            <GlassView radius={16} intensity={25}>
              <View className="flex-row items-start gap-3 px-4 py-3.5">
                <Feather name="info" size={15} color={palette.textDim} />
                <Text
                  className="flex-1 text-sm font-outfit"
                  style={{ color: palette.textDim }}
                >
                  If you&apos;d rather not, no problem — we&apos;ll start you in
                  central Tbilisi and you can move the map yourself.
                </Text>
              </View>
            </GlassView>
          </View>
        </View>

        <View className="gap-3 px-6 pb-4">
          <Pressable
            onPress={share}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel="Share my location"
            className="items-center rounded-2xl px-4 py-4 active:opacity-80"
            style={{ backgroundColor: palette.accent, opacity: pending ? 0.7 : 1 }}
          >
            {pending ? (
              <ActivityIndicator size="small" color={palette.accentFg} />
            ) : (
              <Text
                className="text-base font-outfit-semibold"
                style={{ color: palette.accentFg }}
              >
                Share my location
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={skip}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel="Continue with Tbilisi as my location"
            className="items-center rounded-2xl px-4 py-4 active:opacity-70 disabled:opacity-40"
            style={{ borderWidth: 1, borderColor: palette.border }}
          >
            <Text
              className="text-base font-outfit-medium"
              style={{ color: palette.text }}
            >
              Not now — use Tbilisi
            </Text>
          </Pressable>
        </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
