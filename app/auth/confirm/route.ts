import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// メール確認(signup)の確認リンク検証。
// @supabase/ssr はデフォルトでPKCEフローを使うため、確認メールのリンクは
// `token_hash`ではなく認可コード(`?code=...`)としてGoTrueからリダイレクトされる。
// verifyOtpではなく exchangeCodeForSession で処理するのが正しい方式
// (実機確認で判明。CLAUDE.mdハマりどころ)。

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=confirm_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=confirm_failed`);
  }

  return NextResponse.redirect(`${origin}/calendar`);
}
