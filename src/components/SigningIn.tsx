import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { type Colors, font, spacing } from "../lib/theme";

// What someone looks at between handing Google their consent and Convex
// agreeing they're signed in. It wears the sign-in screen's own wordmark and
// tagline on purpose: the alternative — the sign-in *form*, or a bare spinner —
// reads as "that didn't work", which is the whole complaint this answers.
//
// Sign-in happens before anyone has picked a language, so this is English-only
// for the same reason sign-in.tsx is.
export function SigningIn() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>{t("en", "appName")}</Text>
        <Text style={styles.tagline}>{t("en", "tagline")}</Text>
        <View style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.label}>{t("en", "signingIn")}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    wordmark: {
      fontSize: 44,
      color: colors.text,
      letterSpacing: 1,
      ...font.medium,
    },
    tagline: {
      marginTop: spacing.sm,
      fontSize: 17,
      lineHeight: 25,
      color: colors.textSoft,
      ...font.regular,
    },
    status: {
      marginTop: spacing.xl * 1.5,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    label: { fontSize: 15, color: colors.textSoft, ...font.regular },
  });
}
