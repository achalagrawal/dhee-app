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
import { Icon } from "../../src/components/ui";
import { t } from "../../src/lib/i18n";
import { useTheme } from "../../src/lib/ThemeContext";
import { type Colors, font, radius, readableColumn } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

// Where the crisis banner's "See support resources" goes.
//
// The design's list had US, UK/ROI and an international directory, and no
// Indian numbers at all — which is a strange gap for the app's primary market.
// India is listed first here for that reason.
//
// Every entry was checked against the operator's own site or a government
// source in July 2026. THESE NEED RE-CHECKING BEFORE EACH RELEASE: a number
// that has quietly changed is worse than no number, because someone in trouble
// spends their effort on it. Epic 16's full Safety & limitations page is the
// eventual home for this.
type Line = {
  region: string;
  name: string;
  /** What the person reads. */
  display: string;
  /** Where the row goes when tapped. */
  href: string;
  hours: string;
};

const LINES: Line[] = [
  {
    region: "India",
    name: "Tele-MANAS",
    display: "14416",
    href: "tel:14416",
    hours: "24×7, free, 20+ languages",
  },
  {
    region: "India",
    name: "AASRA",
    display: "+91 98204 66726",
    href: "tel:+919820466726",
    hours: "24×7",
  },
  {
    region: "India",
    name: "iCALL (TISS)",
    display: "+91 91529 87821",
    href: "tel:+919152987821",
    hours: "Mon–Sat, 8am–10pm",
  },
  {
    region: "India",
    name: "Vandrevala Foundation",
    display: "+91 99996 66555",
    href: "tel:+919999666555",
    hours: "24×7",
  },
  {
    region: "United States",
    name: "988 Suicide & Crisis Lifeline",
    display: "988 — call or text",
    href: "tel:988",
    hours: "24×7",
  },
  {
    region: "United Kingdom & Ireland",
    name: "Samaritans",
    display: "116 123",
    href: "tel:116123",
    hours: "24×7, free",
  },
  {
    region: "International",
    name: "Befrienders Worldwide",
    display: "befrienders.org",
    href: "https://befrienders.org",
    hours: "Directory of local helplines",
  },
];

export default function Support() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Grouped so the region heading isn't repeated on every Indian row.
  const groups = useMemo(() => {
    const byRegion = new Map<string, Line[]>();
    for (const line of LINES) {
      const existing = byRegion.get(line.region);
      if (existing) existing.push(line);
      else byRegion.set(line.region, [line]);
    }
    return [...byRegion.entries()];
  }, []);

  return (
    <AppShell>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable
          // Deep-linked straight here (from the incognito banner, or a shared
          // link) there may be no history to pop — land on home instead.
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/home")
          }
          style={styles.back}
        >
          <Icon name="chevronLeft" size={16} color={colors.textSoft} />
          <Text style={styles.backLabel}>{t(lang, "back")}</Text>
        </Pressable>

        <Text style={styles.title}>{t(lang, "supportTitle")}</Text>
        <Text style={styles.intro}>{t(lang, "supportIntro")}</Text>

        {groups.map(([region, lines]) => (
          <View key={region} style={styles.group}>
            <Text style={styles.region}>{region}</Text>
            {lines.map((line) => (
              <Pressable
                key={line.name}
                onPress={() => void Linking.openURL(line.href)}
                accessibilityRole="link"
                accessibilityLabel={`${line.name}, ${line.display}`}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{line.name}</Text>
                  <Text style={styles.rowHours}>{line.hours}</Text>
                </View>
                <Text style={styles.rowNumber}>{line.display}</Text>
              </Pressable>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>{t(lang, "supportFooter")}</Text>
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    // maxWidth alone left the page hugging the window's left edge on desktop.
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
    group: { gap: 8, marginTop: 6 },
    region: {
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
    rowBody: { flex: 1, minWidth: 0, gap: 2 },
    rowName: { color: colors.text, fontSize: 15.5, ...font.medium },
    rowHours: { color: colors.textFaint, fontSize: 13, ...font.regular },
    rowNumber: { color: colors.accentStrong, fontSize: 15.5, ...font.semibold },
    footer: {
      color: colors.textFaint,
      fontSize: 13.5,
      lineHeight: 20,
      marginTop: 10,
      ...font.regular,
    },
  });
}
