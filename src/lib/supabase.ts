import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Copy .env.example to .env and fill them in from your project's API settings.",
  );
}

/**
 * The one Supabase client for the app.
 *
 * Only the *publishable* key ever appears here. Anything prefixed
 * `EXPO_PUBLIC_` is compiled into the shipped bundle and can be read out of
 * the binary, so the secret key must never be referenced from this directory —
 * it lives in the Edge Function environment (see supabase/functions).
 *
 * Everything this key can reach is fenced off by row level security, which is
 * the actual boundary: see the policies in supabase/migrations.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Sessions outlive the process, so they need somewhere on disk to live.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no URL to read a session back from on a phone — this is a
    // browser redirect-flow feature and leaving it on makes the client parse
    // deep links looking for tokens that are never there.
    detectSessionInUrl: false,
  },
});

/**
 * Refresh tokens only while the app is actually in front of someone.
 *
 * A background timer firing every hour on a suspended app is wasted wakeups;
 * worse, iOS may freeze the timer mid-flight and the client comes back with a
 * half-applied refresh. Stopping on background and restarting on foreground is
 * what Supabase's own React Native guidance does.
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
