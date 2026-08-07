import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DisclaimerList } from "../src/components/DisclaimerList";
import { Field } from "../src/components/ui";
import { api } from "../convex/_generated/api";
import { type Language, t } from "../src/lib/i18n";
import { legalUrls } from "../src/lib/legal";
import { DEFAULT_TRADITION, TRADITIONS } from "../src/lib/traditions";
import { useTheme } from "../src/lib/ThemeContext";
import { type Colors, font, radius, spacing } from "../src/lib/theme";

// Two steps. The first asks the three things Dhee needs to speak to someone at
// all; the second is what Dhee owes them in return — the six disclaimers, and a
// button that says they read them. They are two steps rather than one scroll
// because the button under the disclaimers has to be an acknowledgement of the
// disclaimers, not of a form that happens to sit above them: finishing here is
// what `completeOnboarding` records as the acknowledgement (#133).
type Step = "you" | "disclaimers";

export default function Onboarding() {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>("you");
  const [lang, setLang] = useState<Language>("en");
  const [name, setName] = useState("");
  // Preselected, not imposed: almost everyone arriving here is studying this,
  // and the chip they tapped to turn it on is the same chip that turns it off.
  const [tradition, setTradition] = useState<string>(DEFAULT_TRADITION);
  const [busy, setBusy] = useState(false);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const profile = useQuery(api.users.currentProfile);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Signing in with Google gives us a name before anyone types one, so the
  // field opens already filled. Once only — after that the field is theirs,
  // including if they clear it.
  const prefilled = useRef(false);
  // "Next" on the name field has to land somewhere, or the key does nothing.
  const traditionInput = useRef<TextInput>(null);
  useEffect(() => {
    if (prefilled.current || !profile?.name) return;
    prefilled.current = true;
    setName(profile.name);
  }, [profile?.name]);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    await completeOnboarding({
      name: name.trim() || undefined,
      preferredLanguage: lang,
      tradition: tradition.trim() || undefined,
    });
    router.replace("/home");
  };

  if (step === "disclaimers") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.discContent}>
          <Pressable
            onPress={() => setStep("you")}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.backRow}
          >
            <Text style={styles.backLabel}>← {t(lang, "back")}</Text>
          </Pressable>

          <Text style={styles.title}>{t(lang, "disclaimersTitle")}</Text>
          <Text style={styles.intro}>{t(lang, "disclaimersIntro")}</Text>

          <DisclaimerList lang={lang} />

          {/* The one claim the six points don't make, and the one that has to
              reach someone before their first hard evening. Sign-in and the
              legal pages carried it; onboarding didn't. */}
          <Text style={styles.notMedical}>
            {t(lang, "notMedical")}{" "}
            <Text
              style={styles.notMedicalLink}
              onPress={() => void Linking.openURL(legalUrls.safety)}
              accessibilityRole="link"
            >
              {t(lang, "safetyAndLimits")}
            </Text>
          </Text>

          <Pressable
            onPress={() => void finish()}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              busy && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>{t(lang, "disclaimersAck")}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

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
                styles={styles}
              />
              <LanguageOption
                label="हिन्दी"
                selected={lang === "hi"}
                onPress={() => setLang("hi")}
                styles={styles}
              />
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>{t(lang, "namePrompt")}</Text>
            <Field
              style={styles.input}
              placeholder={t(lang, "namePlaceholder")}
              placeholderTextColor={colors.textFaint}
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => traditionInput.current?.focus()}
              returnKeyType="next"
            />
          </View>

          {/* Writes the same field the settings picker edits. */}
          <View style={styles.block}>
            <Text style={styles.label}>{t(lang, "traditionPrompt")}</Text>
            <Field
              ref={traditionInput}
              style={styles.input}
              placeholder={t(lang, "traditionPlaceholder")}
              placeholderTextColor={colors.textFaint}
              value={tradition}
              onChangeText={setTradition}
              onSubmitEditing={() => setStep("disclaimers")}
              returnKeyType="next"
              maxLength={60}
            />
            <View style={styles.chipRow}>
              {TRADITIONS.slice(0, 6).map((name) => {
                const selected =
                  tradition.trim().toLowerCase() === name.toLowerCase();
                return (
                  <Pressable
                    key={name}
                    onPress={() => setTradition(selected ? "" : name)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        selected && styles.chipLabelSelected,
                      ]}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.optional}>{t(lang, "traditionOptional")}</Text>
          </View>

          <Pressable
            onPress={() => setStep("disclaimers")}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>{t(lang, "next")}</Text>
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
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.langOption, selected && styles.langOptionSelected]}
    >
      <Text style={[styles.langLabel, selected && styles.langLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
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
    title: { fontSize: 30, color: colors.text, ...font.medium },
    // Step two scrolls — six points don't fit a phone — so it sets its own
    // column instead of the centred, fixed layout step one uses.
    discContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    backRow: { alignSelf: "flex-start", paddingVertical: 4 },
    backLabel: { fontSize: 15, color: colors.textSoft, ...font.regular },
    intro: {
      fontSize: 15.5,
      lineHeight: 23,
      color: colors.textSoft,
      marginBottom: spacing.xs,
      ...font.regular,
    },
    notMedical: {
      fontSize: 13.5,
      lineHeight: 20,
      color: colors.textFaint,
      marginTop: spacing.xs,
      ...font.regular,
    },
    notMedicalLink: { color: colors.accentStrong, ...font.medium },
    block: { gap: spacing.sm },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    chipSelected: {
      borderColor: "transparent",
      backgroundColor: colors.accentSoft,
    },
    chipLabel: { fontSize: 14, color: colors.textSoft, ...font.regular },
    chipLabelSelected: { color: colors.accentStrong, ...font.medium },
    optional: { fontSize: 13.5, color: colors.textFaint, ...font.regular },
    label: { fontSize: 16, color: colors.textSoft, ...font.regular },
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
    langLabel: { fontSize: 18, color: colors.text, ...font.regular },
    langLabelSelected: { color: colors.accentStrong, ...font.medium },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontSize: 17,
      color: colors.text,
      ...font.regular,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 16,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.4 },
    buttonPressed: { opacity: 0.85 },
    buttonLabel: {
      color: colors.onAccent,
      fontSize: 17,
      ...font.medium,
    },
  });
}
