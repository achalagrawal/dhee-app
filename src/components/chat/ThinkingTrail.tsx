import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import {
  activeActivity,
  activityText,
  type Activity,
} from "../../lib/activity";
import { t } from "../../lib/i18n";
import { USE_NATIVE_DRIVER } from "../../lib/motion";
import { useTheme } from "../../lib/ThemeContext";
import { font, type Colors } from "../../lib/theme";
import type { Language } from "../../lib/i18n";
import { DheeAvatar } from "./DheeAvatar";

// What shows while Dhee works, in place of the mockup's single static line.
// Contract in docs/build/specs/chat-loop.md §3, tool-part reading in
// src/lib/activity.ts.

// The steps before the current one are context, not a log. Four is enough to
// see that Dhee went looking; more turns the indicator into a wall. Study-mode
// turns measure at three steps total (see STUDY_STEPS), so this rarely bites.
const TRAIL_MAX = 4;

const PULSE_MS = 900;

export function ThinkingTrail({
  activities = [],
  lang,
}: {
  activities?: Activity[];
  lang: Language;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(1)).current;

  // A single step can run for seconds with nothing new to say. The motion is
  // what tells someone it's working rather than wedged.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: PULSE_MS,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const active = activeActivity(activities);
  const done = activities.filter((a) => a.done).slice(-TRAIL_MAX);

  // Three states, in order of what is actually true: a tool is running; every
  // tool has come back but no word has been written yet; nothing has been
  // reached for at all.
  const current = active
    ? `${activityText(lang, active)}…`
    : activities.length > 0
      ? `${t(lang, "actTakingIn")}…`
      : t(lang, "thinking");

  return (
    // One line sits beside the avatar, as in the mockup; a trail hangs off the
    // top of it, the way the avatar fronts a multi-line reply.
    <View style={[styles.row, done.length > 0 && styles.rowTrail]}>
      <DheeAvatar animated />
      <View style={styles.lines}>
        {done.map((activity) => (
          <Text key={activity.id} style={styles.doneText} numberOfLines={1}>
            {activityText(lang, activity)}
          </Text>
        ))}
        <Animated.Text style={[styles.currentText, { opacity: pulse }]}>
          {current}
        </Animated.Text>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    rowTrail: { alignItems: "flex-start" },
    lines: { flex: 1, gap: 2 },
    currentText: {
      color: colors.textFaint,
      fontSize: 15,
      fontStyle: "italic",
      ...font.regular,
    },
    doneText: {
      color: colors.textFaint,
      fontSize: 13,
      opacity: 0.65,
      ...font.regular,
    },
  });
}
