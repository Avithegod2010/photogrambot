import { useCallback } from "react";
import { useSettingsStore } from "./store/useSettingsStore";
import { t } from "./lib/i18n";

/** Translation hook bound to the current language preference. */
export function useT() {
  const language = useSettingsStore((s) => s.prefs.language);
  return useCallback(
    (key: string, vars?: Record<string, string>) => t(key, language, vars),
    [language]
  );
}
