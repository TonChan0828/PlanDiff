import Link from "next/link";
import { ERROR_PAGE_MESSAGES } from "@/lib/errors/messages";

// ルート直下のnot-found(P4-5): notFound()に加え、アプリ全体の未マッチURLの
// 受け皿になる(Next.jsの規約)。route groupのシェルは通らないため自前で中央寄せする
export default function NotFound() {
  const M = ERROR_PAGE_MESSAGES.notFound;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p
        aria-hidden="true"
        className="text-ink-muted font-mono text-5xl font-semibold tracking-tight"
      >
        404
      </p>
      <h1 className="text-xl font-bold tracking-tight">{M.title}</h1>
      <p className="text-ink-muted max-w-sm text-sm leading-relaxed">
        {M.description}
      </p>
      <Link
        href="/"
        className="bg-brand text-brand-ink mt-2 inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold"
      >
        {M.backToTop}
      </Link>
    </main>
  );
}
