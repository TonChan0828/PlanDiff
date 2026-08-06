import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// 仕様書: docs/specs/P6-0_サマリー集計の行数上限.md
// ページング取得(.range によるループ)の検証用に、PostgRESTのクエリビルダを模したモック。
// .select / .not / .lt / .gt / .order はチェーンを返し、.range が Promise を返す。

export interface PagedQueryCall {
  from: number;
  to: number;
}

export interface PagedQueryMock {
  client: SupabaseClient;
  /** .range(from, to) の呼び出し履歴。ページ数の検証に使う */
  calls: PagedQueryCall[];
  /** 適用されたフィルタ(条件の非退行を確認する) */
  filters: string[];
  /** .order() に渡されたカラム(ページング順序の一意性を確認する) */
  orders: string[];
}

export interface PagedQueryOptions {
  /** 何ページ目(1始まり)でDBエラーを返すか */
  errorOnPage?: number;
}

/**
 * 指定した行を保持し、.range(from, to) でその範囲を返すクライアントモックを作る。
 * PostgREST の max_rows による切り捨ては再現しない(呼び出し側が要求した範囲を素直に返す)。
 */
export function createPagedQueryMock(
  rows: Record<string, unknown>[],
  options: PagedQueryOptions = {},
): PagedQueryMock {
  const calls: PagedQueryCall[] = [];
  const filters: string[] = [];
  const orders: string[] = [];

  const builder = {
    select: vi.fn(() => builder),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      filters.push(`not:${column}:${operator}:${String(value)}`);
      return builder;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push(`is:${column}:${String(value)}`);
      return builder;
    }),
    lt: vi.fn((column: string, value: unknown) => {
      filters.push(`lt:${column}:${String(value)}`);
      return builder;
    }),
    gt: vi.fn((column: string, value: unknown) => {
      filters.push(`gt:${column}:${String(value)}`);
      return builder;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      filters.push(`gte:${column}:${String(value)}`);
      return builder;
    }),
    order: vi.fn((column: string) => {
      orders.push(column);
      return builder;
    }),
    range: vi.fn((from: number, to: number) => {
      calls.push({ from, to });
      if (options.errorOnPage === calls.length) {
        return Promise.resolve({
          data: null,
          error: { message: "range failed" },
        });
      }
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    }),
  };

  const client = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient;

  return { client, calls, filters, orders };
}

/** synced_events の行を count 件生成する(start_at は1分刻みの昇順) */
export function buildEventRows(count: number): Record<string, unknown>[] {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  return [...Array(count).keys()].map((index) => ({
    id: `e${index}`,
    google_event_id: `g${index}`,
    title: `予定${index}`,
    start_at: new Date(base + index * 60_000).toISOString(),
    end_at: new Date(base + index * 60_000 + 30 * 60_000).toISOString(),
    source: "google",
  }));
}

/** time_entries の行を count 件生成する(start_at は1分刻みの昇順) */
export function buildEntryRows(count: number): Record<string, unknown>[] {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  return [...Array(count).keys()].map((index) => ({
    id: `t${index}`,
    title: `実績${index}`,
    google_event_id: index % 2 === 0 ? `g${index}` : null,
    start_at: new Date(base + index * 60_000).toISOString(),
    end_at: new Date(base + index * 60_000 + 30 * 60_000).toISOString(),
  }));
}
