// クライアントのIANAタイムゾーンをCookieで受け渡す(P8-3)。
// サーバー(Server Component)は訪問者のTZを知る手段がないため、初回描画後に
// クライアント(components/timezone-sync.tsx)が Intl.DateTimeFormat().resolvedOptions().timeZone
// をCookieへ書き込み、以後のサーバーレンダリングがそれを読んで「今日」の境界を計算する。
// このファイルはクライアントコンポーネントからもimportされるため next/headers を持ち込まない。
// Cookieの読み取り(next/headers 依存)は timezone-cookie.server.ts に分離する。

export const TIMEZONE_COOKIE_NAME = "plandiff-tz";

// IANAタイムゾーン名の形式(例: "Asia/Tokyo", "Pacific/Kiritimati", "UTC")の軽い健全性チェック。
// 形式を通っても実在しないタイムゾーン名の可能性はあるため、最終防御は
// resolveNowInTimezone 側の Invalid Date 判定で行う(多層防御)
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+\-/]{1,64}$/;

export function isValidTimezoneValue(value: string): boolean {
  return TIMEZONE_PATTERN.test(value);
}
