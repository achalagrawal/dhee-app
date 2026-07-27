import { expo } from "@better-auth/expo";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { sendEmail } from "./email";
import { isLoopback } from "./lib/backend";
import { parseOrigins } from "./lib/origins";
import { normalizeProviderName } from "./users";

// Auth foundation. See docs/build/specs/auth-foundation.md.
//
// The component owns the real auth tables (user, session, account, …) inside
// its own namespace. We keep an app-side `users` row per component user, made
// and unmade by the triggers below, so every product table can keep a real
// `v.id("users")` foreign key instead of an opaque string from a JWT.
//
// Nothing in the app queries the component in order to authorize: see
// `requireUserId` in users.ts, which resolves `identity.subject` against our
// own `by_auth_id` index and stops there.

// The explicit annotation breaks a type cycle: the config below names
// `internal.auth.onCreate`, which is generated from this module's own exports,
// one of which is derived from `authComponent`. Without it, tsc gives up and
// infers `any`, which silently unties every downstream Convex type.
export const authComponent: ReturnType<typeof createClient<DataModel>> =
  createClient<DataModel>(components.betterAuth, {
    triggers: {
      user: {
        onCreate: async (ctx, doc) => {
          const name = normalizeProviderName(doc.name);

          // Account linking (see accountLinking.trustedProviders below) means
          // this can fire twice for one person — an email OTP sign-up
          // followed by Google on the same address. If our own row already
          // exists for that email, adopt the new authId rather than creating
          // a second `users` row; nothing past this point (profile seeding,
          // avatar import) should run again for someone who already onboarded.
          const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", doc.email))
            .unique();
          if (existing) {
            await ctx.db.patch(existing._id, { authId: doc._id, name });
            return;
          }

          const userId = await ctx.db.insert("users", {
            authId: doc._id,
            email: doc.email,
            name,
            createdAt: Date.now(),
            plan: "free",
          });

          // Seed the profile from whatever the provider told us, so onboarding
          // opens with the person's name already in the field. Email sign-ups
          // arrive with nothing to seed, which is fine — the field is editable
          // either way and onboarding is what makes it real.
          await ctx.db.insert("profiles", {
            userId,
            name,
            // Sign-in happens before anyone picks a language; onboarding is
            // where they choose, and this row is not yet onboarded.
            preferredLanguage: "en",
            onboarded: false,
            createdAt: Date.now(),
          });

          // Pull the provider's photo into our own storage, off the sign-in
          // path. A photo that won't download is never a reason to fail a
          // sign-in, so this is scheduled rather than awaited.
          if (doc.image) {
            await ctx.scheduler.runAfter(0, internal.users.importOAuthAvatar, {
              userId,
              url: doc.image,
            });
          }
        },

        onUpdate: async (ctx, newDoc) => {
          // Keep the mirror honest if someone changes their name or email with
          // the provider. Product data hangs off our `_id`, so nothing moves.
          const user = await ctx.db
            .query("users")
            .withIndex("by_auth_id", (q) => q.eq("authId", newDoc._id))
            .unique();
          if (!user) return;
          await ctx.db.patch(user._id, {
            email: newDoc.email,
            name: normalizeProviderName(newDoc.name),
          });
        },

        onDelete: async (ctx, doc) => {
          const user = await ctx.db
            .query("users")
            .withIndex("by_auth_id", (q) => q.eq("authId", doc._id))
            .unique();
          if (!user) return;

          // Deleting this row alone would strand everything pointing at it —
          // the profile and its photo, the conversations, and every inference
          // Dhee drew about the person. Scheduled before the delete so the id
          // is still in hand; paging a long history is more work than belongs
          // on a trigger.
          await ctx.scheduler.runAfter(0, internal.account.purgeUserData, {
            userId: user._id,
          });
          await ctx.db.delete(user._id);
        },
      },
    },
    authFunctions: {
      onCreate: internal.auth.onCreate,
      onUpdate: internal.auth.onUpdate,
      onDelete: internal.auth.onDelete,
    },
  });

// The component calls back into these to run the triggers above in app context.
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    // The origin Better Auth's own handler answers on — which is the Convex
    // deployment's site origin (see http.ts), not SITE_URL where the app is
    // served. Every URL Better Auth hands to a third party is built from this,
    // so pointing it at the app origin sends Google a `redirect_uri` of
    // `${SITE_URL}/api/auth/callback/google` — a route that doesn't exist on
    // that origin — and Google rejects the whole flow with redirect_uri_mismatch.
    //
    // SITE_URL is still the right answer for "where does the person end up",
    // which is `crossDomain({ siteUrl })` below and lib/redirect.ts.
    baseURL: process.env.CONVEX_SITE_URL,
    database: authComponent.adapter(ctx),

    // Read twice over: `registerRoutes(..., { cors: true })` in http.ts reflects
    // these back as `Access-Control-Allow-Origin`, and Better Auth checks them
    // again when validating a callback target. The CORS layer reads this option
    // directly, so Better Auth's implicit default (the baseURL origin) never
    // reaches it — leaving this unset returns a preflight with every CORS header
    // *except* the one that matters, and the browser rejects the call with a
    // bare "Failed to fetch" and nothing in the response to explain it.
    trustedOrigins: [
      ...(process.env.SITE_URL ? [process.env.SITE_URL] : []),
      // Preview deployments only: a Vercel preview answers on two hostnames
      // and SITE_URL can only be one of them. Unset in production. See
      // lib/origins.ts and scripts/vercel-build.mjs.
      ...parseOrigins(process.env.EXTRA_TRUSTED_ORIGINS),
      // Native never presents an http origin; it comes back on the app's own
      // scheme. Matches APP_SCHEME in lib/redirect.ts and `expo.scheme`.
      "dhee://",
    ],

    // A person who signed in with a code and later uses Google with the same
    // address must land in the same account. Google verifies its addresses,
    // which is what makes trusting it here safe — an unverified provider in
    // this list would be an account-takeover route.
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },

    socialProviders: {
      google: {
        clientId: process.env.AUTH_GOOGLE_ID ?? "",
        clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      },
    },

    plugins: [
      emailOTP({
        // Six digits, not eight — this gets typed on a phone keyboard, often
        // by someone who is not in a patient mood.
        otpLength: 6,
        expiresIn: 60 * 15,
        // Codes are stored hashed and three wrong guesses burn the code.
        // Neither was true of the SMTP setup this replaces.
        storeOTP: "hashed",
        allowedAttempts: 3,
        sendVerificationOTP: async ({ email, otp }) => {
          // Dev convenience: surface the code in the Convex logs so a
          // developer can sign in without opening an inbox — and, on a local
          // backend with no AWS keys, without SES existing at all (email.ts
          // skips the send rather than throwing). Local only.
          if (isLoopback(process.env.CONVEX_CLOUD_URL)) {
            console.log(`[dev] OTP for ${email}: ${otp}`);
          }
          await sendEmail({
            to: email,
            subject: `${otp} is your Dhee code`,
            text: [
              `Your sign-in code is ${otp}`,
              "",
              "It works for the next 15 minutes.",
              "If you didn't ask for this, you can ignore this email.",
            ].join("\n"),
          });
        },
      }),
      // The web build's session lives here. Better Auth would normally set a
      // cookie, but the handler is on `.convex.site` while the app is on
      // SITE_URL, which makes it a third-party cookie — Safari and Firefox
      // drop it outright and Chrome is heading the same way. This plugin
      // sends the session as a `Set-Better-Auth-Cookie` header instead, which
      // `crossDomainClient` in src/lib/auth-client.ts stores and replays.
      //
      // It defers to `expo()` below for native requests (it matches on the
      // `expo-origin` header), so registering both is correct, not redundant.
      crossDomain({ siteUrl: process.env.SITE_URL ?? "" }),
      expo(),
      convex({ authConfig }),
    ],
  });
