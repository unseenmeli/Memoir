import { Feather } from "@expo/vector-icons";
import type { User } from "@instantdb/react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { PinDetails, type PinRecord } from "@/components/PinDetails";
import { db } from "@/lib/db";
import { useMapFocus } from "@/lib/mapFocus";
import { ensureProfile, updateAvatar, type ProfileRecord } from "@/lib/profile";

// Playful backgrounds + emoji for pins that have no photo, so the collage
// never turns into a wall of grey boxes.
const CARD_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#6366f1",
  "#d946ef",
  "#ec4899",
];
const CARD_EMOJI = ["📍", "🌆", "🍜", "🏞️", "☕️", "🌊", "🎡", "🌮"];
const TILE_HEIGHT = 172;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-2">
      <Text
        className="text-right text-lg font-outfit-semibold text-zinc-900 dark:text-zinc-50"
        style={{ width: 28 }}
      >
        {value}
      </Text>
      <Text className="text-lg text-zinc-900 font-outfit dark:text-zinc-300">
        {label}
      </Text>
    </View>
  );
}

/** One collage tile: a photo with a caption, or a colorful emoji card. */
function PinTile({
  pin,
  index,
  onPress,
}: {
  pin: PinRecord;
  index: number;
  onPress: () => void;
}) {
  const rotate = index % 2 === 0 ? "-1.5deg" : "1.5deg";
  const photo = pin.photos[0];

  return (
    <Pressable
      onPress={onPress}
      style={{ width: "50%", padding: 5 }}
      className="active:opacity-80"
    >
      <View
        style={{ height: TILE_HEIGHT, transform: [{ rotate }] }}
        className="overflow-hidden rounded-3xl bg-zinc-100 shadow-sm dark:bg-zinc-800"
      >
        {photo ? (
          <>
            <Image
              source={{ uri: photo.url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
            <View className="absolute inset-x-0 bottom-0 bg-black/45 px-3 py-2">
              <Text
                numberOfLines={1}
                className="text-sm font-outfit-semibold text-white"
              >
                {pin.name}
              </Text>
            </View>
          </>
        ) : (
          <View
            className="flex-1 items-center justify-center px-3"
            style={{ backgroundColor: CARD_COLORS[index % CARD_COLORS.length] }}
          >
            <Text style={{ fontSize: 34 }}>
              {CARD_EMOJI[index % CARD_EMOJI.length]}
            </Text>
            <Text
              numberOfLines={2}
              className="mt-2 text-center text-sm font-outfit-semibold text-white"
            >
              {pin.name}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function EmptyCollage() {
  return (
    <View className="mx-6 mt-3 items-center rounded-3xl border border-dashed border-zinc-300 px-6 py-10 dark:border-zinc-700">
      <Text style={{ fontSize: 34 }}>🗺️</Text>
      <Text className="mt-3 text-center text-base font-outfit-medium text-zinc-900 dark:text-zinc-100">
        No pins yet
      </Text>
      <Text className="mt-1 text-center text-sm text-zinc-500 font-outfit dark:text-zinc-400">
        Long-press anywhere on the map to drop your first one.
      </Text>
    </View>
  );
}

function ProfileContent({ user }: { user: User }) {
  const router = useRouter();
  const { focusPin } = useMapFocus();
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const creatingRef = useRef(false);

  const { data, isLoading } = db.useQuery({
    profiles: {
      $: { where: { "user.id": user.id } },
      avatar: {},
    },
    pins: {
      $: { where: { "owner.id": user.id }, order: { createdAt: "desc" } },
      photos: {},
      owner: {},
    },
  });

  const profile = (data?.profiles?.[0] ?? null) as ProfileRecord | null;
  const pins = (data?.pins ?? []) as unknown as PinRecord[];
  const pinCount = pins.length;
  const email = user.email ?? "";

  // Create the profile row the first time we see a signed-in user without one.
  useEffect(() => {
    if (isLoading || profile || creatingRef.current) return;
    creatingRef.current = true;
    ensureProfile(user.id, email, profile).catch(() => {
      creatingRef.current = false;
    });
  }, [isLoading, profile, user.id, email]);

  async function changeAvatar() {
    if (!profile || uploading) return;
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

    setUploading(true);
    try {
      await updateAvatar(profile.id, result.assets[0], profile.avatar?.id);
    } catch (err) {
      Alert.alert("Couldn't update photo", (err as Error)?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  }

  function goToPinOnMap(pin: PinRecord) {
    setSelected(null);
    // Tell the map which pin to fly to, then switch to the map tab.
    focusPin({
      latitude: pin.latitude,
      longitude: pin.longitude,
      pinId: pin.id,
    });
    router.navigate("/");
  }

  const displayName = profile?.displayName ?? email.split("@")[0] ?? "explorer";
  const initial = displayName.charAt(0).toUpperCase();

  const header = (
    <View className="px-6 pt-4">
      {/* Header row */}
      <View className="flex-row items-center justify-between">
        <Text
          numberOfLines={1}
          className="flex-1 text-3xl font-outfit-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          {displayName}
        </Text>
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          className="ml-2 active:opacity-60"
        >
          <Feather name="settings" size={24} color="#a1a1aa" />
        </Pressable>
      </View>

      {/* Avatar + stats */}
      <View className="mt-5 flex-row items-center justify-between">
        <Pressable
          onPress={changeAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          className="active:opacity-80"
        >
          <View className="h-44 w-44 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {profile?.avatar?.url ? (
              <Image
                source={{ uri: profile.avatar.url }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text className="text-5xl font-outfit-bold text-zinc-400 dark:text-zinc-500">
                  {initial}
                </Text>
              </View>
            )}
            {uploading ? (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : null}
          </View>
          <View className="absolute bottom-1 right-1 h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-zinc-900 dark:border-zinc-950">
            <Feather name="camera" size={17} color="#ffffff" />
          </View>
        </Pressable>

        <View className="items-start gap-7">
          <Stat label="Connections" value="0" />
          <Stat label="Pins" value={String(pinCount)} />
          <Stat label="Streak" value="0" />
        </View>
      </View>

      {/* Collage heading */}
      <View className="mt-9 flex-row items-baseline justify-between">
        <Text className="text-xl font-outfit-semibold text-zinc-900 dark:text-zinc-50">
          Your pins
        </Text>
        <Text className="text-sm text-zinc-500 font-outfit dark:text-zinc-400">
          {pinCount} saved
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950" edges={["top"]}>
      <FlatList
        data={pins}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item, index }) => (
          <PinTile pin={item} index={index} onPress={() => setSelected(item)} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={isLoading ? null : <EmptyCollage />}
        columnWrapperStyle={{ paddingHorizontal: 19 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        // Virtualization: only tiles near the viewport are rendered.
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
      />

      <PinDetails
        pin={selected}
        currentUserId={user.id}
        onClose={() => setSelected(null)}
        onShowOnMap={goToPinOnMap}
      />
    </SafeAreaView>
  );
}

export default function ProfileScreen() {
  return <AuthGate>{(user) => <ProfileContent user={user} />}</AuthGate>;
}
