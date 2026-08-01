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
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassView } from "@/components/GlassView";
import { PinComposer } from "@/components/PinComposer";
import { PinDetails, sortPhotos, type PinRecord } from "@/components/PinDetails";
import { ScreenBackground } from "@/components/ScreenBackground";
import { db } from "@/lib/db";
import { useBootBlocker } from "@/lib/loading";
import { useMapFocus } from "@/lib/mapFocus";
import { darken, getPalette, monoFont } from "@/lib/palette";
import { usePlaceSearch, type PlaceResult } from "@/lib/places";
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

/** Right-aligned "NEARBY"/"FAR" tag, matching the design's result rows. */
function DistanceTag({ isLocal }: { isLocal: boolean }) {
  const { scheme } = useTheme();
  const p = getPalette(scheme);
  return (
    <Text
      style={{
        flexShrink: 0,
        fontSize: 9.5,
        fontWeight: "800",
        letterSpacing: 0.8,
        color: p.textDim,
      }}
    >
      {isLocal ? "NEARBY" : "FAR"}
    </Text>
  );
}

/** One search hit: thumbnail (real photo if it has one, else a tinted tile), name, description. */
function ResultRow({
  pin,
  isLocal,
  tint,
  onPress,
}: {
  pin: PinRecord;
  isLocal: boolean;
  tint: string;
  onPress: () => void;
}) {
  const photo = sortPhotos(pin.photos)[0];

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3.5 px-6 py-2.5"
      style={{ borderBottomWidth: 1, borderBottomColor: "rgba(128,128,128,0.14)" }}
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

      <DistanceTag isLocal={isLocal} />
    </Pressable>
  );
}

/** One live POI result: tinted tile (no photo source for these yet), name, address. */
function PlaceRow({
  place,
  isLocal,
  tint,
  onPress,
}: {
  place: PlaceResult;
  isLocal: boolean;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3.5 px-6 py-2.5"
      style={{ borderBottomWidth: 1, borderBottomColor: "rgba(128,128,128,0.14)" }}
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

      <DistanceTag isLocal={isLocal} />
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
  const [searchFocused, setSearchFocused] = useState(false);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const [editing, setEditing] = useState<PinRecord | null>(null);
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

  const myPinCount = useMemo(
    () => pins.filter((p) => p.owner?.id === user.id).length,
    [pins, user.id],
  );

  const trimmed = query.trim();

  // Ranked so same-country pins come first, then by match quality.
  const results = useMemo(
    () => searchPins(pins, query, viewerCountry),
    [pins, query, viewerCountry],
  );

  // Live POI search (restaurants, shops, etc. from OpenStreetMap) — only
  // saved pins are browsable without a query, so this stays idle until then.
  const { results: places, loading: placesLoading } = usePlaceSearch(
    trimmed,
    viewerCountry,
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
            if (row.kind === "pin") {
              return (
                <ResultRow
                  pin={row.pin}
                  isLocal={Boolean(
                    viewerCountry && row.pin.country === viewerCountry,
                  )}
                  tint={tint}
                  onPress={() => setSelected(row.pin)}
                />
              );
            }
            return (
              <PlaceRow
                place={row.place}
                isLocal={Boolean(
                  viewerCountry && row.place.countryCode === viewerCountry,
                )}
                tint={tint}
                onPress={() => goToPlaceOnMap(row.place)}
              />
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
