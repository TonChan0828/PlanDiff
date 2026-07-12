"use client";

import { useSyncExternalStore } from "react";
import { SETTINGS_MESSAGES as M } from "@/lib/settings/messages";
import {
  applyThemePreference,
  resolveThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme/theme";

// 外観(テーマ)の3択セレクタ(D-1e)。選択はlocalStorageに保存し、
// <html data-theme>で即時反映する。SSRとの不一致を避けるため保存値は
// useSyncExternalStoreで購読する(サーバースナップショットはsystem)

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: M.themeLight },
  { value: "dark", label: M.themeDark },
  { value: "system", label: M.themeSystem },
];

function readStoredPreference(): ThemePreference {
  try {
    return resolveThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function subscribePreference(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  // 別タブでの変更にも追随する
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeSelector() {
  const preference = useSyncExternalStore(
    subscribePreference,
    readStoredPreference,
    () => "system" as const,
  );

  const handleChange = (next: ThemePreference) => {
    applyThemePreference(next);
  };

  // 見出しは親セクションのh2が担うため、グループ名はaria-labelで与える
  return (
    <fieldset
      aria-label={M.themeSectionHeading}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
              preference === option.value
                ? "border-brand bg-brand text-brand-ink"
                : "border-line hover:bg-ink/5"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => handleChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
