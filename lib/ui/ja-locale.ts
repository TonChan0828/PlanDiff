import type { Locale } from "date-fns";

// 日本語表示に必要な最小限の date-fns locale(P6-3)。
// 仕様書: docs/specs/P6-3_クライアントバンドルとレンダリング.md
//
// `date-fns/locale` の `ja` は barrel オブジェクトで、formatDistance の全文言・
// formatRelative・パース用の matchPatterns / parsePatterns まで取り込む。
// 本アプリが実際に使うのは format() の "E"(曜日略称)だけで、
// それ以外の書式(yyyy / M / d / HH:mm、および「年月日」の非ASCIIリテラル)は
// ロケールに依存しない。
//
// そのため曜日7語だけを持つ locale に差し替える。使わないものは実装せず、
// 呼ばれたら例外にする。将来 "P" や formatDistance を使い始めたときに
// 黙って英語表記になるのではなく、テストで気づけるようにするため。

/** 曜日の略称。date-fns/locale の ja と同じ並び(0=日曜) */
const ABBREVIATED_DAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function unsupported(name: string): never {
  throw new Error(
    `ja-locale: ${name} は未実装です。使う場合は lib/ui/ja-locale.ts に追加し、` +
      `date-fns/locale の ja と出力が一致することをテストで固定してください`,
  );
}

export const jaMinimal: Locale = {
  code: "ja",
  formatDistance: () => unsupported("formatDistance"),
  formatRelative: () => unsupported("formatRelative"),
  localize: {
    ordinalNumber: () => unsupported("localize.ordinalNumber"),
    era: () => unsupported("localize.era"),
    quarter: () => unsupported("localize.quarter"),
    month: () => unsupported("localize.month"),
    day: (index, options) => {
      // "E" 〜 "EEE" は abbreviated。既定値も abbreviated として扱う
      const width = options?.width ?? "abbreviated";
      if (width !== "abbreviated") {
        unsupported(`localize.day(width: ${width})`);
      }
      return ABBREVIATED_DAYS[index as number] ?? unsupported("localize.day");
    },
    dayPeriod: () => unsupported("localize.dayPeriod"),
  },
  formatLong: {
    date: () => unsupported("formatLong.date"),
    time: () => unsupported("formatLong.time"),
    dateTime: () => unsupported("formatLong.dateTime"),
  },
  match: {
    ordinalNumber: () => unsupported("match.ordinalNumber"),
    era: () => unsupported("match.era"),
    quarter: () => unsupported("match.quarter"),
    month: () => unsupported("match.month"),
    day: () => unsupported("match.day"),
    dayPeriod: () => unsupported("match.dayPeriod"),
  },
  options: {
    // date-fns/locale の ja と同じ値。呼び出し側は startOfWeek に
    // weekStartsOn を明示しているため、実際にはここに依存していない
    weekStartsOn: 0,
    firstWeekContainsDate: 1,
  },
};
