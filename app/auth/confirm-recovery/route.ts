import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// パスワード再設定(recovery)の確認リンク検証。仕組みは /auth/confirm と同様
// (PKCEの認可コードを exchangeCodeForSession で交換)だが、成功後の遷移先が
// /reset-password になるためルートを分ける(redirectToは固定URLでのみ
// allow-list照合できるため、next等のクエリ分岐ではなくパスで分ける)。

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/forgot-password?error=expired`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/forgot-password?error=expired`);
  }

  return NextResponse.redirect(`${origin}/reset-password`);
}
