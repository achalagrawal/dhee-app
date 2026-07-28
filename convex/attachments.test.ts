import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
import {
  asUser,
  attachPhoto,
  attachmentDoc,
  createUser,
  initTest,
  storeBlob,
} from "./test.setup";

// Photo attachments — upload, register, discard. See
// docs/build/specs/photo-attachments.md. Nothing here reaches the model:
// attaching is pure storage bookkeeping, and the send path is covered in
// chat.test.ts.

async function storedBlobCount(t: ReturnType<typeof initTest>) {
  return await t.run(
    async (ctx) => (await ctx.db.system.query("_storage").collect()).length,
  );
}

describe("attachments — auth", () => {
  test("generateUploadUrl throws when unauthenticated", async () => {
    const t = initTest();
    await expect(
      t.mutation(api.attachments.generateUploadUrl, {}),
    ).rejects.toThrow("Not signed in");
  });

  test("attach throws when unauthenticated", async () => {
    const t = initTest();
    const storageId = await storeBlob(t);
    await expect(
      t.mutation(api.attachments.attach, {
        storageId,
        mediaType: "image/jpeg",
      }),
    ).rejects.toThrow("Not signed in");
  });
});

describe("attachments — attach", () => {
  test("registers a photo as an unreferenced file", async () => {
    const t = initTest();
    const user = await createUser(t);
    const fileId = await attachPhoto(t, user);

    const file = await attachmentDoc(t, fileId);
    expect(file?.mediaType).toBe("image/jpeg");
    expect(file?.filename).toBe("photo.jpg");
    // Nothing points at it until a message is saved — which is what makes
    // every step up to send reversible.
    expect(file?.refcount).toBe(0);
  });

  test("refuses anything that is not an image, and keeps none of it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await storeBlob(t, { type: "application/pdf" });

    const result = await asUser(t, user).mutation(api.attachments.attach, {
      storageId,
      mediaType: "application/pdf",
    });

    expect(result).toEqual({ error: "notPhoto" });
    // A refusal returns rather than throwing precisely so this holds: a throw
    // would roll back the delete along with everything else, leaving the
    // rejected bytes in storage with nothing pointing at them.
    expect(await storedBlobCount(t)).toBe(0);
  });

  test("refuses a photo over the size cap, and keeps none of it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await storeBlob(t, { size: MAX_ATTACHMENT_BYTES + 1 });

    const result = await asUser(t, user).mutation(api.attachments.attach, {
      storageId,
      mediaType: "image/jpeg",
    });

    expect(result).toEqual({ error: "tooLarge" });
    expect(await storedBlobCount(t)).toBe(0);
  });

  // Not covered: the cross-check against storage's own `contentType`, for a
  // client that uploads a PDF and calls it `image/png`. `convex-test`'s
  // storage fake records only size and sha256, so the field the check reads is
  // always undefined here and the check is skipped. It is a second line of
  // defence behind the `image/*` rule above, which is covered.
});

describe("attachments — discard", () => {
  test("removes the file and its bytes", async () => {
    const t = initTest();
    const user = await createUser(t);
    const fileId = await attachPhoto(t, user);

    await asUser(t, user).mutation(api.attachments.discard, { fileId });

    expect(await attachmentDoc(t, fileId)).toBeNull();
    expect(await storedBlobCount(t)).toBe(0);
  });

  test("is a no-op on a photo that is already gone", async () => {
    const t = initTest();
    const user = await createUser(t);
    const fileId = await attachPhoto(t, user);
    const as = asUser(t, user);

    await as.mutation(api.attachments.discard, { fileId });
    // Removing twice, or an upload losing a race with its own removal.
    await expect(
      as.mutation(api.attachments.discard, { fileId }),
    ).resolves.toBeNull();
  });

  test("refuses a photo a message is holding on to", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    const fileId = await attachPhoto(t, user);
    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "what is this?",
      fileIds: [fileId],
    });

    await expect(
      as.mutation(api.attachments.discard, { fileId }),
    ).rejects.toThrow("part of a message");
    expect(await attachmentDoc(t, fileId)).not.toBeNull();
  });
});

describe("attachments — dedupe", () => {
  test("the same photo twice registers once", async () => {
    const t = initTest();
    const user = await createUser(t);
    const first = await attachPhoto(t, user);
    const second = await attachPhoto(t, user);

    expect(second).toBe(first);
    // The component kept its own copy, so the duplicate upload's bytes are
    // dropped rather than left orphaned.
    expect(await storedBlobCount(t)).toBe(1);
  });
});

describe("attachments — component wiring", () => {
  test("an attached photo is what the agent's vacuum would collect until it is sent", async () => {
    const t = initTest();
    const user = await createUser(t);
    const fileId = await attachPhoto(t, user);

    const before = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.files.getFilesToDelete, {
          paginationOpts: { cursor: null, numItems: 10 },
        }),
    );
    expect(before.page.map((f) => f._id)).toContain(fileId);

    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "",
      fileIds: [fileId],
    });

    const after = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.files.getFilesToDelete, {
          paginationOpts: { cursor: null, numItems: 10 },
        }),
    );
    expect(after.page.map((f) => f._id)).not.toContain(fileId);
  });
});
