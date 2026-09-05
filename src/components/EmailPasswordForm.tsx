import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  emailRegistered,
  errorMessage,
  linkEmailToGuest,
  MIN_PASSWORD_LENGTH,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth";
import { haptics } from "@/lib/haptics";
import { getPalette } from "@/lib/palette";
import { useTheme } from "@/lib/theme";

/**
 * What the form is being used for. The two look identical to the person
 * typing, but they are different calls underneath:
 *
 *  - `signIn` starts (or resumes) an account from an email address.
 *  - `linkEmail` adds an address and password to the anonymous account already
 *    signed in, upgrading it in place. It must NOT sign up — signing up would
 *    start a second, empty account and strand every pin the guest made.
 */
export type EmailPasswordMode = "signIn" | "linkEmail";

/**
 * Email → password, in one self-contained two-step form.
 *
 * The email step is what decides the second step. Asking for the address first
 * is what lets an existing user see one password field instead of the "confirm
 * password" pair, and lets a new one find out they're signing up before they
 * have invented a password. `emailRegistered` is what that branch costs — see
 * the migration that defines it.
 *
 * Lives here rather than inside the login screen because it has a second job:
 * a guest adds an email through this same flow to turn their throwaway session
 * into a real account — same fields, same buttons, different `mode`.
 */
export function EmailPasswordForm({
  compact,
  mode = "signIn",
  onSignedIn,
}: {
  /** Drops the heading, for embedding inside an existing section. */
  compact?: boolean;
  mode?: EmailPasswordMode;
  onSignedIn?: () => void;
}) {
  // `null` while the email step is still up. Afterwards it carries the address
  // *and* which branch the check landed on, because the password step needs
  // both and neither is worth re-deriving.
  const [step, setStep] = useState<{
    email: string;
    registered: boolean;
  } | null>(null);

  return step ? (
    <PasswordStep
      email={step.email}
      registered={step.registered}
      compact={compact}
      mode={mode}
      onBack={() => setStep(null)}
      onSignedIn={onSignedIn}
    />
  ) : (
    <EmailStep compact={compact} mode={mode} onChecked={setStep} />
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
      accessibilityRole="button"
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
  mode,
  onChecked,
}: {
  compact?: boolean;
  mode: EmailPasswordMode;
  onChecked: (step: { email: string; registered: boolean }) => void;
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
      const registered = await emailRegistered(trimmed);
      // A guest is creating their account, not resuming one. An address that
      // already belongs to someone can't be attached to this session at all —
      // so say it here, rather than letting `updateUser` fail after they have
      // already picked a password.
      if (mode === "linkEmail" && registered) {
        haptics.error();
        setError(
          "That email already has an account. Use an address you haven't used with this app before.",
        );
        setPending(false);
        return;
      }
      haptics.success();
      onChecked({ email: trimmed, registered });
    } catch (err) {
      haptics.error();
      setError(errorMessage(err) ?? "Couldn't check that email. Try again.");
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
            Enter your email to sign in or create an account.
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
        returnKeyType="next"
        onSubmitEditing={submit}
        className="font-outfit"
        style={field}
      />

      <ErrorText text={error} />

      <SubmitButton
        label="Continue"
        pendingLabel="Checking…"
        pending={pending}
        onPress={submit}
      />
    </View>
  );
}

function PasswordStep({
  email,
  registered,
  compact,
  mode,
  onBack,
  onSignedIn,
}: {
  email: string;
  registered: boolean;
  compact?: boolean;
  mode: EmailPasswordMode;
  onBack: () => void;
  onSignedIn?: () => void;
}) {
  const { palette, field } = useFieldStyle();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Signup succeeded but there's no session — the address needs confirming
  // from the inbox before this account can sign in.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Two ways to end up creating a password: a new address on the login screen,
  // and a guest attaching one from Settings. Both want the confirm field.
  const creating = !registered || mode === "linkEmail";

  async function submit() {
    if (pending) return;

    // Checked here so the two mistakes people actually make come back
    // instantly and phrased for them, instead of as an API error.
    if (creating) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        haptics.error();
        setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        haptics.error();
        setError("Those passwords don't match.");
        setConfirm("");
        return;
      }
    } else if (!password) {
      return;
    }

    setPending(true);
    setError("");
    try {
      if (mode === "linkEmail") {
        await linkEmailToGuest(email, password);
      } else if (registered) {
        await signInWithPassword(email, password);
      } else {
        const { needsEmailConfirmation } = await signUpWithPassword(
          email,
          password,
        );
        // Confirmation on means the account exists but there's no session yet.
        // Say so plainly — the old code called onSignedIn() here and left the
        // UI spinning for a session that was never going to arrive.
        if (needsEmailConfirmation) {
          haptics.success();
          setAwaitingConfirmation(true);
          setPending(false);
          return;
        }
      }
      haptics.success();
      onSignedIn?.();
    } catch (err) {
      // A wrong password is the one error people hit repeatedly, and the field
      // clears itself — worth feeling without reading the message again.
      haptics.error();
      setError(
        errorMessage(err) ??
          (creating ? "Couldn't create that account." : "That didn't work."),
      );
      setPassword("");
      setConfirm("");
      setPending(false);
    }
  }

  // Account created, inbox round-trip pending. This replaces the form
  // entirely: there is nothing useful to type here until the link is clicked.
  if (awaitingConfirmation) {
    return (
      <View className="gap-4">
        <View
          className="items-center justify-center self-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: palette.accent,
          }}
        >
          <Feather name="mail" size={26} color={palette.accentFg} />
        </View>

        <View className="gap-2">
          <Text
            className="text-center text-2xl font-outfit-semibold tracking-tight"
            style={{ color: palette.text }}
          >
            Check your email
          </Text>
          <Text
            className="text-center text-base font-outfit"
            style={{ color: palette.textDim }}
          >
            We sent a confirmation link to{" "}
            <Text style={{ color: palette.text }}>{email}</Text>. Tap it, then
            come back and sign in.
          </Text>
          <Text
            className="text-center text-sm font-outfit"
            style={{ color: palette.textDim }}
          >
            Not there? Check your spam folder.
          </Text>
        </View>

        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          className="items-center rounded-xl px-4 py-3.5 active:opacity-70"
          style={{ backgroundColor: palette.accent }}
        >
          <Text
            className="text-base font-outfit-medium"
            style={{ color: palette.accentFg }}
          >
            Back to sign in
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        {compact ? null : (
          <Text
            className="text-3xl font-outfit-semibold tracking-tight"
            style={{ color: palette.text }}
          >
            {creating ? "Create a password" : "Welcome back"}
          </Text>
        )}
        <Text className="text-base font-outfit" style={{ color: palette.textDim }}>
          {creating ? (
            <>
              Setting up <Text style={{ color: palette.text }}>{email}</Text>.
              There&apos;s no password reset yet, so pick something you
              won&apos;t lose.
            </>
          ) : (
            <>
              Signing in as <Text style={{ color: palette.text }}>{email}</Text>.
            </>
          )}
        </Text>
      </View>

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={
          creating ? `At least ${MIN_PASSWORD_LENGTH} characters` : "Password"
        }
        placeholderTextColor={palette.textDim}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        // Tells the keychain to offer a strong new password rather than trying
        // to fill one that doesn't exist yet.
        autoComplete={creating ? "new-password" : "current-password"}
        textContentType={creating ? "newPassword" : "password"}
        editable={!pending}
        autoFocus
        returnKeyType={creating ? "next" : "go"}
        onSubmitEditing={creating ? undefined : submit}
        className="font-outfit"
        style={field}
      />

      {creating ? (
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          placeholderTextColor={palette.textDim}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!pending}
          returnKeyType="go"
          onSubmitEditing={submit}
          className="font-outfit"
          style={field}
        />
      ) : null}

      <ErrorText text={error} />

      <SubmitButton
        label={creating ? "Create account" : "Sign in"}
        pendingLabel={creating ? "Creating…" : "Signing in…"}
        pending={pending}
        onPress={submit}
      />

      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        className="items-center py-2"
      >
        <Text className="text-sm font-outfit" style={{ color: palette.textDim }}>
          Use a different email
        </Text>
      </Pressable>
    </View>
  );
}
