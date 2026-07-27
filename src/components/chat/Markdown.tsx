import { type ReactNode, useMemo } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type Block, parseMarkdown, type Span } from "../../lib/markdown";
import { type Colors, font, radius } from "../../lib/theme";

// Draws a formatted assistant reply. The parser is in lib/markdown.ts; this
// file is only the styling of what it produced. See
// docs/build/specs/markdown-replies.md.

// Custom font families don't synthesize weights on native, so bold is a
// different face rather than a fontWeight. Italic does synthesize, and there
// is no italic Hanken in the bundle, so fontStyle is the honest choice.
const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, monospace",
});

// Styles depend only on the palette, and the palette changes about as often as
// the theme toggle is pressed — so they are built once per palette rather than
// once per message. Keyed on the Colors object itself, which useTheme keeps
// stable for as long as mode and accent do.
const sheets = new WeakMap<Colors, ReturnType<typeof makeStyles>>();
function stylesFor(colors: Colors) {
  let sheet = sheets.get(colors);
  if (!sheet) {
    sheet = makeStyles(colors);
    sheets.set(colors, sheet);
  }
  return sheet;
}

export function Markdown({
  text,
  colors,
  /** Rendered at the very end — the streaming caret. */
  trailing,
}: {
  text: string;
  colors: Colors;
  trailing?: ReactNode;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const styles = stylesFor(colors);

  // A caret with nothing to trail (the fence has opened but said nothing yet)
  // still needs somewhere to sit.
  if (blocks.length === 0) {
    return trailing ? <Text style={styles.text}>{trailing}</Text> : null;
  }

  return (
    <View>
      {blocks.map((block, i) => (
        <MarkdownBlock
          key={i}
          block={block}
          styles={styles}
          spacing={gapBefore(blocks[i - 1], block)}
          trailing={i === blocks.length - 1 ? trailing : undefined}
        />
      ))}
    </View>
  );
}

// List items sit close together; a heading wants air above it and little
// below. Margins rather than a container gap, because the amount depends on
// which two blocks meet.
function gapBefore(previous: Block | undefined, block: Block): number {
  if (!previous) return 0;
  if (block.type === "item" && previous.type === "item") return 6;
  if (block.type === "heading") return 18;
  if (previous.type === "heading") return 6;
  return 12;
}

function MarkdownBlock({
  block,
  styles,
  spacing,
  trailing,
}: {
  block: Block;
  styles: ReturnType<typeof makeStyles>;
  spacing: number;
  trailing?: ReactNode;
}) {
  const margin = { marginTop: spacing };

  switch (block.type) {
    case "heading":
      return (
        <Text style={[styles.text, styles[`h${block.level}`], margin]}>
          <Inline spans={block.spans} styles={styles} />
          {trailing}
        </Text>
      );

    case "quote":
      return (
        <View style={[styles.quote, margin]}>
          <Text style={[styles.text, styles.quoteText]}>
            <Inline spans={block.spans} styles={styles} />
            {trailing}
          </Text>
        </View>
      );

    case "item":
      return (
        <View style={[styles.item, margin, { marginLeft: block.depth * 18 }]}>
          {block.ordered ? (
            <Text style={[styles.text, styles.marker]}>{block.marker}</Text>
          ) : (
            // Drawn rather than typed: neither face in the bundle carries a
            // bullet, so the glyph falls through to whatever the platform has
            // and lands as a small square.
            <View style={styles.dot} />
          )}
          <Text style={[styles.text, styles.itemText]}>
            <Inline spans={block.spans} styles={styles} />
            {trailing}
          </Text>
        </View>
      );

    case "code":
      // Code is the one thing that must not re-wrap: a wrapped line reads as a
      // different line. It scrolls sideways instead.
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.codeBlock, margin]}
          contentContainerStyle={styles.codeBlockInner}
        >
          <Text style={styles.codeBlockText}>
            {block.text}
            {trailing}
          </Text>
        </ScrollView>
      );

    case "rule":
      return <View style={[styles.rule, margin]} />;

    default:
      return (
        <Text style={[styles.text, margin]}>
          <Inline spans={block.spans} styles={styles} />
          {trailing}
        </Text>
      );
  }
}

function Inline({
  spans,
  styles,
}: {
  spans: Span[];
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <>
      {spans.map((span, i) => {
        const href = span.href;
        return (
          <Text
            key={i}
            style={[
              span.bold && styles.bold,
              span.italic && styles.italic,
              span.strike && styles.strike,
              span.code && styles.code,
              href !== undefined && styles.link,
            ]}
            onPress={
              href === undefined
                ? undefined
                : // A link the model invented may not open; that is a dead
                  // tap, not an error worth a dialog.
                  () => void Linking.openURL(href).catch(() => {})
            }
          >
            {span.text}
          </Text>
        );
      })}
    </>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    text: {
      color: colors.text,
      fontSize: 16.5,
      lineHeight: 27,
      ...font.regular,
    },
    bold: { ...font.semibold },
    italic: { fontStyle: "italic" },
    strike: { textDecorationLine: "line-through" },
    link: { color: colors.accentStrong, textDecorationLine: "underline" },
    code: {
      fontFamily: MONO,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface3,
      // Web honours padding on an inline span; native ignores it, which is
      // why the tint alone has to be enough to read as code.
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    h1: { fontSize: 21, lineHeight: 30, ...font.semibold },
    h2: { fontSize: 19, lineHeight: 28, ...font.semibold },
    h3: { fontSize: 17, lineHeight: 26, ...font.semibold },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accentSoft,
      paddingLeft: 12,
    },
    quoteText: { color: colors.textSoft },
    item: { flexDirection: "row", gap: 8 },
    marker: { color: colors.textSoft, minWidth: 16 },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.textFaint,
      // Centres the dot on the first line of the item.
      marginTop: 11,
      marginLeft: 6,
      marginRight: 5,
    },
    itemText: { flex: 1, minWidth: 0 },
    codeBlock: {
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
    },
    codeBlockInner: { paddingHorizontal: 12, paddingVertical: 10 },
    codeBlockText: {
      fontFamily: MONO,
      fontSize: 14.5,
      lineHeight: 22,
      color: colors.text,
    },
    rule: {
      height: 1,
      backgroundColor: colors.border,
    },
  });
}
