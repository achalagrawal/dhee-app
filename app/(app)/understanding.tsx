import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AppShell } from "../../src/components/AppShell";
import { type Language, t } from "../../src/lib/i18n";
import { useTheme } from "../../src/lib/ThemeContext";
import { type Colors, font, radius } from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

export default function Understanding() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const data = useQuery(api.understanding.overview);

  const editObservation = useMutation(api.understanding.editObservation);
  const deleteObservation = useMutation(api.understanding.deleteObservation);
  const editInquiry = useMutation(api.understanding.editInquiry);
  const deleteInquiry = useMutation(api.understanding.deleteInquiry);
  const deleteConcept = useMutation(api.understanding.deleteConcept);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (data === undefined) {
    return (
      <AppShell>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppShell>
    );
  }

  const isEmpty =
    data.inquiries.length === 0 &&
    data.observations.length === 0 &&
    data.concepts.length === 0;

  return (
    <AppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t(lang, "understanding")}</Text>
        <Text style={styles.intro}>{t(lang, "understandingIntro")}</Text>

        {isEmpty ? (
          <Text style={styles.empty}>{t(lang, "nothingYet")}</Text>
        ) : null}

        {data.inquiries.length > 0 ? (
          <Section title={t(lang, "inquiries")} colors={colors}>
            {data.inquiries.map((row) => (
              <EditableRow
                key={row._id}
                value={row.question}
                lang={lang}
                colors={colors}
                onSave={(question) => editInquiry({ id: row._id, question })}
                onDelete={() => deleteInquiry({ id: row._id })}
              />
            ))}
          </Section>
        ) : null}

        {data.observations.length > 0 ? (
          <Section title={t(lang, "observations")} colors={colors}>
            {data.observations.map((row) => (
              <EditableRow
                key={row._id}
                value={row.text}
                badge={row.confidence === "inferred" ? row.kind : undefined}
                lang={lang}
                colors={colors}
                onSave={(text) => editObservation({ id: row._id, text })}
                onDelete={() => deleteObservation({ id: row._id })}
              />
            ))}
          </Section>
        ) : null}

        {data.concepts.length > 0 ? (
          <Section title={t(lang, "concepts")} colors={colors}>
            {data.concepts.map((row: Doc<"conceptsTouched">) => (
              <View key={row._id} style={styles.card}>
                <Text style={styles.cardText}>{row.plainLanguageLabel}</Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => deleteConcept({ id: row._id })}
                    hitSlop={6}
                  >
                    <Text style={styles.delete}>{t(lang, "delete")}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8, marginTop: 20 }}>
      <Text
        style={{
          fontSize: 12.5,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.textFaint,
          marginLeft: 4,
          ...font.semibold,
        }}
      >
        {title}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function EditableRow({
  value,
  badge,
  lang,
  colors,
  onSave,
  onDelete,
}: {
  value: string;
  badge?: string;
  lang: Language;
  colors: Colors;
  onSave: (next: string) => void;
  onDelete: () => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <View style={[styles.card, { borderColor: colors.accent }]}>
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
            hitSlop={6}
          >
            <Text style={styles.actionMuted}>{t(lang, "cancel")}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const next = draft.trim();
              if (next) onSave(next);
              setEditing(false);
            }}
            hitSlop={6}
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
        <Pressable onPress={() => setEditing(true)} hitSlop={6}>
          <Text style={styles.actionMuted}>{t(lang, "edit")}</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={6}>
          <Text style={styles.delete}>{t(lang, "delete")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    scroll: {
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 48,
    },
    title: {
      fontSize: 28,
      letterSpacing: -0.4,
      color: colors.text,
      ...font.medium,
    },
    intro: {
      fontSize: 15.5,
      lineHeight: 23,
      color: colors.textSoft,
      marginTop: 10,
      ...font.regular,
    },
    empty: {
      fontSize: 15,
      color: colors.textFaint,
      paddingVertical: 32,
      textAlign: "center",
      ...font.regular,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    cardMain: { gap: 4 },
    cardText: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
      ...font.regular,
    },
    badge: {
      fontSize: 11.5,
      letterSpacing: 0.3,
      textTransform: "uppercase",
      color: colors.textFaint,
      ...font.medium,
    },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 18 },
    actionMuted: { fontSize: 14.5, color: colors.textSoft, ...font.regular },
    actionAccent: {
      fontSize: 14.5,
      color: colors.accentStrong,
      ...font.medium,
    },
    delete: { fontSize: 14.5, color: colors.danger, ...font.regular },
    editInput: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
      minHeight: 60,
      textAlignVertical: "top",
      ...font.regular,
    },
  });
}
