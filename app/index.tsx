import { useMutation } from "convex/react";
import { type UIMessage, useUIMessages } from "@convex-dev/agent/react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../convex/_generated/api";

export default function ChatScreen() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  const listRef = useRef<FlatList>(null);

  const startThread = useMutation(api.chat.startThread);
  const sendMessage = useMutation(api.chat.sendMessage);

  // Materialize thread on first mount so the query below has something to point at.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (threadId || starting) return;
      setStarting(true);
      try {
        const id = await startThread();
        if (!cancelled) setThreadId(id);
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, starting, startThread]);

  const messagesResult = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const uiMessages = messagesResult.results ?? [];

  useEffect(() => {
    if (uiMessages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [uiMessages.length]);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || !threadId) return;
    setDraft("");
    await sendMessage({ threadId, prompt });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dhee</Text>
        </View>

        {threadId == null ? (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        ) : uiMessages.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.hint}>
              Ask anything you're sitting with.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={uiMessages}
            keyExtractor={(m) => m.key}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.list}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message"
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={threadId != null}
            onSubmitEditing={send}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || !threadId}
            style={({ pressed }) => [
              styles.sendBtn,
              (!draft.trim() || !threadId) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.text;

  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleText}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  headerTitle: { fontSize: 20, fontWeight: "500" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  hint: { fontSize: 16, color: "#888", textAlign: "center" },
  list: { padding: 16, gap: 8 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: { backgroundColor: "#1a73e8" },
  bubbleAssistant: { backgroundColor: "#f2f2f2" },
  bubbleText: { fontSize: 16, color: "#111", lineHeight: 22 },
  bubbleTextUser: { fontSize: 16, color: "#fff", lineHeight: 22 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e5e5",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    fontSize: 16,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed: { opacity: 0.7 },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "500" },
});
