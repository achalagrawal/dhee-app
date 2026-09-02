import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import {
  MODE_KEYS,
  modeLabelKey,
  startersFor,
  type ModeKey,
} from "../../src/lib/starters";
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
  const [mode, setMode] = useState<ModeKey | undefined>(undefined);
  const photos = useAttachments(lang);

  // Takes its text explicitly rather than reading `draft`, so a starter and the
  // composer share one path. Deliberately not the callback handed to either —
  // `onSubmit` is invoked with an event, and a function that accepts an
  // optional string would silently take that event as the prompt.
  const submit = async (prompt: string, fileIds: string[]) => {
    const text = prompt.trim();
    if ((!text && fileIds.length === 0) || photos.uploading || busy) return;
    // Incognito hands the prompt to the ephemeral chat, which never touches a
    // thread — nothing about it is saved. Photos don't go there at all.
    if (incognito) {
      setDraft("");
      router.push({ pathname: "/chat/incognito", params: { prompt: text } });
      return;
    }
    setBusy(true);
    try {
      const threadId = await startThread();
      await sendMessage({ threadId, prompt: text, fileIds });
      setDraft("");
      photos.clear();
      router.push(`/chat/${threadId}` as never);
    } catch {
      setBusy(false);
    }
  };

  const send = () => void submit(draft, photos.fileIds);
  // A starter carries no photos — it is its own complete question, and silently
  // attaching whatever happened to be picked would send something the person
  // did not compose.
  const sendStarter = (question: string) => void submit(question, []);

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

          {/* Only while the box is empty. Once someone is writing, suggestions
              are no longer help — they are something else competing for the
              screen with the thing they came to say. */}
          {draft.trim() ? null : (
            <View style={styles.starters}>
              <View style={styles.modes}>
                {MODE_KEYS.map((key) => {
                  const selected = mode === key;
                  const label = t(lang, modeLabelKey(key));
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      // Named explicitly: react-native-web does not derive an
                      // accessible name from a nested Text, so without this a
                      // screen reader reads the whole row as unlabelled
                      // buttons.
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                      // Tapping the selected chip clears it, so the wider
                      // default set is always one tap away.
                      onPress={() => setMode(selected ? undefined : key)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: selected
                            ? colors.accentSoft
                            : colors.surface2,
                          borderColor: selected ? colors.accent : colors.border,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: selected ? colors.text : colors.textSoft },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.startersLead, { color: colors.textSoft }]}>
                {t(lang, mode ? "startersLeadMode" : "startersLead")}
              </Text>

              {startersFor(lang, mode).map((question) => (
                <Pressable
                  key={question}
                  accessibilityRole="button"
                  accessibilityLabel={question}
                  disabled={busy}
                  onPress={() => sendStarter(question)}
                  style={({ pressed }) => [
                    styles.starter,
                    {
                      backgroundColor: colors.surface2,
                      borderColor: colors.border,
                      opacity: pressed || busy ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.starterText, { color: colors.text }]}>
                    {question}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
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
  starters: { marginTop: 30, gap: 9 },
  modes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 6,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, ...font.medium },
  startersLead: {
    fontSize: 12.5,
    textAlign: "center",
    marginBottom: 3,
    ...font.regular,
  },
  starter: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  starterText: { fontSize: 14.5, lineHeight: 21, ...font.regular },
});
