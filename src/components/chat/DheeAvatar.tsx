import { StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import { Icon } from "../ui";

/** The small Dhee logo circle that fronts assistant turns. */
export function DheeAvatar() {
  const { colors } = useTheme();
  return (
    <View style={[styles.circle, { borderColor: colors.border }]}>
      <Icon name="logo" size={16} color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
});
