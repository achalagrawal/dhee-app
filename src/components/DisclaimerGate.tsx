import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { font, radius, spacing } from "../lib/theme";
import { useLanguage } from "../lib/useLanguage";
import { DisclaimerList } from "./DisclaimerList";

// Catches the people onboarding can't: accounts created before the disclaimers
// existed, and accounts that acknowledged an older DISCLAIMER_VERSION. Mounted
// once on the signed-in group, so it covers every screen — including the first
// one someone lands on from a shared link.
//
// Deliberately not dismissible by tapping outside or by the back button. Every
// other modal in this app is; this one is the single point where someone is
// told the tool can be wrong, and a stray tap should not be able to spend it.
// The only way out is the button that says they read it.
export function DisclaimerGate() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const profile = useQuery(api.users.currentProfile);
  const acknowledge = useMutation(api.users.acknowledgeDisclaimers);
  const [busy, setBusy] = useState(false);

  // `undefined` is "still loading" and `null` is "signed out" — neither is a
  // reason to interrupt someone. Only a loaded profile that has not
  // acknowledged opens this.
  const open = profile != null && !profile.disclaimersAcked;
  // Onboarding shows the same six points and its button acknowledges them, so
  // opening here as well would show them twice in a row.
  if (!open || !profile.onboarded) return null;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await acknowledge({});
    } finally {
      // The query going true is what closes this. On failure the gate stays,
      // which is the right way for it to fail.
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              {t(lang, "disclaimersTitle")}
            </Text>
            <Text style={[styles.intro, { color: colors.textSoft }]}>
              {t(lang, "disclaimersIntro")}
            </Text>
            <DisclaimerList lang={lang} compact />
          </ScrollView>
          <Pressable
            onPress={() => void accept()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              busy && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.buttonLabel, { color: colors.onAccent }]}>
              {t(lang, "disclaimersAck")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    // Caps the card on a short window so the button never leaves the screen —
    // the list scrolls inside instead.
    maxHeight: "88%",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  scroll: { gap: 12, paddingBottom: 4 },
  title: { fontSize: 21, ...font.semibold },
  intro: { fontSize: 14.5, lineHeight: 21, marginBottom: 4, ...font.regular },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { fontSize: 16, ...font.medium },
});
