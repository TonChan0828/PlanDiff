// テーマの手動切替(D-1e / D-6)。localStorageの保存値と<html data-theme>属性の対応を定義する。
// 属性なし=システム(prefers-color-scheme)追随

import { syncBrowserThemeMetadata } from "./browser-theme";

export const THEME_STORAGE_KEY = "plandiff-theme";

/** 選択変更をUIへ通知するイベント名(useSyncExternalStoreの購読用) */
export const THEME_CHANGE_EVENT = "plandiff-theme-change";

export const THEME_PREFERENCES = [
  "light",
  "dark",
  "structured",
  "system",
] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** data-theme属性として書き込む値。systemだけは属性なしで表現する */
export type ThemeAttribute = Exclude<ThemePreference, "system">;

// 保存に失敗した場合も、同じページ内では現在の選択を優先する。
let currentThemePreference: ThemePreference | undefined;

// テーマを増やすときはTHEME_PREFERENCESだけを直せば、解決関数も描画前スクリプトも
// 同時に追随する(片方だけ直し忘れる事故を防ぐ。D-6 S8)
const THEME_ATTRIBUTES: readonly string[] = THEME_PREFERENCES.filter(
  (preference) => preference !== "system",
);

/** 保存値からdata-theme属性値を解決する。system・不正値・未保存はnull(属性なし) */
export function resolveThemeAttribute(
  stored: string | null,
): ThemeAttribute | null {
  return stored !== null && THEME_ATTRIBUTES.includes(stored)
    ? (stored as ThemeAttribute)
    : null;
}

/** 保存値から選択状態を復元する。不正値・未保存はsystem扱い */
export function resolveThemePreference(stored: string | null): ThemePreference {
  return resolveThemeAttribute(stored) ?? "system";
}

/** 現在のページで有効なテーマ属性を解決する。 */
export function resolveCurrentThemeAttribute(): ThemeAttribute | null {
  const currentAttribute = resolveThemeAttribute(
    document.documentElement.dataset.theme ?? null,
  );
  if (currentAttribute) return currentAttribute;
  if (currentThemePreference !== undefined) {
    return resolveThemeAttribute(currentThemePreference);
  }

  try {
    return resolveThemeAttribute(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** 選択をDOMへ適用し、localStorageへ保存する(読み書き失敗は無視) */
export function applyThemePreference(preference: ThemePreference): void {
  currentThemePreference = preference;
  const attribute = resolveThemeAttribute(preference);
  if (attribute) {
    document.documentElement.dataset.theme = attribute;
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // プライベートモード等で保存できない場合は表示だけ切り替える
  }
  syncBrowserThemeMetadata(attribute);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

// 初回描画前に<html data-theme>へ保存値を反映するインラインスクリプト(FOUC防止)。
// Next.jsが管理する<head>のメタデータはhydration後に同期する。
// 許可する値はTHEME_ATTRIBUTESから生成するため、テーマ追加時の直し忘れが起きない
export const THEME_INIT_SCRIPT =
  `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");` +
  `if(${JSON.stringify(THEME_ATTRIBUTES)}.indexOf(t)>=0)` +
  `{document.documentElement.dataset.theme=t}}catch(e){}`;
