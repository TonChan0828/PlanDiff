import "server-only";

// Google OAuth token endpoint で refresh token からアクセストークンを取得する。
// トークン値・レスポンスボディはログ・エラーメッセージに出さない(エラー種別のみ)。

export type GoogleAuthFailureReason = "reauthorize" | "transient";

export type RefreshAccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: GoogleAuthFailureReason };

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshAccessTokenResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Googleの環境変数(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)が設定されていません",
    );
  }

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      // invalid_grant = refresh token の失効・取り消し。再認可が必要
      if (body?.error === "invalid_grant") {
        return { ok: false, reason: "reauthorize" };
      }
      console.error("アクセストークンの更新に失敗しました:", response.status);
      return { ok: false, reason: "transient" };
    }

    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) {
      console.error("アクセストークンの更新に失敗しました: no_access_token");
      return { ok: false, reason: "transient" };
    }
    return { ok: true, accessToken: body.access_token };
  } catch (cause) {
    console.error(
      "アクセストークンの更新に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return { ok: false, reason: "transient" };
  }
}
