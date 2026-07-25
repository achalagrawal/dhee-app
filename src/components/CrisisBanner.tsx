import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Language, t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { font, radius } from "../lib/theme";

// Shown above the transcript once something the person wrote suggests they may
// be in danger. Shared by the saved and incognito chat screens so the wording
// can't drift between them — the incognito path is the one most likely to be
// used by someone who doesn't want a record of this.
//
// It states plainly what Dhee is not, and gives one tap to people who are
// trained for it. It never blocks the conversation: someone who wants to keep
// talking should be able to keep talking.
export function CrisisBanner({ lang }: { lang: Language }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        {t(lang, "crisisTitle")}
      </Text>
      <Text style={[styles.body, { color: colors.textSoft }]}>
        {t(lang, "crisisBody")}
      </Text>
      <Pressable
        onPress={() => router.push("/support")}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          {
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.ctaLabel, { color: colors.text }]}>
          {t(lang, "crisisCta")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    gap: 6,
  },
  title: { fontSize: 15, lineHeight: 21, ...font.semibold },
  body: { fontSize: 14, lineHeight: 21, ...font.regular },
  cta: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  ctaLabel: { fontSize: 13.5, ...font.medium },
});
