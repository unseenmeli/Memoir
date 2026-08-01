import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassView } from "@/components/GlassView";
import { HeaderPill, nextPhotoIndex, type PinRecord } from "@/components/PinDetails";
import { ScreenBackground } from "@/components/ScreenBackground";
import { createPin, MAX_PINS_PER_USER, updatePin } from "@/lib/pins";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

type Coordinate = { latitude: number; longitude: number };
/** An existing pin's photo, kept as-is unless the user removes it. */
type ExistingPhoto = { id: string; url: string };

export function PinComposer({
  visible,
  coordinate,
  editingPin,
  userId,
  pinCount,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Where a new pin will be dropped. Ignored when `editingPin` is set. */
  coordinate: Coordinate | null;
  /** When set, edits this pin instead of creating a new one at `coordinate`. */
  editingPin?: PinRecord | null;
  userId: string;
  pinCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<ImagePicker.ImagePickerAsset[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!editingPin;
  const atLimit = !isEditing && pinCount >= MAX_PINS_PER_USER;

  // Prefill from the pin being edited (or start blank) each time the sheet
  // opens — not on every render, so edits mid-session aren't clobbered.
  useEffect(() => {
    if (!visible) return;
    setName(editingPin?.name ?? "");
    setDescription(editingPin?.description ?? "");
    setExistingPhotos(editingPin?.photos ?? []);
    setRemovedPhotoIds([]);
    setNewPhotos([]);
    setSaving(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingPin?.id]);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function pickPhotos() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos permission needed",
        "Allow photo access to add pictures to a pin.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setNewPhotos((prev) => [...prev, ...result.assets]);
    }
  }

  function removeExistingPhoto(photoId: string) {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setRemovedPhotoIds((prev) => [...prev, photoId]);
  }

  function removeNewPhoto(uri: string) {
    setNewPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  async function handleSave() {
    if (saving) return;
    if (!isEditing && !coordinate) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give this place a name.");
      return;
    }
    if (atLimit) {
      setError(`You've reached the limit of ${MAX_PINS_PER_USER} pins.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editingPin) {
        await updatePin(editingPin.id, {
          name: trimmedName,
          description,
          newPhotos,
          removedPhotoIds,
          startPhotoIndex: nextPhotoIndex(editingPin.photos),
        });
      } else if (coordinate) {
        await createPin(userId, {
          name: trimmedName,
          description,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          photos: newPhotos,
        });
      }
      onSaved();
    } catch (err) {
      setError(
        (err as Error)?.message ?? "Could not save the pin. Try again.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ScreenBackground>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {/* Grabber handle — matches the other sheets' chrome. */}
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

            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-3">
              <HeaderPill
                label="Cancel"
                color={palette.textDim}
                onPress={handleClose}
              />
              <Text
                className="flex-1 text-center text-base font-outfit-semibold"
                style={{ color: palette.text }}
              >
                {isEditing ? "Edit place" : "New place"}
              </Text>
              <HeaderPill
                label="Save"
                color={palette.accent}
                disabled={saving || atLimit}
                loading={saving}
                onPress={handleSave}
              />
            </View>

            <ScrollView
              className="flex-1 px-5"
              contentContainerClassName="gap-5 pb-8 pt-2"
              keyboardShouldPersistTaps="handled"
            >
              {atLimit ? (
                <View className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-950/40">
                  <Text className="text-sm text-amber-700 font-outfit dark:text-amber-300">
                    You&apos;ve reached the limit of {MAX_PINS_PER_USER} pins.
                    Delete one to add another.
                  </Text>
                </View>
              ) : null}

              {/* Photos */}
              <View className="gap-2">
                <Text
                  className="text-sm font-outfit-medium"
                  style={{ color: palette.textDim }}
                >
                  Photos
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-3"
                >
                  <Pressable
                    onPress={pickPhotos}
                    className="active:opacity-70"
                    style={{ height: 96, width: 96, borderRadius: 20, overflow: "hidden" }}
                  >
                    <GlassView radius={20} intensity={25}>
                      <View className="h-24 w-24 items-center justify-center">
                        <Feather name="plus" size={22} color={palette.text} />
                        <Text
                          className="mt-1 text-xs font-outfit"
                          style={{ color: palette.textDim }}
                        >
                          Add
                        </Text>
                      </View>
                    </GlassView>
                  </Pressable>

                  {existingPhotos.map((photo) => (
                    <View key={photo.id} className="h-24 w-24">
                      <Image
                        source={{ uri: photo.url }}
                        className="h-24 w-24 rounded-2xl"
                        style={{ backgroundColor: palette.surface2 }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => removeExistingPhoto(photo.id)}
                        hitSlop={6}
                        className="absolute -right-1.5 -top-1.5 active:opacity-70"
                        style={{ height: 24, width: 24, borderRadius: 12, overflow: "hidden" }}
                      >
                        <GlassView radius={12} intensity={35}>
                          <View className="h-6 w-6 items-center justify-center">
                            <Feather name="x" size={13} color={palette.text} />
                          </View>
                        </GlassView>
                      </Pressable>
                    </View>
                  ))}

                  {newPhotos.map((photo) => (
                    <View key={photo.uri} className="h-24 w-24">
                      <Image
                        source={{ uri: photo.uri }}
                        className="h-24 w-24 rounded-2xl"
                        style={{ backgroundColor: palette.surface2 }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => removeNewPhoto(photo.uri)}
                        hitSlop={6}
                        className="absolute -right-1.5 -top-1.5 active:opacity-70"
                        style={{ height: 24, width: 24, borderRadius: 12, overflow: "hidden" }}
                      >
                        <GlassView radius={12} intensity={35}>
                          <View className="h-6 w-6 items-center justify-center">
                            <Feather name="x" size={13} color={palette.text} />
                          </View>
                        </GlassView>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              {/* Name */}
              <View className="gap-2">
                <Text
                  className="text-sm font-outfit-medium"
                  style={{ color: palette.textDim }}
                >
                  Name
                </Text>
                <View style={{ borderRadius: 16, overflow: "hidden" }}>
                  <GlassView radius={16} intensity={25}>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g. Fabrika courtyard"
                      placeholderTextColor={palette.textDim}
                      editable={!saving}
                      className="px-4 py-3.5 text-base font-outfit"
                      style={{ color: palette.text }}
                    />
                  </GlassView>
                </View>
              </View>

              {/* Description */}
              <View className="gap-2">
                <Text
                  className="text-sm font-outfit-medium"
                  style={{ color: palette.textDim }}
                >
                  Description
                </Text>
                <View style={{ borderRadius: 16, overflow: "hidden" }}>
                  <GlassView radius={16} intensity={25}>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="What makes this place worth remembering?"
                      placeholderTextColor={palette.textDim}
                      editable={!saving}
                      multiline
                      textAlignVertical="top"
                      className="min-h-28 px-4 py-3.5 text-base font-outfit"
                      style={{ color: palette.text }}
                    />
                  </GlassView>
                </View>
              </View>

              {error ? (
                <Text className="text-sm font-outfit text-red-500">{error}</Text>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ScreenBackground>
    </Modal>
  );
}
