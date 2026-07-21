import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set. Run `pnpm convex:dev` once to populate .env.local.",
  );
}

export const convex = new ConvexReactClient(url, {
  unsavedChangesWarning: false,
});

// SecureStore has no web implementation; ConvexAuthProvider falls back to
// localStorage when storage is undefined.
export const secureStorage =
  Platform.OS === "web"
    ? undefined
    : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        removeItem: SecureStore.deleteItemAsync,
      };
