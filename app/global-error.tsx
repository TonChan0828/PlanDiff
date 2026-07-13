"use client"; // エラー境界はClient Componentである必要がある(Next.jsの規約)

import { useEffect } from "react";
import { ERROR_PAGE_MESSAGES } from "@/lib/errors/messages";
import "./globals.css";

// ルートレイアウト自体の例外の受け皿(P4-5)。発動時はroot layoutごと置き換わるため、
// html/bodyとグローバルスタイルを自前で持つ(metadataは使えないので<title>で代替)
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("画面の表示に失敗しました:", error.digest ?? error.name);
  }, [error]);

  const M = ERROR_PAGE_MESSAGES.globalError;
  return (
    <html lang="ja">
      <body>
        <title>{`${M.title} | PlanDiff`}</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-bold tracking-tight">{M.title}</h1>
          <p className="text-ink-muted max-w-sm text-sm leading-relaxed">
            {M.description}
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="bg-brand text-brand-ink mt-2 inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold"
          >
            {M.reload}
          </button>
        </main>
      </body>
    </html>
  );
}
