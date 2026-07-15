import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing-header";

const FOOTER_LINKS = [
  { href: "/pricing", label: "料金" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/terms", label: "利用規約" },
] as const;

const COPYRIGHT = "© 2026 PlanDiff";

export default function MarketingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <MarketingHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-line border-t">
        <nav
          aria-label="サイト情報"
          className="text-ink-muted mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
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
