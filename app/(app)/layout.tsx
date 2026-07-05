import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

// 認証必須グループ。未ログインは /login へリダイレクトする
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
