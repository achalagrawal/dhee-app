import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../../src/components/AppShell";
import { Composer } from "../../src/components/Composer";
import { Icon } from "../../src/components/ui";
import { greetingFontSize, greetingText } from "../../src/lib/greeting";
import { t } from "../../src/lib/i18n";
import { useShell } from "../../src/lib/shell";
import { useTheme } from "../../src/lib/ThemeContext";
import { font } from "../../src/lib/theme";
import { useAttachments } from "../../src/lib/useAttachments";
import { useLanguage } from "../../src/lib/useLanguage";

// Greeting + composer landing. Sending starts a real thread and hands off to
// the chat screen. Incognito is surfaced here (banner note); its no-save
// behaviour is handled in the chat flow.
export default function Home() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const { incognito } = useShell();
  const account = useQuery(api.users.accountSummary);
  const { width } = useWindowDimensions();

  const startThread = useMutation(api.chat.startThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const photos = useAttachments(lang);

  const send = async () => {
    const prompt = draft.trim();
    const fileIds = photos.fileIds;
    if ((!prompt && fileIds.length === 0) || photos.uploading || busy) return;
    // Incognito hands the prompt to the ephemeral chat, which never touches a
    // thread — nothing about it is saved. Photos don't go there at all.
    if (incognito) {
      setDraft("");
      router.push({ pathname: "/chat/incognito", params: { prompt } });
      return;
    }
    setBusy(true);
    try {
      const threadId = await startThread();
      await sendMessage({ threadId, prompt, fileIds });
      setDraft("");
      photos.clear();
      router.push(`/chat/${threadId}` as never);
    } catch {
      setBusy(false);
    }
  };

  // What the greeting has to fit into: the reading column (or the window, when
  // it is narrower), less its padding and the mark sitting beside it.
  const hero = greetingText(lang, account?.name);
  const heroSize = greetingFontSize(
    hero,
    Math.min(width, CONTENT_WIDTH) - PADDING_X * 2 - LOGO_SIZE - HERO_GAP,
  );

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
            <Icon name="logo" size={LOGO_SIZE} color={colors.accentStrong} />
            <Text
              style={[
                styles.greeting,
                {
                  color: colors.text,
                  fontSize: heroSize,
                  letterSpacing: -heroSize / 60,
                },
              ]}
            >
              {hero}
            </Text>
          </View>

          <Composer
            value={draft}
            onChangeText={setDraft}
            onSubmit={send}
            placeholder={t(lang, "homePlaceholder")}
            minHeight={48}
            {...(incognito
              ? {}
              : {
                  attachments: photos.attachments,
                  onPickPhoto: () => void photos.pick(),
                  onRemoveAttachment: photos.remove,
                })}
          />

          {incognito ? (
            <View style={styles.incognitoNote}>
              <Icon name="incognito" size={15} color={colors.textSoft} />
              <Text style={[styles.incognitoText, { color: colors.textSoft }]}>
                {t(lang, "incognitoHomeNote")}
              </Text>
            </View>
          ) : null}

          {/* The same line the chat dock carries, so the caveat is already on
              screen before the first question rather than after it. */}
          <Text style={[styles.disclaimer, { color: colors.textFaint }]}>
            {t(lang, "chatDisclaimer")}{" "}
            <Text
              style={[styles.disclaimerLink, { color: colors.textSoft }]}
              onPress={() => router.push("/about")}
              accessibilityRole="link"
            >
              {t(lang, "aboutDhee")}
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

// The hero's measurements, shared between the layout and the size the greeting
// is set at, so the two can't drift apart.
const CONTENT_WIDTH = 720;
const PADDING_X = 20;
const LOGO_SIZE = 40;
const HERO_GAP = 14;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    maxWidth: CONTENT_WIDTH,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: PADDING_X,
    paddingTop: "16%",
    paddingBottom: 40,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: HERO_GAP,
    paddingVertical: 24,
  },
  greeting: font.medium,
  incognitoNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 14,
  },
  incognitoText: { fontSize: 13.5, ...font.regular },
  disclaimer: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    ...font.regular,
  },
  disclaimerLink: font.medium,
});
