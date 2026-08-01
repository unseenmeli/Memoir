import type { User } from "@instantdb/react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, {
  Callout,
  Marker,
  type LongPressEvent,
} from "react-native-maps";
import { db } from "@/lib/db";
import { PinComposer } from "@/components/PinComposer";
import { PinDetails, type PinRecord } from "@/components/PinDetails";
import { useMapFocus } from "@/lib/mapFocus";
import { getLastRegion, setLastRegion } from "@/lib/mapRegion";
import { useTheme } from "@/lib/theme";

type Coordinate = { latitude: number; longitude: number };

// Grace period after the map view lays out, for platforms where `onMapLoaded`
// never fires (Apple Maps). Long enough for tiles to paint on a warm cache.
const TILE_SETTLE_MS = 1200;

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
  const mapRef = useRef<MapView>(null);
  // Keyed by pin id so we can open a specific pin's callout on demand.
  const markerRefs = useRef<Record<string, InstanceType<typeof Marker> | null>>(
    {}
  );

  const [draft, setDraft] = useState<Coordinate | null>(null);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const [editing, setEditing] = useState<PinRecord | null>(null);
  // `mapReady` = the native view laid out. `tilesLoaded` = it actually painted.
  // Only the second one means there's a map to look at.
  const [mapReady, setMapReady] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);

  const { data, isLoading } = db.useQuery({
    pins: { photos: {}, owner: {} },
  });

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

  const pins = (data?.pins ?? []) as unknown as PinRecord[];
  const myPinCount = pins.filter((p) => p.owner?.id === user.id).length;

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
    setDraft(event.nativeEvent.coordinate);
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
                <View style={styles.labelPill}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {pin.name}
                  </Text>
                </View>
                <View style={styles.caret} />
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

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
  calloutWrap: {
    alignItems: "center",
  },
  // Floating dark "glass" pill instead of a speech bubble.
  labelPill: {
    maxWidth: 240,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(24,24,27,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  labelText: {
    color: "#ffffff",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  // Small pointer toward the pin — same color as the pill, no bubble outline.
  caret: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(24,24,27,0.94)",
  },
});
