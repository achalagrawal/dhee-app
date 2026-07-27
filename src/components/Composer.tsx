import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextInput as TextInputType,
  TextInput,
  type TextInputContentSizeChangeEvent,
  View,
} from "react-native";
import { t } from "../lib/i18n";
import { composerKeyAction } from "../lib/keyboard";
import { useTheme } from "../lib/ThemeContext";
import { font, noFocusRing, radius, shadow } from "../lib/theme";
import type { Attachment } from "../lib/useAttachments";
import { useEnterToSend } from "../lib/useEnterToSend";
import { useLanguage } from "../lib/useLanguage";
import { Icon, IconButton } from "./ui";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder: string;
  minHeight?: number;
  autoFocus?: boolean;
  /** When generating, the send button becomes a stop button. */
  generating?: boolean;
  onStop?: () => void;
  /**
   * Photos waiting on this message. Given `onPickPhoto`, the (+) opens the
   * photo library; without it — incognito, which saves nothing — (+) keeps
   * its "coming soon" note.
   */
  attachments?: Attachment[];
  onPickPhoto?: () => void;
  onRemoveAttachment?: (key: string) => void;
};

// Past this the input scrolls instead of growing.
const MAX_HEIGHT = 160;

// The rounded composer card shared by Home and Chat. Text entry, Send and
// photo attachments are wired; the model pill is rendered for fidelity but is
// inert until its backend exists — it surfaces a "coming soon" note so nothing
// looks broken.
//
// Voice mode and dictation used to sit beside Send and pop "coming soon" (#97).
// Neither has a cheap path — dictation needs a native module or a transcription
// vendor, voice mode needs TTS plus barge-in — so they are hidden rather than
// left inert next to the button people press most. They come back when Epic 12
// lands; their icons (`mic`/`voice`) and labels are still in place waiting.
export function Composer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  minHeight = 24,
  autoFocus = false,
  generating = false,
  onStop,
  attachments = [],
  onPickPhoto,
  onRemoveAttachment,
}: Props) {
  const { colors, mode } = useTheme();
  const lang = useLanguage();
  const inputRef = useRef<TextInputType>(null);
  const [height, setHeight] = useState(minHeight);
  const sendOnEnter = useEnterToSend();
  // A photo on its own is a message: "what is this?" without the words.
  // Sending waits on the uploads, so a half-attached photo can't be lost.
  const uploading = attachments.some((a) => !a.fileId);
  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !uploading;

  const soon = (label: string) => Alert.alert(label, t(lang, "comingSoon"));

  const clamp = useCallback(
    (h: number) => Math.min(MAX_HEIGHT, Math.max(minHeight, h)),
    [minHeight],
  );

  // Native reports the real content height, so its measurement is trustworthy.
  // On web there is nothing to subscribe to — react-native-web derives this
  // from `scrollHeight`, which the effect below reads directly.
  const onContentSizeChange = useMemo(
    () =>
      Platform.OS === "web"
        ? undefined
        : (e: TextInputContentSizeChangeEvent) => {
            const next = clamp(e.nativeEvent.contentSize.height);
            setHeight((prev) => (prev === next ? prev : next));
          },
    [clamp],
  );

  // A `<textarea>`'s `scrollHeight` is floored by its own height, so measuring
  // while our height is applied can only ever report growth — the composer
  // would never shrink back after a line was deleted. Collapse to zero first so
  // the measurement is the content alone (`auto` is not enough: it falls back
  // to the element's default two `rows`), then write the result back in the
  // same layout pass, before anything is painted.
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) return;
    node.style.height = "0px";
    const next = clamp(node.scrollHeight);
    node.style.height = `${next}px`;
    setHeight((prev) => (prev === next ? prev : next));
  }, [value, clamp]);

  return (
    <View
      style={[
        styles.card,
        shadow(mode),
        { backgroundColor: colors.surface, borderColor: colors.borderStrong },
      ]}
    >
      {attachments.length > 0 ? (
        <View style={styles.chips}>
          {attachments.map((a) => (
            <View
              key={a.key}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border,
                  // Dimmed until the upload lands, which is the same moment
                  // Send comes back.
                  opacity: a.fileId ? 1 : 0.55,
                },
              ]}
            >
              {/* The mockup's generic glyph, except a filename says nothing
                  about which photo this is. Same geometry, real thumbnail. */}
              <Image
                source={{ uri: a.uri }}
                style={[styles.chipThumb, { borderColor: colors.border }]}
                accessibilityIgnoresInvertColors
              />
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: colors.text }]}
              >
                {a.name}
              </Text>
              <Pressable
                onPress={() => onRemoveAttachment?.(a.key)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "removePhoto")}
              >
                <Text style={[styles.chipRemove, { color: colors.textFaint }]}>
                  ×
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline
        autoFocus={autoFocus}
        // A free-text prompt is not a password, card or address field. Without
        // this, react-native-web ships `autocomplete="on"` and iOS Safari treats
        // the composer as an AutoFill target: it re-decides candidacy on every
        // keystroke, showing and hiding the AutoFill accessory row above the
        // keyboard, which reads as the keyboard blinking. Issue #72.
        autoComplete="off"
        onKeyPress={(e) => {
          if (composerKeyAction(e, { sendOnEnter }) !== "send") return;
          // Swallow the newline even when we can't send — an Enter that both
          // fails to send and leaves a blank line behind is the worst of both.
          e.preventDefault();
          if (canSend && !generating) onSubmit();
        }}
        onContentSizeChange={onContentSizeChange}
        style={[
          styles.input,
          noFocusRing,
          { color: colors.text, height: Math.max(minHeight, height) },
        ]}
      />

      <View style={styles.row}>
        <View style={styles.left}>
          {/* Straight to the photo library. The mockup's attach *menu*
              (files, photos, web search) waits until there is more than one
              thing on it. */}
          <IconButton
            name="plus"
            variant="surface"
            size={36}
            accessibilityLabel={t(lang, onPickPhoto ? "addPhoto" : "addFiles")}
            onPress={onPickPhoto ?? (() => soon(t(lang, "addFiles")))}
          />
          <Pressable
            onPress={() => soon(t(lang, "chooseModel"))}
            style={({ pressed }) => [
              styles.modelPill,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.modelText, { color: colors.textSoft }]}>
              Dhee
            </Text>
            <Icon name="chevronDown" size={11} color={colors.textSoft} />
          </Pressable>
        </View>

        <View style={styles.right}>
          {generating ? (
            <IconButton
              name="stop"
              size={40}
              color={colors.bg}
              accessibilityLabel={t(lang, "stop")}
              onPress={onStop}
              style={{ backgroundColor: colors.text, borderRadius: 20 }}
            />
          ) : (
            <IconButton
              name="send"
              size={40}
              variant="accent"
              disabled={!canSend}
              accessibilityLabel={t(lang, "send")}
              onPress={onSubmit}
              style={{ borderRadius: 20 }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 6,
    maxWidth: 200,
  },
  chipThumb: { width: 22, height: 22, borderRadius: 5, borderWidth: 1 },
  chipText: { fontSize: 13, flexShrink: 1, ...font.regular },
  chipRemove: { fontSize: 15, lineHeight: 15 },
  input: {
    fontSize: 16.5,
    lineHeight: 24,
    ...font.regular,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  modelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  modelText: { fontSize: 13, ...font.regular },
});
