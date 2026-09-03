import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GlassSheetBackground } from "@/components/GlassSheetBackground";
import { GlassView } from "@/components/GlassView";
import { HeaderPill, nextPhotoIndex, type PinRecord } from "@/components/PinDetails";
import { usePins } from "@/lib/data";
import { useDragToDismiss } from "@/lib/dragToDismiss";
import { haptics } from "@/lib/haptics";
import { createPin, MAX_PINS_PER_USER, updatePin } from "@/lib/pins";
import { getPalette } from "@/lib/palette";
import {
  collectTags,
  formatTag,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_PIN,
  normalizeTag,
  normalizeTags,
  pinTags,
  suggestTags,
} from "@/lib/tags";
import { useTheme } from "@/lib/theme";

type Coordinate = { latitude: number; longitude: number };
/** An existing pin's photo, kept as-is unless the user removes it. */
type ExistingPhoto = { id: string; url: string };

/** Orange marker on fields that must be filled before saving. */
const REQUIRED_COLOR = "#f97316";

/**
 * A field label, with an orange asterisk when the field is required. Having
 * one component own this means "what's required" reads the same everywhere
 * instead of each label styling itself.
 */
function FieldLabel({
  children,
  required,
  trailing,
}: {
  children: string;
  required?: boolean;
  /** Optional right-aligned extra, e.g. a "2/8" counter. */
  trailing?: ReactNode;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);

  return (
    <View className="flex-row items-baseline justify-between">
      <Text className="text-sm font-outfit-semibold" style={{ color: palette.text }}>
        {children}
        {required ? (
          <Text style={{ color: REQUIRED_COLOR, fontWeight: "800" }}> *</Text>
        ) : null}
      </Text>
      {trailing}
    </View>
  );
}

export function PinComposer({
  visible,
  coordinate,
  editingPin,
  userId,
  pinCount,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Where a new pin will be dropped. Ignored when `editingPin` is set. */
  coordinate: Coordinate | null;
  /** When set, edits this pin instead of creating a new one at `coordinate`. */
  editingPin?: PinRecord | null;
  userId: string;
  pinCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<ImagePicker.ImagePickerAsset[]>(
    [],
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  // Which field has focus, so the active input can carry an accent ring
  // instead of every field looking identically inert.
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!editingPin;
  const atLimit = !isEditing && pinCount >= MAX_PINS_PER_USER;
  // Name is the only required field — everything else can be added later.
  const canSave = name.trim().length > 0 && !saving && !atLimit;
  const { gesture: dragGesture, style: dragStyle, reset: resetDrag } =
    useDragToDismiss(handleClose, !saving);

  // The tag vocabulary already in use, for autocomplete. Read here rather
  // than passed down so the composer works wherever it's mounted; the query is
  // shared with whatever screen is behind it, so this costs no extra fetch.
  // Scoped to this user because pins are private — "my labels", not everyone's.
  const { pins: ownPins } = usePins(userId);
  const allTags = useMemo(() => collectTags(ownPins), [ownPins]);
  const suggestions = useMemo(
    () =>
      tags.length >= MAX_TAGS_PER_PIN
        ? []
        : suggestTags(allTags, tagDraft, tags),
    [allTags, tagDraft, tags],
  );

  // Prefill from the pin being edited (or start blank) each time the sheet
  // opens — not on every render, so edits mid-session aren't clobbered.
  useEffect(() => {
    if (!visible) return;
    setName(editingPin?.name ?? "");
    setDescription(editingPin?.description ?? "");
    setTags(editingPin ? pinTags(editingPin) : []);
    setTagDraft("");
    setExistingPhotos(editingPin?.photos ?? []);
    setRemovedPhotoIds([]);
    setNewPhotos([]);
    setSaving(false);
    setError("");
    resetDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingPin?.id]);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function pickPhotos() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos permission needed",
        "Allow photo access to add pictures to a pin.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      haptics.selection();
      setNewPhotos((prev) => [...prev, ...result.assets]);
    }
  }

  function removeExistingPhoto(photoId: string) {
    haptics.selection();
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setRemovedPhotoIds((prev) => [...prev, photoId]);
  }

  function removeNewPhoto(uri: string) {
    haptics.selection();
    setNewPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  /** Commits whatever is in the tag field, ignoring blanks and duplicates. */
  function commitTag(raw?: string) {
    const next = normalizeTag(raw ?? tagDraft);
    setTagDraft("");
    if (!next || tags.includes(next) || tags.length >= MAX_TAGS_PER_PIN) return;
    haptics.selection();
    setTags((prev) => [...prev, next]);
  }

  function removeTag(tag: string) {
    haptics.selection();
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave() {
    if (saving) return;
    if (!isEditing && !coordinate) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      // Nothing was attempted — the sheet is refusing to start. `warning`
      // rather than `error` keeps that distinction audible in the hand.
      haptics.warning();
      setError("Give this place a name.");
      return;
    }
    if (atLimit) {
      haptics.warning();
      setError(`You've reached the limit of ${MAX_PINS_PER_USER} pins.`);
      return;
    }

    // Fold in a tag that was typed but never committed — otherwise hitting
    // Save straight after typing silently drops it.
    const finalTags = normalizeTags([...tags, tagDraft]);

    setSaving(true);
    setError("");
    try {
      if (editingPin) {
        await updatePin(userId, editingPin.id, {
          name: trimmedName,
          description,
          tags: finalTags,
          newPhotos,
          removedPhotoIds,
          startPhotoIndex: nextPhotoIndex(editingPin.photos),
        });
      } else if (coordinate) {
        await createPin(userId, {
          name: trimmedName,
          description,
          tags: finalTags,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          photos: newPhotos,
        });
      }
      // Photo uploads make saving genuinely slow, so the finish is worth
      // confirming — by then people are usually looking at something else.
      haptics.success();
      onSaved();
    } catch (err) {
      haptics.error();
      setError(
        (err as Error)?.message ?? "Could not save the pin. Try again.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // `pageSheet` rendered as an opaque native card with no way to show
      // the map behind it, so the glass background had nothing to blur —
      // just its own flat tint. `overFullScreen` + `transparent` keeps the
      // map in the view hierarchy behind the sheet, same as the pin details
      // and settings sheets, so the blur actually has something real to show
      // through. This also means iOS loses the free swipe-to-dismiss
      // `pageSheet` gave it, which is why the drag gesture below is now
      // unconditional instead of Android-only.
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/*
           * The blur/tint background lives INSIDE the translating view, not
           * outside it — so it's part of the card being dragged. If it sat
           * outside (static, full-screen) while only the header+content
           * moved, dragging down would reveal the sheet's own background in
           * the gap instead of the real screen underneath, since that
           * background never actually moved.
           */}
          <Animated.View style={[{ flex: 1 }, dragStyle]}>
            <GlassSheetBackground>
              <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
                {/* Grabber + header live OUTSIDE the keyboard avoider on purpose.
                    Inside it, opening the keyboard pushed the whole header — Cancel
                    and Save included — up off the top of the sheet. Only the
                    scrolling content should move when the keyboard appears. */}
                <GestureDetector gesture={dragGesture}>
                <View>
                  {/* Grabber handle — also the drag-down-to-close target. */}
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
                    <HeaderPill
                      label="Cancel"
                      color={palette.textDim}
                      onPress={handleClose}
                    />
                    <Text
                      className="flex-1 text-center text-base font-outfit-semibold"
                      style={{ color: palette.text }}
                    >
                      {isEditing ? "Edit place" : "New place"}
                    </Text>
                    <HeaderPill
                      label="Save"
                      // Filled and high-contrast once there's actually something to
                      // save; plain glass while the form is still incomplete, so the
                      // button's state says whether you can proceed.
                      color={canSave ? palette.accentFg : palette.textDim}
                      fill={canSave ? palette.accent : undefined}
                      disabled={!canSave}
                      loading={saving}
                      onPress={handleSave}
                    />
                  </View>
                </View>
              </GestureDetector>

              <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <ScrollView
                  className="flex-1 px-5"
                  contentContainerClassName="gap-5 pb-8 pt-2"
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                >
              {atLimit ? (
                <View className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-950/40">
                  <Text className="text-sm text-amber-700 font-outfit dark:text-amber-300">
                    You&apos;ve reached the limit of {MAX_PINS_PER_USER} pins.
                    Delete one to add another.
                  </Text>
                </View>
              ) : null}

              {/* Photos */}
              <View className="gap-2">
                <FieldLabel>Photos</FieldLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  // A ScrollView's root carries `flexGrow: 1`. Nested in the
                  // form's column that makes it swallow every pixel the sheet
                  // has spare, so the row stretched to fill the sheet instead
                  // of hugging one row of 96pt tiles. Pin it to its content
                  // and align tiles to the top so nothing can be stretched
                  // vertically to fit the box.
                  //
                  // gap moves here from contentContainerClassName because
                  // NativeWind compiles that prop down to contentContainerStyle
                  // — passing both would let one silently drop the other.
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: 12, alignItems: "flex-start" }}
                >
                  {/*
                   * One box owns the size, one owns the clip. This used to be
                   * three nested 96pt boxes — the Pressable and GlassView each
                   * rounding and clipping at the same size, with the content
                   * pinned to its own fixed w-24 inside them. Two rounded
                   * `overflow: hidden` masks over identical bounds don't round
                   * to the same physical pixels, so the glass edge sat a hair
                   * proud on the right and the tile read as lopsided next to
                   * the square thumbnails. Now the Pressable alone sets 96pt
                   * and GlassView fills it, so the plus and label centre
                   * against the same box that draws the border.
                   */}
                  <Pressable
                    onPress={pickPhotos}
                    className="active:opacity-70"
                    // A derived square: one dimension plus aspectRatio, and
                    // alignSelf so the row can never stretch the cross axis.
                    // The rounded corners live on the GlassView below.
                    style={{ width: 96, aspectRatio: 1, alignSelf: "flex-start" }}
                  >
                    <GlassView
                      radius={20}
                      intensity={25}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name="plus" size={22} color={palette.text} />
                      <Text
                        className="mt-1 text-xs font-outfit"
                        style={{ color: palette.textDim }}
                      >
                        Add
                      </Text>
                    </GlassView>
                  </Pressable>

                  {existingPhotos.map((photo) => (
                    <View key={photo.id} className="h-24 w-24">
                      <Image
                        source={{ uri: photo.url }}
                        className="h-24 w-24 rounded-2xl"
                        style={{ backgroundColor: palette.surface2 }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => removeExistingPhoto(photo.id)}
                        hitSlop={6}
                        className="absolute -right-1.5 -top-1.5 active:opacity-70"
                        style={{ height: 24, width: 24, borderRadius: 12, overflow: "hidden" }}
                      >
                        <GlassView radius={12} intensity={35}>
                          <View className="h-6 w-6 items-center justify-center">
                            <Feather name="x" size={13} color={palette.text} />
                          </View>
                        </GlassView>
                      </Pressable>
                    </View>
                  ))}

                  {newPhotos.map((photo) => (
                    <View key={photo.uri} className="h-24 w-24">
                      <Image
                        source={{ uri: photo.uri }}
                        className="h-24 w-24 rounded-2xl"
                        style={{ backgroundColor: palette.surface2 }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => removeNewPhoto(photo.uri)}
                        hitSlop={6}
                        className="absolute -right-1.5 -top-1.5 active:opacity-70"
                        style={{ height: 24, width: 24, borderRadius: 12, overflow: "hidden" }}
                      >
                        <GlassView radius={12} intensity={35}>
                          <View className="h-6 w-6 items-center justify-center">
                            <Feather name="x" size={13} color={palette.text} />
                          </View>
                        </GlassView>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              {/* Name */}
              <View className="gap-2">
                <FieldLabel required>Name</FieldLabel>
                <View style={{ borderRadius: 16, overflow: "hidden" }}>
                  <GlassView radius={16} intensity={25}>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      onFocus={() => setFocusedField("name")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g. Fabrika courtyard"
                      placeholderTextColor={palette.textDim}
                      editable={!saving}
                      className="px-4 py-3.5 text-base font-outfit"
                      style={{ color: palette.text }}
                    />
                  </GlassView>
                  {/* Accent ring while typing; a soft orange one when the
                      required field is still empty, so what's blocking Save
                      is visible without hunting. */}
                  <View
                    pointerEvents="none"
                    style={{
                      ...StyleSheet.absoluteFillObject,
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor:
                        focusedField === "name"
                          ? palette.accent
                          : name.trim()
                            ? "transparent"
                            : `${REQUIRED_COLOR}55`,
                    }}
                  />
                </View>
              </View>

              {/* Description */}
              <View className="gap-2">
                <FieldLabel>Description</FieldLabel>
                <View style={{ borderRadius: 16, overflow: "hidden" }}>
                  <GlassView radius={16} intensity={25}>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="What makes this place worth remembering?"
                      placeholderTextColor={palette.textDim}
                      editable={!saving}
                      multiline
                      textAlignVertical="top"
                      className="min-h-28 px-4 py-3.5 text-base font-outfit"
                      style={{ color: palette.text }}
                    />
                  </GlassView>
                </View>
              </View>

              {/* Tags */}
              <View className="gap-2">
                <FieldLabel
                  trailing={
                    <Text
                      className="text-xs font-outfit"
                      style={{ color: palette.textDim }}
                    >
                      {tags.length}/{MAX_TAGS_PER_PIN}
                    </Text>
                  }
                >
                  Tags
                </FieldLabel>

                {tags.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() => removeTag(tag)}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove tag ${formatTag(tag)}`}
                        className="active:opacity-60"
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          backgroundColor: palette.accent,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: "700",
                            color: palette.accentFg,
                          }}
                        >
                          {formatTag(tag)}
                        </Text>
                        <Feather name="x" size={12} color={palette.accentFg} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {tags.length < MAX_TAGS_PER_PIN ? (
                  <View style={{ borderRadius: 16, overflow: "hidden" }}>
                    <GlassView radius={16} intensity={25}>
                      <TextInput
                        value={tagDraft}
                        onChangeText={setTagDraft}
                        onSubmitEditing={() => commitTag()}
                        // Commit on blur too, so tapping Save doesn't lose it.
                        onBlur={() => commitTag()}
                        placeholder="brunch, rooftop, cheap…"
                        placeholderTextColor={palette.textDim}
                        editable={!saving}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        maxLength={MAX_TAG_LENGTH}
                        className="px-4 py-3.5 text-base font-outfit"
                        style={{ color: palette.text }}
                      />
                    </GlassView>
                  </View>
                ) : null}

                {/* Suggestions from tags already in use, so the vocabulary
                    converges instead of fragmenting into near-duplicates. */}
                {suggestions.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {suggestions.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() => commitTag(tag)}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`Add tag ${formatTag(tag)}`}
                        className="active:opacity-60"
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          borderRadius: 999,
                          paddingHorizontal: 11,
                          paddingVertical: 5.5,
                          borderWidth: 1,
                          borderColor: palette.border,
                        }}
                      >
                        <Feather name="plus" size={11} color={palette.textDim} />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: palette.text,
                          }}
                        >
                          {formatTag(tag)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

                  {error ? (
                    <Text className="text-sm font-outfit text-red-500">{error}</Text>
                  ) : null}
                </ScrollView>
              </KeyboardAvoidingView>
              </SafeAreaView>
            </GlassSheetBackground>
          </Animated.View>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}
