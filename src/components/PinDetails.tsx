import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deletePin } from "@/lib/pins";
import { useTheme } from "@/lib/theme";

type PinPhoto = { id: string; url: string };
type PinOwner = { id: string; email?: string };

export type PinRecord = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2. Absent on pins created before the field existed. */
  country?: string | null;
  createdAt: number;
  photos: PinPhoto[];
  // `owner` is a has-one link, so Instant returns a single object (or null).
  owner?: PinOwner | null;
};

const PHOTO_WIDTH = Dimensions.get("window").width;

/** e.g. "Added Jul 28, 2026 at 3:42 PM" */
function formatAddedAt(createdAt: number): string {
  const when = new Date(createdAt).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Added ${when}`;
}

export function PinDetails({
  pin,
  currentUserId,
  onClose,
  onShowOnMap,
}: {
  pin: PinRecord | null;
  currentUserId: string;
  onClose: () => void;
  /** When provided (e.g. opened from the profile), shows a jump-to-map button. */
  onShowOnMap?: (pin: PinRecord) => void;
}) {
  const { scheme } = useTheme();
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!pin && pin.owner?.id === currentUserId;

  function confirmDelete() {
    if (!pin) return;
    Alert.alert("Delete pin", `Delete "${pin.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deletePin(
              pin.id,
              pin.photos.map((p) => p.id),
            );
            onClose();
          } catch (err) {
            Alert.alert(
              "Couldn't delete",
              (err as Error)?.message ?? "Try again.",
            );
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal
      visible={!!pin}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        className="flex-1 bg-white dark:bg-zinc-950"
        edges={["top", "bottom"]}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable onPress={onClose} hitSlop={8} className="active:opacity-60">
            <Text className="text-base text-zinc-500 font-outfit dark:text-zinc-400">
            Close
          </Text>
          </Pressable>
          {isOwner ? (
            <Pressable
              onPress={confirmDelete}
              disabled={deleting}
              hitSlop={8}
              className="active:opacity-60 disabled:opacity-40"
            >
              <Text className="text-base font-outfit-medium text-red-600 dark:text-red-400">
                {deleting ? "Deleting…" : "Delete"}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>

        {pin ? (
          <ScrollView className="flex-1" contentContainerClassName="pb-10">
            {/* Photos */}
            {pin.photos.length > 0 ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
              >
                {pin.photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: photo.url }}
                    style={{ width: PHOTO_WIDTH, height: PHOTO_WIDTH * 0.75 }}
                    className="bg-zinc-100 dark:bg-zinc-800"
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            ) : (
              <View className="mx-5 h-40 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                <Feather name="image" size={28} color="#a1a1aa" />
                <Text className="mt-2 text-sm text-zinc-400 font-outfit dark:text-zinc-500">
                  No photos
                </Text>
              </View>
            )}

            <View className="gap-3 px-5 pt-5">
              <Text className="text-2xl font-outfit-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {pin.name}
              </Text>

              {pin.description ? (
                <Text className="text-base leading-6 text-zinc-700 font-outfit dark:text-zinc-300">
                  {pin.description}
                </Text>
              ) : (
                <Text className="text-base italic text-zinc-400 font-outfit dark:text-zinc-500">
                  No description yet.
                </Text>
              )}

              <View className="flex-row items-center gap-1.5 pt-1">
                <Feather name="map-pin" size={13} color="#a1a1aa" />
                <Text className="text-xs text-zinc-400 font-outfit dark:text-zinc-500">
                  {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                </Text>
              </View>

              <View className="flex-row items-center gap-1.5">
                <Feather name="clock" size={13} color="#a1a1aa" />
                <Text className="text-xs text-zinc-400 font-outfit dark:text-zinc-500">
                  {formatAddedAt(pin.createdAt)}
                </Text>
              </View>

              {onShowOnMap ? (
                <Pressable
                  onPress={() => onShowOnMap(pin)}
                  className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3.5 active:opacity-80 dark:bg-zinc-100"
                >
                  <Feather
                    name="navigation"
                    size={16}
                    color={scheme === "dark" ? "#18181b" : "#ffffff"}
                  />
                  <Text className="text-base font-outfit-medium text-white dark:text-zinc-900">
                    Take me to the pin
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
