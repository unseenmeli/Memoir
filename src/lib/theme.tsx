import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "nativewind";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** "system" follows the OS; the others force a fixed appearance. */
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme:preference";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** The scheme actually in effect right now. */
  scheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Loads the saved theme preference and applies it via NativeWind. Wrap the app
 * so `dark:` classes and the status bar / tab bar all follow the same choice.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active) return;
      const pref = (stored as ThemePreference | null) ?? "system";
      setPreferenceState(pref);
      setColorScheme(pref);
    });
    return () => {
      active = false;
    };
  }, [setColorScheme]);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    setColorScheme(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref);
  }

  return (
    <ThemeContext.Provider
      value={{ preference, setPreference, scheme: colorScheme ?? "light" }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
