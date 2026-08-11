import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { startOfDay } from "date-fns";
import { useNowMinuteMs } from "@/lib/time/use-now-minute";

// 仕様書: docs/specs/P8-1_日付またぎの自動反映.md S1〜S7
// R-1: 日時はすべてローカルTZで構築する(ISO文字列で固定しない)

const MINUTE_MS = 60_000;

/** ローカルTZでの分丸め epoch ms */
function minuteMs(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return new Date(year, monthIndex, day, hour, minute).getTime();
}

describe("useNowMinuteMs(S1〜S6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("S1: 秒以下を切り捨てた分単位の epoch ms を返す", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 45, 123));

    const { result } = renderHook(() => useNowMinuteMs());

    expect(result.current).toBe(minuteMs(2026, 7, 11, 10, 30));
  });

  it("S2: 分境界で値が1分進む", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 45));

    const { result } = renderHook(() => useNowMinuteMs());
    expect(result.current).toBe(minuteMs(2026, 7, 11, 10, 30));

    // 10:30:45 から次の分境界(10:31:00)まで15秒
    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(result.current).toBe(minuteMs(2026, 7, 11, 10, 31));
  });

  it("S3: 0時をまたぐと startOfDay が翌日になる", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 23, 59, 30));

    const { result } = renderHook(() => useNowMinuteMs());
    expect(startOfDay(new Date(result.current!))).toEqual(
      new Date(2026, 7, 11),
    );

    // 23:59:30 から 00:00:00 まで30秒。分境界にアラインしているので秒単位で拾える
    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(result.current).toBe(minuteMs(2026, 7, 12, 0, 0));
    expect(startOfDay(new Date(result.current!))).toEqual(
      new Date(2026, 7, 12),
    );
  });

  it("S4: visibilitychange でタイマーを待たず最新の分へ更新される", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 0));

    const { result } = renderHook(() => useNowMinuteMs());
    expect(result.current).toBe(minuteMs(2026, 7, 11, 10, 30));

    // バックグラウンドでタイマーがスロットリングされた状況を、
    // タイマーを進めずにシステム時刻だけ進めて再現する
    vi.setSystemTime(new Date(2026, 7, 11, 10, 35, 10));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(minuteMs(2026, 7, 11, 10, 35));
  });

  it("S5: 同じ分の中の visibilitychange では値が変わらず再レンダーも起きない", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 0));

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useNowMinuteMs();
    });
    const rendersBefore = renderCount;

    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 59));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current).toBe(minuteMs(2026, 7, 11, 10, 30));
    expect(renderCount).toBe(rendersBefore);
  });

  it("S6: 購読者が0になるとタイマーとイベントリスナが解除される", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 0));

    const documentRemove = vi.spyOn(document, "removeEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");

    const first = renderHook(() => useNowMinuteMs());
    const second = renderHook(() => useNowMinuteMs());

    // ストアはモジュールスコープに1つ。購読者が増えてもタイマーは1本
    expect(vi.getTimerCount()).toBe(1);

    first.unmount();
    expect(vi.getTimerCount()).toBe(1);
    expect(documentRemove).not.toHaveBeenCalled();

    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(documentRemove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(windowRemove).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(windowRemove).toHaveBeenCalledWith("pageshow", expect.any(Function));

    documentRemove.mockRestore();
    windowRemove.mockRestore();
  });

  it("S2: 購読を再開すると最新の分から再スケジュールされる", () => {
    vi.setSystemTime(new Date(2026, 7, 11, 10, 30, 0));
    const first = renderHook(() => useNowMinuteMs());
    first.unmount();

    // 購読が切れている間に時刻が進んでもタイマーは動かない
    vi.setSystemTime(new Date(2026, 7, 11, 14, 5, 30));
    const { result } = renderHook(() => useNowMinuteMs());

    expect(result.current).toBe(minuteMs(2026, 7, 11, 14, 5));
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS);
    });
    expect(result.current).toBe(minuteMs(2026, 7, 11, 14, 6));
  });
});

describe("useNowMinuteMs のサーバースナップショット(S7)", () => {
  it("S7: SSRでは null を返す(サーバーTZとクライアントTZの不一致を避ける)", () => {
    function Probe() {
      const value = useNowMinuteMs();
      return <span>{value === null ? "null" : String(value)}</span>;
    }

    expect(renderToString(<Probe />)).toContain("null");
  });
});
