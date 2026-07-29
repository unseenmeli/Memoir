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

type Coordinate = { latitude: number; longitude: number };

/**
 * Full-bleed map. Apple Maps on iOS, Google Maps on Android.
 * Native module — needs a development build, not Expo Go.
 *
 * Long-press the map to drop a new pin; tap a pin to see its details.
 */
export function Map({ user }: { user: User }) {
  const { target, clear } = useMapFocus();
  const mapRef = useRef<MapView>(null);
  // Keyed by pin id so we can open a specific pin's callout on demand.
  const markerRefs = useRef<Record<string, InstanceType<typeof Marker> | null>>(
    {},
  );

  const [draft, setDraft] = useState<Coordinate | null>(null);
  const [selected, setSelected] = useState<PinRecord | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { data } = db.useQuery({
    pins: { photos: {}, owner: {} },
  });

  // "Take me to the pin": once the map is ready, pan in tight and open the
  // pin's label. Gated on `mapReady` so it also works on the map's first mount.
  useEffect(() => {
    if (!target || !mapReady) return;
    const { latitude, longitude, pinId } = target;

    // Brief delay lets the tab switch settle before the native map animates.
    const panTimer = setTimeout(() => {
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 },
        650,
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
        onMapReady={() => setMapReady(true)}
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
        visible={!!draft}
        coordinate={draft}
        userId={user.id}
        pinCount={myPinCount}
        onClose={() => setDraft(null)}
        onSaved={() => setDraft(null)}
      />

      <PinDetails
        pin={selected}
        currentUserId={user.id}
        onClose={() => setSelected(null)}
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
