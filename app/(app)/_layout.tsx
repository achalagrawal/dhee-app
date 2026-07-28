import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Redirect, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppDrawer } from "../../src/components/AppDrawer";
import { AppSidebar } from "../../src/components/AppSidebar";
import { SearchModal } from "../../src/components/SearchModal";
import { Loading } from "../../src/components/ui";
import { ShellProvider } from "../../src/lib/shell";
import { useTheme } from "../../src/lib/ThemeContext";
import { useIsDesktop } from "../../src/lib/useIsDesktop";

// Auth gate for every signed-in screen. The parentheses keep this group out
// of the URL, so routes stay at /home, /threads, /settings, and so on.
//
// Without this, deep-linking or refreshing on any of these routes runs the
// screen's queries while signed out and surfaces a raw "Not signed in"
// server error instead of sending the person to sign in.
//
// Signed in, the whole group is wrapped in the app shell context, and the
// sidebar + search overlay are mounted once here so they sit beside (desktop)
// or above (narrower) whichever screen the Stack is showing.
export default function AppLayout() {
  const { colors } = useTheme();
  const isDesktop = useIsDesktop();
  return (
    <>
      <AuthLoading>
        <View style={[styles.splash, { backgroundColor: colors.bg }]}>
          <Loading />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <Redirect href="/sign-in" />
      </Unauthenticated>
      <Authenticated>
        <ShellProvider>
          <View style={styles.shell}>
            {isDesktop ? <AppSidebar /> : null}
            <View style={styles.flex}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              />
            </View>
            {isDesktop ? null : <AppDrawer />}
            <SearchModal />
          </View>
        </ShellProvider>
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shell: { flex: 1, flexDirection: "row" },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
