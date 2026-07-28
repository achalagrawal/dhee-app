import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../lib/i18n";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { font } from "../lib/theme";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useLanguage } from "../lib/useLanguage";
import { OfflineBanner } from "./OfflineBanner";
import { Icon, IconButton } from "./ui";

type Props = {
  children: ReactNode;
  /** Screen-specific action buttons rendered at the header's trailing edge. */
  right?: ReactNode;
  /** Show the incognito toggle in the header (Home + Chat). */
  showIncognito?: boolean;
  /**
   * What this screen is looking at, named in the header. A screen whose
   * content has its own name — a conversation — passes it here; the Dhee mark
   * steps aside for it, because two things centred in one bar is one too many.
   */
  title?: string;
  /** Makes the title a button (a chevron appears) — used to open its menu. */
  onTitlePress?: () => void;
  /** Accessibility label for the title button, e.g. "Conversation options". */
  titleAccessibilityLabel?: string;
};

// The signed-in chrome: a menu button that opens the drawer, a centered Dhee
// mark, screen-supplied trailing actions, the offline banner, and the
// incognito strip. Mirrors the prototype's header (menu + title or centered
// logo + contextual actions); on screens with no title of their own, the
// page's own <h1> names the screen.
//
// The menu button and the mark are both mobile chrome. On a desktop-width
// window the sidebar is always on screen — full column or icon rail — so it
// carries the brand and there is nothing for a hamburger to open. A screen
// with a title of its own still shows it there.
export function AppShell({
  children,
  right,
  showIncognito = false,
  title,
  onTitlePress,
  titleAccessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const { openDrawer, incognito, toggleIncognito } = useShell();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          // With no menu button on the left, a titleless header would drift its
          // trailing actions there under space-between; pin them to the
          // trailing edge instead. A title takes the row's slack either way.
          isDesktop && styles.headerDesktop,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: colors.border,
            backgroundColor: colors.bg,
          },
        ]}
      >
        {isDesktop ? null : (
          <IconButton
            name="menu"
            variant="surface"
            size={40}
            color={colors.text}
            onPress={openDrawer}
            accessibilityLabel={t(lang, "openMenu")}
          />
        )}

        {title ? (
          <Pressable
            onPress={onTitlePress}
            disabled={!onTitlePress}
            accessibilityRole={onTitlePress ? "button" : "header"}
            accessibilityLabel={titleAccessibilityLabel}
            hitSlop={6}
            style={({ pressed }) => [
              styles.title,
              pressed && onTitlePress ? { opacity: 0.6 } : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.titleText, { color: colors.text }]}
            >
              {title}
            </Text>
            {onTitlePress ? (
              <Icon name="chevronDown" size={15} color={colors.textFaint} />
            ) : null}
          </Pressable>
        ) : isDesktop ? null : (
          <View pointerEvents="none" style={styles.logo}>
            <Icon name="logo" size={30} color={colors.accentStrong} />
          </View>
        )}

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
  headerDesktop: { justifyContent: "flex-end" },
  logo: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: "center",
  },
  // Takes the row's slack so a long name ellipsizes rather than pushing the
  // trailing actions off the edge.
  title: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    minWidth: 0,
  },
  titleText: { flexShrink: 1, fontSize: 17, ...font.medium },
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
