import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
} from "@expo-google-fonts/inter";
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
} from "@expo-google-fonts/noto-sans-devanagari";

export const fontMap = {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
};

// Devanagari needs a font that actually has the conjuncts and matras; the
// system fallback on web is Times, which renders them but badly. Listing
// Noto after Inter lets each script pick the face that covers it, so mixed
// Hinglish in a single message stays legible without us tagging spans.
export const fontStack = {
  regular: "Inter_400Regular, NotoSansDevanagari_400Regular",
  medium: "Inter_500Medium, NotoSansDevanagari_500Medium",
  light: "Inter_300Light, NotoSansDevanagari_400Regular",
};
