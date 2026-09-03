import type { User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { resetData } from "./data";
import { supabase } from "./supabase";

export type { User };

export type AuthState = {
  isLoading: boolean;
  error: Error | null;
  user: User | null;
};

const AuthContext = createContext<AuthState>({
  isLoading: true,
  error: null,
  user: null,
});

/**
 * Tracks the signed-in user for the whole app.
 *
 * Instant's `db.useAuth()` was a hook you could call anywhere and it resolved
 * once per app; a provider is the closest equivalent, and it keeps the number
 * of `onAuthStateChange` listeners at one no matter how many screens are
 * mounted. Mount it above the router in app/_layout.tsx.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    error: null,
    user: null,
  });

  useEffect(() => {
    let active = true;

    // `onAuthStateChange` fires an INITIAL_SESSION on subscribe, which is what
    // normally resolves the loading state. `getSession` is the belt to that
    // braces: if reading the stored session fails outright, this is the only
    // path that surfaces the error instead of leaving the splash up forever.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setState({
        isLoading: false,
        error: error ?? null,
        user: data.session?.user ?? null,
      });
    });

    const { data } = supabase.auth.onAuthStateChange((event, supabaseSession) => {
      if (!active) return;
      // Cached rows and signed URLs belong to the account that just left.
      if (event === "SIGNED_OUT") resetData();
      setState({
        isLoading: false,
        error: null,
        user: supabaseSession?.user ?? null,
      });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** The app's password floor. Mirrors `minimum_password_length` in config.toml. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Does this address already have an account?
 *
 * Decides which half of the login form to show — "enter your password" or
 * "choose a password" — before anyone types a character. There is no client
 * API for this on purpose, so it goes through a `security definer` function we
 * own; read the migration that defines it (`email_registered`) for the
 * enumeration trade-off it accepts.
 *
 * Failing closed (`false`) would push an existing user into the sign-up branch
 * and hand them "an account already exists" for a password they typed twice,
 * so the error is raised instead and the form asks them to retry.
 */
export async function emailRegistered(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("email_registered", {
    check_email: email,
  });
  if (error) throw error;
  return data === true;
}

/** Sign in to an account that already exists. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Create a brand-new account.
 *
 * With `enable_confirmations = false` the account is usable immediately and no
 * mail is generated, so this returns already signed in — there is no inbox
 * round-trip and no pending state to hold on to.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

/**
 * Turn a guest into a real account, in place.
 *
 * This is deliberately NOT `signUpWithPassword`: signing up would start a
 * second, empty account and strand every pin the guest made. Adding an email
 * and password to the *existing* anonymous user keeps the same user id —
 * which is what every pin's `owner_id` points at.
 *
 * Both fields go in one call because that is the only shape Auth confirms
 * without mailing: the no-mail path is gated on `user.IsAnonymous &&
 * Mailer.Autoconfirm`, and the user stops being anonymous the moment the
 * email lands. Splitting this into two calls would send the second one down
 * the confirmation-mail path, which this project cannot deliver.
 */
export async function linkEmailToGuest(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
}

/**
 * Sets a new password on the currently signed-in session.
 *
 * Only reached through `changePassword`, which proves the old password
 * first. There is no recovery flow: see the note in README.md on what it
 * would take to add one.
 */
export async function setPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Changes the password of a signed-in account, checking the current one first.
 *
 * `updateUser` alone would let anyone holding an unlocked phone silently
 * change the password, so the current one has to be proven. Auth exposes no
 * "is this the password" endpoint — its own answer to this is
 * `reauthenticate()`, which mails a nonce and is therefore unavailable here —
 * so a sign-in as the same user is the check. It costs one round-trip and
 * returns a fresh session for the account that is already signed in, which is
 * a no-op as far as the app is concerned: `AuthProvider` sees the same user id
 * and `resetData` only runs on SIGNED_OUT.
 *
 * A failed attempt leaves the existing session alone — auth-js does not clear
 * it when sign-in returns a 400 — so getting the current password wrong is
 * recoverable rather than a surprise sign-out.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { error: wrongPassword } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  // Phrased here rather than passed through: Supabase says "Invalid login
  // credentials", which is about signing in and reads as nonsense to someone
  // who is already signed in and changing their password.
  if (wrongPassword) {
    throw new Error("That's not your current password.");
  }

  await setPassword(newPassword);
}

/**
 * Guest sign-in — a real look at the app before handing over an email, and the
 * entry an App Review tester can use without being issued credentials.
 *
 * Not a dead end: `linkEmailToGuest` upgrades this same account in place, so
 * nothing made as a guest is lost by signing up later.
 *
 * Requires `enable_anonymous_sign_ins` on the project (config.toml).
 */
export async function signInAsGuest(): Promise<User> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Couldn't start a guest session.");
  return data.user;
}

/**
 * Signs out and clears cached data.
 *
 * The server call is allowed to fail: after account deletion the session it
 * would revoke is already gone, and a rejected request must not leave the app
 * believing it is still signed in. Dropping the local session is the part that
 * actually matters.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
  // Deliberately after, not before. Clearing the cache first would notify the
  // still-mounted screens, and their `usePins` call would rebuild the session
  // — realtime channel and all — a beat before the auth event unmounts them.
  // The SIGNED_OUT listener normally gets here first; this is the fallback for
  // when neither call managed to emit an event at all.
  resetData();
}

/**
 * The human-readable half of a Supabase error, if it has one.
 *
 * Supabase phrases most auth failures for end users already ("Token has
 * expired or is invalid"), so preferring its message over a generic fallback
 * is usually the more helpful choice.
 */
export function errorMessage(err: unknown): string | undefined {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : undefined;
}
