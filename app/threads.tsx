import { useAuthActions } from "@convex-dev/auth/react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Link, router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../convex/_generated/api";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { t } from "../src/lib/i18n";
import { colors, font, radius, spacing } from "../src/lib/theme";
import { useLanguage } from "../src/lib/useLanguage";

export default function Threads() {
  const lang = useLanguage();
  const { signOut } = useAuthActions();
  const startThread = useMutation(api.chat.startThread);
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.listThreads,
    {},
    { initialNumItems: 25 },
  );

  const newConversation = async () => {
    const threadId = await startThread();
    router.push(`/chat/${threadId}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "conversations")}</Text>
        <View style={styles.headerActions}>
          <Link href="/understanding" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.headerLink}>{t(lang, "understanding")}</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <OfflineBanner lang={lang} />

      {status === "LoadingFirstPage" ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t(lang, "noConversations")}</Text>
          <Text style={styles.emptyHint}>{t(lang, "noConversationsHint")}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(thread) => thread._id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (status === "CanLoadMore") loadMore(25);
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/chat/${item._id}`)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title?.trim() || t(lang, "newConversation")}
              </Text>
              {item.summary ? (
                <Text style={styles.rowSummary} numberOfLines={2}>
                  {item.summary}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={newConversation}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaLabel}>{t(lang, "newConversation")}</Text>
        </Pressable>
        <Pressable onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutLabel}>{t(lang, "signOut")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  title: { fontSize: 28, fontWeight: "300", color: colors.text, ...font.light },
  headerActions: { flexDirection: "row" },
  headerLink: { fontSize: 15, color: colors.accent, ...font.regular },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: 17, color: colors.text, ...font.regular },
  emptyHint: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    ...font.regular,
  },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowPressed: { opacity: 0.7 },
  rowTitle: { fontSize: 17, color: colors.text, ...font.regular },
  rowSummary: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    ...font.regular,
  },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { color: "#fff", fontSize: 17, fontWeight: "500", ...font.medium },
  signOut: { alignItems: "center", paddingVertical: spacing.xs },
  signOutLabel: { color: colors.textMuted, fontSize: 14, ...font.regular },
});
