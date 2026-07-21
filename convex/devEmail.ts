"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internalAction } from "./_generated/server";

// Dev-only SMTP check. `verify()` opens the TLS connection and authenticates
// without delivering anything, so credentials and host reachability can be
// confirmed without mailing a real person:
//
//   npx convex run devEmail:smtpCheck '{}'

export const smtpCheck = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), detail: v.string() }),
  handler: async () => {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USERNAME;
    const pass = process.env.EMAIL_PASSWORD;
    const port = Number(process.env.EMAIL_PORT ?? 465);

    if (!host) return { ok: false, detail: "EMAIL_HOST is not set." };

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    try {
      await transport.verify();
      return {
        ok: true,
        detail: `Authenticated to ${host}:${port} as ${user ?? "anonymous"}.`,
      };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  },
});
