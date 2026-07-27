import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../../src/components/AppShell";
import {
  FailureCard,
  type FailureReason,
  failureFrom,
} from "../../src/components/chat/FailureCard";
import { Composer } from "../../src/components/Composer";
import { Icon } from "../../src/components/ui";
import { t } from "../../src/lib/i18n";
import { useShell } from "../../src/lib/shell";
import { useTheme } from "../../src/lib/ThemeContext";
import { font } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

// Greeting + composer landing. Sending starts a real thread and hands off to
// the chat screen. Incognito is surfaced here (banner note); its no-save
// behaviour is handled in the chat flow.
export default function Home() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const { incognito } = useShell();
  const account = useQuery(api.users.accountSummary);

  const usage = useQuery(api.chat.usage);
  const sendMessage = useMutation(api.chat.sendMessage);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FailureReason | null>(null);

  const outOfMessages = usage?.remaining === 0;

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    // Incognito hands the prompt to the ephemeral chat, which never touches a
    // thread — nothing about it is saved.
    if (incognito) {
      setDraft("");
      router.push({ pathname: "/chat/incognito", params: { prompt } });
      return;
    }
    if (outOfMessages) {
      setFailed("limit");
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      // The thread comes back from the send itself, so a refusal leaves no
      // empty conversation in the history.
      const threadId = await sendMessage({ prompt });
      setDraft("");
      router.push(`/chat/${threadId}` as never);
    } catch (e) {
      setBusy(false);
      setFailed(failureFrom(e));
    }
  };

  return (
    <AppShell showIncognito>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Icon name="logo" size={40} color={colors.accent} />
            <Text style={[styles.greeting, { color: colors.text }]}>
              {greeting(lang, account?.name)}
            </Text>
          </View>

          <Composer
            value={draft}
            onChangeText={setDraft}
            onSubmit={send}
            placeholder={t(lang, "homePlaceholder")}
            minHeight={48}
          />

          {/* Shown before anyone types, not just after a refused send —
              knowing the day is spent is the point of the card. */}
          {(failed ?? (outOfMessages ? "limit" : null)) ? (
            <FailureCard reason={failed ?? "limit"} />
          ) : null}

          {incognito ? (
            <View style={styles.incognitoNote}>
              <Icon name="incognito" size={15} color={colors.textSoft} />
              <Text style={[styles.incognitoText, { color: colors.textSoft }]}>
                {t(lang, "incognitoHomeNote")}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

function greeting(lang: Parameters<typeof t>[0], name?: string): string {
  const hour = new Date().getHours();
  const base =
    hour < 12
      ? t(lang, "greetingMorning")
      : hour < 17
        ? t(lang, "greetingAfternoon")
        : t(lang, "greetingEvening");
  const trimmed = name?.trim();
  if (trimmed) return `${base}, ${trimmed}`;
  return base;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: "16%",
    paddingBottom: 40,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 24,
  },
  greeting: {
    fontSize: 30,
    letterSpacing: -0.5,
    ...font.medium,
  },
  incognitoNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 14,
  },
  incognitoText: { fontSize: 13.5, ...font.regular },
});
