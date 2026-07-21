"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internalAction } from "./_generated/server";

// SMTP delivery for sign-in codes.
//
// This module is Node-runtime because SMTP needs a raw TLS socket, which
// Convex's default V8 runtime cannot open — it only has fetch. Convex Auth
// passes `ctx` into sendVerificationRequest, so the provider (V8) can hop
// here via ctx.runAction.
//
// Note on SES: the credentials here are SES *SMTP* credentials, which are
// not IAM API credentials. An SES SMTP password is derived one-way from an
// IAM secret key, so it cannot be used to sign SigV4 requests against the
// SES HTTP API. SMTP is the only option with these.

export const sendOtpEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, { to, subject, text }) => {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USERNAME;
    const pass = process.env.EMAIL_PASSWORD;
    const from = process.env.AUTH_EMAIL_FROM;
    const port = Number(process.env.EMAIL_PORT ?? 465);

    if (!host || !from) {
      throw new Error(
        "Email is not configured. Set EMAIL_HOST and AUTH_EMAIL_FROM in the Convex deployment.",
      );
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      // Some SMTP servers accept unauthenticated relay on a private network.
      auth: user && pass ? { user, pass } : undefined,
    });

    await transport.sendMail({
      from,
      to,
      subject,
      text,
      // Sign-in mail may be Devanagari.
      textEncoding: "base64",
    });
    return null;
  },
});
