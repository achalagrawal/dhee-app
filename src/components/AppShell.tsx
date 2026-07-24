import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../lib/i18n";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { font } from "../lib/theme";
import { useLanguage } from "../lib/useLanguage";
import { OfflineBanner } from "./OfflineBanner";
import { Icon, IconButton } from "./ui";

type Props = {
  children: ReactNode;
  /** Screen-specific action buttons rendered at the header's trailing edge. */
  right?: ReactNode;
  /** Show the incognito toggle in the header (Home + Chat). */
  showIncognito?: boolean;
};

// The signed-in chrome: a menu button that opens the drawer, a centered Dhee
// mark, screen-supplied trailing actions, the offline banner, and the
// incognito strip. Mirrors the prototype's mobile header (menu + centered
// logo + contextual actions); the page's own <h1> names the screen.
export function AppShell({ children, right, showIncognito = false }: Props) {
  const { colors } = useTheme();
  const { openDrawer, incognito, toggleIncognito } = useShell();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: colors.border,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <IconButton
          name="menu"
          variant="surface"
          size={40}
          color={colors.text}
          onPress={openDrawer}
          accessibilityLabel={t(lang, "openMenu")}
        />

        <View pointerEvents="none" style={styles.logo}>
          <Icon name="logo" size={30} color={colors.accent} />
        </View>

        <View style={styles.right}>
          {right}
          {showIncognito ? (
            <IconButton
              name="incognito"
              variant="surface"
              size={40}
              color={incognito ? colors.onAccent : colors.text}
              onPress={toggleIncognito}
              accessibilityLabel={t(lang, "incognito")}
              style={
                incognito
                  ? { backgroundColor: colors.text, borderColor: colors.text }
                  : undefined
              }
            />
          ) : null}
        </View>
      </View>

      {incognito ? (
        <View style={[styles.incognitoBar, { backgroundColor: colors.text }]}>
          <Icon name="incognito" size={15} color={colors.bg} />
          <Text style={[styles.incognitoText, { color: colors.bg }]}>
            {t(lang, "incognitoBanner")}
          </Text>
          <Text
            onPress={toggleIncognito}
            style={[styles.incognitoOff, { color: colors.bg }]}
          >
            {t(lang, "turnOff")}
          </Text>
        </View>
      ) : null}

      <OfflineBanner lang={lang} />

      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 58,
  },
  logo: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: "center",
  },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  incognitoBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  incognitoText: { fontSize: 13, ...font.medium },
  incognitoOff: {
    fontSize: 13,
    textDecorationLine: "underline",
    ...font.semibold,
  },
  body: { flex: 1 },
});
