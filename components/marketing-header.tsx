"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/wordmark";

export function MarketingHeader() {
  const pathname = usePathname();
  const onSignup = pathname === "/signup";

  return (
    <header className="border-line flex min-h-16 items-center justify-between border-b px-5 sm:px-8">
      <Link href="/" aria-label="PlanDiff トップ">
        <Wordmark withMark className="text-xl" />
      </Link>
      <Link
        href={onSignup ? "/login" : "/signup"}
        className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold transition-colors"
      >
        {onSignup ? "ログイン" : "無料で始める"}
      </Link>
    </header>
  );
}
