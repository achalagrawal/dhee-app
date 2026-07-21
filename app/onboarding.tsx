import { useMutation } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
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
import { type Language, t } from "../src/lib/i18n";
import { colors, radius, spacing } from "../src/lib/theme";

export default function Onboarding() {
  const [lang, setLang] = useState<Language>("en");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    await completeOnboarding({
      name: name.trim() || undefined,
      preferredLanguage: lang,
    });
    router.replace("/threads");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>{t(lang, "onboardingTitle")}</Text>

          <View style={styles.block}>
            <Text style={styles.label}>{t(lang, "languagePrompt")}</Text>
            <View style={styles.langRow}>
              <LanguageOption
                label="English"
                selected={lang === "en"}
                onPress={() => setLang("en")}
              />
              <LanguageOption
                label="हिन्दी"
                selected={lang === "hi"}
                onPress={() => setLang("hi")}
              />
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>{t(lang, "namePrompt")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t(lang, "namePlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              onSubmitEditing={start}
              returnKeyType="go"
            />
          </View>

          <Pressable
            onPress={start}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              busy && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>{t(lang, "start")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LanguageOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.langOption, selected && styles.langOptionSelected]}
    >
      <Text
        style={[styles.langLabel, selected && styles.langLabelSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 30, fontWeight: "300", color: colors.text },
  block: { gap: spacing.sm },
  label: { fontSize: 16, color: colors.textMuted },
  langRow: { flexDirection: "row", gap: spacing.sm },
  langOption: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  langOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  langLabel: { fontSize: 18, color: colors.text },
  langLabelSelected: { color: colors.accent, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: "#fff", fontSize: 17, fontWeight: "500" },
});
