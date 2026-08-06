// 取得行数の上限超過(P6-0)。仕様書: docs/specs/P6-0_サマリー集計の行数上限.md
//
// PostgREST の max_rows は上限に達しても**エラーを返さずに黙って打ち切る**ため、
// 打ち切りに気づかないまま集計値が過小になる。これを防ぐためページング取得にしたうえで、
// 想定を超える件数になった場合は部分結果を返さず、この例外で明示的に失敗させる。

export class RowLimitExceededError extends Error {
  constructor(limit: number) {
    super(`取得行数が上限(${limit}件)を超えました`);
    this.name = "RowLimitExceededError";
  }
}
