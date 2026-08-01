import { describe, expect, it } from "vitest";
import {
  formatAverageStartDelay,
  formatRangeLabel,
} from "@/lib/summary/format";
import { resolveSummaryRange } from "@/lib/summary/range";

// 仕様書: docs/specs/P5-9_サマリーの任意期間表示.md S17〜S20・S45

const NOW = new Date(2026, 7, 1, 13, 45); // 2026-08-01(土)

describe("formatRangeLabel", () => {
  it("S17: today は年月日と曜日を表示する", () => {
    expect(formatRangeLabel(resolveSummaryRange({ range: "today" }, NOW))).toBe(
      "2026年8月1日(土)",
    );
  });

  it("S18: week は週の初日〜最終日を表示する", () => {
    expect(formatRangeLabel(resolveSummaryRange({ range: "week" }, NOW))).toBe(
      "2026年7月27日〜8月2日",
    );
  });

  it("S19: month は年月のみ表示する", () => {
    expect(formatRangeLabel(resolveSummaryRange({ range: "month" }, NOW))).toBe(
      "2026年8月",
    );
  });

  it("S20: custom は開始日〜終了日を表示し、同年なら末尾の年を省く", () => {
    expect(
      formatRangeLabel(
        resolveSummaryRange(
          { range: "custom", from: "2026-07-01", to: "2026-07-31" },
          NOW,
        ),
      ),
    ).toBe("2026年7月1日〜7月31日");
  });

  it("S20: 年をまたぐ custom は末尾にも年を表示する(境界値)", () => {
    expect(
      formatRangeLabel(
        resolveSummaryRange(
          { range: "custom", from: "2026-12-28", to: "2027-01-03" },
          NOW,
        ),
      ),
    ).toBe("2026年12月28日〜2027年1月3日");
  });
});

describe("formatAverageStartDelay", () => {
  it("S45: 遅れ・早着手・定刻をそれぞれ文言化する(0は境界値)", () => {
    expect(formatAverageStartDelay(8)).toBe("着手 予定より平均 +8分遅れ");
    expect(formatAverageStartDelay(-3)).toBe("着手 予定より平均 3分早い");
    expect(formatAverageStartDelay(0)).toBe("着手 平均で予定どおり");
  });
});
