import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "@/lib/db";

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading, user } = db.useAuth();
  const [sentEmail, setSentEmail] = useState("");

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || user) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-950">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6">
          {sentEmail ? (
            <CodeForm email={sentEmail} onBack={() => setSentEmail("")} />
          ) : (
            <EmailForm onSent={setSentEmail} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EmailForm({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError("");
    try {
      await db.auth.sendMagicCode({ email: trimmed });
      onSent(trimmed);
    } catch (err) {
      setError(errorMessage(err) ?? "Could not send the code. Try again.");
      setPending(false);
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-3xl font-outfit-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign in
        </Text>
        <Text className="text-base text-zinc-500 font-outfit dark:text-zinc-400">
          We&apos;ll email you a one-time code.
        </Text>
      </View>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#a1a1aa"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!pending}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        className="rounded-xl border border-zinc-300 px-4 py-3.5 text-base text-zinc-900 font-outfit dark:border-zinc-700 dark:text-zinc-100"
      />

      {error ? (
        <Text className="text-sm text-red-600 font-outfit dark:text-red-400">
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={pending}
        className="items-center rounded-xl bg-zinc-900 px-4 py-3.5 active:opacity-80 disabled:opacity-50 dark:bg-zinc-100"
      >
        <Text className="text-base font-outfit-medium text-white dark:text-zinc-900">
          {pending ? "Sending…" : "Send code"}
        </Text>
      </Pressable>
    </View>
  );
}

function CodeForm({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const trimmed = code.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError("");
    try {
      await db.auth.signInWithMagicCode({ email, code: trimmed });
      // On success useAuth updates and this screen redirects to "/".
    } catch (err) {
      setError(errorMessage(err) ?? "That code didn't work. Try again.");
      setCode("");
      setPending(false);
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-3xl font-outfit-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Enter code
        </Text>
        <Text className="text-base text-zinc-500 font-outfit dark:text-zinc-400">
          We sent a code to{" "}
          <Text className="text-zinc-900 dark:text-zinc-100">{email}</Text>.
        </Text>
      </View>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        placeholderTextColor="#a1a1aa"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        editable={!pending}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        className="rounded-xl border border-zinc-300 px-4 py-3.5 text-center text-2xl tracking-[8px] text-zinc-900 font-outfit dark:border-zinc-700 dark:text-zinc-100"
      />

      {error ? (
        <Text className="text-sm text-red-600 font-outfit dark:text-red-400">
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={pending}
        className="items-center rounded-xl bg-zinc-900 px-4 py-3.5 active:opacity-80 disabled:opacity-50 dark:bg-zinc-100"
      >
        <Text className="text-base font-outfit-medium text-white dark:text-zinc-900">
          {pending ? "Verifying…" : "Verify"}
        </Text>
      </Pressable>

      <Pressable onPress={onBack} className="items-center py-2">
        <Text className="text-sm text-zinc-500 font-outfit dark:text-zinc-400">
          Use a different email
        </Text>
      </Pressable>
    </View>
  );
}

function errorMessage(err: unknown): string | undefined {
  return (err as { body?: { message?: string } })?.body?.message;
}
