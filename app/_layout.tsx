import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { convex, secureStorage } from "../src/lib/convex";
import { fontMap } from "../src/lib/fonts";
import { ThemeProvider, useTheme } from "../src/lib/ThemeContext";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Render nothing until fonts resolve, so Devanagari never flashes in the
  // system fallback face. A font failure still lets the app through.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <ThemeProvider>
        <SafeAreaProvider>
          <Themed />
        </SafeAreaProvider>
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}

// Keeps the app background and status bar in step with the resolved theme so
// there's no light flash behind screens during navigation in dark mode.
function Themed() {
  const { mode, colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </View>
  );
}
