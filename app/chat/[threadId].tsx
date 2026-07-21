import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { useMutation } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { t } from "../../src/lib/i18n";
import { colors, font, radius, spacing } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

export default function Chat() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const lang = useLanguage();
  const listRef = useRef<FlatList<UIMessage>>(null);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  const sendMessage = useMutation(api.chat.sendMessage);
  const { results, status } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const send = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || !threadId) return;
    setDraft("");
    setFailed(null);
    try {
      await sendMessage({ threadId, prompt });
    } catch {
      // Keep the text so the person doesn't lose what they wrote.
      setDraft(prompt);
      setFailed(t(lang, "somethingWentWrong"));
    }
  }, [draft, threadId, sendMessage, lang]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ {t(lang, "conversations")}</Text>
          </Pressable>
        </View>

        <OfflineBanner lang={lang} />

        {status === "LoadingFirstPage" ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : results.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.empty}>{t(lang, "emptyChat")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={results}
            keyExtractor={(m) => m.key}
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerStyle={styles.list}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        {failed ? <Text style={styles.error}>{failed}</Text> : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={t(lang, "inputPlaceholder")}
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              !draft.trim() && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
          >
            <Text style={styles.sendLabel}>{t(lang, "send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  if (!message.text.trim()) return null;
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text style={isUser ? styles.textUser : styles.textAssistant}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.accent, ...font.regular },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  empty: {
    fontSize: 17,
    color: colors.textMuted,
    textAlign: "center",
    ...font.regular,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowAssistant: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "88%",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  bubbleUser: { backgroundColor: colors.userBubble },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textUser: {
    color: colors.userBubbleText,
    fontSize: 16,
    lineHeight: 24,
    ...font.regular,
  },
  textAssistant: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    ...font.regular,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
    paddingBottom: spacing.xs,
    ...font.regular,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
    ...font.regular,
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed: { opacity: 0.85 },
  sendLabel: { color: "#fff", fontSize: 16, fontWeight: "500", ...font.medium },
});
