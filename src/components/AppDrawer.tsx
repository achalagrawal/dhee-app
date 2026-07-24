import { usePaginatedQuery, useQuery } from "convex/react";
import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { t } from "../lib/i18n";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { font, radius } from "../lib/theme";
import { groupByTime } from "../lib/time";
import { useLanguage } from "../lib/useLanguage";
import { Avatar, Icon, type IconName } from "./ui";

const MAX_W = 330;

// Slide-in navigation drawer (the prototype's sidebar, in its mobile
// overlay form). Renders once at the layout level; open/close state lives in
// the shell context so any header can trigger it.
export function AppDrawer() {
  const { colors } = useTheme();
  const { drawerOpen, closeDrawer, openSearch } = useShell();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const width = Math.min(Dimensions.get("window").width * 0.86, MAX_W);
  const translate = useRef(new Animated.Value(-width)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  const account = useQuery(api.users.accountSummary);
  const { results: threads } = usePaginatedQuery(
    api.chat.listThreads,
    {},
    { initialNumItems: 20 },
  );

  useEffect(() => {
    if (drawerOpen) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translate, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(scrim, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translate, {
          toValue: -width,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(scrim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [drawerOpen, mounted, translate, scrim, width]);

  if (!mounted) return null;

  const go = (path: string) => {
    closeDrawer();
    router.push(path as never);
  };

  const navItems: { icon: IconName; label: string; path: string }[] = [
    { icon: "logo", label: t(lang, "navHome"), path: "/home" },
    { icon: "history", label: t(lang, "navHistory"), path: "/threads" },
    { icon: "book", label: t(lang, "navMemory"), path: "/understanding" },
    { icon: "sparkle", label: t(lang, "navSettings"), path: "/settings" },
  ];

  const groups = groupByTime(threads, (thr) => thr._creationTime);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width,
            backgroundColor: colors.surface,
            borderRightColor: colors.border,
            paddingTop: insets.top,
            transform: [{ translateX: translate }],
          },
        ]}
      >
        {/* Brand row */}
        <View style={styles.brandRow}>
          <Pressable style={styles.brand} onPress={() => go("/home")}>
            <Icon name="logo" size={28} color={colors.accent} />
            <Text style={[styles.brandName, { color: colors.text }]}>Dhee</Text>
          </Pressable>
          <Pressable onPress={closeDrawer} hitSlop={10}>
            <Icon name="close" size={18} color={colors.textSoft} />
          </Pressable>
        </View>

        {/* New conversation */}
        <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
          <Pressable
            onPress={() => go("/home")}
            style={({ pressed }) => [
              styles.newBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Icon name="plus" size={16} color={colors.onAccent} />
            <Text style={[styles.newBtnText, { color: colors.onAccent }]}>
              {t(lang, "newConversation")}
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <Pressable
            onPress={openSearch}
            style={({ pressed }) => [
              styles.searchBtn,
              { backgroundColor: colors.surface2, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Icon name="search" size={15} color={colors.textSoft} />
            <Text style={[styles.searchText, { color: colors.textSoft }]}>
              {t(lang, "searchConversations")}
            </Text>
          </Pressable>
        </View>

        {/* Nav */}
        <View style={styles.nav}>
          {navItems.map((n) => {
            const active = pathname === n.path;
            return (
              <Pressable
                key={n.path}
                onPress={() => go(n.path)}
                style={({ pressed }) => [
                  styles.navItem,
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
                <Text
                  style={[
                    styles.navLabel,
                    { color: colors.text },
                    active && font.semibold,
                  ]}
                >
                  {n.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* History */}
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
                    onPress={() => go(`/chat/${thr._id}`)}
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

        {/* Account */}
        <View
          style={[
            styles.account,
            {
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <Pressable style={styles.accountBtn} onPress={() => go("/settings")}>
            <Avatar name={account?.name} size={30} />
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
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(0,0,0,0.4)", zIndex: 60 },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    zIndex: 61,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontSize: 21, ...font.semibold },
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
    paddingHorizontal: 12,
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
    paddingHorizontal: 12,
    paddingTop: 12,
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
