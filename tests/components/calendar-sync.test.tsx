import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { routerMock } = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { CalendarSync } from "@/components/calendar-sync";

// 仕様書: docs/specs/P1-2_カレンダー同期.md S18

const fetchMock = vi.fn();

const SYNC_ERROR_MESSAGE =
  "同期に失敗しました。時間をおいてもう一度お試しください";

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ローカルタイムゾーンの 09:00 開始として組み立てる(表示は端末TZのため)
const events = [
  {
    id: "row-1",
    title: "設計レビュー",
    startAt: new Date(2026, 6, 6, 9, 0).toISOString(),
    endAt: new Date(2026, 6, 6, 10, 30).toISOString(),
  },
  {
    id: "row-2",
    title: "リリース作業",
    startAt: new Date(2026, 6, 7, 14, 0).toISOString(),
    endAt: new Date(2026, 6, 7, 15, 0).toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CalendarSync", () => {
  it("S18: キャッシュ済み予定のリストと「更新」ボタンが表示される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { events: [] }));

    render(<CalendarSync events={events} />);

    expect(screen.getByText("設計レビュー")).toBeInTheDocument();
    expect(screen.getByText("リリース作業")).toBeInTheDocument();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    // マウント時のバックグラウンド同期中は「同期中…」表示になるため、完了を待つ
    expect(
      await screen.findByRole("button", { name: "更新" }),
    ).toBeInTheDocument();

    // マウント時のバックグラウンド同期が1回実行される
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("S18: 同期失敗時は日本語エラーメッセージが表示され、キャッシュ表示は維持される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { error: "sync_failed" }));

    render(<CalendarSync events={events} />);

    expect(await screen.findByText(SYNC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("設計レビュー")).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("S18: 401 reauthorize の場合は /auth/reauthorize へ誘導される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "reauthorize" }));

    render(<CalendarSync events={[]} />);

    await vi.waitFor(() => {
      expect(routerMock.push).toHaveBeenCalledWith("/auth/reauthorize");
    });
  });

  it("S18: 手動リフレッシュ(更新ボタン)で再同期される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { events: [] }));
    const user = userEvent.setup();

    render(<CalendarSync events={events} />);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // マウント時の同期完了(ボタンが「更新」に戻る)を待ってからクリックする
    await user.click(await screen.findByRole("button", { name: "更新" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
