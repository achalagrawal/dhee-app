import { useMutation, usePaginatedQuery } from "convex/react";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { t } from "../../src/lib/i18n";
import { colors, font, radius, spacing } from "../../src/lib/theme";
import { relativeTime } from "../../src/lib/time";
import { useLanguage } from "../../src/lib/useLanguage";

export default function Threads() {
  const lang = useLanguage();
  const startThread = useMutation(api.chat.startThread);
  const renameThread = useMutation(api.chat.renameThread);
  const deleteThread = useMutation(api.chat.deleteThread);
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.listThreads,
    {},
    { initialNumItems: 25 },
  );

  // Which row has its actions revealed, which is being renamed, and which is
  // pending a delete confirmation. Only one at a time by design.
  const [openId, setOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const newConversation = async () => {
    const threadId = await startThread();
    router.push(`/chat/${threadId}`);
  };

  const commitRename = (threadId: string) => {
    const title = draftTitle.trim();
    if (title) void renameThread({ threadId, title });
    setRenamingId(null);
    setOpenId(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "conversations")}</Text>
        <Link href="/settings" asChild>
          <Pressable hitSlop={12}>
            <Text style={styles.headerLink}>{t(lang, "settings")}</Text>
          </Pressable>
        </Link>
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
          renderItem={({ item }) => {
            const isRenaming = renamingId === item._id;
            const isOpen = openId === item._id;

            if (isRenaming) {
              return (
                <View style={styles.row}>
                  <TextInput
                    style={styles.renameInput}
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    onSubmitEditing={() => commitRename(item._id)}
                    autoFocus
                    returnKeyType="done"
                    maxLength={120}
                  />
                  <View style={styles.renameActions}>
                    <Pressable
                      onPress={() => setRenamingId(null)}
                      hitSlop={8}
                      style={styles.action}
                    >
                      <Text style={styles.actionLabel}>
                        {t(lang, "cancel")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => commitRename(item._id)}
                      hitSlop={8}
                      style={styles.action}
                    >
                      <Text style={styles.actionPrimary}>
                        {t(lang, "save")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            }

            return (
              <Pressable
                onPress={() =>
                  isOpen ? setOpenId(null) : router.push(`/chat/${item._id}`)
                }
                onLongPress={() => setOpenId(item._id)}
                delayLongPress={300}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title?.trim() || t(lang, "newConversation")}
                  </Text>
                  <Text style={styles.rowTime}>
                    {relativeTime(item._creationTime, lang)}
                  </Text>
                </View>
                {item.summary ? (
                  <Text style={styles.rowSummary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}

                {isOpen ? (
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => {
                        setDraftTitle(item.title ?? "");
                        setRenamingId(item._id);
                      }}
                      hitSlop={8}
                      style={styles.action}
                    >
                      <Text style={styles.actionLabel}>
                        {t(lang, "renameConversation")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setConfirmId(item._id)}
                      hitSlop={8}
                      style={styles.action}
                    >
                      <Text style={styles.actionDanger}>
                        {t(lang, "deleteConversation")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={newConversation}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaLabel}>{t(lang, "newConversation")}</Text>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirmId !== null}
        lang={lang}
        title={t(lang, "deleteConversation")}
        body={t(lang, "deleteConversationBody")}
        onConfirm={() => {
          if (confirmId) void deleteThread({ threadId: confirmId });
          setConfirmId(null);
          setOpenId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 28, color: colors.text, ...font.light },
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
  rowHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowTitle: { flex: 1, fontSize: 17, color: colors.text, ...font.regular },
  rowTime: { fontSize: 13, color: colors.textMuted, ...font.regular },
  rowSummary: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    ...font.regular,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  renameInput: {
    fontSize: 17,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 4,
    ...font.regular,
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  action: { paddingVertical: 4 },
  actionLabel: { fontSize: 15, color: colors.textMuted, ...font.regular },
  actionPrimary: { fontSize: 15, color: colors.accent, ...font.medium },
  actionDanger: { fontSize: 15, color: colors.danger, ...font.regular },
  footer: {
    padding: spacing.md,
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
  ctaLabel: { color: "#fff", fontSize: 17, ...font.medium },
});
