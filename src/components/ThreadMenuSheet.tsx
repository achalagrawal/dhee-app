import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { font, radius } from "../lib/theme";
import { useLanguage } from "../lib/useLanguage";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon, type IconName } from "./ui";

type Props = {
  threadId: string | null;
  currentTitle?: string;
  starred?: boolean;
  pinned?: boolean;
  onClose: () => void;
  /** Called after a delete so the caller can navigate away if needed. */
  onDeleted?: (threadId: string) => void;
};

// Bottom-sheet options for a conversation. Rename, Delete, Star and Pin are
// wired to their mutations; Share is still pending (no backend yet).
export function ThreadMenuSheet({
  threadId,
  currentTitle,
  starred = false,
  pinned = false,
  onClose,
  onDeleted,
}: Props) {
  const { colors } = useTheme();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const renameThread = useMutation(api.chat.renameThread);
  const deleteThread = useMutation(api.chat.deleteThread);
  const setStarred = useMutation(api.chat.setStarred);
  const setPinned = useMutation(api.chat.setPinned);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset transient state whenever a different thread's sheet opens.
  useEffect(() => {
    if (threadId) {
      setRenaming(false);
      setDraft(currentTitle ?? "");
      setConfirmDelete(false);
    }
  }, [threadId, currentTitle]);

  const visible = threadId !== null;
  const soon = (label: string) => Alert.alert(label, t(lang, "comingSoon"));

  const commitRename = () => {
    const title = draft.trim();
    if (title && threadId) void renameThread({ threadId, title });
    onClose();
  };

  const rows: {
    icon: IconName;
    label: string;
    onPress: () => void;
    danger?: boolean;
    filled?: boolean;
  }[] = [
    {
      icon: "bookmark",
      label: t(lang, starred ? "unstar" : "star"),
      filled: starred,
      onPress: () => {
        if (threadId) void setStarred({ threadId, starred: !starred });
        onClose();
      },
    },
    {
      icon: "history",
      label: t(lang, pinned ? "unpin" : "pin"),
      onPress: () => {
        if (threadId) void setPinned({ threadId, pinned: !pinned });
        onClose();
      },
    },
    {
      icon: "edit",
      label: t(lang, "rename"),
      onPress: () => setRenaming(true),
    },
    {
      icon: "share",
      label: t(lang, "shareLabel"),
      onPress: () => soon(t(lang, "shareLabel")),
    },
    {
      icon: "trash",
      label: t(lang, "deleteConversation"),
      onPress: () => setConfirmDelete(true),
      danger: true,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bg,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View
            style={[styles.grabber, { backgroundColor: colors.borderStrong }]}
          />

          {renaming ? (
            <View style={styles.renameWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t(lang, "renamePlaceholder")}
                placeholderTextColor={colors.textFaint}
                autoFocus
                onSubmitEditing={commitRename}
                returnKeyType="done"
                maxLength={120}
                style={[
                  styles.renameInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              <View style={styles.renameActions}>
                <Pressable onPress={onClose} style={styles.renameBtn}>
                  <Text
                    style={[styles.renameBtnText, { color: colors.textSoft }]}
                  >
                    {t(lang, "cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={commitRename}
                  style={[styles.renameBtn, { backgroundColor: colors.accent }]}
                >
                  <Text
                    style={[styles.renameBtnText, { color: colors.onAccent }]}
                  >
                    {t(lang, "save")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            rows.map((row) => (
              <Pressable
                key={row.label}
                onPress={row.onPress}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? colors.surface2 : "transparent",
                  },
                ]}
              >
                <Icon
                  name={row.icon}
                  size={18}
                  color={
                    row.danger
                      ? colors.danger
                      : row.filled
                        ? colors.accentStrong
                        : colors.textSoft
                  }
                  filled={row.filled}
                />
                <Text
                  style={[
                    styles.rowLabel,
                    { color: row.danger ? colors.danger : colors.text },
                  ]}
                >
                  {row.label}
                </Text>
              </Pressable>
            ))
          )}
        </Pressable>
      </Pressable>

      <ConfirmDialog
        visible={confirmDelete}
        lang={lang}
        title={t(lang, "deleteConversation")}
        body={t(lang, "deleteConversationBody")}
        onConfirm={() => {
          const id = threadId;
          setConfirmDelete(false);
          if (id) {
            void deleteThread({ threadId: id });
            onDeleted?.(id);
          }
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  rowLabel: { fontSize: 16, ...font.regular },
  renameWrap: { paddingHorizontal: 6, paddingVertical: 6, gap: 12 },
  renameInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    ...font.regular,
  },
  renameActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  renameBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  renameBtnText: { fontSize: 14, ...font.medium },
});
