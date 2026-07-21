import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
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
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { t } from "../src/lib/i18n";
import { colors, radius, spacing } from "../src/lib/theme";
import { useLanguage } from "../src/lib/useLanguage";

export default function Understanding() {
  const lang = useLanguage();
  const data = useQuery(api.understanding.overview);

  const editObservation = useMutation(api.understanding.editObservation);
  const deleteObservation = useMutation(api.understanding.deleteObservation);
  const editInquiry = useMutation(api.understanding.editInquiry);
  const deleteInquiry = useMutation(api.understanding.deleteInquiry);
  const deleteConcept = useMutation(api.understanding.deleteConcept);

  if (data === undefined) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty =
    data.inquiries.length === 0 &&
    data.observations.length === 0 &&
    data.concepts.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ {t(lang, "conversations")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t(lang, "understanding")}</Text>
        <Text style={styles.intro}>{t(lang, "understandingIntro")}</Text>

        {isEmpty ? (
          <Text style={styles.empty}>{t(lang, "nothingYet")}</Text>
        ) : null}

        {data.inquiries.length > 0 ? (
          <Section title={t(lang, "inquiries")}>
            {data.inquiries.map((row) => (
              <EditableRow
                key={row._id}
                value={row.question}
                lang={lang}
                onSave={(question) => editInquiry({ id: row._id, question })}
                onDelete={() => deleteInquiry({ id: row._id })}
              />
            ))}
          </Section>
        ) : null}

        {data.observations.length > 0 ? (
          <Section title={t(lang, "observations")}>
            {data.observations.map((row) => (
              <EditableRow
                key={row._id}
                value={row.text}
                badge={row.confidence === "inferred" ? row.kind : undefined}
                lang={lang}
                onSave={(text) => editObservation({ id: row._id, text })}
                onDelete={() => deleteObservation({ id: row._id })}
              />
            ))}
          </Section>
        ) : null}

        {data.concepts.length > 0 ? (
          <Section title={t(lang, "concepts")}>
            {data.concepts.map((row: Doc<"conceptsTouched">) => (
              <View key={row._id} style={styles.card}>
                <Text style={styles.cardText}>{row.plainLanguageLabel}</Text>
                <Pressable onPress={() => deleteConcept({ id: row._id })}>
                  <Text style={styles.delete}>{t(lang, "delete")}</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function EditableRow({
  value,
  badge,
  lang,
  onSave,
  onDelete,
}: {
  value: string;
  badge?: string;
  lang: "en" | "hi";
  onSave: (next: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <View style={styles.card}>
        <TextInput
          style={styles.editInput}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
        />
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              setEditing(false);
              setDraft(value);
            }}
          >
            <Text style={styles.actionMuted}>{t(lang, "cancel")}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const next = draft.trim();
              if (next) onSave(next);
              setEditing(false);
            }}
          >
            <Text style={styles.actionAccent}>{t(lang, "save")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardMain}>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Text style={styles.cardText}>{value}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => setEditing(true)}>
          <Text style={styles.actionMuted}>{t(lang, "edit")}</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={styles.delete}>{t(lang, "delete")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.accent },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 28, fontWeight: "300", color: colors.text },
  intro: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  empty: {
    fontSize: 15,
    color: colors.textMuted,
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { fontSize: 13, color: colors.textMuted, letterSpacing: 1 },
  sectionBody: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardMain: { gap: spacing.xs },
  cardText: { fontSize: 16, lineHeight: 23, color: colors.text },
  badge: { fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.md },
  actionMuted: { fontSize: 15, color: colors.textMuted },
  actionAccent: { fontSize: 15, color: colors.accent, fontWeight: "500" },
  delete: { fontSize: 15, color: colors.danger },
  editInput: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
    minHeight: 60,
  },
});
