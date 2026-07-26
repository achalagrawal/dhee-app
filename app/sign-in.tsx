import { useConvexAuth } from "convex/react";
import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient } from "../src/lib/auth-client";
import { t } from "../src/lib/i18n";
import { legalUrls } from "../src/lib/legal";
import { signInWithGoogle } from "../src/lib/oauth";
import { useTheme } from "../src/lib/ThemeContext";
import { type Colors, font, radius, spacing } from "../src/lib/theme";

export default function SignIn() {
  const { colors } = useTheme();
  const { isAuthenticated } = useConvexAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Sign-in happens before we know the person's language preference, so this
  // screen is English-only by necessity. Onboarding is where they choose.
  const lang = "en" as const;

  const submitEmail = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });
      if (error) throw new Error(error.message);
      setStep("code");
    } catch {
      setError(t(lang, "somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  const submitGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await signInWithGoogle();
      // On success the redirect below takes over once isAuthenticated flips,
      // so `busy` deliberately stays true. Backing out of the browser sheet
      // just returns the screen to idle — it isn't a failure.
      if (outcome === "cancelled") setBusy(false);
    } catch {
      setError(t(lang, "somethingWentWrong"));
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: code.trim(),
      });
      if (error) throw new Error(error.message);
      // Success falls through to the redirect below once isAuthenticated
      // flips; busy stays true so the button can't be pressed twice while
      // the session settles.
    } catch {
      setError(t(lang, "somethingWentWrong"));
      setBusy(false);
    }
  };

  // signIn resolves before this screen knows where to go. Bounce to the index
  // route, which decides between onboarding and the thread list. Without this
  // a successful sign-in leaves the person watching a spinner forever.
  if (isAuthenticated) return <Redirect href="/" />;

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
                <Pressable
                  onPress={submitGoogle}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.googleButton,
                    busy && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <View style={styles.googleBadge}>
                    <Text style={styles.googleBadgeLetter}>G</Text>
                  </View>
                  <Text style={styles.googleLabel}>
                    {t(lang, "continueWithGoogle")}
                  </Text>
                </Pressable>

                <View style={styles.divider}>
                  <View style={styles.dividerRule} />
                  <Text style={styles.dividerLabel}>{t(lang, "or")}</Text>
                  <View style={styles.dividerRule} />
                </View>

                <Text style={styles.label}>{t(lang, "signInSubtitle")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t(lang, "emailPlaceholder")}
                  placeholderTextColor={colors.textFaint}
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
                  styles={styles}
                  colors={colors}
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
                  placeholderTextColor={colors.textFaint}
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
                  styles={styles}
                  colors={colors}
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

          <LegalFooter lang={lang} styles={styles} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Sign-in is where a person hands over an email address, so it is where the two
// documents have to be reachable — and on web this screen is what `/` redirects
// to, which makes it the page Google's OAuth review lands on when it checks
// that the homepage links to the privacy policy.
function LegalFooter({
  lang,
  styles,
}: {
  lang: "en";
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.legal}>
      <Text style={styles.legalText}>
        {t(lang, "legalIntro")}{" "}
        <Text
          style={styles.legalLink}
          onPress={() => Linking.openURL(legalUrls.terms)}
        >
          {t(lang, "termsOfUse")}
        </Text>{" "}
        {t(lang, "and")}{" "}
        <Text
          style={styles.legalLink}
          onPress={() => Linking.openURL(legalUrls.privacy)}
        >
          {t(lang, "privacyPolicy")}
        </Text>
        .
      </Text>
      {/* The disclaimer carries the link rather than standing alone: the moment
          someone needs a crisis line is not the moment to go looking for one. */}
      <Text style={styles.legalText}>
        {t(lang, "notMedical")}{" "}
        <Text
          style={styles.legalLink}
          onPress={() => Linking.openURL(legalUrls.safety)}
        >
          {t(lang, "safetyAndLimits")}
        </Text>
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  styles,
  colors,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: Colors;
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
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
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
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    wordmark: {
      fontSize: 44,
      color: colors.text,
      letterSpacing: 1,
      ...font.medium,
    },
    tagline: {
      marginTop: spacing.sm,
      fontSize: 17,
      lineHeight: 25,
      color: colors.textSoft,
      ...font.regular,
    },
    form: { marginTop: spacing.xl * 1.5, gap: spacing.md },
    label: { fontSize: 15, color: colors.textSoft, ...font.regular },
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
    codeInput: {
      fontSize: 24,
      letterSpacing: 8,
      textAlign: "center",
      ...font.regular,
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
    // Inverted against the page, per the mockup's auth modal — this is the
    // primary way in, so it outweighs the accent-coloured email button below.
    googleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.text,
      borderRadius: radius.md,
      paddingVertical: 15,
      minHeight: 54,
    },
    googleBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    googleBadgeLetter: { fontSize: 12, color: colors.text, ...font.medium },
    googleLabel: { fontSize: 15, color: colors.bg, ...font.medium },
    divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    dividerRule: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerLabel: { fontSize: 13, color: colors.textFaint, ...font.regular },
    buttonLabel: {
      color: colors.onAccent,
      fontSize: 17,
      ...font.medium,
    },
    legal: { marginTop: spacing.xl, gap: spacing.xs },
    legalText: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textFaint,
      textAlign: "center",
      ...font.regular,
    },
    legalLink: { color: colors.textSoft, textDecorationLine: "underline" },
    textButton: { alignItems: "center", paddingVertical: spacing.sm },
    textButtonLabel: { color: colors.textSoft, fontSize: 15, ...font.regular },
    error: {
      color: colors.danger,
      fontSize: 15,
      textAlign: "center",
      ...font.regular,
    },
  });
}
