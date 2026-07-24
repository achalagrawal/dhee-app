import { usePaginatedQuery } from "convex/react";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../../src/components/AppShell";
import { ThreadMenuSheet } from "../../src/components/ThreadMenuSheet";
import { Icon, IconButton } from "../../src/components/ui";
import { t } from "../../src/lib/i18n";
import { useShell } from "../../src/lib/shell";
import { useTheme } from "../../src/lib/ThemeContext";
import { type Colors, font, radius } from "../../src/lib/theme";
import { groupByTime, relativeTime } from "../../src/lib/time";
import { useLanguage } from "../../src/lib/useLanguage";

// The full History screen (grouped by recency). Search lives in the header
// pill (opens the shared search modal); each row's ⋯ opens the thread sheet.
export default function History() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const { openSearch } = useShell();
  const [menuThread, setMenuThread] = useState<{
    id: string;
    title?: string;
  } | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.listThreads,
    {},
    { initialNumItems: 30 },
  );

  const groups = useMemo(
    () => groupByTime(results, (thr) => thr._creationTime),
    [results],
  );

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <AppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t(lang, "navHistory")}</Text>

        <Pressable onPress={openSearch} style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.textFaint} />
          <Text style={styles.searchText}>
            {t(lang, "searchConversations")}
          </Text>
        </Pressable>

        {status === "LoadingFirstPage" ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t(lang, "noConversations")}</Text>
            <Text style={styles.emptyHint}>
              {t(lang, "noConversationsHint")}
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.bucket} style={styles.group}>
              <Text style={styles.groupLabel}>{t(lang, g.bucket)}</Text>
              <View style={styles.card}>
                {g.items.map((thr, i) => (
                  <Pressable
                    key={thr._id}
                    onPress={() => router.push(`/chat/${thr._id}`)}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && styles.rowBorder,
                      pressed && { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {thr.title?.trim() || t(lang, "newConversation")}
                      </Text>
                      {thr.summary ? (
                        <Text style={styles.rowSummary} numberOfLines={1}>
                          {thr.summary}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.rowTime}>
                      {relativeTime(thr._creationTime, lang)}
                    </Text>
                    <IconButton
                      name="dots"
                      size={34}
                      iconSize={16}
                      accessibilityLabel={t(lang, "conversationOptions")}
                      onPress={() =>
                        setMenuThread({ id: thr._id, title: thr.title })
                      }
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}

        {status === "CanLoadMore" ? (
          <Pressable onPress={() => loadMore(30)} style={styles.loadMore}>
            <Text style={styles.loadMoreText}>···</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ThreadMenuSheet
        threadId={menuThread?.id ?? null}
        currentTitle={menuThread?.title}
        onClose={() => setMenuThread(null)}
      />
    </AppShell>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    scroll: {
      maxWidth: 720,
      width: "100%",
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 48,
    },
    title: {
      fontSize: 30,
      letterSpacing: -0.5,
      color: colors.text,
      ...font.medium,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: 16,
      paddingVertical: 11,
      marginTop: 16,
      marginBottom: 8,
    },
    searchText: { color: colors.textFaint, fontSize: 14.5, ...font.regular },
    centered: { paddingVertical: 60, alignItems: "center" },
    empty: { paddingVertical: 60, alignItems: "center", gap: 6 },
    emptyTitle: { fontSize: 17, color: colors.text, ...font.regular },
    emptyHint: {
      fontSize: 15,
      color: colors.textSoft,
      textAlign: "center",
      ...font.regular,
    },
    group: { marginTop: 18 },
    groupLabel: {
      fontSize: 11.5,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: colors.textFaint,
      marginBottom: 8,
      marginLeft: 4,
      ...font.semibold,
    },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingLeft: 16,
      paddingRight: 8,
      paddingVertical: 13,
    },
    rowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowMain: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 15.5, color: colors.text, ...font.regular },
    rowSummary: {
      fontSize: 13,
      color: colors.textFaint,
      marginTop: 2,
      ...font.regular,
    },
    rowTime: { fontSize: 12.5, color: colors.textFaint, ...font.regular },
    loadMore: { alignItems: "center", paddingVertical: 20 },
    loadMoreText: { color: colors.textFaint, fontSize: 20, ...font.semibold },
  });
}
