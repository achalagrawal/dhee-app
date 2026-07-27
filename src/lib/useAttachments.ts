import { useMutation } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "../../convex/_generated/api";
import { t } from "./i18n";
import type { useLanguage } from "./useLanguage";

// Photos waiting on a message. Owned here rather than in the Composer because
// Home and Chat both compose, and neither should own an upload.
//
// Each photo uploads the moment it is picked, so sending is instant. Until its
// upload lands a photo has no `fileId`, which is what `sending` waits on.
// See docs/build/specs/photo-attachments.md.

export type Attachment = {
  /** Ours, stable from the moment it is picked — the fileId only exists later. */
  key: string;
  /** The local file, for the preview. Never sent anywhere. */
  uri: string;
  name: string;
  /** Null while uploading. */
  fileId: string | null;
};

type Lang = ReturnType<typeof useLanguage>;

const DEFAULT_MEDIA_TYPE = "image/jpeg";

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAttachments(lang: Lang) {
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const attach = useMutation(api.attachments.attach);
  const discard = useMutation(api.attachments.discard);

  const [items, setItems] = useState<Attachment[]>([]);
  // Photos removed while their upload was still in flight. The upload can't be
  // called back, so it checks this on the way out and discards what nobody
  // wants any more.
  const abandoned = useRef(new Set<string>());

  const drop = useCallback((key: string) => {
    setItems((prev) => prev.filter((a) => a.key !== key));
  }, []);

  const fail = useCallback(
    (key: string, reason: "notPhoto" | "tooLarge" | "other") => {
      drop(key);
      Alert.alert(
        t(lang, "addPhoto"),
        t(
          lang,
          reason === "notPhoto"
            ? "onlyPhotos"
            : reason === "tooLarge"
              ? "photoTooLarge"
              : "somethingWentWrong",
        ),
      );
    },
    [drop, lang],
  );

  const upload = useCallback(
    async (key: string, asset: ImagePicker.ImagePickerAsset, name: string) => {
      try {
        const blob = await (await fetch(asset.uri)).blob();
        // The picker knows better than the blob does: a `file://` fetch on
        // native often comes back with no type at all.
        const mediaType = asset.mimeType || blob.type || DEFAULT_MEDIA_TYPE;

        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": mediaType },
          body: blob,
        });
        const { storageId } = await res.json();
        const result = await attach({ storageId, mediaType, filename: name });

        if ("error" in result) {
          abandoned.current.delete(key);
          fail(
            key,
            result.error === "notPhoto" || result.error === "tooLarge"
              ? result.error
              : "other",
          );
          return;
        }
        // Removed while this was in the air.
        if (abandoned.current.delete(key)) {
          await discard({ fileId: result.fileId });
          return;
        }
        setItems((prev) =>
          prev.map((a) =>
            a.key === key ? { ...a, fileId: result.fileId } : a,
          ),
        );
      } catch {
        abandoned.current.delete(key);
        fail(key, "other");
      }
    },
    [generateUploadUrl, attach, discard, fail],
  );

  const pick = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (picked.canceled) return;
    for (const asset of picked.assets) {
      const key = newKey();
      const name = asset.fileName ?? `photo-${key}.jpg`;
      setItems((prev) => [
        ...prev,
        { key, uri: asset.uri, name, fileId: null },
      ]);
      void upload(key, asset, name);
    }
  }, [upload]);

  const remove = useCallback(
    (key: string) => {
      const item = items.find((a) => a.key === key);
      drop(key);
      if (!item) return;
      if (item.fileId) void discard({ fileId: item.fileId });
      else abandoned.current.add(key);
    },
    [items, drop, discard],
  );

  // After a send. No discard: the message now holds these, and discarding a
  // photo someone can see in their own transcript is the one thing this must
  // never do.
  const clear = useCallback(() => {
    setItems([]);
    abandoned.current.clear();
  }, []);

  return {
    attachments: items,
    pick,
    remove,
    clear,
    /** What `chat.sendMessage` takes. Empty until every upload has landed. */
    fileIds: items.map((a) => a.fileId).filter((id): id is string => !!id),
    uploading: items.some((a) => !a.fileId),
  };
}
