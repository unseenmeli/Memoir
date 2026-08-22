import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { db } from "@/lib/db";
import { haptics } from "@/lib/haptics";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * Email → 6-digit code sign-in, in one self-contained two-step form.
 *
 * Lives here rather than inside the login screen because it has a second job:
 * a guest adds an email through this same flow to turn their throwaway session
 * into a real account. Instant upgrades a guest in place when they sign in —
 * their pins come with them — so the upgrade needs no special path, just this
 * form rendered somewhere else.
 */
export function MagicCodeForm({
  compact,
  onSignedIn,
}: {
  /** Drops the heading, for embedding inside an existing section. */
  compact?: boolean;
  onSignedIn?: () => void;
}) {
  const [sentTo, setSentTo] = useState("");

  return sentTo ? (
    <CodeStep
      email={sentTo}
      compact={compact}
      onBack={() => setSentTo("")}
      onSignedIn={onSignedIn}
    />
  ) : (
    <EmailStep compact={compact} onSent={setSentTo} />
  );
}

function useFieldStyle() {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  return {
    palette,
    field: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: palette.text,
    } as const,
  };
}

function ErrorText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <Text className="text-sm font-outfit" style={{ color: "#ef4444" }}>
      {text}
    </Text>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  pending,
  onPress,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const palette = getPalette(scheme);
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      className="items-center rounded-xl px-4 py-3.5 active:opacity-80 disabled:opacity-50"
      style={{ backgroundColor: palette.accent }}
    >
      <Text
        className="text-base font-outfit-medium"
        style={{ color: palette.accentFg }}
      >
        {pending ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}

function EmailStep({
  compact,
  onSent,
}: {
  compact?: boolean;
  onSent: (email: string) => void;
}) {
  const { palette, field } = useFieldStyle();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError("");
    try {
      await db.auth.sendMagicCode({ email: trimmed });
      haptics.success();
      onSent(trimmed);
    } catch (err) {
      haptics.error();
      setError(errorMessage(err) ?? "Could not send the code. Try again.");
      setPending(false);
    }
  }

  return (
    <View className="gap-4">
      {compact ? null : (
        <View className="gap-1">
          <Text
            className="text-3xl font-outfit-semibold tracking-tight"
            style={{ color: palette.text }}
          >
            Sign in
          </Text>
          <Text className="text-base font-outfit" style={{ color: palette.textDim }}>
            We&apos;ll email you a one-time code.
          </Text>
        </View>
      )}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={palette.textDim}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!pending}
        returnKeyType="go"
        onSubmitEditing={submit}
        className="font-outfit"
        style={field}
      />

      <ErrorText text={error} />

      <SubmitButton
        label="Send code"
        pendingLabel="Sending…"
        pending={pending}
        onPress={submit}
      />
    </View>
  );
}

function CodeStep({
  email,
  compact,
  onBack,
  onSignedIn,
}: {
  email: string;
  compact?: boolean;
  onBack: () => void;
  onSignedIn?: () => void;
}) {
  const { palette, field } = useFieldStyle();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError("");
    try {
      await db.auth.signInWithMagicCode({ email, code: trimmed });
      haptics.success();
      onSignedIn?.();
    } catch (err) {
      // A mistyped code is the one error people hit repeatedly, and the field
      // clears itself — worth feeling without reading the message again.
      haptics.error();
      setError(errorMessage(err) ?? "That code didn't work. Try again.");
      setCode("");
      setPending(false);
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        {compact ? null : (
          <Text
            className="text-3xl font-outfit-semibold tracking-tight"
            style={{ color: palette.text }}
          >
            Enter code
          </Text>
        )}
        <Text className="text-base font-outfit" style={{ color: palette.textDim }}>
          We sent a code to{" "}
          <Text style={{ color: palette.text }}>{email}</Text>.
        </Text>
      </View>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        placeholderTextColor={palette.textDim}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        editable={!pending}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={submit}
        className="text-center font-outfit tracking-[8px]"
        style={[field, { fontSize: 24 }]}
      />

      <ErrorText text={error} />

      <SubmitButton
        label="Verify"
        pendingLabel="Verifying…"
        pending={pending}
        onPress={submit}
      />

      <Pressable onPress={onBack} className="items-center py-2">
        <Text className="text-sm font-outfit" style={{ color: palette.textDim }}>
          Use a different email
        </Text>
      </Pressable>
    </View>
  );
}

export function errorMessage(err: unknown): string | undefined {
  return (err as { body?: { message?: string } })?.body?.message;
}
