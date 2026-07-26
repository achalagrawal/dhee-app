import { AwsClient } from "aws4fetch";
import { v } from "convex/values";
import { sendEmail } from "./email";
import { internalAction } from "./_generated/server";

// Dev-only credential check. SES v2's GetAccount is a read-only call, so this
// proves the IAM keys, region, and SigV4 signing all work without delivering
// anything to a real person — the same role `transport.verify()` played for
// the SMTP setup this replaces.
//
//   npx convex run devEmail:sesCheck '{}'

export const sesCheck = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), detail: v.string() }),
  handler: async () => {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!region) return { ok: false, detail: "AWS_REGION is not set." };
    if (!accessKeyId || !secretAccessKey) {
      return {
        ok: false,
        detail: "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set.",
      };
    }
    if (!process.env.AUTH_EMAIL_FROM) {
      return { ok: false, detail: "AUTH_EMAIL_FROM is not set." };
    }

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      service: "ses",
      region,
    });

    try {
      const response = await aws.fetch(
        `https://email.${region}.amazonaws.com/v2/email/account`,
      );
      if (!response.ok) {
        return {
          ok: false,
          detail: `HTTP ${response.status}: ${await response.text()}`,
        };
      }
      const account = (await response.json()) as {
        ProductionAccessEnabled?: boolean;
        SendingEnabled?: boolean;
      };
      // Sandboxed accounts can only mail verified addresses — the single most
      // common reason a sign-in code never arrives.
      return {
        ok: account.SendingEnabled !== false,
        detail: `region ${region}, sending ${
          account.SendingEnabled === false ? "disabled" : "enabled"
        }, ${
          account.ProductionAccessEnabled
            ? "production access"
            : "SANDBOX — only verified addresses will receive mail"
        }.`,
      };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  },
});

// Dev-only end-to-end send. `sesCheck` proves the credentials sign correctly;
// this proves a message actually leaves SES and lands in an inbox, which is the
// one thing a read-only call cannot tell you. Goes through the same
// `sendEmail` that the Better Auth handler uses, so a pass here covers the
// real sign-in path — including `AUTH_EMAIL_FROM` being a verified identity.
//
//   npx convex run devEmail:sendTest '{"to":"you@example.com"}'

export const sendTest = internalAction({
  args: { to: v.string() },
  returns: v.object({ ok: v.boolean(), detail: v.string() }),
  handler: async (_ctx, { to }) => {
    try {
      await sendEmail({
        to,
        subject: "Dhee — SES test",
        text: "If you are reading this, Dhee can send sign-in mail through SES.",
      });
      return { ok: true, detail: `Accepted by SES for delivery to ${to}.` };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  },
});
