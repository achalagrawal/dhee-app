import { AwsClient } from "aws4fetch";
import { isLoopback } from "./lib/backend";

// Transactional email over the SES v2 HTTP API.
//
// This module deliberately runs in Convex's default V8 runtime. The previous
// implementation used nodemailer over SMTP, which needs a raw TLS socket and
// so forced `"use node"` — a second bundle and a slower cold start on the
// sign-in path. SigV4 over `fetch` needs neither, so V8 is now the only
// runtime this backend uses.
//
// Note on credentials: these are ordinary **IAM** keys (`ses:SendEmail`), not
// SES *SMTP* credentials. An SES SMTP password is derived one-way from an IAM
// secret and cannot sign SigV4, so the two are not interchangeable — if you
// are migrating from the SMTP setup you need to mint a fresh IAM key.

export type EmailArgs = {
  to: string;
  subject: string;
  text: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in the Convex deployment.`);
  }
  return value;
}

/** A local backend with no SES credentials skips the send instead of throwing.
 *
 *  This is what lets someone clone the repo and sign in without being handed
 *  AWS keys at all: `convex dev --local` logs the OTP in the clear (auth.ts),
 *  and without this guard `requireEnv` would throw right afterwards and fail
 *  the mutation that just logged a perfectly usable code.
 *
 *  Both halves matter. Set the AWS vars on a local backend and mail goes out
 *  normally, so the real send path stays testable; and on a cloud deployment
 *  missing credentials still throw, because silently dropping sign-in mail in
 *  production is the worst outcome available. */
export function shouldSkipSend(env: {
  convexCloudUrl?: string;
  awsAccessKeyId?: string;
}): boolean {
  return isLoopback(env.convexCloudUrl) && !env.awsAccessKeyId;
}

/** Plain function, not a Convex function: the Better Auth handler already runs
 *  in an action, so there is nothing to gain from another hop. */
export async function sendEmail({ to, subject, text }: EmailArgs) {
  if (
    shouldSkipSend({
      convexCloudUrl: process.env.CONVEX_CLOUD_URL,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    })
  ) {
    console.log(
      `[dev] SES is not configured on this local backend — not sending "${subject}" to ${to}.`,
    );
    return;
  }

  const region = requireEnv("AWS_REGION");
  const from = requireEnv("AUTH_EMAIL_FROM");

  const aws = new AwsClient({
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    // Present only when running under temporary credentials.
    sessionToken: process.env.AWS_SESSION_TOKEN,
    service: "ses",
    region,
  });

  const response = await aws.fetch(
    `https://email.${region}.amazonaws.com/v2/email/outbound-emails`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            // Sign-in mail may be Devanagari, so both parts are explicitly
            // UTF-8 rather than relying on the default.
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    // SES returns a JSON body with a message; surface it, since the common
    // failures (unverified identity, still in sandbox) are self-explanatory
    // and otherwise invisible.
    throw new Error(
      `SES SendEmail failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
}
