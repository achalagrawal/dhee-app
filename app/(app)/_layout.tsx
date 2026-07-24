import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppDrawer } from "../../src/components/AppDrawer";
import { SearchModal } from "../../src/components/SearchModal";
import { ShellProvider } from "../../src/lib/shell";
import { useTheme } from "../../src/lib/ThemeContext";

// Auth gate for every signed-in screen. The parentheses keep this group out
// of the URL, so routes stay at /home, /threads, /settings, and so on.
//
// Without this, deep-linking or refreshing on any of these routes runs the
// screen's queries while signed out and surfaces a raw "Not signed in"
// server error instead of sending the person to sign in.
//
// Signed in, the whole group is wrapped in the app shell context, and the
// drawer + search overlays are mounted once here so they float above whichever
// screen the Stack is showing.
export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <>
      <AuthLoading>
        <View style={[styles.splash, { backgroundColor: colors.bg }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <Redirect href="/sign-in" />
      </Unauthenticated>
      <Authenticated>
        <ShellProvider>
          <View style={styles.flex}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            />
            <AppDrawer />
            <SearchModal />
          </View>
        </ShellProvider>
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
