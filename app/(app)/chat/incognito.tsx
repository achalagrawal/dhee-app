import { useAction, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "../../../src/components/AppShell";
import { DheeAvatar } from "../../../src/components/chat/DheeAvatar";
import {
  FailureCard,
  failureFrom,
} from "../../../src/components/chat/FailureCard";
import { Markdown } from "../../../src/components/chat/Markdown";
import { Composer } from "../../../src/components/Composer";
import { CrisisBanner } from "../../../src/components/CrisisBanner";
import { Icon } from "../../../src/components/ui";
import { t } from "../../../src/lib/i18n";
import { useShell } from "../../../src/lib/shell";
import { useTheme } from "../../../src/lib/ThemeContext";
import { type Colors, font, radius } from "../../../src/lib/theme";
import { useLanguage } from "../../../src/lib/useLanguage";

type Msg = { id: string; role: "user" | "assistant"; text: string };

// Ephemeral incognito chat. The transcript lives only in this component's
// state; every turn sends the whole history to the threadless `incognitoReply`
// action, which persists nothing. Leaving the screen (or turning incognito
// off) discards it. No streaming — the agent can only stream through a saved
// thread — so it shows "considering…" then the full reply.
export default function IncognitoChat() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const { incognito } = useShell();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const listRef = useRef<FlatList<Msg>>(null);

  // An incognito turn costs the same model call, so it draws on the same
  // allowance — the exchange just isn't attributed to a thread.
  const usage = useQuery(api.chat.usage);
  const outOfMessages = usage?.remaining === 0;

  const reply = useAction(api.chat.incognitoReply);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);
  // Incognito saves nothing, so the flag can't live on the thread. It comes
  // back with each reply and is held for the session — someone who chose not
  // to be recorded still gets the safety net. Sticky, like the saved path.
  const [crisisFlagged, setCrisisFlagged] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const runTurn = useCallback(
    async (history: Msg[]) => {
      setBusy(true);
      try {
        const result = await reply({
          messages: history.map((m) => ({ role: m.role, text: m.text })),
        });
        if (result.crisisFlagged) setCrisisFlagged(true);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: result.text },
        ]);
      } catch (e) {
        // A spent allowance is not something Dhee said, so it never becomes a
        // reply bubble. The card comes from the live usage query below.
        if (failureFrom(e) === "limit") {
          setMessages((prev) => prev.slice(0, -1));
          setDraft(history[history.length - 1]?.text ?? "");
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: t(lang, "somethingWentWrong"),
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [reply, lang],
  );

  const send = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt || busy) return;
      // Keep what they wrote — this includes the prompt handed over from home,
      // which has no other copy.
      if (outOfMessages) {
        setDraft(prompt);
        return;
      }
      const userMsg: Msg = {
        id: `u-${Date.now()}`,
        role: "user",
        text: prompt,
      };
      setDraft("");
      setMessages((prev) => {
        const next = [...prev, userMsg];
        void runTurn(next);
        return next;
      });
    },
    [busy, runTurn, outOfMessages],
  );

  // Turning incognito off (via the header toggle or the banner's "Turn off")
  // ends the ephemeral chat and returns Home, discarding the transcript.
  useEffect(() => {
    if (!incognito) router.replace("/home");
  }, [incognito]);

  // Seed the first prompt handed over from Home exactly once.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const first = params.prompt?.trim();
    if (first) send(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell showIncognito>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {crisisFlagged ? (
          <View style={styles.bannerWrap}>
            <CrisisBanner lang={lang} />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          style={styles.flex}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListHeaderComponent={
            <View style={styles.intro}>
              <Icon name="incognito" size={18} color={colors.textSoft} />
              <Text style={styles.introText}>{t(lang, "incognitoIntro")}</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.role === "user" ? (
              <View style={styles.userWrap}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.text}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.botRow}>
                <DheeAvatar />
                <View style={styles.botBody}>
                  <Markdown text={item.text} colors={colors} />
                  <Pressable
                    onPress={() => void Clipboard.setStringAsync(item.text)}
                    hitSlop={4}
                    style={styles.copyBtn}
                  >
                    <Icon name="copy" size={15} color={colors.textFaint} />
                  </Pressable>
                </View>
              </View>
            )
          }
          ListFooterComponent={
            busy ? (
              <View style={styles.thinkingRow}>
                <DheeAvatar />
                <Text style={styles.thinkingText}>{t(lang, "thinking")}</Text>
              </View>
            ) : null
          }
        />

        <View style={styles.dock}>
          {outOfMessages ? <FailureCard reason="limit" /> : null}
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSubmit={() => send(draft)}
            placeholder={t(lang, "replyPlaceholder")}
            minHeight={24}
          />
        </View>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    bannerWrap: { paddingHorizontal: 16, paddingTop: 12 },
    list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 22 },
    intro: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 4,
    },
    introText: {
      flex: 1,
      color: colors.textSoft,
      fontSize: 13.5,
      lineHeight: 19,
      ...font.regular,
    },
    userWrap: { alignItems: "flex-end" },
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
    botRow: { flexDirection: "row", gap: 12 },
    botBody: { flex: 1, minWidth: 0 },
    copyBtn: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      marginTop: 6,
    },
    thinkingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    thinkingText: {
      color: colors.textFaint,
      fontSize: 15,
      fontStyle: "italic",
      ...font.regular,
    },
    dock: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: Platform.OS === "ios" ? 8 : 12,
      backgroundColor: colors.bg,
      gap: 10,
    },
  });
}
