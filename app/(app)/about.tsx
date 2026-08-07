import { router } from "expo-router";
import { useMemo } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppShell } from "../../src/components/AppShell";
import { DisclaimerList } from "../../src/components/DisclaimerList";
import { Icon } from "../../src/components/ui";
import { t } from "../../src/lib/i18n";
import { legalUrls } from "../../src/lib/legal";
import { useTheme } from "../../src/lib/ThemeContext";
import { type Colors, font, radius, readableColumn } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

// The standing home for the six disclaimers (#133). Onboarding and the gate
// each show them once; this is where they stay, one tap from the line under
// every composer and one row down in Settings, so that someone who wants to
// re-read them can, months later, without a support email.
//
// Nothing here is behind a decision or a dismissal — the page is the same six
// points, plus the three documents that go further than a caveat can.
export default function About() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const links: { label: string; url: string }[] = [
    { label: t(lang, "safetyAndLimits"), url: legalUrls.safety },
    { label: t(lang, "privacyPolicy"), url: legalUrls.privacy },
    { label: t(lang, "termsOfUse"), url: legalUrls.terms },
  ];

  return (
    <AppShell>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable
          // Deep-linked straight here there may be no history to pop — land on
          // home rather than on nothing.
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/home")
          }
          style={styles.back}
        >
          <Icon name="chevronLeft" size={16} color={colors.textSoft} />
          <Text style={styles.backLabel}>{t(lang, "back")}</Text>
        </Pressable>

        <Text style={styles.title}>{t(lang, "disclaimersTitle")}</Text>
        <Text style={styles.intro}>{t(lang, "disclaimersIntro")}</Text>

        <View style={styles.list}>
          <DisclaimerList lang={lang} />
        </View>

        {/* The claim the six points don't make, kept next to them. */}
        <Text style={styles.notMedical}>{t(lang, "notMedical")}</Text>

        <Text style={styles.readMore}>{t(lang, "aboutDheeReadMore")}</Text>
        {links.map((link) => (
          <Pressable
            key={link.url}
            onPress={() => void Linking.openURL(link.url)}
            accessibilityRole="link"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowLabel}>{link.label}</Text>
            <Icon name="chevronRight" size={14} color={colors.textFaint} />
          </Pressable>
        ))}
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    page: { ...readableColumn, padding: 16, paddingBottom: 40, gap: 14 },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: -4,
    },
    backLabel: { color: colors.textSoft, fontSize: 14.5, ...font.regular },
    title: { color: colors.text, fontSize: 24, ...font.semibold },
    intro: {
      color: colors.textSoft,
      fontSize: 15.5,
      lineHeight: 23,
      ...font.regular,
    },
    list: { marginTop: 4, marginBottom: 10 },
    notMedical: {
      color: colors.textSoft,
      fontSize: 14.5,
      lineHeight: 21,
      marginBottom: 6,
      ...font.medium,
    },
    readMore: {
      color: colors.textFaint,
      fontSize: 12.5,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      ...font.medium,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    rowPressed: { opacity: 0.75 },
    rowLabel: { color: colors.text, fontSize: 15.5, ...font.regular },
  });
}
