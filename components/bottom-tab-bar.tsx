"use client";

import {
  CalendarDays,
  ChartNoAxesCombined,
  Settings2,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 下部タブバー(D-1c)。(app)全ページ共通のナビゲーション。
// アクティブ判定はpathnameの前方一致(クエリはpathnameに含まれない)

const TABS = [
  { href: "/calendar", label: "カレンダー", icon: CalendarDays },
  { href: "/track", label: "計測", icon: Timer },
  { href: "/summary", label: "サマリー", icon: ChartNoAxesCombined },
  { href: "/settings", label: "設定", icon: Settings2 },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="border-line bg-surface border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-13 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[10px] leading-tight font-semibold transition-colors ${
                  active ? "text-brand" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
