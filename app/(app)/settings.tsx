import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
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
import { TRADITIONS } from "../../src/lib/traditions";
import { useLanguage } from "../../src/lib/useLanguage";

type Pending = "forget" | "deleteChats" | null;

// Matches the server cap in users.setPersonalization. Kept here only so the
// input can stop typing at the same place the server would truncate — the
// server is still the one that enforces it.
const ABOUT_YOU_MAX = 600;

// Free plan gets one lens (design `PRICING`). Mirrored from the server, which
// is where it is actually enforced — this copy only decides when to explain
// the limit instead of letting the mutation reject.
const FREE_LENS_LIMIT = 1;

type PersonalFields = {
  nickname: string;
  occupation: string;
  aboutYou: string;
};

export default function Settings() {
  const { colors, mode, pref, accent, setPref, setAccent } = useTheme();
  const lang = useLanguage();
  const { signOut } = useAuthActions();
  const account = useQuery(api.users.accountSummary);
  const profile = useQuery(api.users.currentProfile);

  const setName = useMutation(api.users.setName);
  const setPersonalization = useMutation(api.users.setPersonalization);
  const setTraditions = useMutation(api.users.setTraditions);
  const setLanguage = useMutation(api.users.setLanguage);
  const forgetEverything = useMutation(api.understanding.forgetEverything);
  const deleteAllThreads = useMutation(api.chat.deleteAllThreads);
  const generateAvatarUploadUrl = useMutation(
    api.users.generateAvatarUploadUrl,
  );
  const setAvatar = useMutation(api.users.setAvatar);

  const [draftName, setDraftName] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  // Held locally while typing, then committed on blur — the same quiet feel as
  // the name field above, with no per-field Save button. Null means "nothing
  // edited yet", so the server's value shows through.
  const [personalDraft, setPersonalDraft_] = useState<Partial<PersonalFields>>(
    {},
  );
  const [lensDraft, setLensDraft] = useState("");
  const [lensError, setLensError] = useState(false);

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

  // What's on screen: the draft where one exists, otherwise the stored value.
  const personal: PersonalFields = {
    nickname: personalDraft.nickname ?? profile?.nickname ?? "",
    occupation: personalDraft.occupation ?? profile?.occupation ?? "",
    aboutYou: personalDraft.aboutYou ?? profile?.aboutYou ?? "",
  };
  const setPersonalDraft = (patch: Partial<PersonalFields>) =>
    setPersonalDraft_((prev) => ({ ...prev, ...patch }));
  const commitPersonal = () => {
    // Sends only what was actually edited, so an untouched field is left alone
    // rather than rewritten with its own value. An edited-to-empty field is
    // still sent — clearing has to reach the prompt.
    if (Object.keys(personalDraft).length === 0) return;
    void setPersonalization(personalDraft);
    setPersonalDraft_({});
  };
  // ---- Tradition lens ----
  const lenses = profile?.traditions ?? [];
  const has = (name: string) =>
    lenses.some((l) => l.toLowerCase() === name.trim().toLowerCase());
  // Free plan gets one. The server enforces this regardless of what the client
  // sends (users.setTraditions) — this is only so the limit is explained here
  // rather than surfacing as a failed mutation.
  const lensLimitHit = lenses.length >= FREE_LENS_LIMIT;

  const saveLenses = (next: string[]) => {
    setLensError(false);
    void setTraditions({ traditions: next });
  };
  const addLens = (raw: string) => {
    const name = raw.trim();
    if (!name || has(name)) return;
    if (lensLimitHit) {
      // The upgrade popup is #10; until it exists, say plainly why rather than
      // failing silently or letting the mutation reject.
      setLensError(true);
      return;
    }
    saveLenses([...lenses, name]);
    setLensDraft("");
  };
  const removeLens = (name: string) => {
    setLensError(false);
    saveLenses(lenses.filter((l) => l !== name));
  };

  const typed = lensDraft.trim();
  const canAddTyped =
    typed.length > 0 &&
    !has(typed) &&
    !TRADITIONS.some((tr) => tr.toLowerCase() === typed.toLowerCase());
  // Filtered by what's been typed, capped so the section doesn't become a wall
  // of 25 chips.
  const suggestions = TRADITIONS.filter(
    (tr) =>
      !has(tr) && (!typed || tr.toLowerCase().includes(typed.toLowerCase())),
  ).slice(0, 8);

  const runPending = () => {
    if (pending === "forget") void forgetEverything();
    if (pending === "deleteChats") void deleteAllThreads();
    setPending(null);
  };

  const pickAvatar = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      const uploadUrl = await generateAvatarUploadUrl();
      const blob = await (await fetch(picked.assets[0].uri)).blob();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      const { storageId } = await res.json();
      await setAvatar({ storageId });
    } catch {
      Alert.alert(t(lang, "changePhoto"), t(lang, "somethingWentWrong"));
    }
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
            onPress={pickAvatar}
            accessibilityLabel={t(lang, "changePhoto")}
          >
            <Avatar name={account.name} size={50} uri={account.avatarUrl} />
            <View style={styles.avatarBadge}>
              <Icon name="plus" size={11} color={colors.onAccent} />
            </View>
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

        {/* More about you — this is what Dhee is told, verbatim. */}
        <Group
          label={t(lang, "moreAboutYou")}
          hint={t(lang, "moreAboutYouHint")}
          colors={colors}
        >
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t(lang, "nickname")}</Text>
            <TextInput
              style={styles.input}
              value={personal.nickname}
              onChangeText={(v) => setPersonalDraft({ nickname: v })}
              onBlur={commitPersonal}
              onSubmitEditing={commitPersonal}
              placeholder={t(lang, "nicknamePlaceholder")}
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
            <Text style={styles.blockLabel}>{t(lang, "occupation")}</Text>
            <TextInput
              style={styles.input}
              value={personal.occupation}
              onChangeText={(v) => setPersonalDraft({ occupation: v })}
              onBlur={commitPersonal}
              onSubmitEditing={commitPersonal}
              placeholder={t(lang, "occupationPlaceholder")}
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
              maxLength={120}
            />
          </View>
          <View
            style={[
              styles.block,
              styles.blockBorder,
              { borderTopColor: colors.border },
            ]}
          >
            <Text style={styles.blockLabel}>{t(lang, "aboutYou")}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={personal.aboutYou}
              onChangeText={(v) => setPersonalDraft({ aboutYou: v })}
              onBlur={commitPersonal}
              multiline
              placeholder={t(lang, "aboutYouPlaceholder")}
              placeholderTextColor={colors.textFaint}
              maxLength={ABOUT_YOU_MAX}
            />
            {/* Only once the cap is close — otherwise it's noise. */}
            {personal.aboutYou.length > ABOUT_YOU_MAX - 100 ? (
              <Text style={styles.counter}>
                {personal.aboutYou.length} / {ABOUT_YOU_MAX}
              </Text>
            ) : null}
          </View>
        </Group>

        {/* Tradition lens */}
        <Group
          label={t(lang, "traditionLens")}
          hint={t(lang, "traditionLensHint")}
          colors={colors}
        >
          <View style={styles.block}>
            <TextInput
              style={styles.input}
              value={lensDraft}
              onChangeText={setLensDraft}
              onSubmitEditing={() => addLens(lensDraft)}
              placeholder={t(lang, "traditionPlaceholder")}
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
              maxLength={60}
            />
            {/* A tradition not on the list is first-class, not a fallback. */}
            {canAddTyped ? (
              <Pressable
                onPress={() => addLens(lensDraft)}
                style={styles.addLensBtn}
              >
                <Text style={styles.addLensLabel}>
                  {t(lang, "addTradition").replace("%s", lensDraft.trim())}
                </Text>
              </Pressable>
            ) : null}

            {lenses.length > 0 ? (
              <View style={styles.chipRow}>
                {lenses.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => removeLens(name)}
                    accessibilityLabel={t(lang, "removeTradition").replace(
                      "%s",
                      name,
                    )}
                    style={[styles.chip, styles.chipActive]}
                  >
                    <Text style={[styles.chipLabel, styles.chipLabelActive]}>
                      {name}
                    </Text>
                    <Icon name="close" size={11} color={colors.accentStrong} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Only after they've tried — not a standing scold. */}
            {lensError ? (
              <Text style={styles.lensLimit}>{t(lang, "oneLensOnFree")}</Text>
            ) : null}

            <View style={styles.chipRow}>
              {suggestions.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => addLens(name)}
                  style={styles.chip}
                >
                  <Text style={styles.chipLabel}>{name}</Text>
                </Pressable>
              ))}
            </View>

            {lenses.length > 0 ? (
              <Pressable onPress={() => saveLenses([])} hitSlop={6}>
                <Text style={styles.clearLenses}>{t(lang, "clearLenses")}</Text>
              </Pressable>
            ) : null}
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
  hint,
  colors,
  children,
}: {
  label: string;
  /** One line under the header, for sections that need to say what they do. */
  hint?: string;
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
          marginBottom: hint ? 4 : 8,
          marginLeft: 4,
          ...font.semibold,
        }}
      >
        {label}
      </Text>
      {hint ? (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 19,
            color: colors.textFaint,
            marginBottom: 8,
            marginLeft: 4,
            marginRight: 4,
            ...font.regular,
          }}
        >
          {hint}
        </Text>
      ) : null}
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
    avatarBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surface2,
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
    textArea: { minHeight: 56, textAlignVertical: "top", lineHeight: 23 },
    // Tradition lens
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipActive: {
      borderColor: "transparent",
      backgroundColor: colors.accentSoft,
    },
    chipLabel: { fontSize: 13.5, color: colors.textSoft, ...font.regular },
    chipLabelActive: { color: colors.accentStrong, ...font.medium },
    addLensBtn: { alignSelf: "flex-start" },
    addLensLabel: {
      fontSize: 13.5,
      color: colors.accentStrong,
      ...font.medium,
    },
    lensLimit: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textFaint,
      ...font.regular,
    },
    clearLenses: {
      fontSize: 13.5,
      color: colors.textFaint,
      ...font.regular,
    },
    counter: {
      alignSelf: "flex-end",
      fontSize: 12,
      color: colors.textFaint,
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
