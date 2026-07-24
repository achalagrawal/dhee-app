import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
} from "@expo-google-fonts/noto-sans-devanagari";

export const fontMap = {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
};

// Hanken Grotesk is the prototype's UI face. Devanagari needs a font that
// actually carries the conjuncts and matras — the system fallback on web is
// Times, which renders them but badly — so Noto is listed after Hanken for
// each weight. Listing both lets each script pick the face that covers it, so
// mixed Hinglish in a single string stays legible without tagging spans.
export const fontStack = {
  regular: "HankenGrotesk_400Regular, NotoSansDevanagari_400Regular",
  medium: "HankenGrotesk_500Medium, NotoSansDevanagari_500Medium",
  semibold: "HankenGrotesk_600SemiBold, NotoSansDevanagari_500Medium",
  bold: "HankenGrotesk_700Bold, NotoSansDevanagari_500Medium",
};
