import { Email } from "@convex-dev/auth/providers/Email";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

// Six digits, not eight — this gets typed on a phone keyboard, often by
// someone who is not in a patient mood.
const CODE_LENGTH = 6;

type SendVerificationRequest = Parameters<
  typeof Email
>[0]["sendVerificationRequest"];

// Convex Auth calls sendVerificationRequest with (params, ctx), but the
// inherited Auth.js type only declares the first argument. The cast restores
// the second so this provider can delegate to a Node-runtime action —
// necessary because SMTP needs a TLS socket, which the V8 runtime lacks.
const sendVerificationRequest = (async (
  { identifier: email, token }: { identifier: string; token: string },
  ctx: ActionCtx,
): Promise<void> => {
  // Dev convenience: surface the code in the Convex logs so a developer can
  // sign in without opening the inbox. Never logs outside dev.
  if (process.env.CONVEX_CLOUD_URL?.includes("127.0.0.1")) {
    console.log(`[dev] OTP for ${email}: ${token}`);
  }
  await ctx.runAction(internal.email.sendOtpEmail, {
    to: email,
    subject: `${token} is your Dhee code`,
    text: [
      `Your sign-in code is ${token}`,
      "",
      "It works for the next 15 minutes.",
      "If you didn't ask for this, you can ignore this email.",
    ].join("\n"),
  });
}) as unknown as SendVerificationRequest;

export const EmailOTP = Email({
  id: "email-otp",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes as Uint8Array<ArrayBuffer>);
      },
    };
    return generateRandomString(random, "0123456789", CODE_LENGTH);
  },
  sendVerificationRequest,
});
