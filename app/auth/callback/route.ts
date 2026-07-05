import { NextResponse, type NextRequest } from "next/server";
import { saveGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// OAuthコールバック。provider_refresh_token はこのタイミングでしか取得できないため、
// ここで必ず google_tokens に保存する(CLAUDE.mdハマりどころ)。
// 認可コード・トークン値はログ・URL・エラーメッセージに出さない。
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    console.error(
      "セッション交換に失敗しました:",
      error?.name ?? "unknown",
      error?.status ?? "",
    );
    return NextResponse.redirect(`${origin}/login?error=failed`);
  }

  const refreshToken = data.session.provider_refresh_token;
  if (!refreshToken) {
    return NextResponse.redirect(`${origin}/auth/reauthorize`);
  }

  const saved = await saveGoogleRefreshToken(
    data.session.user.id,
    refreshToken,
  );
  if (!saved) {
    // 保存に失敗してもログインは成立させ、連携のみ再試行できるようにする
    return NextResponse.redirect(`${origin}/auth/reauthorize`);
  }

  return NextResponse.redirect(`${origin}/calendar`);
}
