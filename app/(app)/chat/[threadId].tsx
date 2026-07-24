import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "../../../src/components/AppShell";
import { Composer } from "../../../src/components/Composer";
import { ThreadMenuSheet } from "../../../src/components/ThreadMenuSheet";
import { Icon, IconButton, type IconName } from "../../../src/components/ui";
import { t } from "../../../src/lib/i18n";
import { useTheme } from "../../../src/lib/ThemeContext";
import { type Colors } from "../../../src/lib/theme";
import { font, radius } from "../../../src/lib/theme";
import { useLanguage } from "../../../src/lib/useLanguage";

export default function Chat() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { colors } = useTheme();
  const lang = useLanguage();
  const listRef = useRef<FlatList<UIMessage>>(null);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const sendMessage = useMutation(api.chat.sendMessage);
  const { results } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const generating = useMemo(
    () =>
      results.some((m) => m.status === "streaming" || m.status === "pending"),
    [results],
  );

  // "Considering…" only before the assistant has produced any text.
  const thinking = useMemo(() => {
    const last = results[results.length - 1];
    if (!last) return false;
    if (last.role === "user") return true;
    return (
      last.role === "assistant" &&
      (last.status === "pending" || last.status === "streaming") &&
      !last.text.trim()
    );
  }, [results]);

  const send = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || !threadId) return;
    setDraft("");
    setFailed(false);
    try {
      await sendMessage({ threadId, prompt });
    } catch {
      setDraft(prompt);
      setFailed(true);
    }
  }, [draft, threadId, sendMessage]);

  const newThread = useCallback(() => router.replace("/home"), []);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <AppShell
      right={
        <>
          <IconButton
            name="plus"
            variant="surface"
            size={40}
            accessibilityLabel={t(lang, "newConversation")}
            onPress={newThread}
          />
          <IconButton
            name="dots"
            variant="surface"
            size={40}
            accessibilityLabel={t(lang, "conversationOptions")}
            onPress={() => setMenuOpen(true)}
          />
        </>
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={results}
          keyExtractor={(m) => m.key}
          renderItem={({ item, index }) => (
            <Message
              message={item}
              isLast={index === results.length - 1}
              colors={colors}
              lang={lang}
              styles={styles}
            />
          )}
          contentContainerStyle={styles.list}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListFooterComponent={
            <>
              {thinking ? (
                <View style={styles.thinkingRow}>
                  <View style={styles.avatar}>
                    <Icon name="logo" size={16} color={colors.accent} />
                  </View>
                  <Text style={styles.thinkingText}>{t(lang, "thinking")}</Text>
                </View>
              ) : null}
              {failed ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorTitle}>
                    {t(lang, "somethingWentWrong")}
                  </Text>
                  <Pressable onPress={send} style={styles.retryBtn}>
                    <Text style={styles.retryText}>{t(lang, "tryAgain")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          }
        />

        <View style={styles.dock}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSubmit={send}
            placeholder={t(lang, "replyPlaceholder")}
            minHeight={24}
            generating={generating}
            onStop={() => Alert.alert(t(lang, "stop"), t(lang, "comingSoon"))}
          />
          <Text style={styles.disclaimer}>{t(lang, "chatDisclaimer")}</Text>
        </View>
      </KeyboardAvoidingView>

      <ThreadMenuSheet
        threadId={menuOpen ? (threadId ?? null) : null}
        onClose={() => setMenuOpen(false)}
        onDeleted={() => router.replace("/home")}
      />
    </AppShell>
  );
}

function Message({
  message,
  isLast,
  colors,
  lang,
  styles,
}: {
  message: UIMessage;
  isLast: boolean;
  colors: Colors;
  lang: ReturnType<typeof useLanguage>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const streaming = message.status === "streaming";
  const done = message.status === "success" || message.status === "failed";

  const copy = async () => {
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const soon = (label: string) => Alert.alert(label, t(lang, "comingSoon"));

  if (isUser) {
    if (!message.text.trim()) return null;
    return (
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
        <View style={styles.userMeta}>
          <Pressable onPress={copy} hitSlop={6} style={styles.metaBtn}>
            <Icon name="copy" size={14} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>
    );
  }

  // Before the assistant has produced text, the "considering…" indicator
  // stands in — don't also render an empty bubble with a lone caret.
  if (!message.text.trim() && !done) return null;

  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    {
      icon: "thumbUp",
      label: t(lang, "goodResponse"),
      onPress: () => soon(t(lang, "goodResponse")),
    },
    {
      icon: "thumbDown",
      label: t(lang, "badResponse"),
      onPress: () => soon(t(lang, "badResponse")),
    },
    {
      icon: "bookmark",
      label: t(lang, "saveHighlight"),
      onPress: () => soon(t(lang, "saveHighlight")),
    },
    {
      icon: "share",
      label: t(lang, "shareLabel"),
      onPress: () => soon(t(lang, "shareLabel")),
    },
    {
      icon: "speaker",
      label: t(lang, "speak"),
      onPress: () => soon(t(lang, "speak")),
    },
  ];
  if (isLast) {
    actions.push({
      icon: "refresh",
      label: t(lang, "tryAgain"),
      onPress: () => soon(t(lang, "tryAgain")),
    });
  }

  return (
    <View style={styles.botRow}>
      <View style={styles.avatar}>
        <Icon name="logo" size={16} color={colors.accent} />
      </View>
      <View style={styles.botBody}>
        <Text style={styles.botText}>
          {message.text}
          {streaming ? <Text style={styles.caret}>▋</Text> : null}
        </Text>
        {done ? (
          <View style={styles.actionsRow}>
            <Pressable onPress={copy} hitSlop={4} style={styles.copyBtn}>
              <Icon name="copy" size={15} color={colors.textFaint} />
              <Text style={styles.copyLabel}>
                {copied ? t(lang, "copied") : t(lang, "copy")}
              </Text>
            </Pressable>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                hitSlop={4}
                accessibilityLabel={a.label}
                style={styles.actionBtn}
              >
                <Icon name={a.icon} size={15} color={colors.textFaint} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    list: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
      gap: 22,
    },
    // User
    userWrap: { alignItems: "flex-end", gap: 8 },
    userBubble: {
      maxWidth: "84%",
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 4,
      borderBottomLeftRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    userText: {
      color: colors.text,
      fontSize: 16.5,
      lineHeight: 25,
      ...font.regular,
    },
    userMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaBtn: { padding: 5, borderRadius: 7 },
    // Assistant
    botRow: { flexDirection: "row", gap: 12 },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    botBody: { flex: 1, minWidth: 0 },
    botText: {
      color: colors.text,
      fontSize: 16.5,
      lineHeight: 27,
      ...font.regular,
    },
    caret: { color: colors.accent, fontSize: 16 },
    actionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 10,
      flexWrap: "wrap",
    },
    copyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    copyLabel: { color: colors.textFaint, fontSize: 12.5, ...font.regular },
    actionBtn: { padding: 8, borderRadius: 8 },
    // Thinking / error
    thinkingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    thinkingText: {
      color: colors.textFaint,
      fontSize: 15,
      fontStyle: "italic",
      ...font.regular,
    },
    errorCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 13,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 14,
    },
    errorTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 14.5,
      ...font.semibold,
    },
    retryBtn: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.pill,
    },
    retryText: { color: colors.text, fontSize: 13.5, ...font.medium },
    // Dock
    dock: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: Platform.OS === "ios" ? 8 : 12,
      backgroundColor: colors.bg,
    },
    disclaimer: {
      textAlign: "center",
      color: colors.textFaint,
      fontSize: 12,
      marginTop: 9,
      ...font.regular,
    },
  });
}
