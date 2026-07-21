import { Email } from "@convex-dev/auth/providers/Email";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { sendEmailViaSes } from "./lib/ses";

// Six digits, not eight — this gets typed on a phone keyboard, often by
// someone who is not in a patient mood.
const CODE_LENGTH = 6;

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
  async sendVerificationRequest({ identifier: email, token }) {
    const from = process.env.AUTH_EMAIL_FROM;
    if (!from) {
      throw new Error(
        "AUTH_EMAIL_FROM is not set. It must be an identity verified in SES.",
      );
    }
    await sendEmailViaSes({
      to: email,
      from,
      subject: `${token} is your Dhee code`,
      text: [
        `Your sign-in code is ${token}`,
        "",
        "It works for the next 15 minutes.",
        "If you didn't ask for this, you can ignore this email.",
      ].join("\n"),
    });
  },
});
