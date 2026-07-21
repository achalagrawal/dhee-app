import { Email } from "@convex-dev/auth/providers/Email";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { Resend as ResendAPI } from "resend";

// Six digits, not eight — this gets typed on a phone keyboard, often by
// someone who is not in a patient mood.
const CODE_LENGTH = 6;

export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", CODE_LENGTH);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? "Dhee <onboarding@resend.dev>",
      to: [email],
      subject: `${token} is your Dhee code`,
      text: [
        `Your sign-in code is ${token}`,
        "",
        "It works for the next 15 minutes.",
        "If you didn't ask for this, you can ignore this email.",
      ].join("\n"),
    });
    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
