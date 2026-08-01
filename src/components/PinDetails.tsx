import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
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
import { GlassView } from "@/components/GlassView";
import { ScreenBackground } from "@/components/ScreenBackground";
import { deletePin } from "@/lib/pins";
import { getPalette, monoFont } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

export type PinPhoto = { id: string; url: string; path?: string };
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

const PHOTO_WIDTH = Dimensions.get("window").width - 40;

/**
 * Instant doesn't guarantee any particular order for a pin's `photos` link,
 * so relying on query order to mean "upload order" is unreliable. Each
 * photo's storage path is `pins/{pinId}/{index}-{name}` (see `uploadPhoto` in
 * lib/pins.ts), so sort by that index instead — this is what makes "the
 * first picture" stable everywhere it's shown.
 */
function photoPathIndex(photo: PinPhoto): number | null {
  const match = photo.path?.match(/\/(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

export function sortPhotos<T extends PinPhoto>(photos: T[]): T[] {
  const key = (photo: T) => photoPathIndex(photo) ?? Number.POSITIVE_INFINITY;
  return [...photos].sort((a, b) => key(a) - key(b));
}

/**
 * The next safe path index for a new photo on this pin — one past the
 * highest index already in use, so a freshly uploaded photo can never
 * collide with (and outrank) an existing one, even after some were removed.
 */
export function nextPhotoIndex(photos: PinPhoto[]): number {
  const highest = photos.reduce(
    (max, photo) => Math.max(max, photoPathIndex(photo) ?? -1),
    -1,
  );
  return highest + 1;
}

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

/**
 * A rounded liquid-glass pill button — used for header text actions across
 * the pin details and pin composer sheets (Close/Edit/Delete, Cancel/Save).
 */
export function HeaderPill({
  label,
  color,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner in place of the label — e.g. while saving. */
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className="active:opacity-70 disabled:opacity-40"
      style={{ borderRadius: 999, overflow: "hidden" }}
    >
      <GlassView radius={999} intensity={30}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            minWidth: loading ? 40 : undefined,
            alignItems: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={color} />
          ) : (
            <Text className="text-sm font-outfit-semibold" style={{ color }}>
              {label}
            </Text>
          )}
        </View>
      </GlassView>
    </Pressable>
  );
}

export function PinDetails({
  pin,
  currentUserId,
  onClose,
  onShowOnMap,
  onEdit,
}: {
  pin: PinRecord | null;
  currentUserId: string;
  onClose: () => void;
  /** When provided (e.g. opened from the profile), shows a jump-to-map button. */
  onShowOnMap?: (pin: PinRecord) => void;
  /** When provided, owners get an Edit button that opens the composer on this pin. */
  onEdit?: (pin: PinRecord) => void;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
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
      <ScreenBackground>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          {/* Grabber handle — matches the settings sheet's chrome. */}
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
            <HeaderPill label="Close" color={palette.accent} onPress={onClose} />
            {isOwner ? (
              <View className="flex-row items-center gap-2">
                {onEdit && pin ? (
                  <HeaderPill
                    label="Edit"
                    color={palette.text}
                    disabled={deleting}
                    onPress={() => onEdit(pin)}
                  />
                ) : null}
                <HeaderPill
                  label={deleting ? "Deleting…" : "Delete"}
                  color="#ef4444"
                  disabled={deleting}
                  onPress={confirmDelete}
                />
              </View>
            ) : null}
          </View>

          {pin ? (
            <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-8">
              {/* Photos */}
              {pin.photos.length > 0 ? (
                <View
                  style={{
                    borderRadius: 20,
                    overflow: "hidden",
                    backgroundColor: palette.surface2,
                  }}
                >
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                  >
                    {sortPhotos(pin.photos).map((photo) => (
                      <Image
                        key={photo.id}
                        source={{ uri: photo.url }}
                        style={{ width: PHOTO_WIDTH, height: PHOTO_WIDTH * 0.75 }}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <View style={{ height: 160, borderRadius: 20, overflow: "hidden" }}>
                  <GlassView radius={20} intensity={20}>
                    <View className="flex-1 items-center justify-center">
                      <Feather name="image" size={28} color={palette.textDim} />
                      <Text
                        className="mt-2 text-sm font-outfit"
                        style={{ color: palette.textDim }}
                      >
                        No photos
                      </Text>
                    </View>
                  </GlassView>
                </View>
              )}

              <View className="gap-3 pt-5">
                <Text
                  className="text-2xl font-outfit-semibold tracking-tight"
                  style={{ color: palette.text }}
                >
                  {pin.name}
                </Text>

                {pin.description ? (
                  <Text
                    className="text-base leading-6 font-outfit"
                    style={{ color: palette.textDim }}
                  >
                    {pin.description}
                  </Text>
                ) : (
                  <Text
                    className="text-base italic font-outfit"
                    style={{ color: palette.textDim }}
                  >
                    No description yet.
                  </Text>
                )}

                <View className="flex-row items-center gap-1.5 pt-1">
                  <Feather name="map-pin" size={12} color={palette.textDim} />
                  <Text
                    style={{
                      fontFamily: monoFont,
                      fontSize: 11,
                      color: palette.textDim,
                    }}
                  >
                    {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                  </Text>
                </View>

                <View className="flex-row items-center gap-1.5">
                  <Feather name="clock" size={12} color={palette.textDim} />
                  <Text
                    style={{
                      fontFamily: monoFont,
                      fontSize: 11,
                      color: palette.textDim,
                    }}
                  >
                    {formatAddedAt(pin.createdAt)}
                  </Text>
                </View>

                {onShowOnMap ? (
                  <Pressable
                    onPress={() => onShowOnMap(pin)}
                    className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3.5 active:opacity-80"
                    style={{ backgroundColor: palette.accent }}
                  >
                    <Feather name="navigation" size={16} color={palette.accentFg} />
                    <Text
                      className="text-base font-outfit-semibold"
                      style={{ color: palette.accentFg }}
                    >
                      Take me to the pin
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </ScreenBackground>
    </Modal>
  );
}
