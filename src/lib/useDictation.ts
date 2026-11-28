import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type DictationFailure,
  MAX_RECORDING_MS,
  micErrorReason,
  pickMimeType,
} from "./dictation";

// Speak instead of type. Records from the microphone in the browser, uploads
// the clip, and hands back the transcript for the composer to put in the box,
// where the person reads and fixes it before sending. Nothing is sent on its
// own. See docs/build/specs/dictation.md.
//
// Web only for now — the app ships as a web app. Native would need
// expo-audio for the recording; the server half would not change.

export type DictationState =
  | { phase: "idle" }
  | { phase: "recording"; startedAt: number }
  | { phase: "transcribing" };

/** True where the browser can record: MediaRecorder plus getUserMedia. */
export function dictationSupported(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function useDictation(onText: (text: string) => void) {
  const generateUploadUrl = useMutation(api.voice.generateUploadUrl);
  const transcribe = useAction(api.voice.transcribe);

  const [supported] = useState(dictationSupported);
  const [state, setState] = useState<DictationState>({ phase: "idle" });
  const [error, setError] = useState<DictationFailure | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  // Set by cancel, so the recorder's stop handler throws the clip away.
  const discard = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  const send = useCallback(
    async (clip: Blob) => {
      setState({ phase: "transcribing" });
      try {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": clip.type || "audio/webm" },
          body: clip,
        });
        if (!res.ok) throw new Error(`upload ${res.status}`);
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        const result = await transcribe({ storageId });
        if (result.ok) onTextRef.current(result.text);
        else setError(result.reason);
      } catch (err) {
        console.error("dictation failed", err);
        setError("failed");
      } finally {
        setState({ phase: "idle" });
      }
    },
    [generateUploadUrl, transcribe],
  );

  const start = useCallback(async () => {
    if (!supported || recorder.current) return;
    setError(null);
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(micErrorReason(err));
      return;
    }
    const mimeType = pickMimeType((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    stream.current = media;
    recorder.current = rec;
    chunks.current = [];
    discard.current = false;
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || "audio/webm";
      const clip = new Blob(chunks.current, { type });
      chunks.current = [];
      release();
      if (discard.current || clip.size === 0) {
        setState({ phase: "idle" });
        return;
      }
      void send(clip);
    };
    rec.start();
    const startedAt = Date.now();
    setNow(startedAt);
    setState({ phase: "recording", startedAt });
  }, [release, send, supported]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    discard.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else release();
    setState({ phase: "idle" });
  }, [release]);

  // The clock, and the cap on how long one clip can run.
  useEffect(() => {
    if (state.phase !== "recording") return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - state.startedAt >= MAX_RECORDING_MS) stop();
    }, 250);
    return () => clearInterval(timer);
  }, [state, stop]);

  // Leaving the screen mid-recording turns the microphone off.
  useEffect(
    () => () => {
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return {
    supported,
    state,
    elapsedMs: state.phase === "recording" ? now - state.startedAt : 0,
    error,
    clearError: () => setError(null),
    start,
    stop,
    cancel,
  };
}
