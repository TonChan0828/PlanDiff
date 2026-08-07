import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppBar } from "@/components/app-bar";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { DesktopNav } from "@/components/desktop-nav";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session-user";

// 認証必須グループ。未ログインは /login へリダイレクトする
// cookies()を呼ぶ前に環境変数チェックで例外を投げるとNext.jsの動的判定より先に
// ビルド時プリレンダリングが走ってしまうため、force-dynamicで明示する
export const dynamic = "force-dynamic";

// 共通シェル(D-1c): AppBar+コンテンツ+下部タブ。h-dvhで固定し、
// コンテンツ領域を内部スクロールにすることでカレンダーのタイムラインが
// 残り高さいっぱいに広がれるようにする(D-1d)
export default async function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  // getSessionUser は検証失敗も null に畳むため、従来の error 判定と等価
  const sessionUser = await getSessionUser(supabase);
  if (!sessionUser) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh">
      <DesktopNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppBar />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
        <BottomTabBar />
      </div>
    </div>
  );
}
