// Minimal AWS SES v2 client: SigV4-signed fetch, no SDK.
//
// The AWS SDK would pull several MB and force this module into Convex's Node
// runtime. SES's SendEmail is a single JSON POST, and SigV4 is a stable,
// well-specified algorithm over Web Crypto — so signing by hand keeps the
// auth provider in the default V8 runtime with zero dependencies.
//
// Spec: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html

const SERVICE = "ses";
const ALGORITHM = "AWS4-HMAC-SHA256";

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  message: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

// kSigning = HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")
// Exported so the derivation can be checked against AWS's published test
// vector — see convex/lib/ses.test.mjs.
export async function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string = SERVICE,
): Promise<ArrayBuffer> {
  let key: ArrayBuffer | Uint8Array = encoder.encode(`AWS4${secretKey}`);
  for (const part of [dateStamp, region, service, "aws4_request"]) {
    key = await hmac(key, part);
  }
  return key as ArrayBuffer;
}

export const __testing = { hex, sha256Hex, hmac };

export type SesEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

export async function sendEmailViaSes({
  to,
  from,
  subject,
  text,
}: SesEmail): Promise<void> {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "SES is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in the Convex deployment.",
    );
  }

  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const payload = JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        // UTF-8 matters here: sign-in mail may be Devanagari.
        Body: { Text: { Data: text, Charset: "UTF-8" } },
      },
    },
  });

  // 20260721T093000Z / 20260721
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(payload);

  // Header names must be lowercase and sorted for both lists below.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalRequest = [
    "POST",
    path,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region);
  const signature = hex(await hmac(signingKey, stringToSign));

  const response = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `${ALGORITHM} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
  });

  if (!response.ok) {
    // SES returns a JSON body with a useful message; surface it rather than
    // just the status, since misconfiguration here is common (unverified
    // sender identity, sandbox restrictions, wrong region).
    const detail = await response.text();
    throw new Error(`SES send failed (${response.status}): ${detail}`);
  }
}
