import { usePaginatedQuery } from "convex/react";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { t } from "../lib/i18n";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { font, radius } from "../lib/theme";
import { relativeTime } from "../lib/time";
import { useLanguage } from "../lib/useLanguage";
import { Icon } from "./ui";

// Full-screen search over the loaded conversation list. Filtering is entirely
// client-side (title + summary) — no new backend surface — which is plenty for
// the volumes a single person accumulates.
export function SearchModal() {
  const { colors } = useTheme();
  const { searchOpen, closeSearch } = useShell();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const { results: threads } = usePaginatedQuery(
    api.chat.listThreads,
    searchOpen ? {} : "skip",
    { initialNumItems: 100 },
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thr) => {
      const hay = `${thr.title ?? ""} ${thr.summary ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [threads, query]);

  const open = (threadId: string) => {
    closeSearch();
    setQuery("");
    router.push(`/chat/${threadId}` as never);
  };

  return (
    <Modal
      visible={searchOpen}
      animationType="fade"
      transparent
      onRequestClose={closeSearch}
    >
      <Pressable
        style={[styles.backdrop, { paddingTop: insets.top + 40 }]}
        onPress={closeSearch}
      >
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.bg, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[styles.searchRow, { borderBottomColor: colors.border }]}
          >
            <Icon name="search" size={18} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t(lang, "searchPlaceholder")}
              placeholderTextColor={colors.textFaint}
              autoFocus
              style={[styles.input, { color: colors.text }]}
            />
            <Pressable onPress={closeSearch} hitSlop={10}>
              <Icon name="close" size={18} color={colors.textFaint} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.results}
            keyboardShouldPersistTaps="handled"
          >
            {matches.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textFaint }]}>
                {query.trim()
                  ? t(lang, "noMatches").replace("%q", query.trim())
                  : t(lang, "noConversationsHint")}
              </Text>
            ) : (
              matches.map((thr) => (
                <Pressable
                  key={thr._id}
                  onPress={() => open(thr._id)}
                  style={({ pressed }) => [
                    styles.resultRow,
                    {
                      backgroundColor: pressed
                        ? colors.surface2
                        : "transparent",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.resultIcon,
                      { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <Icon name="history" size={15} color={colors.textSoft} />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.resultTitle, { color: colors.text }]}
                  >
                    {thr.title?.trim() || t(lang, "newConversation")}
                  </Text>
                  <Text
                    style={[styles.resultMeta, { color: colors.textFaint }]}
                  >
                    {relativeTime(thr._creationTime, lang)}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 16,
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 640,
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
    maxHeight: "70%",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 16, ...font.regular },
  results: { paddingHorizontal: 8, paddingVertical: 6 },
  empty: {
    textAlign: "center",
    fontSize: 14.5,
    paddingVertical: 30,
    paddingHorizontal: 16,
    ...font.regular,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  resultIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: { flex: 1, fontSize: 15, ...font.regular },
  resultMeta: { fontSize: 12.5, ...font.regular },
});
