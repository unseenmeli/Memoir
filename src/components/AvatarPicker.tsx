import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassSheetBackground } from "@/components/GlassSheetBackground";
import { haptics } from "@/lib/haptics";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

const PREVIEW_SIZE = 220;

/**
 * Review-then-commit flow for a profile picture.
 *
 * Picking an image used to upload it the instant the picker closed, so there
 * was no way to see the result at profile size before it was live and no way
 * to back out except picking again. This shows the choice first and only
 * writes when the button is pressed.
 */
export function AvatarPicker({
  visible,
  currentUrl,
  initial,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** The avatar in use right now, shown until a new one is picked. */
  currentUrl?: string | null;
  /** Letter fallback when there's no picture yet. */
  initial: string;
  onClose: () => void;
  /** Uploads the picked asset. Errors surface here; the sheet stays open. */
  onConfirm: (asset: ImagePicker.ImagePickerAsset) => Promise<void>;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    setPicked(null);
    onClose();
  }

  /**
   * Library only — the camera is switched off in app.json
   * (`cameraPermission: false`), so offering "take a photo" here would just
   * fail at runtime. The picker's own editor handles the square crop.
   */
  async function pick() {
    if (saving) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos permission needed",
        "Allow photo access to set a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;
    haptics.tap();
    setPicked(result.assets[0]);
  }

  async function confirm() {
    if (!picked || saving) return;
    setSaving(true);
    try {
      await onConfirm(picked);
      haptics.success();
      setPicked(null);
      onClose();
    } catch (err) {
      haptics.error();
      Alert.alert(
        "Couldn't update photo",
        (err as Error)?.message ?? "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // What the preview circle shows: the new pick if there is one, otherwise
  // whatever is currently set.
  const previewUri = picked?.uri ?? currentUrl ?? null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={close}
    >
      <GlassSheetBackground>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          {/* Grabber */}
          <View className="items-center pt-2">
            <View
              style={{
                width: 36,
                height: 4.5,
                borderRadius: 3,
                backgroundColor: palette.border,
              }}
            />
          </View>

          <View className="flex-row items-center justify-between px-5 py-3">
            <Pressable
              onPress={close}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}
              className="active:opacity-60 disabled:opacity-40"
            >
              <Text
                className="text-base font-outfit-medium"
                style={{ color: palette.textDim }}
              >
                Cancel
              </Text>
            </Pressable>
            <Text
              className="text-base font-outfit-semibold"
              style={{ color: palette.text }}
            >
              Profile picture
            </Text>
            {/* Balances the row so the title stays centred. */}
            <View style={{ width: 54 }} />
          </View>

          <View className="flex-1 items-center justify-center gap-7 px-6">
            <View
              style={{
                width: PREVIEW_SIZE,
                height: PREVIEW_SIZE,
                borderRadius: PREVIEW_SIZE / 2,
                overflow: "hidden",
                backgroundColor: palette.surface2,
                borderWidth: picked ? 3 : 0,
                borderColor: palette.accent,
              }}
            >
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text
                    className="font-outfit-bold"
                    style={{ fontSize: 72, color: palette.textDim }}
                  >
                    {initial}
                  </Text>
                </View>
              )}
            </View>

            <Text
              className="text-center text-sm font-outfit"
              style={{ color: palette.textDim }}
            >
              {picked
                ? "This is how it'll look. Save it or pick another."
                : "Choose a photo to replace your current picture."}
            </Text>

            <SourceButton
              icon="image"
              label={picked ? "Choose another" : "Choose photo"}
              onPress={pick}
              disabled={saving}
            />
          </View>

          {/* The commit. Disabled until there's actually something to save. */}
          <View className="px-5 pb-3 pt-2">
            <Pressable
              onPress={confirm}
              disabled={!picked || saving}
              accessibilityRole="button"
              accessibilityLabel="Update profile picture"
              className="items-center rounded-2xl px-4 py-4 active:opacity-80"
              style={{
                backgroundColor: picked ? palette.accent : palette.surface2,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={palette.accentFg} />
              ) : (
                <Text
                  className="text-base font-outfit-semibold"
                  style={{
                    color: picked ? palette.accentFg : palette.textDim,
                  }}
                >
                  Update profile picture
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </GlassSheetBackground>
    </Modal>
  );
}

function SourceButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-2 rounded-full px-4 py-3 active:opacity-70 disabled:opacity-40"
      style={{ borderWidth: 1, borderColor: palette.border }}
    >
      <Feather name={icon} size={15} color={palette.text} />
      <Text
        className="text-sm font-outfit-medium"
        style={{ color: palette.text }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
