import Link from "next/link";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";

export type GoogleConnectionStatus = "not_connected" | "reauthorize";

// Google未連携時のバナー(仕様書P1-3)。/calendarを強制遷移させず、
// 予定レーンは空のまま・フリータイマーは操作可能な状態で案内のみ行う。

export function GoogleConnectionBanner({
  status,
}: {
  status: GoogleConnectionStatus;
}) {
  const message =
    status === "reauthorize"
      ? M.googleReauthorizeBanner
      : M.googleNotConnectedBanner;

  return (
    <div className="border-interrupt/40 bg-interrupt/10 text-ink flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
      <p>{message}</p>
      <Link href="/settings" className="font-medium underline">
        {M.googleConnectSettingsLink}
      </Link>
    </div>
  );
}
