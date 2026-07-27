import { usePaginatedQuery, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { DheeAvatar } from "../../src/components/chat/DheeAvatar";
import { Markdown } from "../../src/components/chat/Markdown";
import { Icon } from "../../src/components/ui";
import { t } from "../../src/lib/i18n";
import { useTheme } from "../../src/lib/ThemeContext";
import { type Colors } from "../../src/lib/theme";
import { font, radius, readableColumn } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

// A shared conversation, read-only, for anyone holding the link.
//
// Deliberately outside `app/(app)/`: that group's layout redirects anyone
// signed out to /sign-in, which is exactly wrong for a public page. Nothing
// here is gated, and nothing here asks the backend for more than
// `share.listSharedMessages` returns — role and text. See
// docs/build/specs/sharing.md.
//
// The message rendering is its own, not `Message` from the chat screen: that
// component carries feedback, editing, regenerate and the edited/stopped marks,
// and a reader has none of those. Copying the two bubble shapes is smaller than
// making that component understand a reader.

type SharedMessage = { key: string; role: "user" | "assistant"; text: string };

const keyExtractor = (m: SharedMessage) => m.key;

export default function SharedConversation() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const conversation = useQuery(
    api.share.sharedConversation,
    slug ? { slug } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.share.listSharedMessages,
    slug ? { slug } : "skip",
    { initialNumItems: 50 },
  );

  const header = (
    <View
      style={[styles.header, { paddingTop: insets.top + 12 }]}
      pointerEvents="none"
    >
      <Icon name="logo" size={26} color={colors.accent} />
      <Text style={styles.headerTitle} numberOfLines={1}>
        {conversation?.title ?? t(lang, "sharedUntitled")}
      </Text>
    </View>
  );

  if (conversation === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Revoked, never minted, or its conversation deleted — one answer for all
  // three, so this page can't be used to find out which.
  if (conversation === null) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <View style={styles.goneCard}>
            <Text style={styles.goneTitle}>{t(lang, "sharedGone")}</Text>
            <Text style={styles.goneBody}>{t(lang, "sharedGoneBody")}</Text>
          </View>
        </View>
        <Footer colors={colors} styles={styles} lang={lang} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <FlatList
        data={results as SharedMessage[]}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SharedBubble message={item} colors={colors} styles={styles} />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (status === "CanLoadMore") loadMore(50);
        }}
        ListFooterComponent={
          status === "LoadingMore" ? (
            <ActivityIndicator color={colors.accent} style={styles.more} />
          ) : null
        }
      />
      <Footer colors={colors} styles={styles} lang={lang} />
    </View>
  );
}

function SharedBubble({
  message,
  colors,
  styles,
}: {
  message: SharedMessage;
  colors: Colors;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (message.role === "user") {
    return (
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.botRow}>
      <DheeAvatar />
      <View style={styles.botBody}>
        <Markdown text={message.text} colors={colors} />
      </View>
    </View>
  );
}

// The most public surface the product has: someone who followed a link from a
// friend and has never heard of Dhee ends up here.
function Footer({
  colors,
  styles,
  lang,
}: {
  colors: Colors;
  styles: ReturnType<typeof makeStyles>;
  lang: ReturnType<typeof useLanguage>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
      <Text style={styles.footerText}>{t(lang, "sharedFooter")}</Text>
      <Pressable
        onPress={() => router.replace("/")}
        style={({ pressed }) => [
          styles.footerCta,
          { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text style={styles.footerCtaLabel}>{t(lang, "sharedCta")}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      padding: 24,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 16,
      maxWidth: "78%",
      ...font.semibold,
    },
    list: {
      ...readableColumn,
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 24,
      gap: 22,
    },
    more: { paddingVertical: 16 },
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
    goneCard: { alignItems: "center", gap: 8, maxWidth: 380 },
    goneTitle: { color: colors.text, fontSize: 17, ...font.semibold },
    goneBody: {
      color: colors.textSoft,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      ...font.regular,
    },
    footer: {
      ...readableColumn,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footerText: { color: colors.textFaint, fontSize: 13, ...font.regular },
    footerCta: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.pill,
    },
    footerCtaLabel: {
      color: colors.onAccent,
      fontSize: 13.5,
      ...font.semibold,
    },
  });
}
