import { Feather, Ionicons } from "@expo/vector-icons";
import type { User } from "@instantdb/react-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { PinDetails, type PinRecord } from "@/components/PinDetails";
import { db } from "@/lib/db";
import { useBootBlocker } from "@/lib/loading";
import { useMapFocus } from "@/lib/mapFocus";
import { searchPins, useViewerCountry } from "@/lib/search";
import { useTabBarHeight } from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

/**
 * The three view filters. Each is a toggle: tapping the active one turns it
 * off and returns to the unfiltered list, so there's always a way back.
 */
const FILTERS = [
  { key: "trending", icon: "trending-up", label: "Trending" },
  { key: "saved", icon: "bookmark", label: "Saved" },
  { key: "friends", icon: "users", label: "Friends" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function FilterToggle({
  filter,
  active,
  onPress,
}: {
  filter: (typeof FILTERS)[number];
  active: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  // Active inverts: dark chip in light mode, light chip in dark mode.
  const iconColor = active
    ? dark
      ? "#18181b"
      : "#ffffff"
    : dark
      ? "#a1a1aa"
      : "#71717a";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={filter.label}
      hitSlop={6}
      className={`h-9 w-9 items-center justify-center rounded-full active:opacity-60 ${
        active
          ? "bg-zinc-900 dark:bg-zinc-100"
          : "bg-zinc-100 dark:bg-zinc-900"
      }`}
    >
      <Feather name={filter.icon} size={16} color={iconColor} />
    </Pressable>
  );
}

/** One search hit: thumbnail, name, description, and a "nearby" marker. */
function ResultRow({
  pin,
  isLocal,
  onPress,
}: {
  pin: PinRecord;
  isLocal: boolean;
  onPress: () => void;
}) {
  const photo = pin.photos[0];

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-6 py-3 active:opacity-60"
    >
      <View className="h-14 w-14 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
        {photo ? (
          <Image
            source={{ uri: photo.url }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text style={{ fontSize: 22 }}>📍</Text>
          </View>
        )}
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="flex-1 text-base font-outfit-semibold text-zinc-900 dark:text-zinc-50"
          >
            {pin.name}
          </Text>
          {isLocal ? (
            <View className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
              <Text className="text-[11px] font-outfit-medium text-zinc-600 dark:text-zinc-300">
                Nearby
              </Text>
            </View>
          ) : null}
        </View>
        {pin.description ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-sm text-zinc-500 font-outfit dark:text-zinc-400"
          >
            {pin.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function EmptyState({ icon, title, body }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View className="items-center gap-3 px-10 pt-24">
      <Ionicons name={icon} size={44} color="#a1a1aa" />
      <Text className="text-center text-base font-outfit-medium text-zinc-900 dark:text-zinc-100">
        {title}
      </Text>
      <Text className="text-center text-sm text-zinc-500 font-outfit dark:text-zinc-400">
        {body}
      </Text>
    </View>
  );
}

/** Picks the right empty message for the current query + filter combination. */
function FindEmptyState({
  query,
  filter,
}: {
  query: string;
  filter: FilterKey | null;
}) {
  if (query) {
    return (
      <EmptyState
        icon="search-outline"
        title="No places found"
        body={`Nothing matches "${query}". Try a different spelling.`}
      />
    );
  }

  // Saved and Friends have no backing data yet — say so plainly rather than
  // showing an empty list that looks like a bug.
  if (filter === "saved") {
    return (
      <EmptyState
        icon="bookmark-outline"
        title="No saved places yet"
        body="Saving pins isn't wired up yet — it needs a saves table in the schema."
      />
    );
  }
  if (filter === "friends") {
    return (
      <EmptyState
        icon="people-outline"
        title="No friends yet"
        body="Friends aren't wired up yet — it needs a connections table in the schema."
      />
    );
  }
  if (filter === "trending") {
    return (
      <EmptyState
        icon="trending-up-outline"
        title="Nothing trending yet"
        body="Once people start dropping pins, the newest ones show up here."
      />
    );
  }

  return (
    <EmptyState
      icon="compass-outline"
      title="Search saved places"
      body="Find pins by name or description. Places in your country show up first."
    />
  );
}

function FindContent({ user }: { user: User }) {
  const router = useRouter();
  const { scheme } = useTheme();
  const { focusPin } = useMapFocus();
  const barHeight = useTabBarHeight();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PinRecord | null>(null);
  // At most one filter at a time; null means "no filter". Trending is on by
  // default so the page opens with content instead of an empty prompt.
  const [active, setActive] = useState<FilterKey | null>("trending");

  function toggleFilter(key: FilterKey) {
    setActive((current) => (current === key ? null : key));
  }

  const viewerCountry = useViewerCountry();

  const { data, isLoading } = db.useQuery({
    pins: { photos: {}, owner: {} },
  });

  useBootBlocker("find", isLoading);

  const pins = useMemo(
    () => (data?.pins ?? []) as unknown as PinRecord[],
    [data],
  );

  // Ranked so same-country pins come first, then by match quality.
  const results = useMemo(
    () => searchPins(pins, query, viewerCountry),
    [pins, query, viewerCountry],
  );

  // With no query, an active filter browses the list instead of searching.
  // Same-country pins still lead, matching the search ordering.
  const browse = useMemo(() => {
    if (active !== "trending") return [];
    const local = (pin: PinRecord) =>
      Boolean(viewerCountry && pin.country === viewerCountry);
    return [...pins].sort((a, b) => {
      if (local(a) !== local(b)) return local(a) ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [active, pins, viewerCountry]);

  function goToPinOnMap(pin: PinRecord) {
    setSelected(null);
    focusPin({
      latitude: pin.latitude,
      longitude: pin.longitude,
      pinId: pin.id,
    });
    router.navigate("/");
  }

  const trimmed = query.trim();
  const iconColor = scheme === "dark" ? "#71717a" : "#a1a1aa";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950" edges={["top"]}>
      <View className="px-6 pt-4">
        {/* Title row — the filter toggles sit on the same baseline as "Find". */}
        <View className="flex-row items-center justify-between">
          <Text className="text-3xl font-outfit-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Find
          </Text>

          <View className="flex-row items-center gap-1.5">
            {FILTERS.map((filter) => (
              <FilterToggle
                key={filter.key}
                filter={filter}
                active={active === filter.key}
                onPress={() => toggleFilter(filter.key)}
              />
            ))}
          </View>
        </View>

        {/* Search field */}
        <View className="mt-4 flex-row items-center gap-2 rounded-xl bg-zinc-100 px-3.5 dark:bg-zinc-900">
          <Feather name="search" size={17} color={iconColor} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search places"
            placeholderTextColor={iconColor}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
            className="flex-1 py-3 text-base text-zinc-900 font-outfit dark:text-zinc-100"
          />
          {trimmed ? (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              className="active:opacity-60"
            >
              <Feather name="x-circle" size={17} color={iconColor} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={trimmed ? results : browse}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ResultRow
            pin={item}
            isLocal={Boolean(viewerCountry && item.country === viewerCountry)}
            onPress={() => setSelected(item)}
          />
        )}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: barHeight + 24 }}
        // Only label the browse lists — search results are self-explanatory.
        ListHeaderComponent={
          !trimmed && active ? (
            <Text className="px-6 pb-2 pt-1 text-xs uppercase tracking-wide text-zinc-400 font-outfit-medium dark:text-zinc-500">
              {FILTERS.find((f) => f.key === active)?.label}
            </Text>
          ) : null
        }
        ListEmptyComponent={<FindEmptyState query={trimmed} filter={active} />}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
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

export default function FindScreen() {
  return <AuthGate>{(user) => <FindContent user={user} />}</AuthGate>;
}
