import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { type Language, t } from "../lib/i18n";
import { colors, font, radius, spacing } from "../lib/theme";

// React Native's Alert has no web implementation, and every destructive
// action in this app needs a confirmation that works on all three targets.
export function ConfirmDialog({
  visible,
  lang,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  lang: Language;
  title: string;
  body?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallow taps on the card so only the backdrop dismisses. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelLabel}>{t(lang, "cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                styles.danger,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dangerLabel}>
                {confirmLabel ?? t(lang, "confirm")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,27,25,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 17, color: colors.text, ...font.medium },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 21,
    ...font.regular,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  pressed: { opacity: 0.7 },
  danger: { backgroundColor: colors.danger },
  cancelLabel: { fontSize: 15, color: colors.textMuted, ...font.regular },
  dangerLabel: { fontSize: 15, color: "#fff", ...font.medium },
});
