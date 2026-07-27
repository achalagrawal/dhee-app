import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { api } from "../convex/_generated/api";
import { SigningIn } from "../src/components/SigningIn";
import { useOAuthHandoff } from "../src/lib/oauth-return";
import { colors } from "../src/lib/theme";

// Entry gate. Auth state and onboarding state are both server-owned, so the
// routing decision waits for the query rather than guessing from local state.
export default function Index() {
  // Google drops people back here with the session still in flight, and Convex
  // reports that gap as plain "unauthenticated" (src/lib/oauth-return.ts).
  // Redirecting on it shows the sign-in screen to someone who just signed in.
  const handingOff = useOAuthHandoff();
  return (
    <>
      <AuthLoading>
        <Splash />
      </AuthLoading>
      <Unauthenticated>
        {handingOff ? <SigningIn /> : <Redirect href="/sign-in" />}
      </Unauthenticated>
      <Authenticated>
        <OnboardingGate />
      </Authenticated>
    </>
  );
}

function OnboardingGate() {
  const profile = useQuery(api.users.currentProfile);
  if (profile === undefined) return <Splash />;
  if (!profile?.onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/home" />;
}

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.accent} />
    </View>
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
