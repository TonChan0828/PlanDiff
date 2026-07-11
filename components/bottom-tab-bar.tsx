"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 下部タブバー(D-1c)。(app)全ページ共通のナビゲーション。
// アクティブ判定はpathnameの前方一致(クエリはpathnameに含まれない)

const TABS = [
  { href: "/calendar", label: "カレンダー", icon: "calendar" },
  { href: "/track", label: "計測", icon: "timer" },
  { href: "/summary", label: "サマリー", icon: "diff" },
  { href: "/settings", label: "設定", icon: "settings" },
] as const;

type TabIcon = (typeof TABS)[number]["icon"];

function TabIconGlyph({ icon }: { icon: TabIcon }) {
  if (icon === "diff") {
    // サマリー=ズレ(±)。コンセプト「時間のdiff」の記号
    return (
      <span
        aria-hidden="true"
        className="flex h-5 items-center font-mono text-base leading-none font-bold"
      >
        ±
      </span>
    );
  }
  const paths: Record<Exclude<TabIcon, "diff">, React.ReactNode> = {
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      </>
    ),
    timer: (
      <>
        <circle cx="12" cy="13.5" r="7" />
        <path d="M12 13.5V9.5M10 3h4" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7.5h16M4 12h16M4 16.5h16" />
        <circle cx="9" cy="7.5" r="1.8" fill="currentColor" />
        <circle cx="15" cy="12" r="1.8" fill="currentColor" />
        <circle cx="7" cy="16.5" r="1.8" fill="currentColor" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      {paths[icon]}
    </svg>
  );
}

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="border-line bg-surface border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-13 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[10px] leading-tight font-semibold transition-colors ${
                  active ? "text-brand" : "text-ink-muted hover:text-ink"
                }`}
              >
                <TabIconGlyph icon={tab.icon} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
