import type { TextStyle, ViewStyle } from "react-native";
import { fontStack } from "./fonts";

// Design tokens for Dhee, ported from the HTML/CSS prototype
// (Dhee.dc.html). The prototype expresses every colour in oklch(); React
// Native has no oklch() parser, so each value is converted once to sRGB hex
// (offline, via the standard Oklab->sRGB transform) and the original oklch is
// kept in a comment for traceability. A warm sand/clay system with full
// light + dark palettes and three switchable accents on top of the default.

export type ThemeMode = "light" | "dark";
export type AccentName = "default" | "clay" | "sage" | "indigo";

export type Colors = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textSoft: string;
  textFaint: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
};

// Base palettes (default accent is the warm amber the prototype ships with,
// i.e. the `.dhee` block before any [data-accent] override).
const light: Colors = {
  bg: "#fdfaf4", //          oklch(0.985 0.008 85)
  surface: "#ffffff", //     oklch(1 0 0)
  surface2: "#f7f3ec", //    oklch(0.965 0.01 82)
  surface3: "#f1ece4", //    oklch(0.945 0.012 80)
  border: "#e2ddd5", //      oklch(0.9 0.012 80)
  borderStrong: "#d0cac1", // oklch(0.84 0.014 78)
  text: "#302720", //        oklch(0.28 0.018 62)
  textSoft: "#60564e", //    oklch(0.46 0.018 62)
  textFaint: "#877e77", //   oklch(0.6 0.015 62)
  accent: "#ba7244", //      oklch(0.62 0.11 52)
  accentStrong: "#9f5021", // oklch(0.52 0.12 48)
  accentSoft: "#fce3cd", //  oklch(0.93 0.04 62)
  onAccent: "#fffbf4", //    oklch(0.99 0.01 85)
  danger: "#b94642", //      oklch(0.55 0.15 25)
};

const dark: Colors = {
  bg: "#16120e", //          oklch(0.185 0.01 62)
  surface: "#201b16", //     oklch(0.225 0.012 62)
  surface2: "#28211c", //    oklch(0.255 0.014 62)
  surface3: "#312a23", //    oklch(0.29 0.016 62)
  border: "#39312b", //      oklch(0.32 0.016 62)
  borderStrong: "#4f463e", // oklch(0.4 0.018 62)
  text: "#ece7df", //        oklch(0.93 0.012 78)
  textSoft: "#aaa39b", //    oklch(0.72 0.014 72)
  textFaint: "#807972", //   oklch(0.58 0.014 68)
  accent: "#d89c67", //      oklch(0.74 0.1 62)
  accentStrong: "#e7b280", // oklch(0.8 0.09 64)
  accentSoft: "#3f2817", //  oklch(0.3 0.045 56)
  onAccent: "#15110d", //    oklch(0.18 0.01 60)
  danger: "#e47d70", //      oklch(0.7 0.13 28)
};

type AccentTokens = Pick<Colors, "accent" | "accentStrong" | "accentSoft">;

// Accent overrides, layered on top of the base palette (mirrors the
// [data-accent] blocks in the prototype). "default" reuses the base amber.
const accents: Record<AccentName, Record<ThemeMode, AccentTokens>> = {
  default: {
    light: {
      accent: light.accent,
      accentStrong: light.accentStrong,
      accentSoft: light.accentSoft,
    },
    dark: {
      accent: dark.accent,
      accentStrong: dark.accentStrong,
      accentSoft: dark.accentSoft,
    },
  },
  clay: {
    light: {
      accent: "#b65d47",
      accentStrong: "#993b29",
      accentSoft: "#ffdbce",
    },
    dark: { accent: "#d9856b", accentStrong: "#eb9e84", accentSoft: "#43241d" },
  },
  sage: {
    light: {
      accent: "#537d5c",
      accentStrong: "#346440",
      accentSoft: "#d7ebda",
    },
    dark: { accent: "#80b38a", accentStrong: "#94caa1", accentSoft: "#1f3423" },
  },
  indigo: {
    light: {
      accent: "#4966a8",
      accentStrong: "#345197",
      accentSoft: "#e1e7ff",
    },
    dark: { accent: "#869bdd", accentStrong: "#9eb1f5", accentSoft: "#242c47" },
  },
};

export const accentNames: AccentName[] = ["default", "clay", "sage", "indigo"];

// Resolve the final colour set for a theme + accent combination.
export function getColors(mode: ThemeMode, accent: AccentName): Colors {
  const base = mode === "light" ? light : dark;
  return { ...base, ...accents[accent][mode] };
}

// A drop shadow that reads well over the sand surfaces. RN can't take the
// prototype's layered box-shadow string, so this is the nearest single shadow.
export function shadow(mode: ThemeMode): ViewStyle {
  return mode === "light"
    ? {
        shadowColor: "#3a2e1f",
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }
    : {
        shadowColor: "#000000",
        shadowOpacity: 0.4,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// Radii used across the prototype (pill = 999).
export const radius = {
  sm: 8,
  chip: 11,
  md: 12,
  card: 14,
  lg: 16,
  xl: 18,
  pill: 999,
} as const;

export const font: Record<
  "regular" | "medium" | "semibold" | "bold" | "light",
  TextStyle
> = {
  regular: { fontFamily: fontStack.regular },
  medium: { fontFamily: fontStack.medium },
  semibold: { fontFamily: fontStack.semibold },
  bold: { fontFamily: fontStack.bold },
  light: { fontFamily: fontStack.regular },
};

// Legacy default export kept so not-yet-migrated screens keep compiling and
// rendering during the redesign migration. The aliases (textMuted, userBubble,
// userBubbleText) map old token names onto the new palette; each screen drops
// this in favour of useTheme() as it is restyled.
export const colors = {
  ...getColors("light", "default"),
  textMuted: light.textSoft,
  userBubble: light.accent,
  userBubbleText: light.onAccent,
};
