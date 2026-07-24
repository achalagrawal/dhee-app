import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { type Language, t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { font, radius, spacing } from "../lib/theme";

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
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallow taps on the card so only the backdrop dismisses. */}
        <Pressable
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {body ? (
            <Text style={[styles.body, { color: colors.textSoft }]}>
              {body}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.cancelLabel, { color: colors.textSoft }]}>
                {t(lang, "cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.danger },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.dangerLabel, { color: colors.onAccent }]}>
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
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 17, ...font.semibold },
  body: { fontSize: 15, lineHeight: 21, ...font.regular },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.7 },
  cancelLabel: { fontSize: 15, ...font.regular },
  dangerLabel: { fontSize: 15, ...font.medium },
});
