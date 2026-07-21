import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { convex, secureStorage } from "../src/lib/convex";

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </ConvexAuthProvider>
  );
}
