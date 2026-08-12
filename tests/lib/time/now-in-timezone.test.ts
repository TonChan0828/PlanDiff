import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { resolveNowInTimezone } from "@/lib/time/now-in-timezone";

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S1〜S3
// R-1: 日時はすべてローカルTZで構築する(ISO文字列で固定しない)。
// ただしS2はタイムゾーン変換そのものを検証するテストのため、解釈に曖昧さのない
// UTC絶対時刻(Date.UTC)を入力に使い、各TZDateが持つゲッター(getFullYear等)で
// 比較する。ホストマシンのローカルTZには一切依存しない

describe("resolveNowInTimezone", () => {
  it("S1: timezoneがnullならbaseをそのまま返す", () => {
    const base = new Date(2026, 7, 11, 23, 30);
    expect(resolveNowInTimezone(null, base)).toBe(base);
  });

  it("S2: 有効なIANA名を渡すとそのタイムゾーンの暦日になる(プロセスTZに依存しない)", () => {
    // 2026-08-11T12:00:00Z: 東京(UTC+9)では8/11 21:00、UTC+14では8/12 02:00と
    // 暦日が割れる瞬間を選び、それぞれ正しいタイムゾーンの日付になることを確認する
    const instant = new Date(Date.UTC(2026, 7, 11, 12, 0, 0));

    const tokyo = resolveNowInTimezone("Asia/Tokyo", instant) as TZDate;
    expect(tokyo).toBeInstanceOf(TZDate);
    expect(tokyo.timeZone).toBe("Asia/Tokyo");
    expect([tokyo.getFullYear(), tokyo.getMonth(), tokyo.getDate()]).toEqual([
      2026, 7, 11,
    ]);

    const kiritimati = resolveNowInTimezone(
      "Pacific/Kiritimati",
      instant,
    ) as TZDate;
    expect(kiritimati.timeZone).toBe("Pacific/Kiritimati");
    expect([
      kiritimati.getFullYear(),
      kiritimati.getMonth(),
      kiritimati.getDate(),
    ]).toEqual([2026, 7, 12]);
  });

  it("S3: 実在しないタイムゾーン名は例外を投げずbaseにフォールバックする", () => {
    const base = new Date(2026, 7, 11, 23, 30);
    expect(resolveNowInTimezone("Not/AZone", base)).toBe(base);
  });
});
