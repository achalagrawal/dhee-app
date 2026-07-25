import { type UIMessage } from "@convex-dev/agent/react";
import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { t } from "../../lib/i18n";
import { useTheme } from "../../lib/ThemeContext";
import { type Colors, font, radius } from "../../lib/theme";
import { useLanguage } from "../../lib/useLanguage";
import { DheeAvatar } from "./DheeAvatar";
import { Icon } from "../ui";

// One transcript entry: a user bubble (with edit-in-place) or an assistant
// reply (with the actions row). Owns its own theme and styles so the screen
// passes data and handlers, not styling.
//
// The behavioral rules live in docs/build/specs/chat-loop.md — the caret only
// while streaming (§2), no empty assistant bubbles (§2), edit semantics (§6),
// try-again on the last reply only (§5).

/** Present while this message is being rewritten in place. */
export type EditState = {
  draft: string;
  onDraft: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function MessageBubble({
  message,
  isLast,
  rating,
  editing,
  onRate,
  onRegenerate,
  onStartEdit,
}: {
  message: UIMessage;
  isLast: boolean;
  rating: "up" | "down" | null;
  /** Non-null while this message is the one being edited. */
  editing: EditState | null;
  onRate: (rating: "up" | "down") => void;
  /** Undefined while a reply is generating — try again is unavailable then. */
  onRegenerate?: () => void;
  /** Undefined while a reply is generating — editing is unavailable then. */
  onStartEdit?: () => void;
}) {
  const { colors } = useTheme();
  const lang = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [copied, setCopied] = useState(false);

  const streaming = message.status === "streaming";
  const done = message.status === "success" || message.status === "failed";

  const copy = async () => {
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (message.role === "user") {
    if (editing) {
      return (
        <View style={styles.userWrap}>
          <View style={styles.editCard}>
            <TextInput
              value={editing.draft}
              onChangeText={editing.onDraft}
              multiline
              autoFocus
              // Escape backs out without changing anything — the draft is
              // discarded, the original message is untouched.
              onKeyPress={(e) => {
                if (e.nativeEvent.key === "Escape") editing.onCancel();
              }}
              style={styles.editInput}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={editing.onCancel}
                style={styles.editCancelBtn}
              >
                <Text style={styles.editCancelText}>{t(lang, "cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={editing.onSubmit}
                disabled={!editing.draft.trim()}
                style={[
                  styles.editSaveBtn,
                  !editing.draft.trim() && styles.editSaveDisabled,
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
      <DheeAvatar />
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
  });
}
