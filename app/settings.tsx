import { Feather } from "@expo/vector-icons";
import type { User } from "@instantdb/react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassSheetBackground } from "@/components/GlassSheetBackground";
import { GlassView } from "@/components/GlassView";
import { MagicCodeForm } from "@/components/MagicCodeForm";
import { HeaderPill } from "@/components/PinDetails";
import { db } from "@/lib/db";
import { useDragToDismiss } from "@/lib/dragToDismiss";
import { haptics } from "@/lib/haptics";
import { getPalette, withAlpha } from "@/lib/palette";
import {
  deleteAccountData,
  updateDisplayName,
  type ProfileRecord,
} from "@/lib/profile";
import { useTheme, type ThemePreference } from "@/lib/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "smartphone" },
];

function AppearanceControl() {
  const { preference, setPreference, scheme } = useTheme();
  const palette = getPalette(scheme);

  return (
    <View className="flex-row gap-2">
      {THEME_OPTIONS.map((opt) => {
        const active = preference === opt.value;
        const content = (
          <View className="items-center gap-1.5 px-3 py-4">
            <Feather
              name={opt.icon}
              size={19}
              color={active ? palette.accentFg : palette.textDim}
            />
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: "700",
                color: active ? palette.accentFg : palette.text,
              }}
            >
              {opt.label}
            </Text>
          </View>
        );
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (!active) haptics.selection();
              setPreference(opt.value);
            }}
            className="flex-1 active:opacity-70"
            style={{ borderRadius: 14, overflow: "hidden" }}
          >
            {active ? (
              <View style={{ backgroundColor: palette.accent }}>{content}</View>
            ) : (
              <GlassView radius={14} intensity={25}>
                {content}
              </GlassView>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function DisplayNameEditor({ user }: { user: User }) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const { data } = db.useQuery({
    profiles: { $: { where: { "user.id": user.id } } },
  });
  const profile = (data?.profiles?.[0] ?? null) as ProfileRecord | null;

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [touched, setTouched] = useState(false);

  // Seed the field from the loaded profile until the user starts editing.
  useEffect(() => {
    if (!touched && profile) setName(profile.displayName);
  }, [profile, touched]);

  async function save() {
    if (!profile || saving) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      haptics.warning();
      setStatus({ kind: "err", text: "Name must be at least 2 characters." });
      return;
    }
    if (trimmed === profile.displayName) {
      setStatus({ kind: "ok", text: "Saved." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await updateDisplayName(profile.id, trimmed);
      haptics.success();
      setStatus({ kind: "ok", text: "Saved." });
      setTouched(false);
    } catch {
      haptics.error();
      setStatus({ kind: "err", text: "That name is taken — try another." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3">
      <View style={{ borderRadius: 14, overflow: "hidden" }}>
        <GlassView radius={14} intensity={25}>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setTouched(true);
              setName(t);
              setStatus(null);
            }}
            placeholder="Your display name"
            placeholderTextColor={palette.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving && !!profile}
            returnKeyType="done"
            onSubmitEditing={save}
            className="px-4 py-3.5 text-base font-outfit"
            style={{ color: palette.text }}
          />
        </GlassView>
      </View>
      <View className="flex-row items-center justify-between">
        <Text
          className={`text-sm font-outfit ${
            status?.kind === "err"
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {status?.text ?? " "}
        </Text>
        <Pressable
          onPress={save}
          disabled={saving || !profile}
          className="rounded-lg px-4 py-2 active:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: palette.accent }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={palette.accentFg} />
          ) : (
            <Text
              className="text-sm font-outfit-medium"
              style={{ color: palette.accentFg }}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** The red used for destructive actions — same as the delete icon on a pin. */
const DANGER = "#ef4444";

function SettingsContent({ user }: { user: User }) {
  const router = useRouter();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [deleting, setDeleting] = useState(false);
  const { gesture: dragGesture, style: dragStyle } = useDragToDismiss(
    () => router.back(),
    !deleting,
  );

  // Just for the confirmation copy — telling someone exactly how much they're
  // about to lose is the difference between a warning and a formality.
  const { data: pinData } = db.useQuery({
    pins: { $: { where: { "owner.id": user.id } } },
  });
  const pinCount = pinData?.pins?.length ?? 0;

  const isGuest = !user.email;

  function confirmSignOut() {
    if (deleting) return;
    // A guest has no email to sign back in with, so signing out is not a
    // reversible "see you later" — it strands every pin they made.
    if (isGuest) {
      Alert.alert(
        "Sign out?",
        "You're signed in as a guest, so there's no email to get back in with. Signing out means losing the pins you've made. Add an email first to keep them.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign out anyway",
            style: "destructive",
            onPress: () => db.auth.signOut(),
          },
        ],
      );
      return;
    }
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => db.auth.signOut(),
      },
    ]);
  }

  async function runDelete() {
    setDeleting(true);
    try {
      await deleteAccountData(user.id);
      haptics.success();
      // Close the sheet BEFORE signing out. Settings is a transparentModal, so
      // signing out first fires AuthGate's redirect to /login with this modal
      // still stacked on top of it.
      router.back();
      await db.auth.signOut();
    } catch (err) {
      haptics.error();
      setDeleting(false);
      Alert.alert(
        "Couldn't delete your account",
        (err as Error)?.message ?? "Try again.",
      );
    }
  }

  function confirmDeleteAccount() {
    if (deleting) return;
    const what =
      pinCount > 0
        ? `your ${pinCount} ${pinCount === 1 ? "pin" : "pins"} and their photos`
        : "your profile";
    Alert.alert(
      "Delete account",
      `This permanently deletes ${what}. It can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert("Are you sure?", "There's no way to get this back.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete everything",
                style: "destructive",
                onPress: runDelete,
              },
            ]),
        },
      ],
    );
  }

  return (
    // Presented as `transparentModal` so the profile screen can show through
    // the glass background — but that surface doesn't reliably feed fresh
    // safe-area insets to the nested `SafeAreaView` (same issue as the pin
    // details sheet), which was letting the header sit under the status bar
    // with "Done" unreachable underneath it. A fresh provider here forces a
    // real measurement scoped to this surface.
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/*
         * The blur/tint background lives INSIDE the translating view, not
         * outside it — so it's part of the card being dragged. If it sat
         * outside (static, full-screen) while only the header+content moved,
         * dragging down would reveal the sheet's own background in the gap
         * instead of the real screen underneath, since that background never
         * actually moved.
         */}
        <Animated.View style={[{ flex: 1 }, dragStyle]}>
          <GlassSheetBackground>
            <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
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

                  <View className="flex-row items-center justify-between px-5 py-3">
                    <Text
                      style={{
                        fontFamily: "Outfit_700Bold",
                        fontSize: 24,
                        letterSpacing: -0.4,
                        color: palette.text,
                      }}
                    >
                      Settings
                    </Text>
                    <HeaderPill
                      label="Done"
                      color={palette.accentFg}
                      fill={palette.accent}
                      onPress={() => router.back()}
                    />
                  </View>
                </View>
              </GestureDetector>

              <ScrollView className="flex-1 px-5" contentContainerClassName="gap-8 pt-3 pb-10">
                <View className="gap-3">
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.2,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      color: palette.textDim,
                    }}
                  >
                    Appearance
                  </Text>
                  <AppearanceControl />
                </View>

                <View className="gap-3">
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.2,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      color: palette.textDim,
                    }}
                  >
                    Display name
                  </Text>
                  <DisplayNameEditor user={user} />
                </View>

                <View className="gap-3">
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.2,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      color: palette.textDim,
                    }}
                  >
                    Account
                  </Text>
                  {isGuest ? (
                    // A guest session lives only on this device and only until
                    // they sign out. Adding an email upgrades the account in
                    // place — Instant carries their pins across — so this is
                    // the one thing worth nudging them toward.
                    <View className="gap-3">
                      <View style={{ borderRadius: 14, overflow: "hidden" }}>
                        <GlassView radius={14} intensity={25}>
                          <View className="px-4 py-3.5">
                            <Text
                              className="text-base font-outfit-semibold"
                              style={{ color: palette.text }}
                            >
                              Guest account
                            </Text>
                            <Text
                              className="mt-1 text-sm font-outfit"
                              style={{ color: palette.textDim }}
                            >
                              Add an email so you don&apos;t lose your pins if
                              you sign out, reinstall, or switch phones. Use an
                              address you haven&apos;t used with this app
                              before.
                            </Text>
                          </View>
                        </GlassView>
                      </View>
                      <MagicCodeForm compact />
                    </View>
                  ) : (
                    <View style={{ borderRadius: 14, overflow: "hidden" }}>
                      <GlassView radius={14} intensity={25}>
                        <View className="px-4 py-3.5">
                          <Text className="text-xs" style={{ color: palette.textDim }}>
                            Signed in as
                          </Text>
                          <Text
                            className="mt-0.5 text-base font-outfit"
                            style={{ color: palette.text }}
                          >
                            {user.email}
                          </Text>
                        </View>
                      </GlassView>
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Sign out and account deletion pinned to the bottom. */}
              <View className="gap-2.5 px-5 pb-2 pt-3">
                <Pressable
                  onPress={confirmSignOut}
                  disabled={deleting}
                  className="items-center rounded-2xl px-4 py-3.5 active:opacity-70 disabled:opacity-40"
                  style={{
                    borderWidth: 1,
                    borderColor: withAlpha(palette.accent, 0.55),
                    backgroundColor: withAlpha(palette.accent, 0.1),
                  }}
                >
                  <Text
                    className="text-base font-outfit-semibold"
                    style={{ color: palette.accent }}
                  >
                    Sign out
                  </Text>
                </Pressable>

                <Pressable
                  onPress={confirmDeleteAccount}
                  disabled={deleting}
                  accessibilityRole="button"
                  accessibilityLabel="Delete account"
                  className="items-center rounded-2xl px-4 py-3.5 active:opacity-70"
                  style={{
                    borderWidth: 1,
                    borderColor: withAlpha(DANGER, 0.55),
                    backgroundColor: withAlpha(DANGER, 0.1),
                  }}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={DANGER} />
                  ) : (
                    <Text
                      className="text-base font-outfit-semibold"
                      style={{ color: DANGER }}
                    >
                      Delete account
                    </Text>
                  )}
                </Pressable>
              </View>
            </SafeAreaView>
          </GlassSheetBackground>
        </Animated.View>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default function SettingsScreen() {
  return <AuthGate>{(user) => <SettingsContent user={user} />}</AuthGate>;
}
