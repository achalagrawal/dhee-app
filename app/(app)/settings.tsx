import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { type Language, t } from "../../src/lib/i18n";
import { colors, font, radius, spacing } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

type Pending = "forget" | "deleteChats" | null;

export default function Settings() {
  const lang = useLanguage();
  const { signOut } = useAuthActions();
  const account = useQuery(api.users.accountSummary);

  const setName = useMutation(api.users.setName);
  const setLanguage = useMutation(api.users.setLanguage);
  const forgetEverything = useMutation(api.understanding.forgetEverything);
  const deleteAllThreads = useMutation(api.chat.deleteAllThreads);

  const [draftName, setDraftName] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  if (account === undefined) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // Uncontrolled until first edit, so the field shows the saved name without
  // fighting the query when it revalidates.
  const nameValue = draftName ?? account.name ?? "";

  const commitName = () => {
    if (draftName === null) return;
    void setName({ name: draftName });
    setDraftName(null);
  };

  const runPending = () => {
    if (pending === "forget") void forgetEverything();
    if (pending === "deleteChats") void deleteAllThreads();
    setPending(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ {t(lang, "conversations")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t(lang, "settings")}</Text>

        <Section label={t(lang, "yourName")}>
          <TextInput
            style={styles.input}
            value={nameValue}
            onChangeText={setDraftName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            placeholder={t(lang, "namePlaceholderSettings")}
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={60}
          />
        </Section>

        <Section label={t(lang, "language")}>
          <View style={styles.langRow}>
            <LanguageOption
              label="English"
              active={account.preferredLanguage === "en"}
              onPress={() => void setLanguage({ preferredLanguage: "en" })}
            />
            <LanguageOption
              label="हिन्दी"
              active={account.preferredLanguage === "hi"}
              onPress={() => void setLanguage({ preferredLanguage: "hi" })}
            />
          </View>
        </Section>

        <Section label={t(lang, "dataAndPrivacy")}>
          <Link href="/understanding" asChild>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.rowLabel}>{t(lang, "whatDheeKnows")}</Text>
              <Text style={styles.rowValue}>
                {t(lang, "knowsSummary")
                  .replace("%o", String(account.observationCount))
                  .replace("%i", String(account.inquiryCount))
                  .replace("%c", String(account.conceptCount))}
              </Text>
            </Pressable>
          </Link>

          <DangerRow
            label={t(lang, "forgetEverything")}
            body={t(lang, "forgetEverythingBody")}
            onPress={() => setPending("forget")}
          />
          <DangerRow
            label={t(lang, "deleteAllChats")}
            body={t(lang, "deleteAllChatsBody")}
            onPress={() => setPending("deleteChats")}
          />
        </Section>

        <Section label={t(lang, "account")}>
          {account.email ? (
            <Text style={styles.meta}>{account.email}</Text>
          ) : null}
          <Text style={styles.meta}>
            {t(lang, "memberSince")}{" "}
            {new Date(account.memberSince).toLocaleDateString(
              lang === "hi" ? "hi-IN" : "en-IN",
              { day: "numeric", month: "long", year: "numeric" },
            )}
          </Text>
          <Pressable
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          >
            <Text style={styles.signOutLabel}>{t(lang, "signOut")}</Text>
          </Pressable>
        </Section>
      </ScrollView>

      <ConfirmDialog
        visible={pending !== null}
        lang={lang}
        title={
          pending === "forget"
            ? t(lang, "forgetEverything")
            : t(lang, "deleteAllChats")
        }
        body={
          pending === "forget"
            ? t(lang, "forgetEverythingBody")
            : t(lang, "deleteAllChatsBody")
        }
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </SafeAreaView>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function LanguageOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.langOption,
        active && styles.langOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.langLabel, active && styles.langLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DangerRow({
  label,
  body,
  onPress,
}: {
  label: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.dangerLabel}>{label}</Text>
      <Text style={styles.rowValue}>{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 16, color: colors.accent, ...font.regular },
  scroll: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xl },
  title: { fontSize: 28, color: colors.text, ...font.light },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontSize: 13,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    ...font.medium,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    ...font.regular,
  },
  langRow: { flexDirection: "row", gap: spacing.sm },
  langOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  langLabel: { fontSize: 16, color: colors.text, ...font.regular },
  langLabelActive: { color: colors.accent, ...font.medium },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  pressed: { opacity: 0.7 },
  rowLabel: { fontSize: 16, color: colors.text, ...font.regular },
  rowValue: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    ...font.regular,
  },
  dangerLabel: { fontSize: 16, color: colors.danger, ...font.regular },
  meta: { fontSize: 15, color: colors.textMuted, ...font.regular },
  signOut: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
  },
  signOutLabel: { fontSize: 16, color: colors.accent, ...font.medium },
});
