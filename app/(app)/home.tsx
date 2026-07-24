import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../../src/components/AppShell";
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

  const startThread = useMutation(api.chat.startThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    // True "don't save" incognito needs a non-persisting chat path on the
    // backend; until that exists, refuse to send rather than silently save a
    // conversation the banner promised wouldn't be kept.
    if (incognito) {
      Alert.alert(t(lang, "incognito"), t(lang, "comingSoon"));
      return;
    }
    setBusy(true);
    try {
      const threadId = await startThread();
      await sendMessage({ threadId, prompt });
      setDraft("");
      router.push(`/chat/${threadId}` as never);
    } catch {
      setBusy(false);
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
