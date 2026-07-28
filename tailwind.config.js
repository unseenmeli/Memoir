/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  // `class` (not the default `media`) so our in-app toggle — setColorScheme via
  // ThemeProvider — actually drives the `dark:` variant instead of only the OS.
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        // Weight-specific families — RN can't synthesize bold for a custom
        // font, so each weight must be named explicitly.
        sans: ["Outfit_400Regular"],
        outfit: ["Outfit_400Regular"],
        "outfit-medium": ["Outfit_500Medium"],
        "outfit-semibold": ["Outfit_600SemiBold"],
        "outfit-bold": ["Outfit_700Bold"],
      },
    },
  },
  plugins: [],
};
