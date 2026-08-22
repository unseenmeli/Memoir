import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MagicCodeForm, errorMessage } from "@/components/MagicCodeForm";
import { db } from "@/lib/db";
import { seedExamplePins } from "@/lib/demo";
import { haptics } from "@/lib/haptics";
import { useBootBlocker } from "@/lib/loading";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  const { isLoading, user } = db.useAuth();
  const [guestPending, setGuestPending] = useState(false);
  const [guestError, setGuestError] = useState("");

  // Keep the boot splash up while auth resolves; if we're signed in we're
  // about to bounce to "/", so let the splash ride through that too rather
  // than flashing a spinner between the two screens.
  useBootBlocker("login", isLoading || !!user);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  /**
   * Guest sign-in. Two jobs: it lets someone try the app before handing over
   * an email, and it is the only way an App Review tester can get in at all —
   * magic codes go to a live inbox they don't have access to.
   *
   * Instant upgrades a guest in place when they later sign in with an email,
   * keeping everything they made, so this is not a dead-end trial.
   */
  async function continueAsGuest() {
    if (guestPending) return;
    setGuestPending(true);
    setGuestError("");
    try {
      const result = await db.auth.signInAsGuest();
      haptics.success();
      // A few obviously-labelled sample pins, so the map isn't empty on the
      // very first run. Never blocks entry if it fails.
      await seedExamplePins(result.user.id).catch(() => {});
    } catch (err) {
      haptics.error();
      setGuestError(
        errorMessage(err) ?? "Couldn't start a guest session. Try again.",
      );
      setGuestPending(false);
    }
  }

  if (isLoading || user) {
    return <View className="flex-1" style={{ backgroundColor: palette.bg }} />;
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: palette.bg }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6">
          <MagicCodeForm />

          <View className="mt-8 gap-3">
            <View className="flex-row items-center gap-3">
              <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
              <Text className="text-xs font-outfit" style={{ color: palette.textDim }}>
                or
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
            </View>

            <Pressable
              onPress={continueAsGuest}
              disabled={guestPending}
              accessibilityRole="button"
              accessibilityLabel="Look around first without an account"
              className="items-center rounded-xl px-4 py-3.5 active:opacity-70 disabled:opacity-50"
              style={{ borderWidth: 1, borderColor: palette.border }}
            >
              {guestPending ? (
                <ActivityIndicator size="small" color={palette.text} />
              ) : (
                <Text
                  className="text-base font-outfit-medium"
                  style={{ color: palette.text }}
                >
                  Look around first
                </Text>
              )}
            </Pressable>

            <Text
              className="text-center text-xs font-outfit"
              style={{ color: palette.textDim }}
            >
              You can add your email later — your pins come with you.
            </Text>

            {guestError ? (
              <Text
                className="text-center text-sm font-outfit"
                style={{ color: "#ef4444" }}
              >
                {guestError}
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
