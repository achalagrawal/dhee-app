import { fontStack } from "./fonts";

export const colors = {
  bg: "#fbfaf8",
  surface: "#ffffff",
  border: "#e8e4dd",
  text: "#1c1b19",
  textMuted: "#78736c",
  accent: "#2f6f5e",
  accentSoft: "#eaf2ef",
  userBubble: "#2f6f5e",
  userBubbleText: "#ffffff",
  danger: "#a4443a",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
};

export const font = {
  regular: { fontFamily: fontStack.regular },
  medium: { fontFamily: fontStack.medium },
  light: { fontFamily: fontStack.light },
} as const;
