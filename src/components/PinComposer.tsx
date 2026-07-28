import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
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
import { createPin, MAX_PINS_PER_USER } from "@/lib/pins";

type Coordinate = { latitude: number; longitude: number };

export function PinComposer({
  visible,
  coordinate,
  userId,
  pinCount,
  onClose,
  onSaved,
}: {
  visible: boolean;
  coordinate: Coordinate | null;
  userId: string;
  pinCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const atLimit = pinCount >= MAX_PINS_PER_USER;

  function reset() {
    setName("");
    setDescription("");
    setPhotos([]);
    setSaving(false);
    setError("");
  }

  function handleClose() {
    if (saving) return;
    reset();
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
      setPhotos((prev) => [...prev, ...result.assets]);
    }
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  async function handleSave() {
    if (!coordinate || saving) return;
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
      await createPin(userId, {
        name: trimmedName,
        description,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        photos,
      });
      reset();
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
      <SafeAreaView
        className="flex-1 bg-white dark:bg-zinc-950"
        edges={["top", "bottom"]}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-3">
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              className="active:opacity-60"
            >
              <Text className="text-base text-zinc-500 font-outfit dark:text-zinc-400">
                Cancel
              </Text>
            </Pressable>
            <Text className="text-base font-outfit-semibold text-zinc-900 dark:text-zinc-50">
              New place
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={saving || atLimit}
              hitSlop={8}
              className="active:opacity-60 disabled:opacity-40"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#18181b" />
              ) : (
                <Text className="text-base font-outfit-semibold text-zinc-900 dark:text-zinc-50">
                  Save
                </Text>
              )}
            </Pressable>
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
              <Text className="text-sm font-outfit-medium text-zinc-500 dark:text-zinc-400">
                Photos
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3"
              >
                <Pressable
                  onPress={pickPhotos}
                  className="h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 active:opacity-70 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <Feather name="plus" size={22} color="#71717a" />
                  <Text className="mt-1 text-xs text-zinc-500 font-outfit dark:text-zinc-400">
                    Add
                  </Text>
                </Pressable>

                {photos.map((photo) => (
                  <View key={photo.uri} className="h-24 w-24">
                    <Image
                      source={{ uri: photo.uri }}
                      className="h-24 w-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800"
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => removePhoto(photo.uri)}
                      hitSlop={6}
                      className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full bg-zinc-900 active:opacity-70"
                    >
                      <Feather name="x" size={13} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Name */}
            <View className="gap-2">
              <Text className="text-sm font-outfit-medium text-zinc-500 dark:text-zinc-400">
                Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Fabrika courtyard"
                placeholderTextColor="#a1a1aa"
                editable={!saving}
                className="rounded-xl border border-zinc-300 px-4 py-3.5 text-base text-zinc-900 font-outfit dark:border-zinc-700 dark:text-zinc-100"
              />
            </View>

            {/* Description */}
            <View className="gap-2">
              <Text className="text-sm font-outfit-medium text-zinc-500 dark:text-zinc-400">
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What makes this place worth remembering?"
                placeholderTextColor="#a1a1aa"
                editable={!saving}
                multiline
                textAlignVertical="top"
                className="min-h-28 rounded-xl border border-zinc-300 px-4 py-3.5 text-base text-zinc-900 font-outfit dark:border-zinc-700 dark:text-zinc-100"
              />
            </View>

            {error ? (
              <Text className="text-sm text-red-600 font-outfit dark:text-red-400">
                {error}
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
