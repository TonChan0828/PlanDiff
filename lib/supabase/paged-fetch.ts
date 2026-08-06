import "server-only";

import { RowLimitExceededError } from "@/lib/errors/row-limit";

// PostgREST のページング取得ヘルパー(P6-0)。
// 仕様書: docs/specs/P6-0_サマリー集計の行数上限.md
//
// PostgREST には1レスポンスあたりの行数上限(max_rows。Supabaseの既定は1000)があり、
// 上限に達すると**エラーなく打ち切られる**。`.limit()` を付けていないクエリでも同じで、
// サマリーの長期間表示(最大366日)では集計値が黙って過小になりうる。
// そのため `.range()` でページを繰り返し取得し、全件を組み立てる。

/** 1ページあたりの取得件数。PostgREST の max_rows(既定1000)と一致させる */
export const PAGE_SIZE = 1000;

/**
 * 1回の取得で許容する総行数の上限。
 * 1日50件 × 366日を上回る値。超えた場合は部分結果を返さず例外にする
 * (黙って打ち切ることが本バグの原因であるため、必ず失敗させる)。
 */
export const MAX_FETCH_ROWS = 20000;

export interface PagedResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

/**
 * `.range(from, to)` のページを、返却件数が PAGE_SIZE 未満になるまで繰り返し取得する。
 *
 * @param buildPageQuery ページごとにクエリを組み立てる。PostgRESTのビルダは
 *   awaitすると使い回せないため、ページごとに新しく組み立てる必要がある
 * @param errorMessage DBエラー時にユーザーへ見せる日本語メッセージ
 *   (接続情報等の詳細は漏らさない。既存の各fetch関数と同じ方針)
 */
export async function fetchAllPages<Row>(
  buildPageQuery: (from: number, to: number) => PromiseLike<PagedResult<Row>>,
  errorMessage: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (;;) {
    const from = rows.length;
    const { data, error } = await buildPageQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(errorMessage);
    }
    const page = data ?? [];
    rows.push(...page);
    if (rows.length > MAX_FETCH_ROWS) {
      throw new RowLimitExceededError(MAX_FETCH_ROWS);
    }
    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}
