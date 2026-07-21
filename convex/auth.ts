import { convexAuth } from "@convex-dev/auth/server";
import { EmailOTP } from "./EmailOTP";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [EmailOTP],
});
