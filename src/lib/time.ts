import { type Language, t } from "./i18n";

// Relative timestamps for the conversation list. Beyond a week an absolute
// date is more useful than a growing "N days ago", and Hindi gets its own
// locale so the month name isn't in English.
export function relativeTime(when: number, lang: Language): string {
  const elapsed = Date.now() - when;
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) return t(lang, "justNow");
  if (minutes < 60) return t(lang, "minutesAgo").replace("%n", String(minutes));

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(lang, "hoursAgo").replace("%n", String(hours));

  const days = Math.floor(hours / 24);
  if (days === 1) return t(lang, "yesterday");
  if (days < 7) return t(lang, "daysAgo").replace("%n", String(days));

  return new Date(when).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year:
      new Date(when).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

export type TimeBucket = "today" | "yesterday" | "previous7" | "older";

// Which history section a timestamp belongs to. Buckets are day-based, so a
// conversation from earlier today stays under "Today" regardless of the hour.
export function timeBucket(when: number): TimeBucket {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const start = startOfToday.getTime();
  if (when >= start) return "today";
  if (when >= start - dayMs) return "yesterday";
  if (when >= start - 7 * dayMs) return "previous7";
  return "older";
}

// Group time-ordered items (newest first) into history buckets, preserving
// order and dropping empty sections.
export function groupByTime<T>(
  items: T[],
  getTime: (item: T) => number,
): { bucket: TimeBucket; items: T[] }[] {
  const order: TimeBucket[] = ["today", "yesterday", "previous7", "older"];
  const map = new Map<TimeBucket, T[]>();
  for (const item of items) {
    const b = timeBucket(getTime(item));
    const list = map.get(b) ?? [];
    list.push(item);
    map.set(b, list);
  }
  return order
    .filter((b) => (map.get(b)?.length ?? 0) > 0)
    .map((b) => ({ bucket: b, items: map.get(b) as T[] }));
}
