import { useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { t } from "../lib/i18n";
import { shareLinkFor } from "../lib/share-url";
import { useTheme } from "../lib/ThemeContext";
import { font, radius, spacing } from "../lib/theme";
import { useLanguage } from "../lib/useLanguage";
import { Icon } from "./ui";

// The share dialog, from the mockup's SHARE MODAL (~1078). Opening it mints the
// link — the prototype's `openShare` creates, opens and copies in one step, and
// a separate "create a link?" confirm would be a second decision about a thing
// the person already asked for.
//
// What it must say out loud, before the link exists: that anyone holding it can
// read the conversation, and that it is a snapshot. See
// docs/build/specs/sharing.md.
export function ShareSheet({
  threadId,
  onClose,
}: {
  /** Non-null opens the sheet. */
  threadId: string | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const lang = useLanguage();
  const shareThread = useMutation(api.share.shareThread);
  const unshareThread = useMutation(api.share.unshareThread);
  const existing = useQuery(
    api.share.shareForThread,
    threadId ? { threadId } : "skip",
  );

  const [slug, setSlug] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const say = useCallback((message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 1600);
  }, []);

  const copy = useCallback(
    async (link: string, message: string) => {
      await Clipboard.setStringAsync(link);
      say(message);
    },
    [say],
  );

  // Reset when a different conversation's sheet opens, so a stale link is
  // never on screen while the new one is being made.
  useEffect(() => {
    setSlug(null);
    setFailed(false);
    setFlash(null);
  }, [threadId]);

  // Mint on open, unless this conversation already has a live link — then the
  // sheet opens on that one, and extending it is the explicit "Update" below.
  useEffect(() => {
    if (!threadId || existing === undefined || slug) return;
    if (existing) {
      setSlug(existing.slug);
      void copy(shareLinkFor(existing.slug), t(lang, "linkCopied"));
      return;
    }
    let cancelled = false;
    void shareThread({ threadId })
      .then(({ slug: created }) => {
        if (cancelled) return;
        setSlug(created);
        void copy(shareLinkFor(created), t(lang, "linkCopied"));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, existing, slug, shareThread, copy, lang]);

  const link = slug ? shareLinkFor(slug) : null;

  const update = () => {
    if (!threadId) return;
    void shareThread({ threadId })
      .then(() => say(t(lang, "shareUpdated")))
      .catch(() => setFailed(true));
  };

  const stop = () => {
    if (threadId) void unshareThread({ threadId });
    onClose();
  };

  return (
    <Modal
      visible={threadId !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.card,
            { backgroundColor: colors.bg, borderColor: colors.border },
          ]}
        >
          <View style={styles.head}>
            <View
              style={[styles.mark, { backgroundColor: colors.accentSoft }]}
              accessible={false}
            >
              <Icon name="share" size={18} color={colors.accentStrong} />
            </View>
            <View style={styles.headText}>
              <Text style={[styles.title, { color: colors.text }]}>
                {t(lang, "shareTitle")}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textFaint }]}>
                {t(lang, "shareSubtitle")}
              </Text>
            </View>
          </View>

          <Text style={[styles.note, { color: colors.textSoft }]}>
            {t(lang, "shareSnapshotNote")}
          </Text>

          {failed ? (
            <Text style={[styles.failed, { color: colors.danger }]}>
              {t(lang, "shareFailed")}
            </Text>
          ) : link ? (
            <>
              <View
                style={[
                  styles.linkRow,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.linkText, { color: colors.textSoft }]}
                >
                  {link}
                </Text>
                <Pressable
                  onPress={() => void copy(link, t(lang, "linkCopied"))}
                  style={({ pressed }) => [
                    styles.copyBtn,
                    {
                      backgroundColor: colors.accent,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.copyLabel, { color: colors.onAccent }]}>
                    {t(lang, "copyLink")}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Pressable onPress={update} hitSlop={6} style={styles.textBtn}>
                  <Text
                    style={[styles.textBtnLabel, { color: colors.textSoft }]}
                  >
                    {t(lang, "shareUpdate")}
                  </Text>
                </Pressable>
                <Pressable onPress={stop} hitSlop={6} style={styles.textBtn}>
                  <Text style={[styles.textBtnLabel, { color: colors.danger }]}>
                    {t(lang, "unshare")}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.pending}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.note, { color: colors.textFaint }]}>
                {t(lang, "shareCreating")}
              </Text>
            </View>
          )}

          {/* Reserves its own line, so confirming a copy doesn't shift the
              dialog under the finger that just tapped. */}
          <Text style={[styles.flash, { color: colors.accentStrong }]}>
            {flash ?? " "}
          </Text>

          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={[styles.doneLabel, { color: colors.textSoft }]}>
              {t(lang, "done")}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, ...font.semibold },
  subtitle: { fontSize: 13, marginTop: 2, ...font.regular },
  note: { fontSize: 13.5, lineHeight: 20, ...font.regular },
  failed: { fontSize: 14, ...font.regular, paddingVertical: spacing.sm },
  pending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: spacing.md,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: 14,
    padding: 6,
    marginTop: spacing.xs,
  },
  linkText: { flex: 1, minWidth: 0, fontSize: 14, ...font.regular },
  copyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  copyLabel: { fontSize: 13.5, ...font.semibold },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  textBtn: { paddingVertical: 6 },
  textBtnLabel: { fontSize: 14, ...font.medium },
  flash: { fontSize: 13, textAlign: "center", ...font.medium },
  doneBtn: { alignItems: "center", paddingVertical: 6 },
  doneLabel: { fontSize: 14.5, ...font.regular },
});
