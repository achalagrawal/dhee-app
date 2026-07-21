import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Language } from "./i18n";

export function useLanguage(): Language {
  const profile = useQuery(api.users.currentProfile);
  return profile?.preferredLanguage ?? "en";
}
