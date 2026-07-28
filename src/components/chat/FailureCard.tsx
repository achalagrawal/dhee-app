import { ConvexError } from "convex/values";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../../lib/i18n";
import { type Colors, font, radius } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { useLanguage } from "../../lib/useLanguage";

export type FailureReason = "error" | "rate" | "limit";

const COPY = {
  error: ["modelErrorTitle", "modelErrorBody"],
  rate: ["rateErrorTitle", "rateErrorBody"],
  limit: ["limitErrorTitle", "limitErrorBody"],
} as const;

/**
 * What a thrown error means to the person. The daily limit carries a code, so
 * that one is exact; rate limiting arrives as a message, so it stays
 * best-effort — misreading it costs nothing worse than the generic wording.
 */
export function failureFrom(error: unknown): FailureReason {
  if (
    error instanceof ConvexError &&
    (error.data as { code?: string })?.code === "LIMIT_REACHED"
  ) {
    return "limit";
  }
  const text = String(error).toLowerCase();
  return text.includes("rate") || text.includes("too many") ? "rate" : "error";
}

/**
 * Why a turn didn't happen. Shared by the chat screen and home, which reach
 * the same daily limit from different places and shouldn't explain it
 * differently.
 *
 * `onRetry` omitted means no button — retrying a spent allowance can only fail
 * again.
 */
export function FailureCard({
  reason,
  onRetry,
}: {
  reason: FailureReason;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const lang = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, body] = COPY[reason];

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Text style={styles.title}>{t(lang, title)}</Text>
        <Text style={styles.text}>{t(lang, body)}</Text>
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>{t(lang, "tryAgain")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 13,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 14,
    },
    body: { flex: 1, gap: 4 },
    title: { color: colors.text, fontSize: 14.5, ...font.semibold },
    text: {
      color: colors.textSoft,
      fontSize: 14,
      lineHeight: 21,
      ...font.regular,
    },
    retryBtn: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.pill,
    },
    retryText: { color: colors.text, fontSize: 13.5, ...font.medium },
  });
