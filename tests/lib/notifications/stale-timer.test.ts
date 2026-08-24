import { describe, expect, it } from "vitest";
import {
  buildStaleTimerPayload,
  formatElapsed,
  resolveTimezone,
  staleThresholdAt,
  STALE_TIMER_TAG,
  STALE_TIMER_THRESHOLD_HOURS,
} from "@/lib/notifications/stale-timer";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S1・S2・S5〜S11
// R-1: 日時はすべてローカルTZで構築する(ISO文字列で固定しない)

describe("staleThresholdAt(S1・S2)", () => {
  it("S1: 経過ちょうど12時間の開始時刻は閾値と一致し、対象に含まれる(lte)", () => {
    const now = new Date(2026, 7, 25, 21, 0);
    const startAt = new Date(2026, 7, 25, 9, 0);

    expect(staleThresholdAt(now).getTime()).toBe(startAt.getTime());
    expect(startAt.getTime() <= staleThresholdAt(now).getTime()).toBe(true);
  });

  it("S2: 経過11時間59分の開始時刻は閾値より後で、対象外になる", () => {
    const now = new Date(2026, 7, 25, 21, 0);
    const startAt = new Date(2026, 7, 25, 9, 1);

    expect(startAt.getTime() <= staleThresholdAt(now).getTime()).toBe(false);
  });

  it("閾値は定数 STALE_TIMER_THRESHOLD_HOURS から算出される", () => {
    expect(STALE_TIMER_THRESHOLD_HOURS).toBe(12);
    const now = new Date(2026, 7, 25, 21, 0);
    const diffHours =
      (now.getTime() - staleThresholdAt(now).getTime()) / (60 * 60 * 1000);
    expect(diffHours).toBe(STALE_TIMER_THRESHOLD_HOURS);
  });
});

describe("formatElapsed(S5〜S7)", () => {
  it("S5: 13時間20分を「13時間20分」と整形する", () => {
    const startAt = new Date(2026, 7, 24, 21, 30);
    const now = new Date(2026, 7, 25, 10, 50);

    expect(formatElapsed(startAt, now)).toBe("13時間20分");
  });

  it("S6: 37時間5分を日数に丸めず「37時間5分」と整形する", () => {
    const startAt = new Date(2026, 7, 24, 8, 0);
    const now = new Date(2026, 7, 25, 21, 5);

    expect(formatElapsed(startAt, now)).toBe("37時間5分");
  });

  it("S7: ちょうど12時間を「12時間0分」と整形する", () => {
    const startAt = new Date(2026, 7, 25, 9, 0);
    const now = new Date(2026, 7, 25, 21, 0);

    expect(formatElapsed(startAt, now)).toBe("12時間0分");
  });
});

describe("resolveTimezone(S9)", () => {
  it("正しいIANA名はそのまま返す", () => {
    expect(resolveTimezone("America/New_York")).toBe("America/New_York");
  });

  it("S9: 不正な文字列は Asia/Tokyo にフォールバックする", () => {
    expect(resolveTimezone("Not/AZone")).toBe("Asia/Tokyo");
  });

  it("S9: 空文字も Asia/Tokyo にフォールバックする", () => {
    expect(resolveTimezone("")).toBe("Asia/Tokyo");
  });
});

describe("buildStaleTimerPayload(S8・S10・S11)", () => {
  const startAt = new Date(2026, 7, 24, 21, 30);
  const now = new Date(2026, 7, 25, 10, 50);

  it("S8: 本文の日時が Asia/Tokyo で整形される", () => {
    const payload = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });

    expect(payload.body).toContain("設計レビュー");
    expect(payload.body).toContain("13時間20分");
    // JSTでの開始時刻。ローカルTZに関わらず同じ表記になる
    expect(payload.body).toMatch(/8月2[45]日 \d{2}:\d{2}/);
  });

  it("S8: タイムゾーンが違えば本文の日時表記も変わる", () => {
    const tokyo = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });
    const newYork = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "America/New_York",
    });

    expect(tokyo.body).not.toBe(newYork.body);
    // 経過時間はTZに依存しない
    expect(newYork.body).toContain("13時間20分");
  });

  it("S10: タイトルが空文字なら「(タイトルなし)」になる", () => {
    const payload = buildStaleTimerPayload({
      entryTitle: "",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });

    expect(payload.body).toContain("(タイトルなし)");
  });

  it("S11: tag が stale-timer で、遷移先が /track", () => {
    const payload = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });

    expect(payload.tag).toBe(STALE_TIMER_TAG);
    expect(payload.url).toBe("/track");
    expect(payload.title).toBe("計測しっぱなしかもしれません");
  });
});
