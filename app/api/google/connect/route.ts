import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthorizationUrl } from "@/lib/google/connect-options";
import { createClient } from "@/lib/supabase/server";

// Googleカレンダー連携(任意)の起点。ログイン手段(メール)とは無関係な
// 独立したOAuth2認可フローを開始する(仕様書P1-3の設計判断)。

export const STATE_COOKIE = "google_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10分

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Googleの環境変数(GOOGLE_CLIENT_ID)が設定されていません");
  }

  const state = randomUUID();
  const authorizationUrl = buildGoogleAuthorizationUrl({
    origin,
    state,
    clientId,
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
