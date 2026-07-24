import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../../src/components/AppShell";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Avatar, Icon, type IconName } from "../../src/components/ui";
import { t } from "../../src/lib/i18n";
import { type ThemePref, useTheme } from "../../src/lib/ThemeContext";
import {
  type AccentName,
  accentNames,
  type Colors,
  font,
  getColors,
  radius,
} from "../../src/lib/theme";
import { useLanguage } from "../../src/lib/useLanguage";

type Pending = "forget" | "deleteChats" | null;

export default function Settings() {
  const { colors, mode, pref, accent, setPref, setAccent } = useTheme();
  const lang = useLanguage();
  const { signOut } = useAuthActions();
  const account = useQuery(api.users.accountSummary);

  const setName = useMutation(api.users.setName);
  const setLanguage = useMutation(api.users.setLanguage);
  const forgetEverything = useMutation(api.understanding.forgetEverything);
  const deleteAllThreads = useMutation(api.chat.deleteAllThreads);

  const [draftName, setDraftName] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (account === undefined) {
    return (
      <AppShell>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppShell>
    );
  }

  const nameValue = draftName ?? account.name ?? "";
  const commitName = () => {
    if (draftName === null) return;
    void setName({ name: draftName });
    setDraftName(null);
  };
  const runPending = () => {
    if (pending === "forget") void forgetEverything();
    if (pending === "deleteChats") void deleteAllThreads();
    setPending(null);
  };

  const themeOptions: { value: ThemePref; label: string }[] = [
    { value: "system", label: t(lang, "themeSystem") },
    { value: "light", label: t(lang, "themeLight") },
    { value: "dark", label: t(lang, "themeDark") },
  ];

  return (
    <AppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t(lang, "navSettings")}</Text>

        {/* Account card */}
        <View style={styles.accountCard}>
          <Pressable
            onPress={() =>
              Alert.alert(t(lang, "appearance"), t(lang, "comingSoon"))
            }
            accessibilityLabel="Upload a photo"
          >
            <Avatar name={account.name} size={50} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.accountName} numberOfLines={1}>
              {account.name?.trim() || "Dhee"}
            </Text>
            {account.email ? (
              <Text style={styles.accountSub} numberOfLines={1}>
                {account.email}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Appearance */}
        <Group label={t(lang, "appearance")} colors={colors}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t(lang, "theme")}</Text>
            <Segmented
              colors={colors}
              options={themeOptions}
              value={pref}
              onChange={setPref}
            />
          </View>
          <View
            style={[
              styles.block,
              styles.blockBorder,
              { borderTopColor: colors.border },
            ]}
          >
            <Text style={styles.blockLabel}>{t(lang, "accentColor")}</Text>
            <View style={styles.swatchRow}>
              {accentNames.map((name) => {
                const swatch = getColors(mode, name).accent;
                const selected = accent === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setAccent(name)}
                    accessibilityLabel={accentLabel(lang, name)}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: swatch,
                        borderColor: selected ? colors.text : "transparent",
                      },
                    ]}
                  >
                    {selected ? (
                      <Icon name="check" size={16} color={colors.onAccent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Group>

        {/* Profile */}
        <Group label={t(lang, "yourName")} colors={colors}>
          <View style={styles.block}>
            <TextInput
              style={styles.input}
              value={nameValue}
              onChangeText={setDraftName}
              onBlur={commitName}
              onSubmitEditing={commitName}
              placeholder={t(lang, "namePlaceholderSettings")}
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
              maxLength={60}
            />
          </View>
          <View
            style={[
              styles.block,
              styles.blockBorder,
              { borderTopColor: colors.border },
            ]}
          >
            <Text style={styles.blockLabel}>{t(lang, "language")}</Text>
            <Segmented
              colors={colors}
              options={[
                { value: "en", label: "English" },
                { value: "hi", label: "हिन्दी" },
              ]}
              value={account.preferredLanguage}
              onChange={(v) => void setLanguage({ preferredLanguage: v })}
            />
          </View>
        </Group>

        {/* Data */}
        <Group label={t(lang, "dataAndPrivacy")} colors={colors}>
          <NavRow
            colors={colors}
            icon="book"
            label={t(lang, "whatDheeKnows")}
            value={t(lang, "knowsSummary")
              .replace("%o", String(account.observationCount))
              .replace("%i", String(account.inquiryCount))
              .replace("%c", String(account.conceptCount))}
            onPress={() => router.push("/understanding")}
          />
          <ActionRow
            colors={colors}
            icon="refresh"
            label={t(lang, "forgetEverything")}
            danger
            onPress={() => setPending("forget")}
          />
          <ActionRow
            colors={colors}
            icon="trash"
            label={t(lang, "deleteAllChats")}
            danger
            onPress={() => setPending("deleteChats")}
          />
        </Group>

        {/* Account */}
        <Group label={t(lang, "account")} colors={colors}>
          <View style={styles.block}>
            <Text style={styles.meta}>
              {t(lang, "memberSince")}{" "}
              {new Date(account.memberSince).toLocaleDateString(
                lang === "hi" ? "hi-IN" : "en-IN",
                { day: "numeric", month: "long", year: "numeric" },
              )}
            </Text>
          </View>
          <ActionRow
            colors={colors}
            icon="chevronRight"
            label={t(lang, "signOut")}
            onPress={() => void signOut()}
          />
        </Group>
      </ScrollView>

      <ConfirmDialog
        visible={pending !== null}
        lang={lang}
        title={
          pending === "forget"
            ? t(lang, "forgetEverything")
            : t(lang, "deleteAllChats")
        }
        body={
          pending === "forget"
            ? t(lang, "forgetEverythingBody")
            : t(lang, "deleteAllChatsBody")
        }
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </AppShell>
  );
}

function accentLabel(
  lang: ReturnType<typeof useLanguage>,
  name: AccentName,
): string {
  return t(
    lang,
    name === "default"
      ? "accentDefault"
      : name === "clay"
        ? "accentClay"
        : name === "sage"
          ? "accentSage"
          : "accentIndigo",
  );
}

function Group({
  label,
  colors,
  children,
}: {
  label: string;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text
        style={{
          fontSize: 12.5,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.textFaint,
          marginBottom: 8,
          marginLeft: 4,
          ...font.semibold,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  colors,
  options,
  value,
  onChange,
}: {
  colors: Colors;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={[segStyles.wrap, { backgroundColor: colors.surface2 }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              segStyles.seg,
              active && {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                segStyles.segText,
                { color: active ? colors.text : colors.textSoft },
                active && font.medium,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NavRow({
  colors,
  icon,
  label,
  value,
  onPress,
}: {
  colors: Colors;
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        { borderTopColor: colors.border },
        pressed && { backgroundColor: colors.surface2 },
      ]}
    >
      <Icon name={icon} size={18} color={colors.textSoft} />
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.label, { color: colors.text }]}>{label}</Text>
        {value ? (
          <Text style={[rowStyles.value, { color: colors.textFaint }]}>
            {value}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={14} color={colors.textFaint} />
    </Pressable>
  );
}

function ActionRow({
  colors,
  icon,
  label,
  danger = false,
  onPress,
}: {
  colors: Colors;
  icon: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        { borderTopColor: colors.border },
        pressed && { backgroundColor: colors.surface2 },
      ]}
    >
      <Icon
        name={icon}
        size={18}
        color={danger ? colors.danger : colors.textSoft}
      />
      <Text
        style={[
          rowStyles.label,
          { flex: 1, color: danger ? colors.danger : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 15.5, ...font.regular },
  value: { fontSize: 13, marginTop: 2, ...font.regular },
});

const segStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  seg: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segText: { fontSize: 14, ...font.regular },
});

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    scroll: {
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 48,
    },
    title: {
      fontSize: 30,
      letterSpacing: -0.5,
      color: colors.text,
      ...font.medium,
    },
    accountCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.surface2,
      borderRadius: radius.lg,
      padding: 16,
      marginTop: 18,
    },
    accountName: { fontSize: 17, color: colors.text, ...font.semibold },
    accountSub: {
      fontSize: 13.5,
      color: colors.textFaint,
      marginTop: 2,
      ...font.regular,
    },
    block: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
    blockBorder: { borderTopWidth: StyleSheet.hairlineWidth },
    blockLabel: { fontSize: 14, color: colors.textSoft, ...font.regular },
    input: {
      fontSize: 16,
      color: colors.text,
      paddingVertical: 2,
      ...font.regular,
    },
    swatchRow: { flexDirection: "row", gap: 12 },
    swatch: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    meta: { fontSize: 14.5, color: colors.textSoft, ...font.regular },
  });
}
