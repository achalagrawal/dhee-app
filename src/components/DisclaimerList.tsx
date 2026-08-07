import { StyleSheet, Text, View } from "react-native";
import { CHAT_MODEL_NAME, DISCLAIMERS } from "../lib/disclaimers";
import { type Language, t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { font } from "../lib/theme";

// The six points, rendered the same way wherever they appear: onboarding's
// second step, the gate, /about. One renderer so the three can't drift, and so
// adding a seventh point is a one-line change in src/lib/disclaimers.ts.
//
// Numbered rather than bulleted. Six caveats in a row read as a wall of hedging
// and the eye slides off them; a number makes each one a thing that ends.
export function DisclaimerList({
  lang,
  compact = false,
}: {
  lang: Language;
  /** Tighter type, for the gate — it has a fixed height to live inside. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={compact ? styles.listCompact : styles.list}>
      {DISCLAIMERS.map((item, i) => (
        <View key={item.title} style={styles.row}>
          <Text
            style={[
              styles.number,
              compact && styles.numberCompact,
              {
                color: colors.accentStrong,
                backgroundColor: colors.accentSoft,
              },
            ]}
          >
            {i + 1}
          </Text>
          <View style={styles.body}>
            <Text
              style={[
                styles.title,
                compact && styles.titleCompact,
                { color: colors.text },
              ]}
            >
              {t(lang, item.title)}
            </Text>
            <Text
              style={[
                styles.text,
                compact && styles.textCompact,
                { color: colors.textSoft },
              ]}
            >
              {/* Only the first point takes a substitution; replace is a no-op
                  on the rest. */}
              {t(lang, item.body).replace("%s", CHAT_MODEL_NAME)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 18 },
  listCompact: { gap: 13 },
  row: { flexDirection: "row", gap: 12 },
  // Fixed square so the text column lines up down the list whether the number
  // is one digit or two.
  number: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 12.5,
    ...font.semibold,
  },
  numberCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
    lineHeight: 20,
    fontSize: 12,
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15.5, lineHeight: 21, ...font.medium },
  titleCompact: { fontSize: 14.5, lineHeight: 20 },
  text: { fontSize: 14.5, lineHeight: 21, ...font.regular },
  textCompact: { fontSize: 13.5, lineHeight: 19.5 },
});
