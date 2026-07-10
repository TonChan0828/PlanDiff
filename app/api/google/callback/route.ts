import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE } from "@/app/api/google/connect/route";
import { isGoogleIntegrationEnabled } from "@/lib/google/integration-flag";
import { exchangeAuthorizationCode } from "@/lib/google/token";
import { saveGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Googleカレンダー連携(任意)のコールバック。Supabase Authを経由せず、
// 認可コードを直接Googleのtoken endpointへ交換する(仕様書P1-3の設計判断)。
// 認可コード・トークン値はログ・URL・エラーメッセージに出さない。

function redirectAndClearState(origin: string, path: string): NextResponse {
  const response = NextResponse.redirect(`${origin}${path}`);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  // Google連携の凍結中(フラグOFF)はコールバックを公開しない(P2-5)
  if (!isGoogleIntegrationEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const state = searchParams.get("state");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!state || !storedState || state !== storedState) {
    return redirectAndClearState(origin, "/settings?error=google_state");
  }

  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  if (oauthError || !code) {
    return redirectAndClearState(origin, "/settings?error=google_auth");
  }

  const exchanged = await exchangeAuthorizationCode(
    code,
    `${origin}/api/google/callback`,
  );
  if (!exchanged.ok) {
    return redirectAndClearState(origin, "/settings?error=google_failed");
  }
  if (!exchanged.refreshToken) {
    return redirectAndClearState(
      origin,
      "/settings?error=google_no_refresh_token",
    );
  }

  const saved = await saveGoogleRefreshToken(
    userData.user.id,
    exchanged.refreshToken,
  );
  if (!saved) {
    return redirectAndClearState(origin, "/settings?error=google_failed");
  }

  return redirectAndClearState(origin, "/settings?connected=1");
}
