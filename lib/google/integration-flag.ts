import "server-only";

// Googleカレンダー連携の凍結フラグ(P2-5)。
// サーバー専用env GOOGLE_INTEGRATION_ENABLED が "true" のときのみ連携UI・APIを有効にする。
// 未設定・それ以外の値は無効(凍結)。クライアントへはpropsのbooleanとしてのみ渡すこと。

export function isGoogleIntegrationEnabled(): boolean {
  return process.env.GOOGLE_INTEGRATION_ENABLED === "true";
}
