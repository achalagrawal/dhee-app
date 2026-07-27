import type { Ref } from "react";
import { useState } from "react";
import {
  Image,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import { focusRing, font, noFocusRing, radius } from "../../lib/theme";
import { Icon, type IconName } from "./Icon";
import { Loading } from "./Loading";

export { Icon } from "./Icon";
export type { IconName } from "./Icon";
export { Loading } from "./Loading";

/**
 * A text input for forms — sign-in, onboarding, settings — where someone moves
 * between several fields and needs to see which one they are in. Swaps Safari's
 * blue system ring for one in the app's accent. Surfaces with a single input
 * that its own card already frames (the composer, the message editors, search,
 * rename) use `TextInput` with `noFocusRing` and show no ring at all.
 */
export function Field({
  style,
  onFocus,
  onBlur,
  ref,
  ...props
}: TextInputProps & { ref?: Ref<TextInput> }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      {...props}
      style={[style, focused ? focusRing(colors) : noFocusRing]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}

function initials(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "•";
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "•";
}

/** Circular avatar — the uploaded photo when present, else initials. */
export function Avatar({
  name,
  size = 30,
  uri,
}: {
  name?: string | null;
  size?: number;
  uri?: string | null;
}) {
  const { colors } = useTheme();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: colors.accentStrong,
          fontSize: size * 0.46,
          ...font.semibold,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  /** Bordered surface pill (the design's round mobile buttons). */
  variant?: "plain" | "surface" | "accent";
  disabled?: boolean;
  accessibilityLabel: string;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  name,
  onPress,
  size = 38,
  iconSize,
  color,
  variant = "plain",
  disabled = false,
  accessibilityLabel,
  filled,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const bg =
    variant === "surface"
      ? colors.surface
      : variant === "accent"
        ? colors.accent
        : "transparent";
  const iconColor =
    color ?? (variant === "accent" ? colors.onAccent : colors.textSoft);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: variant === "plain" ? radius.md : size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: variant === "surface" ? 1 : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      <Icon
        name={name}
        size={iconSize ?? Math.round(size * 0.5)}
        color={iconColor}
        filled={filled}
      />
    </Pressable>
  );
}

/** Accent-filled pill CTA. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          backgroundColor: colors.accent,
          borderRadius: radius.pill,
          paddingVertical: 13,
          paddingHorizontal: 24,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        // Sized to the label's own line so the pill doesn't resize mid-press.
        <Loading size={20} color={colors.onAccent} />
      ) : (
        <Text
          style={{ color: colors.onAccent, fontSize: 15.5, ...font.semibold }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Small rounded label chip. */
export function Pill({
  label,
  icon,
  tone = "surface",
}: {
  label: string;
  icon?: IconName;
  tone?: "surface" | "accent";
}) {
  const { colors } = useTheme();
  const accentTone = tone === "accent";
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: accentTone ? colors.accentSoft : colors.surface,
          borderColor: accentTone ? "transparent" : colors.border,
        },
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={13}
          color={accentTone ? colors.accentStrong : colors.textSoft}
        />
      ) : null}
      <Text
        style={{
          fontSize: 12.5,
          color: accentTone ? colors.accentStrong : colors.textSoft,
          ...font.medium,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
