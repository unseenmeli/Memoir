import { Feather } from "@expo/vector-icons";
import type { User } from "@instantdb/react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassView } from "@/components/GlassView";
import { PinComposer } from "@/components/PinComposer";
import { PinDetails, sortPhotos, type PinRecord } from "@/components/PinDetails";
import { ScreenBackground } from "@/components/ScreenBackground";
import { db } from "@/lib/db";
import { haptics } from "@/lib/haptics";
import { useBootBlocker } from "@/lib/loading";
import { useRefresh } from "@/lib/refresh";
import { useMapFocus } from "@/lib/mapFocus";
import { getPalette, mix, monoFont, withAlpha } from "@/lib/palette";
import { ensureProfile, updateAvatar, type ProfileRecord } from "@/lib/profile";
import { collectTags } from "@/lib/tags";
import { useTabBarHeight } from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

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

function Stat({
  label,
  value,
  fg,
  fgDim,
}: {
  label: string;
  value: string;
  fg: string;
  fgDim: string;
}) {
  return (
    <View className="flex-row items-baseline gap-2">
      <Text
        className="text-right text-lg font-outfit-semibold"
        style={{ width: 28, color: fg }}
      >
        {value}
      </Text>
      <Text className="text-base font-outfit-medium" style={{ color: fgDim }}>
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
  const photo = sortPhotos(pin.photos)[0];

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
  const barHeight = useTabBarHeight();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const { refreshing, onRefresh } = useRefresh();
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const [editing, setEditing] = useState<PinRecord | null>(null);
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

  // Hold the boot splash until the pins/profile query lands, so the collage
  // never flashes empty on a cold start.
  useBootBlocker("profile", isLoading);

  const profile = (data?.profiles?.[0] ?? null) as ProfileRecord | null;
  const pins = (data?.pins ?? []) as unknown as PinRecord[];
  const pinCount = pins.length;
  const email = user.email ?? "";
  const isGuest = !email;

  // Both derived from pins already in hand, so they move as the collage does.
  // `country` is optional on older pins (see instant.schema.ts), so this can
  // undercount slightly — the label stays true either way.
  const countryCount = useMemo(
    () => new Set(pins.map((pin) => pin.country).filter(Boolean)).size,
    [pins],
  );
  const tagCount = useMemo(() => collectTags(pins).length, [pins]);

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
      await updateAvatar(user.id, profile.id, result.assets[0], profile.avatar?.id);
      haptics.success();
    } catch (err) {
      haptics.error();
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

  // `||`, not `??`: a guest has no email, so `"".split("@")[0]` is `""` — which
  // is not nullish, so `??` would hand the header an empty name.
  const displayName =
    profile?.displayName || (email ? email.split("@")[0] : "Guest");
  const initial = displayName.charAt(0).toUpperCase();

  const heroGradient: [string, string, string] = [
    palette.accent,
    mix(palette.accent, palette.accent2, 0.55),
    palette.accent2,
  ];

  const header = (
    <View className="px-6 pt-4">
      {/* Gradient hero card */}
      <View
        style={{
          borderRadius: 22,
          overflow: "hidden",
          marginBottom: 22,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
        }}
      >
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <LinearGradient
          colors={["rgba(255,255,255,0.4)", "transparent"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.55 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />

        <View style={{ padding: 18 }}>
          {/* Name + settings */}
          <View className="mb-5 flex-row items-center justify-between">
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: "Outfit_700Bold",
                fontSize: 28,
                letterSpacing: -0.5,
                color: palette.heroFg,
              }}
            >
              {displayName}
            </Text>
            <Pressable
              onPress={() => router.push("/settings")}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={8}
              className="ml-2 active:opacity-70"
            >
              <GlassView radius={19} intensity={25} style={{ width: 38, height: 38 }}>
                <View className="flex-1 items-center justify-center">
                  <Feather name="settings" size={17} color={palette.heroFg} />
                </View>
              </GlassView>
            </Pressable>
          </View>

          {/* Avatar + stats */}
          <View className="flex-row items-center gap-5">
            <Pressable
              onPress={changeAvatar}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              className="active:opacity-80"
              style={{ width: 90, height: 90 }}
            >
              <View
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 45,
                  overflow: "hidden",
                  borderWidth: 2.5,
                  borderColor: palette.heroFg,
                }}
                className="bg-black/10"
              >
                {profile?.avatar?.url ? (
                  <Image
                    source={{ uri: profile.avatar.url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Text
                      className="text-3xl font-outfit-bold"
                      style={{ color: palette.heroFg }}
                    >
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
              <View
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#ffffff",
                  borderWidth: 2.5,
                  borderColor: palette.accent,
                }}
              >
                <Feather name="camera" size={13} color={palette.accent} />
              </View>
            </Pressable>

            <View className="flex-1 gap-2.5">
              <Stat
                label="Pins"
                value={String(pinCount)}
                fg={palette.heroFg}
                fgDim={palette.heroFgDim}
              />
              <Stat
                label={countryCount === 1 ? "Country" : "Countries"}
                value={String(countryCount)}
                fg={palette.heroFg}
                fgDim={palette.heroFgDim}
              />
              <Stat
                label={tagCount === 1 ? "Tag" : "Tags"}
                value={String(tagCount)}
                fg={palette.heroFg}
                fgDim={palette.heroFgDim}
              />
            </View>
          </View>
        </View>
      </View>

      {/* A guest session lives only on this device and only until they sign
          out, so the way to keep it needs to be visible from the main screen —
          not buried behind the settings gear. */}
      {isGuest ? (
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Add an email to keep your pins"
          className="mb-5 flex-row items-center gap-3 rounded-2xl px-4 py-3 active:opacity-70"
          style={{
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.5),
            backgroundColor: withAlpha(palette.accent, 0.1),
          }}
        >
          <Feather name="alert-circle" size={17} color={palette.accent} />
          <Text
            className="flex-1 text-sm font-outfit"
            style={{ color: palette.text }}
          >
            You&apos;re browsing as a guest. Add an email so you don&apos;t lose
            these pins.
          </Text>
          <Feather name="chevron-right" size={17} color={palette.textDim} />
        </Pressable>
      ) : null}

      {/* Collage heading */}
      <View className="flex-row items-baseline justify-between">
        <Text
          style={{
            fontFamily: "Outfit_700Bold",
            fontSize: 21,
            letterSpacing: -0.3,
            color: palette.text,
          }}
        >
          Your pins
        </Text>
        <Text
          style={{
            fontFamily: monoFont,
            fontSize: 10.5,
            letterSpacing: 1,
            color: palette.textDim,
          }}
        >
          {`[ ${String(pinCount).padStart(2, "0")} SAVED ]`}
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenBackground>
    <SafeAreaView className="flex-1" edges={["top"]}>
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
        // Clear the floating tab bar so the last pins aren't hidden under it.
        contentContainerStyle={{ paddingBottom: barHeight + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.textDim}
            colors={[palette.accent]}
            progressBackgroundColor={palette.surface}
          />
        }
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
        onEdit={(pin) => {
          setSelected(null);
          setEditing(pin);
        }}
      />

      <PinComposer
        visible={!!editing}
        coordinate={
          editing
            ? { latitude: editing.latitude, longitude: editing.longitude }
            : null
        }
        editingPin={editing}
        userId={user.id}
        pinCount={pinCount}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    </SafeAreaView>
    </ScreenBackground>
  );
}

export default function ProfileScreen() {
  return <AuthGate>{(user) => <ProfileContent user={user} />}</AuthGate>;
}
