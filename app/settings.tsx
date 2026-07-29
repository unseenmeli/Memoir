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
import { db } from "@/lib/db";
import { updateDisplayName, type ProfileRecord } from "@/lib/profile";
import { useTheme, type ThemePreference } from "@/lib/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "smartphone" },
];

function AppearanceControl() {
  const { preference, setPreference, scheme } = useTheme();
  // The active chip's fill inverts with the theme, so its icon must contrast
  // with that fill: dark icon in dark mode, light icon in light mode.
  const activeIconColor = scheme === "dark" ? "#18181b" : "#ffffff";
  return (
    <View className="flex-row gap-2">
      {THEME_OPTIONS.map((opt) => {
        const active = preference === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => setPreference(opt.value)}
            className={`flex-1 items-center gap-1.5 rounded-2xl border px-3 py-4 active:opacity-70 ${
              active
                ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100"
                : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            }`}
          >
            <Feather
              name={opt.icon}
              size={20}
              color={active ? activeIconColor : "#a1a1aa"}
            />
            <Text
              className={`text-sm font-outfit-medium ${
                active
                  ? "text-white dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DisplayNameEditor({ user }: { user: User }) {
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
    <View className="gap-2">
      <TextInput
        value={name}
        onChangeText={(t) => {
          setTouched(true);
          setName(t);
          setStatus(null);
        }}
        placeholder="Your display name"
        placeholderTextColor="#a1a1aa"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving && !!profile}
        returnKeyType="done"
        onSubmitEditing={save}
        className="rounded-xl border border-zinc-300 px-4 py-3.5 text-base text-zinc-900 font-outfit dark:border-zinc-700 dark:text-zinc-100"
      />
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
          className="rounded-lg bg-zinc-900 px-4 py-2 active:opacity-80 disabled:opacity-40 dark:bg-zinc-100"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-sm font-outfit-medium text-white dark:text-zinc-900">
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
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Text className="text-lg font-outfit-semibold text-zinc-900 dark:text-zinc-50">
          Settings
        </Text>
        <Pressable onPress={() => router.back()} hitSlop={8} className="active:opacity-60">
          <Text className="text-base font-outfit-medium text-zinc-500 dark:text-zinc-400">
            Done
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="gap-8 pt-3 pb-10">
        <View className="gap-3">
          <Text className="text-sm font-outfit-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Appearance
          </Text>
          <AppearanceControl />
        </View>

        <View className="gap-3">
          <Text className="text-sm font-outfit-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Display name
          </Text>
          <DisplayNameEditor user={user} />
        </View>

        <View className="gap-3">
          <Text className="text-sm font-outfit-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Account
          </Text>
          <View className="rounded-xl border border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
            <Text className="text-xs text-zinc-400 font-outfit dark:text-zinc-500">
              Signed in as
            </Text>
            <Text className="mt-0.5 text-base text-zinc-900 font-outfit dark:text-zinc-100">
              {user.email}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sign out pinned to the bottom of the screen. */}
      <View className="border-t border-zinc-200 px-5 pb-2 pt-3 dark:border-zinc-800">
        <Pressable
          onPress={confirmSignOut}
          className="items-center rounded-xl border border-red-300 px-4 py-3.5 active:opacity-70 dark:border-red-900"
        >
          <Text className="text-base font-outfit-medium text-red-600 dark:text-red-400">
            Sign out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function SettingsScreen() {
  return <AuthGate>{(user) => <SettingsContent user={user} />}</AuthGate>;
}
