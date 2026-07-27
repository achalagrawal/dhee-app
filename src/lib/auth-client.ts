import { expoClient } from "@better-auth/expo/client";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { convexSiteUrl } from "./convex-urls";

// Better Auth's handler is mounted on the Convex deployment's *site* origin
// (`.convex.site`), not the API origin the ConvexReactClient talks to — see
// `authComponent.registerRoutes` in convex/http.ts.
//
// The fallback is what makes preview deployments work: their Convex hostname is
// generated per branch, so the Vercel build can only inject the API URL and the
// site origin has to be derived from it (src/lib/convex-urls.ts).
const baseURL =
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
  convexSiteUrl(process.env.EXPO_PUBLIC_CONVEX_URL);
if (!baseURL) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_SITE_URL is not set. Run `pnpm convex:dev` once to populate .env.local.",
  );
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    emailOTPClient(),
    convexClient(),
    // Neither platform can rely on a cookie here, because the handler is on
    // `.convex.site` and the app is not. Native has no cookie jar at all; web
    // has one, but the session cookie is third-party there and browsers drop
    // it. So both sides store the session themselves and replay it as a
    // `Better-Auth-Cookie` header — SecureStore on native, localStorage on
    // web — against the `crossDomain`/`expo` server plugins in convex/auth.ts.
    //
    // Note the *synchronous* SecureStore API: the plugin's storage contract is
    // sync, and the `…Async` variants would hand it a Promise to store.
    ...(Platform.OS === "web"
      ? [crossDomainClient({ storagePrefix: "dhee" })]
      : [
          // The cast is a type-level papering-over, not a behavioural one:
          // `@better-auth/expo` types `getActions` against its own copy of
          // better-fetch's generics, which `better-auth`'s
          // `BetterAuthClientPlugin` won't accept. Both are 1.6.25 and the
          // runtime shapes match. Without it the whole plugin array degrades
          // and `authClient` silently loses `emailOtp`.
          expoClient({
            scheme: "dhee",
            storagePrefix: "dhee",
            storage: {
              getItem: SecureStore.getItem,
              setItem: SecureStore.setItem,
            },
          }) as BetterAuthClientPlugin,
        ]),
  ],
});
