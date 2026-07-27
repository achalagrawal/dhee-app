import { StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import { DheeMark } from "../ui/DheeMark";

/**
 * The Dhee mark that fronts assistant turns. `animated` runs its sweep — on
 * while the reply is still being worked out, off once it lands.
 */
export function DheeAvatar({ animated = false }: { animated?: boolean }) {
  const { colors } = useTheme();
  return (
    // The mark is already a ring, so it stands in for the mockup's bordered
    // circle rather than sitting inside one — at 16px the rays would smear.
    // accentStrong, not accent: forty hairlines at the lighter tone grey out
    // against the light background in a way a solid shape would not.
    <View style={styles.slot}>
      <DheeMark size={30} color={colors.accentStrong} animated={animated} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
});
