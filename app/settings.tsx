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
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { GlassView } from "@/components/GlassView";
import { ScreenBackground } from "@/components/ScreenBackground";
import { db } from "@/lib/db";
import { getPalette, withAlpha } from "@/lib/palette";
import { updateDisplayName, type ProfileRecord } from "@/lib/profile";
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
            onPress={() => setPreference(opt.value)}
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
      setStatus({ kind: "ok", text: "Saved." });
      setTouched(false);
    } catch {
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

function SettingsContent({ user }: { user: User }) {
  const router = useRouter();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => db.auth.signOut(),
      },
    ]);
  }

  return (
    <ScreenBackground>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        {/* Grabber handle — this route is presented as a modal sheet. */}
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
          <Pressable onPress={() => router.back()} hitSlop={8} className="active:opacity-60">
            <Text
              className="text-base font-outfit-semibold"
              style={{ color: palette.accent }}
            >
              Done
            </Text>
          </Pressable>
        </View>

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
          </View>
        </ScrollView>

        {/* Sign out pinned to the bottom of the screen. */}
        <View className="px-5 pb-2 pt-3">
          <Pressable
            onPress={confirmSignOut}
            className="items-center rounded-2xl px-4 py-3.5 active:opacity-70"
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
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

export default function SettingsScreen() {
  return <AuthGate>{(user) => <SettingsContent user={user} />}</AuthGate>;
}
