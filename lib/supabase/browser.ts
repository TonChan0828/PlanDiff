import { createBrowserClient } from "@supabase/ssr";

// クライアントコンポーネント用のSupabaseクライアント
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabaseの環境変数(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)が設定されていません",
    );
  }
  return createBrowserClient(url, anonKey);
}
