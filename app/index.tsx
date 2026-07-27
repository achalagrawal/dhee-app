import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { api } from "../convex/_generated/api";
import { SigningIn } from "../src/components/SigningIn";
import { Loading } from "../src/components/ui";
import { useOAuthHandoff } from "../src/lib/oauth-return";
import { useTheme } from "../src/lib/ThemeContext";

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

// The first thing anyone sees on a cold open, so it is the mark turning rather
// than the platform's arc (#103).
function Splash() {
  const { colors } = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: colors.bg }]}>
      <Loading />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
