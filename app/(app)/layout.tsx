import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

// 認証必須グループ。未ログインは /login へリダイレクトする
// cookies()を呼ぶ前に環境変数チェックで例外を投げるとNext.jsの動的判定より先に
// ビルド時プリレンダリングが走ってしまうため、force-dynamicで明示する
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/login");
  }

  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
