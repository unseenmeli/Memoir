import { Platform } from "react-native";

/**
 * Design palette ported from designexample/NewEraApp.tsx (a web/CSS mockup).
 * The mockup's colors are defined in OKLCH/color-mix, which React Native's
 * StyleSheet can't parse — every token here is that same color pre-converted
 * to a static hex/rgba value. Additive to `theme.tsx`: this only supplies
 * color/gradient tokens, it doesn't touch the existing light/dark/system
 * preference logic.
 */

export type Palette = {
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  text: string;
  textDim: string;
  border: string;
  glassBg: string;
  glassBorder: string;
  glassShine: string;
  accent: string;
  accent2: string;
  /** Foreground for text sitting on the accent gradient (hero card, active chips). */
  accentFg: string;
  /** Foreground for content on the accent hero gradient specifically. */
  heroFg: string;
  heroFgDim: string;
  heroChipBg: string;
  heroChipBorder: string;
  /** Vertical page-background gradient stops (top → bottom). */
  pageGradient: string[];
  /** Soft top highlight, layered over the page gradient. */
  mistColor: string;
};

const DARK: Palette = {
  bg: "#010304",
  bg2: "#05080b",
  surface: "#0b1013",
  surface2: "#161b1f",
  text: "#f3f5f7",
  textDim: "#899096",
  border: "rgba(255,255,255,0.13)",
  glassBg: "rgba(255,255,255,0.1)",
  glassBorder: "rgba(255,255,255,0.24)",
  glassShine: "rgba(255,255,255,0.35)",
  accent: "#7d94a8",
  accent2: "#b8c8d4",
  accentFg: "#ffffff",
  heroFg: "#1a222b",
  heroFgDim: "rgba(20,30,40,0.72)",
  heroChipBg: "rgba(20,30,40,0.1)",
  heroChipBorder: "rgba(20,30,40,0.28)",
  pageGradient: ["#474e53", "#21272c", "#33393e"],
  mistColor: "rgba(255,255,255,0.16)",
};

const LIGHT: Palette = {
  bg: "#ffffff",
  bg2: "#f9fcff",
  surface: "#ffffff",
  surface2: "#ecf3f5",
  text: "#080c0f",
  textDim: "#595e63",
  border: "rgba(0,0,0,0.08)",
  glassBg: "rgba(255,255,255,0.42)",
  glassBorder: "rgba(255,255,255,0.65)",
  glassShine: "rgba(255,255,255,0.95)",
  accent: "#9fbdd4",
  accent2: "#d8e6f0",
  accentFg: "#16202a",
  heroFg: "#1a222b",
  heroFgDim: "rgba(20,30,40,0.72)",
  heroChipBg: "rgba(20,30,40,0.1)",
  heroChipBorder: "rgba(20,30,40,0.28)",
  pageGradient: ["#7ec6f0", "#b8dff6", "#eef7fc", "#e2f2e0"],
  mistColor: "rgba(255,255,255,0.92)",
};

export function getPalette(scheme: "light" | "dark"): Palette {
  return scheme === "dark" ? DARK : LIGHT;
}

/** Applies an alpha to a `#rrggbb` palette color, e.g. for gradient stops. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mixes a `#rrggbb` color toward black by `amount` (0-1) — for tile gradient shading. */
export function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount));
  const toHex = (x: number) => x.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Mixes two `#rrggbb` colors — `t`=0 is `hexA`, `t`=1 is `hexB`. */
export function mix(hexA: string, hexB: string, t: number): string {
  const a = hexA.replace("#", "");
  const b = hexB.replace("#", "");
  const chan = (i: number) => {
    const av = parseInt(a.slice(i, i + 2), 16);
    const bv = parseInt(b.slice(i, i + 2), 16);
    return Math.round(av + (bv - av) * t);
  };
  const toHex = (x: number) => x.toString(16).padStart(2, "0");
  return `#${toHex(chan(0))}${toHex(chan(2))}${toHex(chan(4))}`;
}

export const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});
