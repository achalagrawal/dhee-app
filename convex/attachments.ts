import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireUserId } from "./users";

// Photos a person attaches to a message. See
// docs/build/specs/photo-attachments.md.
//
// Two steps, because the agent component needs the bytes to already be in
// storage: the client POSTs to a signed upload URL (the same dance the avatar
// does in users.ts), then calls `attach` with the storageId it gets back. That
// second call is what registers the file with the component — which is what
// gives it a refcount, and lets `chat.sendMessage` hang an image part off it.
//
// A registered file starts at refcount 0 and only reaches 1 when a message
// referencing it is saved. So everything here is reversible right up to send.

/**
 * The per-image ceiling. Claude's own limit is 5 MB per image, so a larger
 * upload would be accepted here and then refused at generation time — a
 * failure the person would meet a turn later, with no way to connect it to
 * the photo. Refusing at the door is the kinder version of the same rule.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Why an upload was turned away, as a code rather than a sentence: the client
 * owns the wording, in both languages.
 *
 * A refusal *returns* instead of throwing, which is not a style choice. A
 * mutation that throws rolls its whole transaction back — including the
 * `storage.delete` that clears the rejected bytes — so a thrown refusal would
 * leave in storage exactly the file it refused, with nothing pointing at it.
 */
export const vAttachmentError = v.union(
  v.literal("missing"),
  v.literal("notPhoto"),
  v.literal("mismatch"),
  v.literal("tooLarge"),
);

export const attach = mutation({
  args: {
    storageId: v.id("_storage"),
    // What the picker says the photo is. Declared rather than read off storage
    // because it is also what the message part is labelled with — and checked
    // against storage's own record below, so declaring it doesn't make it
    // trustworthy.
    mediaType: v.string(),
    filename: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ fileId: v.string() }),
    v.object({ error: vAttachmentError }),
  ),
  handler: async (ctx, { storageId, mediaType, filename }) => {
    await requireUserId(ctx);

    const meta = await ctx.db.system.get(storageId);
    // Nothing arrived, so there is nothing to clean up either.
    if (!meta) return { error: "missing" as const };

    // Storage records the Content-Type the bytes actually arrived under, so a
    // client claiming `image/png` over a PDF is caught by the second check.
    const refusal = !mediaType.startsWith("image/")
      ? ("notPhoto" as const)
      : meta.contentType && meta.contentType !== mediaType
        ? ("mismatch" as const)
        : meta.size > MAX_ATTACHMENT_BYTES
          ? ("tooLarge" as const)
          : null;
    if (refusal) {
      // The person's next action is to pick a different photo; these bytes
      // would otherwise sit in storage with no row anywhere pointing at them.
      await ctx.storage.delete(storageId);
      return { error: refusal };
    }

    // The component dedupes on (hash, filename) and hands back the storageId
    // it decided to keep. Storage computed the hash on upload, so it costs a
    // system read rather than re-reading the bytes.
    const file = await ctx.runMutation(components.agent.files.addFile, {
      storageId,
      hash: meta.sha256,
      filename,
      mediaType,
    });
    // It kept an earlier copy of the same photo, so ours is a duplicate with
    // nothing pointing at it.
    if (file.storageId !== storageId) await ctx.storage.delete(storageId);

    return { fileId: file.fileId };
  },
});

// The `×` on a composer chip. Signed-in is the whole of the check: the
// component's files table has no owner, and a fileId is only knowable to
// whoever just uploaded it. What that bounds the blast radius to is another
// signed-in person's *unsent* upload — a saved message's photo is refcounted
// above zero and refused below.
export const discard = mutation({
  args: { fileId: v.string() },
  returns: v.null(),
  handler: async (ctx, { fileId }) => {
    await requireUserId(ctx);

    const file = await ctx.runQuery(components.agent.files.get, { fileId });
    // Already gone: the person removed it twice, or an upload lost a race with
    // its own removal. Not worth an error either way.
    if (!file) return null;
    if (file.refcount > 0) {
      throw new Error("That photo is part of a message.");
    }

    await ctx.runMutation(components.agent.files.deleteFiles, {
      fileIds: [file._id],
    });
    await ctx.storage.delete(file.storageId as Id<"_storage">);
    return null;
  },
});
