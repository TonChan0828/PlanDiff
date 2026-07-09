import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, format, startOfDay } from "date-fns";

const { routerMock } = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { CalendarView } from "@/components/calendar-view";
import { computeSyncRange } from "@/lib/google/sync-range";

// 仕様書: docs/specs/P2-1_カレンダービュー.md S7〜S13

const SYNC_ERROR_MESSAGE =
  "同期に失敗しました。時間をおいてもう一度お試しください";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// 「今日」基準のテストデータ(現在時刻ライン等が実日付に依存するため動的に組み立てる)
const today = startOfDay(new Date());
const todayParam = format(today, "yyyy-MM-dd");

function eventOn(
  day: Date,
  id: string,
  title: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
) {
  const base = startOfDay(day);
  return {
    id,
    googleEventId: `g-${id}`,
    title,
    startAt: new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      startHour,
      startMinute,
    ).toISOString(),
    endAt: new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      endHour,
      endMinute,
    ).toISOString(),
  };
}

const todaysEvents = [
  eventOn(today, "row-1", "設計レビュー", 9, 0, 10, 30),
  eventOn(today, "row-2", "リリース作業", 14, 0, 15, 0),
];

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(jsonResponse(200, { events: [] }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CalendarView 日ビュー(S7)", () => {
  it("S7: 時間軸上にタイトル・時刻付きの予定ブロックが表示される", async () => {
    render(
      <CalendarView
        events={todaysEvents}
        viewParam="day"
        dateParam={todayParam}
      />,
    );

    // 時間軸の目盛り
    expect(screen.getByText("9:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();

    // 予定ブロック(タイトル+時刻)と時間比例の配置
    expect(screen.getByText("設計レビュー")).toBeInTheDocument();
    expect(screen.getByText("09:00〜10:30")).toBeInTheDocument();
    expect(screen.getByText("リリース作業")).toBeInTheDocument();

    const block = screen.getByText("設計レビュー").closest("li");
    expect(block).toHaveStyle({ top: "37.5%" });

    // マウント時のバックグラウンド同期が完了する
    expect(
      await screen.findByRole("button", { name: "更新" }),
    ).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("CalendarView 週ビュー(S8)", () => {
  it("S8: 月曜始まり7列に予定が配置され、当日が強調される", async () => {
    const { container } = render(
      <CalendarView
        events={todaysEvents}
        viewParam="week"
        dateParam={todayParam}
      />,
    );

    // 7日分の列ヘッダー(月〜日)
    const headers = container.querySelectorAll("[data-week-day-header]");
    expect(headers).toHaveLength(7);

    // 当日の列ヘッダーが強調される
    const current = container.querySelector('[aria-current="date"]');
    expect(current).not.toBeNull();
    expect(current!.textContent).toContain(format(today, "d"));

    // 予定はタイトルのみ(週ビューでは時刻を省略)
    expect(screen.getByText("設計レビュー")).toBeInTheDocument();
    expect(screen.queryByText("09:00〜10:30")).not.toBeInTheDocument();

    await screen.findByRole("button", { name: "更新" });
  });

  it("S8: ビュー切替ボタンで週ビューへのURLに遷移する", async () => {
    const user = userEvent.setup();
    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    await user.click(screen.getByRole("button", { name: "週" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/calendar?view=week&date=${todayParam}`,
    );
  });
});

describe("CalendarView ナビゲーション(S9 / S10)", () => {
  it("S9: 日ビューの「次へ」は+1日のURLへ遷移する", async () => {
    const user = userEvent.setup();
    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/calendar?view=day&date=${format(addDays(today, 1), "yyyy-MM-dd")}`,
    );
  });

  it("S9: 週ビューの「前へ」は−7日のURLへ遷移する", async () => {
    const user = userEvent.setup();
    render(
      <CalendarView events={[]} viewParam="week" dateParam={todayParam} />,
    );

    await user.click(screen.getByRole("button", { name: "前へ" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/calendar?view=week&date=${format(addDays(today, -7), "yyyy-MM-dd")}`,
    );
  });

  it("S9: 「今日」ボタンで今日のURLへ遷移する", async () => {
    const user = userEvent.setup();
    const past = format(addDays(today, -30), "yyyy-MM-dd");
    render(<CalendarView events={[]} viewParam="day" dateParam={past} />);

    await user.click(screen.getByRole("button", { name: "今日" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/calendar?view=day&date=${todayParam}`,
    );
  });

  it("S10: 週が変わったときだけ新しい期間で再同期される", async () => {
    // 週の真ん中(水曜)を基準にすると同一週内の±1日移動を確認できる
    const wednesday = addDays(startOfDay(new Date(2026, 6, 6)), 2);
    const { rerender } = render(
      <CalendarView
        events={[]}
        viewParam="day"
        dateParam={format(wednesday, "yyyy-MM-dd")}
      />,
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual(computeSyncRange(wednesday));

    // 同一週内の日移動では再同期しない
    rerender(
      <CalendarView
        events={[]}
        viewParam="day"
        dateParam={format(addDays(wednesday, 1), "yyyy-MM-dd")}
      />,
    );
    await screen.findByRole("button", { name: "更新" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 週をまたぐと新しい表示週±1週間で再同期する
    const nextWeek = addDays(wednesday, 7);
    rerender(
      <CalendarView
        events={[]}
        viewParam="day"
        dateParam={format(nextWeek, "yyyy-MM-dd")}
      />,
    );
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(
      JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string),
    ).toEqual(computeSyncRange(nextWeek));
  });
});

describe("CalendarView 空状態・エラー(S11 / S12)", () => {
  it("S11: 予定0件でも時間軸と「予定がありません」が表示される", async () => {
    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    expect(screen.getByText("9:00")).toBeInTheDocument();
    expect(screen.getByText("予定がありません")).toBeInTheDocument();
    await screen.findByRole("button", { name: "更新" });
  });

  it("S12: 同期失敗時は日本語エラーが表示され、キャッシュ表示は維持される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { error: "sync_failed" }));

    render(
      <CalendarView
        events={todaysEvents}
        viewParam="day"
        dateParam={todayParam}
      />,
    );

    expect(await screen.findByText(SYNC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("設計レビュー")).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("S24(P1-3): 401 not_connected の場合は遷移せず未連携バナーが表示される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "not_connected" }));

    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    expect(
      await screen.findByText(
        "Googleカレンダーが未接続です。接続すると予定と実績のギャップが見えるようになります。",
      ),
    ).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("S25(P1-3): 401 reauthorize の場合は遷移せず連携失効バナーが表示される", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "reauthorize" }));

    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    expect(
      await screen.findByText(
        "Googleカレンダーとの連携の有効期限が切れています。設定から再接続してください。",
      ),
    ).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("S23(P1-3): googleConnected=falseの場合も予定レーンは空のままフリータイマーが操作できる", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "not_connected" }));

    render(
      <CalendarView
        events={[]}
        viewParam="day"
        dateParam={todayParam}
        googleConnected={false}
      />,
    );

    expect(
      await screen.findByText(
        "Googleカレンダーが未接続です。接続すると予定と実績のギャップが見えるようになります。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    ).toBeInTheDocument();
  });

  it("S12: 手動リフレッシュ(更新ボタン)で再同期される", async () => {
    const user = userEvent.setup();
    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    await user.click(await screen.findByRole("button", { name: "更新" }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("CalendarView 現在時刻ライン(S13)", () => {
  it("S13: 今日を含む表示では現在時刻ラインが表示される", async () => {
    render(<CalendarView events={[]} viewParam="day" dateParam={todayParam} />);

    expect(screen.getByTestId("current-time-line")).toBeInTheDocument();
    await screen.findByRole("button", { name: "更新" });
  });

  it("S13: 今日を含まない日では表示されない", async () => {
    const past = format(addDays(today, -30), "yyyy-MM-dd");
    render(<CalendarView events={[]} viewParam="day" dateParam={past} />);

    expect(screen.queryByTestId("current-time-line")).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "更新" });
  });
});
