import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, {
  Callout,
  Marker,
  type LongPressEvent,
} from "react-native-maps";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { GlassView } from "@/components/GlassView";
import type { User } from "@/lib/auth";
import { usePins } from "@/lib/data";
import { haptics } from "@/lib/haptics";
import { PinComposer } from "@/components/PinComposer";
import { PinDetails, sortPhotos, type PinRecord } from "@/components/PinDetails";
import { useViewerLocation } from "@/lib/distance";
import { useMapFocus } from "@/lib/mapFocus";
import { usePrefetchPhotos } from "@/lib/photoPrefetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  HEADER_HEIGHT,
  HINT_HEIGHT,
  PLACEMENT_DELTA,
  getLastRegion,
  placementRegion,
  regionForCoords,
  setLastRegion,
  zoomedRegion,
} from "@/lib/mapRegion";
import { getPalette } from "@/lib/palette";
import {
  TAB_BAR_PILL_HEIGHT,
  useTabBarBottomOffset,
} from "@/lib/tabBar";
import { useTheme } from "@/lib/theme";

type Coordinate = { latitude: number; longitude: number };

// Grace period after the map view lays out, for platforms where `onMapLoaded`
// never fires (Apple Maps). Long enough for tiles to paint on a warm cache.
const TILE_SETTLE_MS = 1200;

/** How long the camera takes to frame a freshly-placed pin. */
const PLACEMENT_ANIM_MS = 520;

/** Zoom button steps are shorter — they're often pressed in quick succession. */
const ZOOM_ANIM_MS = 220;

/** Matches the header's notification button exactly — same box, same circle. */
const CONTROL_SIZE = 40;
const CONTROL_RADIUS = 20;


/**
 * The confirm step between long-pressing and filling out a pin.
 *
 * Long-press used to open the composer immediately, which meant committing to
 * a form before you'd even seen where the pin landed. This shows the spot
 * first and asks; the composer only opens once you say yes.
 */
function PlacementPrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const bottomOffset = useTabBarBottomOffset();

  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOutDown.duration(160)}
      style={{
        position: "absolute",
        left: 20,
        right: 20,
        bottom: bottomOffset + TAB_BAR_PILL_HEIGHT + 16,
        borderRadius: 24,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
      }}
    >
      <GlassView radius={24} intensity={45}>
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 3 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: palette.text,
              }}
            >
              New place
            </Text>
            <Text
              style={{ fontSize: 13, fontWeight: "500", color: palette.textDim }}
            >
              Drop a memory here, or move the map and hold again.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel placing pin"
              className="active:opacity-70"
              style={{
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: palette.border,
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: palette.text }}
              >
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel="Create a memory here"
              className="active:opacity-80"
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: palette.accent,
              }}
            >
              <Feather name="plus" size={15} color={palette.accentFg} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: palette.accentFg,
                }}
              >
                Create a memory
              </Text>
            </Pressable>
          </View>
        </View>
      </GlassView>
    </Animated.View>
  );
}

/**
 * Full-bleed map. Apple Maps on iOS, Google Maps on Android.
 * Native module — needs a development build, not Expo Go.
 *
 * Long-press the map to drop a new pin; tap a pin to see its details.
 */
export function Map({
  user,
  onReady,
}: {
  user: User;
  /** Fires once the native map has laid out and the pins query has landed. */
  onReady?: () => void;
}) {
  const { target, clear } = useMapFocus();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Keyed by pin id so we can open a specific pin's callout on demand.
  const markerRefs = useRef<Record<string, InstanceType<typeof Marker> | null>>(
    {}
  );
  // Two-step placement: `pending` is the provisional marker the user is
  // looking at after a long-press; `draft` only gets set once they confirm,
  // which is what actually opens the composer.
  const [pending, setPending] = useState<Coordinate | null>(null);
  const [draft, setDraft] = useState<Coordinate | null>(null);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const [editing, setEditing] = useState<PinRecord | null>(null);
  // `mapReady` = the native view laid out. `tilesLoaded` = it actually painted.
  // Only the second one means there's a map to look at.
  const [mapReady, setMapReady] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  // The opening shot happens once; after that the camera belongs to the user.
  const didFrame = useRef(false);
  const viewerLocation = useViewerLocation();
  // Read through a ref so the opening-shot effect below can see the pins
  // without re-running every time the list identity changes.
  const pinsRef = useRef<PinRecord[]>([]);

  // Only the viewer's own pins — pins are private, and row level security is
  // what enforces that (see the policies in supabase/migrations). This query
  // is shared with every other screen asking the same thing.
  const { pins, isLoading } = usePins(user.id);

  // `onMapLoaded` is the real "tiles are painted" signal, but it only fires on
  // Google-backed maps — on Apple Maps it may never arrive. So once the view
  // has laid out, give the tiles a beat to draw and then accept that as loaded.
  useEffect(() => {
    if (!mapReady || tilesLoaded) return;
    const timer = setTimeout(() => setTilesLoaded(true), TILE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [mapReady, tilesLoaded]);

  // Report ready once the map has painted and the pins have arrived. On web the
  // map never mounts, so fire immediately rather than blocking boot forever.
  const ready = Platform.OS === "web" || (tilesLoaded && !isLoading);
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  // The opening shot, once per mount. `INITIAL_REGION` is a fixed city, which
  // is the right guess for nobody — so frame the user's own pins instead, and
  // fall back to where they physically are if they haven't made any yet.
  // Skipped entirely when a "take me to the pin" target is pending, which owns
  // the camera in that case.
  useEffect(() => {
    if (!ready || !mapReady || didFrame.current || target) return;

    const fitted = regionForCoords(
      pinsRef.current.map((pin) => ({
        latitude: pin.latitude,
        longitude: pin.longitude,
      })),
    );
    const destination =
      fitted ??
      (viewerLocation
        ? {
            ...viewerLocation,
            latitudeDelta: PLACEMENT_DELTA,
            longitudeDelta: PLACEMENT_DELTA,
          }
        : null);
    if (!destination) return;

    didFrame.current = true;
    mapRef.current?.animateToRegion(destination, PLACEMENT_ANIM_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mapReady, viewerLocation, target]);

  // "Take me to the pin": once the map is ready, pan in tight and open the
  // pin's label. Gated on `mapReady` so it also works on the map's first mount.
  // A focused search result (no `pinId` in the pins list) just gets the pan —
  // there's no marker for it, so the callout lookup below is a harmless no-op.
  useEffect(() => {
    if (!target || !mapReady) return;
    const { latitude, longitude, pinId } = target;

    // Brief delay lets the tab switch settle before the native map animates.
    const panTimer = setTimeout(() => {
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 },
        650
      );
    }, 250);
    const calloutTimer = setTimeout(() => {
      markerRefs.current[pinId]?.showCallout();
      clear();
    }, 1000);

    return () => {
      clearTimeout(panTimer);
      clearTimeout(calloutTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.ts, mapReady]);

  pinsRef.current = pins;

  // Warm the cache for the photo each pin opens on, so tapping a label paints
  // the sheet from memory. Unlike the Find and Profile tabs, nothing on the
  // map has requested these yet.
  const firstPhotoUrls = useMemo(
    () =>
      pins
        .map((pin) => sortPhotos(pin.photos)[0]?.url)
        .filter((url): url is string => !!url),
    [pins],
  );
  usePrefetchPhotos(firstPhotoUrls);
  // The query is already scoped to this user, so every pin here is theirs.
  const myPinCount = pins.length;

  if (Platform.OS === "web") {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          Map is unavailable on web.
        </Text>
      </View>
    );
  }

  function handleLongPress(event: LongPressEvent) {
    const coordinate = event.nativeEvent.coordinate;
    // The one moment in the app where something happens under a finger that's
    // already pressing and holding still — without a tick there's nothing to
    // tell you the hold "took" except looking away from your own thumb.
    haptics.longPress();
    setPending(coordinate);
    // Frame the spot before asking anything — see the place, then decide.
    mapRef.current?.animateToRegion(
      placementRegion(coordinate, getLastRegion()),
      PLACEMENT_ANIM_MS,
    );
  }

  function zoom(direction: "in" | "out") {
    // `getLastRegion` tracks the live camera via onRegionChangeComplete, so
    // stepping from it keeps repeated presses consistent with what's on screen.
    mapRef.current?.animateToRegion(
      zoomedRegion(getLastRegion(), direction),
      ZOOM_ANIM_MS,
    );
  }

  function confirmPending() {
    if (!pending) return;
    haptics.tap();
    setDraft(pending);
    setPending(null);
  }

  return (
    <>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={getLastRegion()}
        onRegionChangeComplete={setLastRegion}
        showsUserLocation
        // Native map tiles follow the app theme — without this the map stays
        // bright white while everything around it goes dark.
        userInterfaceStyle={scheme === "dark" ? "dark" : "light"}
        onMapReady={() => setMapReady(true)}
        onMapLoaded={() => setTilesLoaded(true)}
        onLongPress={handleLongPress}
      >
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            ref={(r) => {
              markerRefs.current[pin.id] = r;
            }}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
          >
            {/* `tooltip` drops the native speech-bubble frame so we can render
                our own label. Tapping the label opens the pin's details. */}
            <Callout tooltip onPress={() => setSelected(pin)}>
              <View style={styles.calloutWrap}>
                {/* The shadow sits on a wrapper rather than on GlassView
                    itself, which clips its own bounds to round the corners. */}
                <View style={styles.labelShadow}>
                  <GlassView radius={999} intensity={45} style={styles.labelPill}>
                    <View style={styles.labelInner}>
                      <Text
                        style={[styles.labelText, { color: palette.text }]}
                        numberOfLines={1}
                      >
                        {pin.name}
                      </Text>
                    </View>
                  </GlassView>
                </View>
                {/* Tinted to the glass edge rather than a solid fill — an
                    opaque triangle under a frosted pill reads as two
                    different materials. */}
                <View
                  style={[styles.caret, { borderTopColor: palette.glassBorder }]}
                />
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Provisional marker — where the long-press landed, not yet saved. */}
        {pending ? (
          <Marker coordinate={pending} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.pendingWrap}>
              <View style={styles.pendingHalo} />
              <View style={styles.pendingDot} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* Zoom controls — two circles matching the header's notification
          button exactly (40pt, fully round, same right margin), stacked
          beneath it so the three read as one column. */}
      <View
        style={{
          position: "absolute",
          // Clear the header's full height, not just the bell's bottom edge —
          // the header paints after the map, so anything overlapping it gets
          // covered rather than layered.
          top: insets.top + HINT_HEIGHT + HEADER_HEIGHT + 10,
          // Nudged tighter to the edge than the header's 20px padding so the
          // buttons line up under the notification bell on screen.
          right: 15,
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        {([
          { icon: "plus", label: "Zoom in", direction: "in" },
          { icon: "minus", label: "Zoom out", direction: "out" },
        ] as const).map((button) => (
          <Pressable
            key={button.direction}
            onPress={() => zoom(button.direction)}
            accessibilityRole="button"
            accessibilityLabel={button.label}
            className="active:opacity-60"
            style={{
              width: CONTROL_SIZE,
              height: CONTROL_SIZE,
              borderRadius: CONTROL_RADIUS,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            {/* GlassView lays its layers out with absoluteFill, so it needs
                explicit dimensions — without them it collapses to nothing and
                the button renders invisible. */}
            <GlassView
              radius={CONTROL_RADIUS}
              intensity={30}
              style={{ width: CONTROL_SIZE, height: CONTROL_SIZE }}
            >
              <View className="flex-1 items-center justify-center">
                <Feather name={button.icon} size={17} color={palette.text} />
              </View>
            </GlassView>
          </Pressable>
        ))}
      </View>

      {/* Confirmation step: see the spot first, then decide to keep it. */}
      {pending ? (
        <PlacementPrompt
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      ) : null}

      <PinComposer
        visible={!!draft || !!editing}
        coordinate={
          draft ??
          (editing
            ? { latitude: editing.latitude, longitude: editing.longitude }
            : null)
        }
        editingPin={editing}
        userId={user.id}
        pinCount={myPinCount}
        onClose={() => {
          setDraft(null);
          setEditing(null);
        }}
        onSaved={() => {
          setDraft(null);
          setEditing(null);
        }}
      />

      <PinDetails
        pin={selected}
        currentUserId={user.id}
        onClose={() => setSelected(null)}
        onEdit={(pin) => {
          setSelected(null);
          setEditing(pin);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Provisional marker: a pulsing-looking halo around a solid dot, visually
  // distinct from saved pins so it never reads as already-saved.
  pendingWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingHalo: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(125,148,168,0.28)",
    borderWidth: 1.5,
    borderColor: "rgba(125,148,168,0.7)",
  },
  pendingDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#7d94a8",
    borderWidth: 2.5,
    borderColor: "#ffffff",
  },
  calloutWrap: {
    alignItems: "center",
  },
  // Liquid glass, the same material as the tab bar and header buttons, so a
  // selected pin's label reads as part of the app's chrome rather than a
  // separate map widget. GlassView blurs whatever is behind it — here, the
  // map itself.
  labelShadow: {
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  labelPill: {
    maxWidth: 240,
  },
  // Padding lives on an inner view: GlassView positions its blur and tint
  // layers with absoluteFill, so the size has to come from a real child.
  labelInner: {
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  labelText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  // Small pointer toward the pin. The fill is set inline from the palette's
  // glass edge so it tracks the theme; a border triangle can't be blurred, so
  // matching the pill's edge is the closest it gets to the same material.
  caret: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
