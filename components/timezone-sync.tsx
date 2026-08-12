"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONE_COOKIE_NAME } from "@/lib/time/timezone-cookie";

// クライアントのIANAタイムゾーンをCookieへ同期する(P8-3)。表示は持たない葉コンポーネント。
// 認証済みシェル(app/(app)/layout.tsx)に1つだけ配置し、サーバー(/summaryなど)が
// 「今日」の境界を訪問者の実際のタイムゾーンで計算できるようにする。
// Cookie値と実際のTZが一致しているときは何もしない
// (毎回書き込むとサーバーレンダリングのたびにrefreshループになるため)

const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // ブラウザの一般的な上限(400日)に合わせる

function readCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (readCookieValue(TIMEZONE_COOKIE_NAME) === detected) {
      return;
    }
    document.cookie = `${TIMEZONE_COOKIE_NAME}=${encodeURIComponent(detected)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
