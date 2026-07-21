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
