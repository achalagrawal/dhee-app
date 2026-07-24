import { useConvexConnectionState } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import { t } from "../lib/i18n";
import type { Language } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { font, spacing } from "../lib/theme";

// The Convex client already buffers mutations while the socket is down and
// replays them on reconnect, so a sent message is never lost. This only makes
// that visible — otherwise a reply that never arrives looks like a bug.
export function OfflineBanner({ lang }: { lang: Language }) {
  const { colors } = useTheme();
  const { isWebSocketConnected, hasEverConnected, inflightMutations } =
    useConvexConnectionState();

  // Don't flash during the initial connect, only on a genuine drop.
  if (isWebSocketConnected || !hasEverConnected) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
      <Text style={[styles.text, { color: colors.accentStrong }]}>
        {inflightMutations > 0 ? t(lang, "sending") : t(lang, "offline")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: 14,
    textAlign: "center",
    ...font.regular,
  },
});
