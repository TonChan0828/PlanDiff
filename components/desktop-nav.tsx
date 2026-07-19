"use client";

import {
  CalendarDays,
  ChartNoAxesCombined,
  Settings2,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/wordmark";

const ITEMS = [
  { href: "/calendar", label: "カレンダー", icon: CalendarDays },
  { href: "/track", label: "計測", icon: Timer },
  { href: "/summary", label: "サマリー", icon: ChartNoAxesCombined },
  { href: "/settings", label: "設定", icon: Settings2 },
] as const;

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <aside className="border-line bg-surface hidden w-52 shrink-0 border-r lg:flex lg:flex-col">
      <Link
        href="/calendar"
        aria-label="PlanDiff"
        className="flex min-h-16 items-center px-5"
      >
        <Wordmark withMark className="text-xl" />
      </Link>
      <nav aria-label="メインナビゲーション" className="px-3 py-2">
        <ul className="flex flex-col gap-1">
          {ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-plan-fill text-brand"
                      : "text-ink-muted hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
