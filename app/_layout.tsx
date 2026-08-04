import "react-native-get-random-values";
import "../global.css";

import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from "@expo-google-fonts/outfit";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LoadingScreen } from "@/components/LoadingScreen";
import { LoadingProvider, useBootBlocker } from "@/lib/loading";
import { MapFocusProvider } from "@/lib/mapFocus";
import { ThemeProvider, useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

// Status bar text follows the active theme (light text on dark backgrounds).
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

/**
 * Holds the boot splash open until the fonts have settled. Lives inside
 * LoadingProvider so it can register itself as a blocker.
 */
function FontGate({ ready }: { ready: boolean }) {
  useBootBlocker("fonts", !ready);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });
  // On error too, so a font failure never wedges the app behind the splash.
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    // Hand off from the native splash to our animated one as soon as the
    // fonts settle — our LoadingScreen covers the app until it's truly ready.
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  // The tree stays mounted while fonts load so the animated splash can run;
  // text is held back until the real fonts are in to avoid a visible swap.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LoadingProvider>
          <MapFocusProvider>
            <ThemedStatusBar />
            <FontGate ready={fontsReady} />
            {fontsReady ? (
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="settings"
                  options={{ presentation: "modal" }}
                />
              </Stack>
            ) : null}
            <LoadingScreen />
          </MapFocusProvider>
        </LoadingProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
