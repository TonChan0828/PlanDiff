// テーマの手動切替(D-1e)。localStorageの保存値と<html data-theme>属性の対応を定義する。
// 属性なし=システム(prefers-color-scheme)追随

export const THEME_STORAGE_KEY = "plandiff-theme";

/** 選択変更をUIへ通知するイベント名(useSyncExternalStoreの購読用) */
export const THEME_CHANGE_EVENT = "plandiff-theme-change";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** 保存値からdata-theme属性値を解決する。system・不正値・未保存はnull(属性なし) */
export function resolveThemeAttribute(
  stored: string | null,
): "light" | "dark" | null {
  return stored === "light" || stored === "dark" ? stored : null;
}

/** 保存値から選択状態を復元する。不正値・未保存はsystem扱い */
export function resolveThemePreference(stored: string | null): ThemePreference {
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** 選択をDOMへ適用し、localStorageへ保存する(読み書き失敗は無視) */
export function applyThemePreference(preference: ThemePreference): void {
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
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

// 初回描画前に保存値を反映するインラインスクリプト(FOUC防止)。
// ルートレイアウトの<body>先頭で同期実行する。localStorage失敗時は何もしない
export const THEME_INIT_SCRIPT =
  `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");` +
  `if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t}}catch(e){}`;
