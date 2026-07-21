// Verifies the SigV4 primitives in ses.ts against AWS's published test
// vectors. Hand-rolled signing fails at runtime with opaque AWS errors, so
// this checks the algorithm without needing live credentials.
//
// Run: node --experimental-strip-types convex/lib/ses.test.mjs

import assert from "node:assert/strict";
import { deriveSigningKey, __testing } from "./ses.ts";

const { hex, sha256Hex } = __testing;

// AWS Signature Version 4 documented example.
// https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
const SECRET = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

// 1. Signing key derivation for the documented iam/us-east-1/20150830 case.
const signingKey = await deriveSigningKey(
  SECRET,
  "20150830",
  "us-east-1",
  "iam",
);
assert.equal(
  hex(signingKey),
  "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
  "signing key derivation does not match AWS's documented value",
);

// 2. SHA-256 of an empty payload, the value SES sees for a bodyless request.
assert.equal(
  await sha256Hex(""),
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sha256 of empty string is wrong",
);

// 3. Full string-to-sign round trip from the same AWS example, which
//    exercises canonical-request hashing and the final HMAC together.
const canonicalRequest = [
  "GET",
  "/",
  "Action=ListUsers&Version=2010-05-08",
  "content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:iam.amazonaws.com\nx-amz-date:20150830T123600Z\n",
  "content-type;host;x-amz-date",
  await sha256Hex(""),
].join("\n");

const stringToSign = [
  "AWS4-HMAC-SHA256",
  "20150830T123600Z",
  "20150830/us-east-1/iam/aws4_request",
  await sha256Hex(canonicalRequest),
].join("\n");

const signature = hex(await __testing.hmac(signingKey, stringToSign));
assert.equal(
  signature,
  "5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
  "final signature does not match AWS's documented value",
);

console.log("SigV4 primitives match AWS published vectors ✓");
