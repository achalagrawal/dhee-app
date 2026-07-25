import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "../../../src/components/AppShell";
import { Composer } from "../../../src/components/Composer";
import { ConfirmDialog } from "../../../src/components/ConfirmDialog";
import { CrisisBanner } from "../../../src/components/CrisisBanner";
import { ThreadMenuSheet } from "../../../src/components/ThreadMenuSheet";
import { Icon, IconButton } from "../../../src/components/ui";
import { t } from "../../../src/lib/i18n";
import { useTheme } from "../../../src/lib/ThemeContext";
import { type Colors } from "../../../src/lib/theme";
import { font, radius, shadow } from "../../../src/lib/theme";
import { useLanguage } from "../../../src/lib/useLanguage";

// How far from the bottom the person can be and still have the view follow a
// streaming reply. Past this, they're reading something further up and the
// scroll-to-latest button takes over. Mirrors the mockup's `onMainScroll`.
const FOLLOW_THRESHOLD = 240;

// The reasons a turn can end badly. Limit-reached (#7) becomes a third once
// the daily allowance lands — it belongs in the composer dock rather than
// here, since its recovery is an upgrade rather than a retry.
type FailureReason = "error" | "rate";

// What "Try again" should do. A failure remembers which action it came from:
// re-sending the composer draft after a failed regenerate would silently do
// nothing, because the draft is empty — each cause retries itself.
type RetryTarget =
  "send" | "regenerate" | { messageId: string; prompt: string };

type Failure = { reason: FailureReason; retry: RetryTarget } | null;

// The backend surfaces rate limiting as a message rather than a code, so this
// is a best-effort read of it. Getting it wrong costs the person nothing worse
// than the generic wording.
function failureFrom(error: unknown): FailureReason {
  const text = String(error).toLowerCase();
  return text.includes("rate") || text.includes("too many") ? "rate" : "error";
}

export default function Chat() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { colors, mode } = useTheme();
  const lang = useLanguage();
  const listRef = useRef<FlatList<UIMessage>>(null);
  const [draft, setDraft] = useState("");
  // Why the last turn failed, or null if it didn't. A stop is deliberately not
  // one of these — see docs/build/specs/chat-loop.md §7. "rate" is separate
  // from "error" because "give it a few seconds" and "try again" ask the
  // person to do different things.
  const [failure, setFailure] = useState<Failure>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Auto-scroll follows the newest message only while the person is already
  // near the bottom. A reply streams in many chunks, so an unconditional
  // scroll-to-end would yank them back down every chunk while they read.
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  // The first landing jumps straight to the newest message rather than
  // animating through the whole transcript.
  const landedRef = useRef(false);
  // Set the instant Stop is pressed so the composer is usable again without
  // waiting for the abort to round-trip. Cleared when the reply actually
  // settles, which also covers the abort racing the stream finishing on its own.
  const [stopping, setStopping] = useState(false);
  // The message being rewritten, by UIMessage key, plus its working text.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // Held while the person confirms an edit that would drop more than one reply.
  const [pendingEdit, setPendingEdit] = useState<{
    messageId: string;
    prompt: string;
  } | null>(null);

  const sendMessage = useMutation(api.chat.sendMessage);
  const stopGeneration = useMutation(api.chat.stopGeneration);
  const regenerateReply = useMutation(api.chat.regenerate);
  const editAndResend = useMutation(api.chat.editAndResend);
  const setFeedback = useMutation(api.chat.setMessageFeedback);
  const { results } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );
  const feedback = useQuery(
    api.chat.threadFeedback,
    threadId ? { threadId } : "skip",
  );
  // Raised server-side, so it survives a reload and applies to every client.
  const crisisFlagged = useQuery(
    api.chat.threadCrisisFlag,
    threadId ? { threadId } : "skip",
  );
  const feedbackMap = useMemo(() => {
    const m = new Map<string, "up" | "down">();
    for (const f of feedback ?? []) m.set(f.messageId, f.rating);
    return m;
  }, [feedback]);

  const rate = useCallback(
    (messageId: string, next: "up" | "down") => {
      if (!threadId) return;
      const current = feedbackMap.get(messageId);
      void setFeedback({
        threadId,
        messageId,
        rating: current === next ? null : next,
      });
    },
    [threadId, feedbackMap, setFeedback],
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
    setFailure(null);
    try {
      await sendMessage({ threadId, prompt });
    } catch (e) {
      setDraft(prompt);
      setFailure({ reason: failureFrom(e), retry: "send" });
    }
  }, [draft, threadId, sendMessage]);

  // A stop is not a failure — no error card, and the partial reply keeps its
  // normal actions row. See docs/build/specs/chat-loop.md §4.
  const stop = useCallback(async () => {
    if (!threadId) return;
    setStopping(true);
    try {
      await stopGeneration({ threadId });
    } catch {
      // Nothing to stop, or it finished first. Either way the composer is
      // already back — there is nothing useful to tell the person here.
    }
  }, [threadId, stopGeneration]);

  useEffect(() => {
    if (!generating) setStopping(false);
  }, [generating]);

  // Try again: the last reply is replaced in place by a fresh one. Only
  // offered on the newest reply — regenerating mid-thread would fork history.
  const regenerate = useCallback(async () => {
    if (!threadId) return;
    setFailure(null);
    try {
      await regenerateReply({ threadId });
    } catch (e) {
      setFailure({ reason: failureFrom(e), retry: "regenerate" });
    }
  }, [threadId, regenerateReply]);

  const startEdit = useCallback((message: UIMessage) => {
    setEditingKey(message.key);
    setEditDraft(message.text);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditDraft("");
  }, []);

  const runEdit = useCallback(
    async (messageId: string, prompt: string) => {
      if (!threadId) return;
      cancelEdit();
      setFailure(null);
      try {
        await editAndResend({ threadId, messageId, prompt });
      } catch (e) {
        setFailure({ reason: failureFrom(e), retry: { messageId, prompt } });
      }
    },
    [threadId, editAndResend, cancelEdit],
  );

  // Dispatch "Try again" on the failure card back to whichever action failed.
  const retryFailure = useCallback(() => {
    if (!failure) return;
    const { retry } = failure;
    if (retry === "send") void send();
    else if (retry === "regenerate") void regenerate();
    else void runEdit(retry.messageId, retry.prompt);
  }, [failure, send, regenerate, runEdit]);

  // Editing forks the conversation: everything after the edited turn goes.
  // Losing only the reply that directly followed is the ordinary case and
  // proceeds quietly; losing more than that is worth stopping for.
  const submitEdit = useCallback(
    (message: UIMessage) => {
      const prompt = editDraft.trim();
      if (!prompt) return;
      const laterUserTurns = results.some(
        (m) => m.role === "user" && m.order > message.order,
      );
      if (laterUserTurns) {
        setPendingEdit({ messageId: message.id, prompt });
        cancelEdit();
        return;
      }
      void runEdit(message.id, prompt);
    },
    [editDraft, results, runEdit, cancelEdit],
  );

  const newThread = useCallback(() => router.replace("/home"), []);

  // Distance from the bottom, past which we stop following the stream and
  // offer the scroll-to-latest button instead. Matches the mockup's
  // `onMainScroll` threshold.
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const fromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    const next = fromBottom <= FOLLOW_THRESHOLD;
    atBottomRef.current = next;
    setAtBottom((prev) => (prev === next ? prev : next));
  }, []);

  // Called on every stream chunk (content grows) and when the keyboard opens
  // (viewport shrinks) — both must respect the same "only if they're already
  // down here" rule.
  const followIfAtBottom = useCallback(() => {
    if (!landedRef.current) {
      landedRef.current = true;
      listRef.current?.scrollToEnd({ animated: false });
      return;
    }
    if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const scrollToLatest = useCallback(() => {
    atBottomRef.current = true;
    setAtBottom(true);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

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
        {crisisFlagged ? (
          <View style={styles.bannerWrap}>
            <CrisisBanner lang={lang} />
          </View>
        ) : null}

        <View style={styles.flex}>
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
                rating={feedbackMap.get(item.key) ?? null}
                onRate={(next) => rate(item.key, next)}
                onRegenerate={generating ? undefined : regenerate}
                editing={editingKey === item.key}
                editDraft={editDraft}
                onEditDraft={setEditDraft}
                onStartEdit={generating ? undefined : () => startEdit(item)}
                onCancelEdit={cancelEdit}
                onSubmitEdit={() => submitEdit(item)}
              />
            )}
            contentContainerStyle={styles.list}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onContentSizeChange={followIfAtBottom}
            onLayout={followIfAtBottom}
            ListFooterComponent={
              <>
                {thinking ? (
                  <View style={styles.thinkingRow}>
                    <View style={styles.avatar}>
                      <Icon name="logo" size={16} color={colors.accent} />
                    </View>
                    <Text style={styles.thinkingText}>
                      {t(lang, "thinking")}
                    </Text>
                  </View>
                ) : null}
                {failure ? (
                  <View style={styles.errorCard}>
                    <View style={styles.errorBody}>
                      <Text style={styles.errorTitle}>
                        {t(
                          lang,
                          failure.reason === "rate"
                            ? "rateErrorTitle"
                            : "modelErrorTitle",
                        )}
                      </Text>
                      <Text style={styles.errorText}>
                        {t(
                          lang,
                          failure.reason === "rate"
                            ? "rateErrorBody"
                            : "modelErrorBody",
                        )}
                      </Text>
                    </View>
                    <Pressable onPress={retryFailure} style={styles.retryBtn}>
                      <Text style={styles.retryText}>
                        {t(lang, "tryAgain")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            }
          />

          {/* The way back down — what makes suppressing auto-scroll safe. */}
          {atBottom ? null : (
            <View style={styles.scrollBtnWrap} pointerEvents="box-none">
              <Pressable
                onPress={scrollToLatest}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "scrollToLatest")}
                style={({ pressed }) => [
                  styles.scrollBtn,
                  shadow(mode),
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Icon name="chevronDown" size={17} color={colors.textSoft} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.dock}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSubmit={send}
            placeholder={t(lang, "replyPlaceholder")}
            minHeight={24}
            generating={generating && !stopping}
            onStop={stop}
          />
          <Text style={styles.disclaimer}>{t(lang, "chatDisclaimer")}</Text>
        </View>
      </KeyboardAvoidingView>

      <ThreadMenuSheet
        threadId={menuOpen ? (threadId ?? null) : null}
        onClose={() => setMenuOpen(false)}
        onDeleted={() => router.replace("/home")}
      />

      <ConfirmDialog
        visible={pendingEdit !== null}
        lang={lang}
        title={t(lang, "editDropsRepliesTitle")}
        body={t(lang, "editDropsRepliesBody")}
        confirmLabel={t(lang, "editDropsRepliesConfirm")}
        onCancel={() => setPendingEdit(null)}
        onConfirm={() => {
          const edit = pendingEdit;
          setPendingEdit(null);
          if (edit) void runEdit(edit.messageId, edit.prompt);
        }}
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
  rating,
  onRate,
  onRegenerate,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
}: {
  message: UIMessage;
  isLast: boolean;
  colors: Colors;
  lang: ReturnType<typeof useLanguage>;
  styles: ReturnType<typeof makeStyles>;
  rating: "up" | "down" | null;
  onRate: (rating: "up" | "down") => void;
  /** Undefined while a reply is generating — try again is unavailable then. */
  onRegenerate?: () => void;
  editing: boolean;
  editDraft: string;
  onEditDraft: (text: string) => void;
  /** Undefined while a reply is generating — editing is unavailable then. */
  onStartEdit?: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
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

  if (isUser) {
    if (editing) {
      return (
        <View style={styles.userWrap}>
          <View style={styles.editCard}>
            <TextInput
              value={editDraft}
              onChangeText={onEditDraft}
              multiline
              autoFocus
              // Escape backs out without changing anything — the draft is
              // discarded, the original message is untouched.
              onKeyPress={(e) => {
                if (e.nativeEvent.key === "Escape") onCancelEdit();
              }}
              style={styles.editInput}
            />
            <View style={styles.editActions}>
              <Pressable onPress={onCancelEdit} style={styles.editCancelBtn}>
                <Text style={styles.editCancelText}>{t(lang, "cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={onSubmitEdit}
                disabled={!editDraft.trim()}
                style={[
                  styles.editSaveBtn,
                  !editDraft.trim() && styles.editSaveDisabled,
                ]}
              >
                <Text style={styles.editSaveText}>
                  {t(lang, "saveAndSend")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }
    if (!message.text.trim()) return null;
    return (
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
        <View style={styles.userMeta}>
          {onStartEdit ? (
            <Pressable
              onPress={onStartEdit}
              hitSlop={6}
              accessibilityLabel={t(lang, "editMessage")}
              style={styles.metaBtn}
            >
              <Icon name="edit" size={14} color={colors.textFaint} />
            </Pressable>
          ) : null}
          <Pressable onPress={copy} hitSlop={6} style={styles.metaBtn}>
            <Icon name="copy" size={14} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>
    );
  }

  // Nothing to show for an empty assistant turn, whichever way it got there.
  // Before text arrives the "considering…" indicator stands in; a turn that
  // failed before producing any text is reported by the failure card below the
  // transcript, not by an empty bubble offering copy and a thumbs-up.
  if (!message.text.trim()) return null;

  // The toolbar carries only what works. Save highlight (Journal, Epic 6),
  // Share (Epic 15) and Read aloud (Voice, Epic 12) used to render here and
  // pop "coming soon" — three of four buttons doing nothing, in the place
  // people touch most. Each comes back as a one-line change the day its epic
  // lands; their labels are still in i18n.ts waiting.
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
            <Pressable
              onPress={() => onRate("up")}
              hitSlop={4}
              accessibilityLabel={t(lang, "goodResponse")}
              style={styles.actionBtn}
            >
              <Icon
                name="thumbUp"
                size={15}
                color={rating === "up" ? colors.accentStrong : colors.textFaint}
              />
            </Pressable>
            <Pressable
              onPress={() => onRate("down")}
              hitSlop={4}
              accessibilityLabel={t(lang, "badResponse")}
              style={styles.actionBtn}
            >
              <Icon
                name="thumbDown"
                size={15}
                color={rating === "down" ? colors.danger : colors.textFaint}
              />
            </Pressable>
            {isLast && onRegenerate ? (
              <Pressable
                onPress={onRegenerate}
                hitSlop={4}
                accessibilityLabel={t(lang, "tryAgain")}
                style={styles.actionBtn}
              >
                <Icon name="refresh" size={15} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    bannerWrap: { paddingHorizontal: 16, paddingTop: 12 },
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
    // Editing a message you sent — the bubble becomes the editor in place.
    editCard: {
      width: "100%",
      maxWidth: "84%",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    editInput: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
      minHeight: 72,
      textAlignVertical: "top",
      ...font.regular,
    },
    editActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 8,
    },
    editCancelBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 15,
      paddingVertical: 7,
      borderRadius: radius.pill,
    },
    editCancelText: { color: colors.text, fontSize: 13.5, ...font.regular },
    editSaveBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 15,
      paddingVertical: 7,
      borderRadius: radius.pill,
    },
    editSaveDisabled: { opacity: 0.5 },
    editSaveText: { color: colors.onAccent, fontSize: 13.5, ...font.semibold },
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
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 13,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 14,
    },
    errorBody: { flex: 1, gap: 4 },
    errorTitle: {
      color: colors.text,
      fontSize: 14.5,
      ...font.semibold,
    },
    errorText: {
      color: colors.textSoft,
      fontSize: 14,
      lineHeight: 21,
      ...font.regular,
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
    // Scroll to latest — floats just above the composer dock.
    scrollBtnWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 8,
      alignItems: "center",
    },
    scrollBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
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
