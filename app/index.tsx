import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { api } from "../convex/_generated/api";
import { colors } from "../src/lib/theme";

// Entry gate. Auth state and onboarding state are both server-owned, so the
// routing decision waits for the query rather than guessing from local state.
export default function Index() {
  return (
    <>
      <AuthLoading>
        <Splash />
      </AuthLoading>
      <Unauthenticated>
        <Redirect href="/sign-in" />
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
  return <Redirect href="/threads" />;
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
