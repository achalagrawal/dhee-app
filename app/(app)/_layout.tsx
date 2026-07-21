import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "../../src/lib/theme";

// Auth gate for every signed-in screen. The parentheses keep this group out
// of the URL, so routes stay at /threads, /settings, and so on.
//
// Without this, deep-linking or refreshing on any of these routes runs the
// screen's queries while signed out and surfaces a raw "Not signed in"
// server error instead of sending the person to sign in.
export default function AppLayout() {
  return (
    <>
      <AuthLoading>
        <View style={styles.splash}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <Redirect href="/sign-in" />
      </Unauthenticated>
      <Authenticated>
        <Stack screenOptions={{ headerShown: false }} />
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
