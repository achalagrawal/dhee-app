import { View, type StyleProp, type ViewStyle } from "react-native";
import { t, type Language } from "../../lib/i18n";
import { useTheme } from "../../lib/ThemeContext";
import { DheeMark } from "./DheeMark";

/**
 * Waiting, anywhere in the app. One thing turns while Dhee works — the mark
 * itself — whether that's the session resolving, a screen's query landing, or a
 * button finishing what it was pressed for. The platform's `ActivityIndicator`
 * used to do this job and drew a generic arc that belongs to no product (#103).
 *
 * `accentStrong` rather than `accent`, for the reason the avatar does it: at
 * this size the rays are hairlines, and hairlines read lighter than a solid
 * shape. Sitting on an accent-filled surface, pass `onAccent` instead.
 */
export function Loading({
  size = 32,
  color,
  /** Only reaches the screen reader; the mark itself carries no text. */
  lang = "en",
  style,
}: {
  size?: number;
  color?: string;
  lang?: Language;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t(lang, "loading")}
      style={style}
    >
      <DheeMark size={size} color={color ?? colors.accentStrong} animated />
    </View>
  );
}
