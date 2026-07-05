import Link from "next/link";
import type { ReactNode } from "react";

const FOOTER_LINKS = [
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/terms", label: "利用規約" },
] as const;

const COPYRIGHT = "© 2026 PlanDiff";

export default function MarketingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <nav
          aria-label="サイト情報"
          className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 py-4 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-400"
        >
          <ul className="flex flex-wrap items-center gap-x-6">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="py-2">{COPYRIGHT}</p>
        </nav>
      </footer>
    </div>
  );
}
