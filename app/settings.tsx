import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
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
import { EmailPasswordForm } from "@/components/EmailPasswordForm";
import { HeaderPill } from "@/components/PinDetails";
import {
  changePassword,
  errorMessage,
  MIN_PASSWORD_LENGTH,
  signOut,
  type User,
} from "@/lib/auth";
import { usePins, useProfile } from "@/lib/data";
import {
  hasBeenAskedForLocation,
  requestLocationPermission,
  useLocationPermission,
} from "@/lib/distance";
import { useDragToDismiss } from "@/lib/dragToDismiss";
import { haptics } from "@/lib/haptics";
import { getPalette, withAlpha } from "@/lib/palette";
import { deleteAccountData, updateDisplayName } from "@/lib/profile";
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
  const { profile } = useProfile(user.id);

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

/** A glass-wrapped secure field. Three of them in a row, so it's a component. */
function PasswordField({
  value,
  onChangeText,
  placeholder,
  autoComplete,
  editable,
  onSubmitEditing,
  returnKeyType,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  editable: boolean;
  onSubmitEditing?: () => void;
  returnKeyType: "next" | "go";
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  return (
    <View style={{ borderRadius: 14, overflow: "hidden" }}>
      <GlassView radius={14} intensity={25}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textDim}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={
            autoComplete === "current-password" ? "password" : "newPassword"
          }
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          className="px-4 py-3.5 text-base font-outfit"
          style={{ color: palette.text }}
        />
      </GlassView>
    </View>
  );
}

/**
 * Changes the password of a signed-in account.
 *
 * Shown only to accounts that have one — a guest has no email to sign in with
 * and no password to replace, so for them Settings offers `linkEmail` instead.
 *
 * The current password is required, not decorative: without it an unlocked
 * phone is enough to lock the owner out of their own account. See
 * `changePassword` in src/lib/auth.tsx for why proving it costs a sign-in.
 */
function ChangePasswordForm({ email }: { email: string }) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  function fail(text: string) {
    haptics.warning();
    setStatus({ kind: "err", text });
  }

  async function save() {
    if (saving) return;

    // Checked here so the ordinary mistakes come back instantly and phrased
    // for the person, rather than as an API error.
    if (!current) return fail("Enter your current password.");
    if (next.length < MIN_PASSWORD_LENGTH) {
      return fail(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (next !== confirm) {
      setConfirm("");
      return fail("Those passwords don't match.");
    }
    if (next === current) {
      return fail("That's already your password.");
    }

    setSaving(true);
    setStatus(null);
    try {
      await changePassword(email, current, next);
      haptics.success();
      setStatus({ kind: "ok", text: "Password changed." });
      // Nothing here should outlive a successful change.
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      haptics.error();
      setStatus({
        kind: "err",
        text: errorMessage(err) ?? "Couldn't change your password.",
      });
      setCurrent("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3">
      <PasswordField
        value={current}
        onChangeText={(t) => {
          setCurrent(t);
          setStatus(null);
        }}
        placeholder="Current password"
        autoComplete="current-password"
        editable={!saving}
        returnKeyType="next"
      />
      <PasswordField
        value={next}
        onChangeText={(t) => {
          setNext(t);
          setStatus(null);
        }}
        placeholder={`New password — at least ${MIN_PASSWORD_LENGTH} characters`}
        autoComplete="new-password"
        editable={!saving}
        returnKeyType="next"
      />
      <PasswordField
        value={confirm}
        onChangeText={(t) => {
          setConfirm(t);
          setStatus(null);
        }}
        placeholder="Confirm new password"
        autoComplete="new-password"
        editable={!saving}
        returnKeyType="go"
        onSubmitEditing={save}
      />

      <View className="flex-row items-center justify-between">
        <Text
          className={`flex-1 text-sm font-outfit ${
            status?.kind === "err"
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {status?.text ?? " "}
        </Text>
        <Pressable
          onPress={save}
          disabled={saving}
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
              Change
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** The red used for destructive actions — same as the delete icon on a pin. */
const DANGER = "#ef4444";

/**
 * The published privacy policy — rendered from PRIVACY.md and deployed by
 * .github/workflows/privacy-policy.yml, so this and the repo's copy cannot
 * drift apart.
 *
 * App Store Connect takes this URL as metadata, which is what Apple actually
 * requires. Linking it in-app as well is for the person using the app: the
 * store listing is not somewhere you go looking once you've installed it.
 */
const PRIVACY_POLICY_URL = "https://unseenmeli.github.io/NewEra/";

/**
 * Read-only identity card: avatar, display name, and the address you're signed
 * in with. Opening Settings shouldn't put a cursor in an editable name field —
 * it's a place to check who you are and get to the things you can change.
 */
/**
 * Offer to turn on location — but only to someone who doesn't already have it
 * on. Once granted, this disappears rather than sitting there as a row that
 * does nothing.
 *
 * Two different actions hide behind one button. If the OS prompt has never
 * been spent, tapping asks directly. If it has (they declined, here or on the
 * first-run screen), iOS will never show that dialog again, so the only honest
 * move is to send them to the system settings page.
 */
function LocationRow() {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const { granted, refresh } = useLocationPermission();
  const [asked, setAsked] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    hasBeenAskedForLocation().then((value) => {
      if (active) setAsked(value);
    });
    return () => {
      active = false;
    };
  }, [granted]);

  // Someone who leaves for iOS Settings and flips the switch comes back to a
  // stale row otherwise — nothing re-reads permission on its own.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Already sharing, or we haven't read the stored answer yet — nothing to
  // offer either way.
  if (granted || asked === null) return null;

  async function enable() {
    if (asked) {
      // The dialog is spent; only the system settings page can change this.
      await Linking.openSettings().catch(() => {});
      return;
    }
    const ok = await requestLocationPermission();
    if (ok) haptics.success();
    setAsked(true);
    refresh();
  }

  return (
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
        Location
      </Text>
      <Pressable
        onPress={enable}
        accessibilityRole="button"
        accessibilityLabel="Share your location"
        className="active:opacity-70"
        style={{ borderRadius: 14, overflow: "hidden" }}
      >
        <GlassView radius={14} intensity={25}>
          <View className="flex-row items-center gap-3.5 px-4 py-3.5">
            <Feather name="map-pin" size={18} color={palette.accent} />
            <View className="flex-1">
              <Text
                className="text-base font-outfit-medium"
                style={{ color: palette.text }}
              >
                Share your location
              </Text>
              <Text
                className="mt-0.5 text-sm font-outfit"
                style={{ color: palette.textDim }}
              >
                You&apos;re on Tbilisi by default. Turn this on to see yourself
                on the map and sort places by real distance.
              </Text>
            </View>
            <Feather
              name={asked ? "external-link" : "chevron-right"}
              size={16}
              color={palette.textDim}
            />
          </View>
        </GlassView>
      </Pressable>
    </View>
  );
}

function AccountCard({
  user,
  onEdit,
}: {
  user: User;
  onEdit: () => void;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const { profile } = useProfile(user.id);

  const displayName =
    profile?.displayName ?? user.email?.split("@")[0] ?? "explorer";
  const initial = displayName.charAt(0).toUpperCase();
  const isGuest = !user.email;

  return (
    <View className="gap-3">
      <View style={{ borderRadius: 14, overflow: "hidden" }}>
        <GlassView radius={14} intensity={25}>
          <View className="flex-row items-center gap-3.5 px-4 py-3.5">
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                overflow: "hidden",
                backgroundColor: palette.surface2,
              }}
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
                    className="text-xl font-outfit-bold"
                    style={{ color: palette.textDim }}
                  >
                    {initial}
                  </Text>
                </View>
              )}
            </View>

            <View className="flex-1 min-w-0">
              <Text
                numberOfLines={1}
                className="text-lg font-outfit-semibold"
                style={{ color: palette.text }}
              >
                {displayName}
              </Text>
              <Text
                className="mt-0.5 text-xs font-outfit"
                style={{ color: palette.textDim }}
              >
                {isGuest ? "Guest account" : "Signed in as"}
              </Text>
              {isGuest ? null : (
                <Text
                  numberOfLines={1}
                  className="text-sm font-outfit"
                  style={{ color: palette.text }}
                >
                  {user.email}
                </Text>
              )}
            </View>
          </View>
        </GlassView>
      </View>

      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="Edit account info"
        className="active:opacity-70"
        style={{ borderRadius: 14, overflow: "hidden" }}
      >
        <GlassView radius={14} intensity={25}>
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <Text
              className="text-base font-outfit-medium"
              style={{ color: palette.text }}
            >
              {isGuest ? "Save your account" : "Edit account info"}
            </Text>
            <Feather name="chevron-right" size={18} color={palette.textDim} />
          </View>
        </GlassView>
      </Pressable>
    </View>
  );
}

function SettingsContent({ user }: { user: User }) {
  const router = useRouter();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const [deleting, setDeleting] = useState(false);
  // Settings opens read-only; the editable fields live behind this flag so
  // nothing is accidentally changed just by looking.
  const [editingAccount, setEditingAccount] = useState(false);
  const { gesture: dragGesture, style: dragStyle } = useDragToDismiss(
    () => router.back(),
    !deleting,
  );

  // Just for the confirmation copy — telling someone exactly how much they're
  // about to lose is the difference between a warning and a formality.
  const { pins } = usePins(user.id);
  const pinCount = pins.length;

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
            onPress: () => {
              void signOut();
            },
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
        onPress: () => {
          void signOut();
        },
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
      await signOut();
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
                    <View className="flex-1 flex-row items-center gap-2">
                      {/* Editing is a sub-view, so it needs its own way back —
                          "Done" closes the whole sheet, which isn't the same
                          thing. */}
                      {editingAccount ? (
                        <Pressable
                          onPress={() => setEditingAccount(false)}
                          accessibilityRole="button"
                          accessibilityLabel="Back to settings"
                          hitSlop={10}
                          className="active:opacity-60"
                        >
                          <Feather
                            name="chevron-left"
                            size={26}
                            color={palette.text}
                          />
                        </Pressable>
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: "Outfit_700Bold",
                          fontSize: 24,
                          letterSpacing: -0.4,
                          color: palette.text,
                        }}
                      >
                        {editingAccount ? "Account" : "Settings"}
                      </Text>
                    </View>
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
                {editingAccount ? null : (
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
                )}

                {editingAccount ? null : <LocationRow />}

                <View className="gap-3">
                  {/* The header already says "Account" while editing — no
                      point saying it twice on the same screen. */}
                  {editingAccount ? null : (
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
                  )}

                  {editingAccount ? (
                    <View className="gap-6">
                      <View className="gap-3">
                        <Text
                          className="text-xs font-outfit-semibold"
                          style={{ color: palette.textDim }}
                        >
                          Display name
                        </Text>
                        <DisplayNameEditor user={user} />
                      </View>

                      {/* A guest has no password to change — they get the
                          "add an email" form below instead. */}
                      {isGuest ? null : (
                        <View className="gap-3">
                          <Text
                            className="text-xs font-outfit-semibold"
                            style={{ color: palette.textDim }}
                          >
                            Password
                          </Text>
                          <ChangePasswordForm email={user.email ?? ""} />
                        </View>
                      )}

                      {isGuest ? (
                        // A guest session lives only on this device and only
                        // until they sign out. `mode="linkEmail"` adds the
                        // address and password to the anonymous account they
                        // already have rather than starting a new one, so the
                        // same user id — and every pin hanging off it —
                        // carries across.
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
                                  Add an email and password so you don&apos;t
                                  lose your pins if you sign out, reinstall, or
                                  switch phones. Use an address you
                                  haven&apos;t used with this app before.
                                </Text>
                              </View>
                            </GlassView>
                          </View>
                          <EmailPasswordForm compact mode="linkEmail" />
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => setEditingAccount(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Save changes and go back to settings"
                        className="items-center rounded-xl px-4 py-3.5 active:opacity-70"
                        style={{ backgroundColor: palette.accent }}
                      >
                        <Text
                          className="text-base font-outfit-semibold"
                          style={{ color: palette.accentFg }}
                        >
                          Save changes
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <AccountCard
                      user={user}
                      onEdit={() => setEditingAccount(true)}
                    />
                  )}
                </View>

                {editingAccount ? null : (
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
                      About
                    </Text>
                    <Pressable
                      onPress={() => {
                        // Non-fatal: no browser, or a URL that won't open, is
                        // not worth an error dialog in Settings.
                        void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
                      }}
                      accessibilityRole="link"
                      accessibilityLabel="Open the privacy policy in your browser"
                      className="active:opacity-70"
                      style={{ borderRadius: 14, overflow: "hidden" }}
                    >
                      <GlassView radius={14} intensity={25}>
                        <View className="flex-row items-center justify-between px-4 py-3.5">
                          <Text
                            className="text-base font-outfit"
                            style={{ color: palette.text }}
                          >
                            Privacy policy
                          </Text>
                          <Feather
                            name="external-link"
                            size={16}
                            color={palette.textDim}
                          />
                        </View>
                      </GlassView>
                    </Pressable>
                  </View>
                )}

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
