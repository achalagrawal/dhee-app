import { Platform } from "react-native";

/**
 * Whether to hand an `Animated` timing off to the native driver.
 *
 * Web has no native animated module, so asking for one there earns a fallback
 * to the JS driver plus a console warning telling you to add `RCTAnimation` and
 * run `pod install` — advice no browser can act on, and on Expo web it arrives
 * as a dev overlay. The animation is the same either way; this only stops us
 * asking for something that was never there.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== "web";
