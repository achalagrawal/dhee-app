import { Platform } from "react-native";
import { authClient } from "./auth-client";

/** What the caller needs to know: did we end up signed in, or did the person
 *  simply back out? Cancelling is not an error and shouldn't look like one. */
export type OAuthOutcome = "signed-in" | "cancelled";

// Google sign-in takes two different shapes, and Better Auth's Expo plugin
// hides most of the difference.
//
// On web, `signIn.social` navigates the tab to Google and the provider picks
// the `?code=` back up on return — so the promise never usefully resolves,
// the navigation is the result.
//
// On native there is no navigation to hijack. The Expo plugin opens the URL in
// a system browser sheet, catches the redirect back to the `dhee://` scheme,
// and stores the session in SecureStore. Backing out of that sheet resolves
// without a session rather than throwing, which is the case this function
// exists to translate.
export async function signInWithGoogle(): Promise<OAuthOutcome> {
  const { data, error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: "/",
  });

  if (error) throw new Error(error.message ?? "Google sign-in failed.");

  // Web: the tab is already navigating away, so treat it as in-flight.
  if (Platform.OS === "web") return "signed-in";

  // Native: the plugin reports a redirect URL it handled. No session and no
  // error means the person dismissed the sheet.
  return data && "url" in data && data.url ? "signed-in" : "cancelled";
}
