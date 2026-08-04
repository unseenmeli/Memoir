import { Feather, Ionicons } from "@expo/vector-icons";
import type { User } from "@instantdb/react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassView } from "@/components/GlassView";
import { PinComposer } from "@/components/PinComposer";
import { PinDetails, sortPhotos, type PinRecord } from "@/components/PinDetails";
import { ScreenBackground } from "@/components/ScreenBackground";
import { db } from "@/lib/db";
import {
  distanceKm,
  formatDistance,
  proximityOf,
  useViewerLocation,
  PROXIMITY_LABEL,
} from "@/lib/distance";
import { useBootBlocker } from "@/lib/loading";
import { useMapFocus } from "@/lib/mapFocus";
import { darken, getPalette, monoFont } from "@/lib/palette";
import { usePlaceSearch, type PlaceResult } from "@/lib/places";
import {
  pinDistanceKm,
  searchPins,
  sortByDistance,
  useViewerCountry,
} from "@/lib/search";
import { collectTags, formatTag, pinTags } from "@/lib/tags";
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
  const p = getPalette(scheme);

  const row = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Feather
        name={filter.icon}
        size={14}
        color={active ? p.accentFg : p.text}
      />
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: active ? "800" : "700",
          color: active ? p.accentFg : p.text,
        }}
      >
        {filter.label}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={filter.label}
      hitSlop={6}
      className="active:opacity-70"
      style={{ borderRadius: 20, overflow: "hidden" }}
    >
      {active ? (
        <View style={{ backgroundColor: p.accent }}>{row}</View>
      ) : (
        <GlassView radius={20} intensity={30}>
          {row}
        </GlassView>
      )}
    </Pressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A row that dips slightly when pressed. Reads as physically tappable in a
 * way a plain opacity flash doesn't, and the spring back makes the list feel
 * responsive rather than static.
 */
function PressableRow({
  onPress,
  children,
  style,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
    opacity: 1 - pressed.value * 0.25,
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 160 });
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** One selectable label in the tag filter row. */
function TagChip({
  tag,
  count,
  active,
  onPress,
}: {
  tag: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const p = getPalette(scheme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${formatTag(tag)}, ${count} ${count === 1 ? "place" : "places"}`}
      className="active:opacity-70"
      style={{
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: active ? p.accent : "transparent",
        borderWidth: 1,
        borderColor: active ? p.accent : p.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            fontSize: 12.5,
            fontWeight: active ? "800" : "600",
            color: active ? p.accentFg : p.text,
          }}
        >
          {formatTag(tag)}
        </Text>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: "700",
            color: active ? p.accentFg : p.textDim,
            opacity: active ? 0.75 : 1,
          }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

/** The gradient tile + pin icon look for results with no photo of their own. */
function TintedTile({ tint }: { tint: string }) {
  return (
    <LinearGradient
      colors={[tint, darken(tint, 0.45)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        height: 52,
        width: 52,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Feather name="map-pin" size={19} color="#0d0c0c" />
    </LinearGradient>
  );
}

/**
 * Right-aligned distance readout: the actual distance ("1.2 km") over a band
 * label ("NEARBY"). Falls back to nothing when location is unavailable —
 * better blank than the old country-based guess, which called a place 400km
 * away "NEARBY" purely because it was in the same country.
 */
function DistanceTag({ km }: { km: number | null }) {
  const { scheme } = useTheme();
  const p = getPalette(scheme);
  const band = proximityOf(km);
  if (km === null || !band) return null;

  return (
    <View style={{ flexShrink: 0, alignItems: "flex-end" }}>
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: "700",
          color: band === "here" || band === "near" ? p.accent : p.text,
        }}
      >
        {formatDistance(km)}
      </Text>
      <Text
        style={{
          marginTop: 1,
          fontSize: 9,
          fontWeight: "800",
          letterSpacing: 0.8,
          color: p.textDim,
        }}
      >
        {PROXIMITY_LABEL[band]}
      </Text>
    </View>
  );
}

/** One search hit: thumbnail (real photo if it has one, else a tinted tile), name, description. */
function ResultRow({
  pin,
  km,
  tint,
  onPress,
}: {
  pin: PinRecord;
  km: number | null;
  tint: string;
  onPress: () => void;
}) {
  const photo = sortPhotos(pin.photos)[0];

  return (
    <PressableRow
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(128,128,128,0.14)",
      }}
    >
      {photo ? (
        <View className="h-[52px] w-[52px] overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
          <Image
            source={{ uri: photo.url }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>
      ) : (
        <TintedTile tint={tint} />
      )}

      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="text-base font-outfit-semibold text-zinc-900 dark:text-zinc-50"
        >
          {pin.name}
        </Text>
        {pin.description ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs text-zinc-500 font-outfit dark:text-zinc-400"
          >
            {pin.description}
          </Text>
        ) : null}
      </View>

      <DistanceTag km={km} />
    </PressableRow>
  );
}

/** One live POI result: tinted tile (no photo source for these yet), name, address. */
function PlaceRow({
  place,
  km,
  tint,
  onPress,
}: {
  place: PlaceResult;
  km: number | null;
  tint: string;
  onPress: () => void;
}) {
  return (
    <PressableRow
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(128,128,128,0.14)",
      }}
    >
      <TintedTile tint={tint} />

      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="text-base font-outfit-semibold text-zinc-900 dark:text-zinc-50"
        >
          {place.name}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-xs text-zinc-500 font-outfit dark:text-zinc-400"
        >
          {place.displayName}
        </Text>
      </View>

      <DistanceTag km={km} />
    </PressableRow>
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
      body="Search by name, description or tag. Closest places show up first."
    />
  );
}

function FindContent({ user }: { user: User }) {
  const router = useRouter();
  const { scheme } = useTheme();
  const { focusPin } = useMapFocus();
  const barHeight = useTabBarHeight();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const [editing, setEditing] = useState<PinRecord | null>(null);
  // At most one filter at a time; null means "no filter". Trending is on by
  // default so the page opens with content instead of an empty prompt.
  const [active, setActive] = useState<FilterKey | null>("trending");
  // Tag chips are additive: a pin must carry every selected tag.
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  function toggleFilter(key: FilterKey) {
    setActive((current) => (current === key ? null : key));
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  }

  const viewerCountry = useViewerCountry();
  const viewerLocation = useViewerLocation();

  const { data, isLoading } = db.useQuery({
    pins: { photos: {}, owner: {} },
  });

  useBootBlocker("find", isLoading);

  const pins = useMemo(
    () => (data?.pins ?? []) as unknown as PinRecord[],
    [data],
  );

  const myPinCount = useMemo(
    () => pins.filter((p) => p.owner?.id === user.id).length,
    [pins, user.id],
  );

  const trimmed = query.trim();

  // Every tag in use, most-common first — drives the filter chip row.
  const allTags = useMemo(() => collectTags(pins), [pins]);

  // Match quality first, then genuine distance from the viewer.
  const results = useMemo(
    () =>
      searchPins(pins, query, {
        viewer: viewerLocation,
        tags: selectedTags,
      }),
    [pins, query, viewerLocation, selectedTags],
  );

  // Live POI search (restaurants, shops, etc. from OpenStreetMap) — only
  // saved pins are browsable without a query, so this stays idle until then.
  const { results: places, loading: placesLoading } = usePlaceSearch(
    trimmed,
    viewerCountry,
  );

  // With no query, an active filter browses the list instead of searching.
  const browse = useMemo(() => {
    const tagged = selectedTags.length
      ? pins.filter((pin) => {
          const own = pinTags(pin);
          return selectedTags.every((tag) => own.includes(tag));
        })
      : pins;

    // Tag chips alone are a browse, even with no view filter selected.
    if (active !== "trending") {
      return selectedTags.length ? sortByDistance(tagged, viewerLocation) : [];
    }
    // Trending = newest first; that's the whole point of the filter.
    return [...tagged].sort((a, b) => b.createdAt - a.createdAt);
  }, [active, pins, selectedTags, viewerLocation]);

  // Rows shown in the list: plain saved pins while browsing, or saved pins +
  // live places while searching — each in its own labeled group when both
  // are present, unlabeled when only one kind of result exists.
  type Row =
    | { kind: "pin"; key: string; pin: PinRecord }
    | { kind: "place"; key: string; place: PlaceResult }
    | { kind: "header"; key: string; label: string };

  const rows = useMemo<Row[]>(() => {
    if (!trimmed) {
      return browse.map((pin) => ({ kind: "pin", key: pin.id, pin }));
    }

    const pinRows: Row[] = results.map((pin) => ({
      kind: "pin",
      key: `pin-${pin.id}`,
      pin,
    }));
    const placeRows: Row[] = places.map((place) => ({
      kind: "place",
      key: `place-${place.id}`,
      place,
    }));

    if (pinRows.length && placeRows.length) {
      return [
        { kind: "header", key: "h-pins", label: "Saved pins" },
        ...pinRows,
        { kind: "header", key: "h-places", label: "Places · OpenStreetMap" },
        ...placeRows,
      ];
    }
    return [...pinRows, ...placeRows];
  }, [trimmed, browse, results, places]);

  function goToPinOnMap(pin: PinRecord) {
    setSelected(null);
    focusPin({
      latitude: pin.latitude,
      longitude: pin.longitude,
      pinId: pin.id,
    });
    router.navigate("/");
  }

  // Places have no details screen and no marker of their own — tapping one
  // just zooms the map in on it, same as "take me to the pin" does minus the
  // pin (there's nothing saved to show a marker for).
  function goToPlaceOnMap(place: PlaceResult) {
    focusPin({
      latitude: place.latitude,
      longitude: place.longitude,
      pinId: `place-${place.id}`,
    });
    router.navigate("/");
  }

  const palette = getPalette(scheme);
  const iconColor = palette.textDim;
  const monoLabelStyle = {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textDim,
  };

  return (
    <ScreenBackground>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="px-6 pt-4">
          {/* Filter row — centered now that there's no title beside it. */}
          <View className="flex-row items-center justify-center gap-1.5">
            {FILTERS.map((filter) => (
              <FilterToggle
                key={filter.key}
                filter={filter}
                active={active === filter.key}
                onPress={() => toggleFilter(filter.key)}
              />
            ))}
          </View>

          {/* Search field */}
          <View style={{ marginTop: 16, borderRadius: 22, overflow: "hidden" }}>
            <GlassView radius={22} intensity={35}>
              <View className="flex-row items-center gap-2.5 px-3.5 py-3">
                <Feather name="search" size={17} color={iconColor} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search places"
                  placeholderTextColor={iconColor}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="never"
                  className="flex-1 py-0.5 text-base font-outfit"
                  style={{ color: palette.text }}
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
            </GlassView>
            {searchFocused ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 22,
                  borderWidth: 1.5,
                  borderColor: palette.accent,
                }}
              />
            ) : null}
          </View>

          {/* Tag chips — the vocabulary is whatever people have actually
              written, so this row is empty until pins carry tags. */}
          {allTags.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 6, paddingVertical: 12, paddingRight: 24 }}
              style={{ marginHorizontal: -24, paddingHorizontal: 24 }}
            >
              {allTags.map(({ tag, count }) => (
                <TagChip
                  key={tag}
                  tag={tag}
                  count={count}
                  active={selectedTags.includes(tag)}
                  onPress={() => toggleTag(tag)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={({ item: row, index }) => {
            if (row.kind === "header") {
              return (
                <Text style={[monoLabelStyle, { paddingHorizontal: 24, paddingBottom: 8, paddingTop: 16 }]}>
                  {`// ${row.label.toUpperCase()}`}
                </Text>
              );
            }
            const tint = index % 2 === 0 ? palette.accent : palette.accent2;
            return (
              // Stagger capped so a long list doesn't leave the last rows
              // visibly waiting to appear.
              <Animated.View
                entering={FadeIn.duration(180).delay(Math.min(index, 8) * 22)}
                layout={LinearTransition.duration(220)}
              >
                {row.kind === "pin" ? (
                  <ResultRow
                    pin={row.pin}
                    km={pinDistanceKm(row.pin, viewerLocation)}
                    tint={tint}
                    onPress={() => setSelected(row.pin)}
                  />
                ) : (
                  <PlaceRow
                    place={row.place}
                    km={
                      viewerLocation
                        ? distanceKm(viewerLocation, {
                            latitude: row.place.latitude,
                            longitude: row.place.longitude,
                          })
                        : null
                    }
                    tint={tint}
                    onPress={() => goToPlaceOnMap(row.place)}
                  />
                )}
              </Animated.View>
            );
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: barHeight + 24 }}
          // Only label the browse lists — search results are self-explanatory
          // (the "Saved pins" / "Places" headers live in `rows` instead).
          ListHeaderComponent={
            !trimmed && active ? (
              <Text style={[monoLabelStyle, { paddingHorizontal: 24, paddingBottom: 8, paddingTop: 4 }]}>
                {`// ${(FILTERS.find((f) => f.key === active)?.label ?? "").toUpperCase()}`}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            trimmed && placesLoading ? (
              <View className="items-center pt-24">
                <ActivityIndicator color={iconColor} />
              </View>
            ) : (
              <FindEmptyState query={trimmed} filter={active} />
            )
          }
          ListFooterComponent={
            trimmed && placesLoading && rows.length > 0 ? (
              <View className="items-center py-4">
                <ActivityIndicator color={iconColor} />
              </View>
            ) : null
          }
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
        pinCount={myPinCount}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
      </SafeAreaView>
    </ScreenBackground>
  );
}

export default function FindScreen() {
  return <AuthGate>{(user) => <FindContent user={user} />}</AuthGate>;
}
