import Link from "next/link";
import type { ReactNode } from "react";

// アプリバー(D-1c)。左にワードマーク、右にページ固有アクション(children)。
// ワードマークは Plan=アウトライン/Diff=塗り で名前自体をdiffとして見せる

interface AppBarProps {
  children?: ReactNode;
}

export function AppBar({ children }: AppBarProps) {
  return (
    <header className="border-line bg-paper flex min-h-12 items-center justify-between gap-3 border-b px-4">
      <Link
        href="/calendar"
        aria-label="PlanDiff"
        className="text-lg font-extrabold tracking-tight"
      >
        <span aria-hidden="true" className="wordmark-plan">
          Plan
        </span>
        <span aria-hidden="true" className="text-brand">
          Diff
        </span>
      </Link>
      {children ? (
        <div className="flex items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}
