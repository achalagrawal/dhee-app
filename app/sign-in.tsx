import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../src/lib/i18n";
import { colors, radius, spacing } from "../src/lib/theme";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign-in happens before we know the person's language preference, so this
  // screen is English-only by necessity. Onboarding is where they choose.
  const lang = "en" as const;

  const submitEmail = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn("resend-otp", { email: email.trim() });
      setStep("code");
    } catch {
      setError(t(lang, "somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn("resend-otp", { email: email.trim(), code: code.trim() });
    } catch {
      setError(t(lang, "somethingWentWrong"));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.wordmark}>{t(lang, "appName")}</Text>
          <Text style={styles.tagline}>{t(lang, "tagline")}</Text>

          <View style={styles.form}>
            {step === "email" ? (
              <>
                <Text style={styles.label}>{t(lang, "signInSubtitle")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t(lang, "emailPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  onSubmitEditing={submitEmail}
                  returnKeyType="go"
                />
                <PrimaryButton
                  label={t(lang, "sendCode")}
                  onPress={submitEmail}
                  disabled={!email.trim()}
                  busy={busy}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>
                  {t(lang, "codeSubtitle")} {email}
                </Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder={t(lang, "codePlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  autoFocus
                  onSubmitEditing={submitCode}
                  returnKeyType="go"
                />
                <PrimaryButton
                  label={t(lang, "verify")}
                  onPress={submitCode}
                  disabled={!code.trim()}
                  busy={busy}
                />
                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  style={styles.textButton}
                >
                  <Text style={styles.textButtonLabel}>{t(lang, "back")}</Text>
                </Pressable>
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        (disabled || busy) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
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
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  wordmark: {
    fontSize: 44,
    fontWeight: "300",
    color: colors.text,
    letterSpacing: 1,
  },
  tagline: {
    marginTop: spacing.sm,
    fontSize: 17,
    lineHeight: 25,
    color: colors.textMuted,
  },
  form: { marginTop: spacing.xl * 1.5, gap: spacing.md },
  label: { fontSize: 15, color: colors.textMuted },
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
  codeInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: "#fff", fontSize: 17, fontWeight: "500" },
  textButton: { alignItems: "center", paddingVertical: spacing.sm },
  textButtonLabel: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.danger, fontSize: 15, textAlign: "center" },
});
