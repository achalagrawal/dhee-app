import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dhee</Text>
      <Text style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: "300",
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    opacity: 0.6,
  },
});
