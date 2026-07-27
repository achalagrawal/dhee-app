import { usePaginatedQuery, useQuery } from "convex/react";
import { usePathname } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { t } from "../lib/i18n";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { font, radius } from "../lib/theme";
import { groupByTime } from "../lib/time";
import { useLanguage } from "../lib/useLanguage";
import { Avatar, Icon, type IconName } from "./ui";

type Props = {
  /** Show the 66px icon rail instead of the full column (desktop only). */
  collapsed: boolean;
  onNavigate: (path: string) => void;
  /** Mobile drawer: the × in the brand row. */
  onClose?: () => void;
  /** Desktop, expanded: the collapse button in the brand row. */
  onCollapse?: () => void;
  /** Desktop, collapsed: pressing the rail's logo or History. */
  onExpand?: () => void;
  paddingTop?: number;
  paddingBottom?: number;
};

/**
 * Everything inside the sidebar — brand row, new conversation, search, the nav,
 * the history list, the account footer. Shared by the desktop sidebar and the
 * mobile drawer so the two can never drift; `collapsed` is what turns it into
 * the icon rail.
 */
export function SidebarContent({
  collapsed,
  onNavigate,
  onClose,
  onCollapse,
  onExpand,
  paddingTop = 0,
  paddingBottom = 0,
}: Props) {
  const { colors } = useTheme();
  const { openSearch } = useShell();
  const lang = useLanguage();
  const pathname = usePathname();

  const account = useQuery(api.users.accountSummary);
  const { results: threads } = usePaginatedQuery(
    api.chat.listThreads,
    {},
    { initialNumItems: 20 },
  );

  const navItems: { icon: IconName; label: string; path: string }[] = [
    { icon: "logo", label: t(lang, "navHome"), path: "/home" },
    { icon: "history", label: t(lang, "navHistory"), path: "/threads" },
    { icon: "book", label: t(lang, "navMemory"), path: "/understanding" },
    { icon: "gear", label: t(lang, "navSettings"), path: "/settings" },
  ];

  const groups = groupByTime(threads, (thr) => thr._creationTime);
  const pad = collapsed ? styles.railPad : styles.pad;

  return (
    <View style={{ flex: 1, paddingTop, paddingBottom }}>
      {/* Brand row. Collapsed, the mark itself is the expand control: it turns
          into the sidebar glyph under the pointer, the way ChatGPT's rail
          does, and still expands on press for touch and keyboard. */}
      <View style={[styles.brandRow, collapsed && styles.brandRowRail]}>
        {collapsed ? (
          <RailToggle onPress={onExpand} label={t(lang, "openSidebar")} />
        ) : (
          <>
            <Pressable
              style={styles.brand}
              onPress={() => onNavigate("/home")}
              accessibilityRole="link"
              accessibilityLabel={t(lang, "navHome")}
            >
              <Icon name="logo" size={28} color={colors.accentStrong} />
              <Text style={[styles.brandName, { color: colors.text }]}>
                Dhee
              </Text>
            </Pressable>
            {onCollapse ? (
              <Pressable
                onPress={onCollapse}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "collapseSidebar")}
              >
                <Icon name="collapse" size={19} color={colors.textSoft} />
              </Pressable>
            ) : null}
            {onClose ? (
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "closeMenu")}
              >
                <Icon name="close" size={18} color={colors.textSoft} />
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      {/* New conversation */}
      <View style={[pad, { paddingTop: 4 }]}>
        <Pressable
          onPress={() => onNavigate("/home")}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "newConversation")}
          style={({ pressed }) => [
            styles.newBtn,
            collapsed && styles.railBtn,
            { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Icon name="plus" size={16} color={colors.onAccent} />
          {collapsed ? null : (
            <Text style={[styles.newBtnText, { color: colors.onAccent }]}>
              {t(lang, "newConversation")}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Search */}
      <View style={[pad, { paddingTop: 8 }]}>
        <Pressable
          onPress={openSearch}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "searchConversations")}
          style={({ pressed }) => [
            styles.searchBtn,
            collapsed && styles.railBtn,
            { backgroundColor: colors.surface2, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Icon name="search" size={15} color={colors.textSoft} />
          {collapsed ? null : (
            <Text style={[styles.searchText, { color: colors.textSoft }]}>
              {t(lang, "searchConversations")}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Nav */}
      <View style={[styles.nav, pad]}>
        {navItems.map((n) => {
          const active = pathname === n.path;
          return (
            <Pressable
              key={n.path}
              onPress={() => onNavigate(n.path)}
              accessibilityRole="link"
              accessibilityLabel={n.label}
              style={({ pressed }) => [
                styles.navItem,
                collapsed && styles.railBtn,
                {
                  backgroundColor: active ? colors.surface2 : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Icon
                name={n.icon}
                size={18}
                color={active ? colors.accentStrong : colors.textSoft}
              />
              {collapsed ? null : (
                <Text
                  style={[
                    styles.navLabel,
                    { color: colors.text },
                    active && font.semibold,
                  ]}
                >
                  {n.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* History — the list when there's room for it, a single button that
          opens the sidebar back up when there isn't. */}
      {collapsed ? (
        <>
          <View style={[pad, { paddingTop: 4 }]}>
            <Pressable
              onPress={onExpand}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "navHistory")}
              style={({ pressed }) => [
                styles.navItem,
                styles.railBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Icon name="history" size={18} color={colors.textSoft} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
        >
          {groups.length === 0 ? (
            <Text style={[styles.emptyHistory, { color: colors.textFaint }]}>
              {t(lang, "noConversationsHint")}
            </Text>
          ) : (
            groups.map((g) => (
              <View key={g.bucket}>
                <Text style={[styles.groupLabel, { color: colors.textFaint }]}>
                  {t(lang, g.bucket === "yesterday" ? "yesterday" : g.bucket)}
                </Text>
                {g.items.map((thr) => (
                  <Pressable
                    key={thr._id}
                    onPress={() => onNavigate(`/chat/${thr._id}`)}
                    style={({ pressed }) => [
                      styles.threadRow,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.threadTitle, { color: colors.text }]}
                    >
                      {thr.title?.trim() || t(lang, "newConversation")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Account */}
      <View style={[styles.account, pad, { borderTopColor: colors.border }]}>
        <Pressable
          style={[styles.accountBtn, collapsed && styles.railBtn]}
          onPress={() => onNavigate("/settings")}
          accessibilityRole="link"
          accessibilityLabel={t(lang, "navSettings")}
        >
          <Avatar name={account?.name} size={30} uri={account?.avatarUrl} />
          {collapsed ? null : (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={[styles.accountName, { color: colors.text }]}
              >
                {account?.name?.trim() || "Dhee"}
              </Text>
              {account?.email ? (
                <Text
                  numberOfLines={1}
                  style={[styles.accountSub, { color: colors.textFaint }]}
                >
                  {account.email}
                </Text>
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** The rail's top slot: the Dhee mark at rest, the sidebar glyph under the
 *  pointer. Pressing it either way opens the sidebar. */
function RailToggle({
  onPress,
  label,
}: {
  onPress?: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.railToggle,
        {
          backgroundColor: hovered ? colors.surface2 : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon
        name={hovered ? "collapse" : "logo"}
        size={hovered ? 20 : 28}
        color={hovered ? colors.text : colors.accentStrong}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 12 },
  railPad: { paddingHorizontal: 9 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  brandRowRail: { justifyContent: "center", paddingHorizontal: 9 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontSize: 21, ...font.semibold },
  railToggle: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  // Collapsed rows drop their label, so they centre what's left and lose the
  // gap that was holding the two apart.
  railBtn: { justifyContent: "center", gap: 0, paddingHorizontal: 0 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  newBtnText: { fontSize: 15, ...font.semibold },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: radius.chip,
  },
  searchText: { fontSize: 14, ...font.regular },
  nav: {
    paddingTop: 10,
    paddingBottom: 4,
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
  },
  navLabel: { fontSize: 15, ...font.regular },
  groupLabel: {
    fontSize: 11.5,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 4,
    ...font.semibold,
  },
  threadRow: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  threadTitle: { fontSize: 14, ...font.regular },
  emptyHistory: {
    fontSize: 13.5,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  account: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 12,
  },
  accountBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  accountName: { fontSize: 14, ...font.medium },
  accountSub: { fontSize: 12 },
});
