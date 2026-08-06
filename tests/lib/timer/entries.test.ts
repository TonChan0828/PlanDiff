import { describe, expect, it } from "vitest";
import { RowLimitExceededError } from "@/lib/errors/row-limit";
import { MAX_FETCH_ROWS, PAGE_SIZE } from "@/lib/supabase/paged-fetch";
import { fetchTimeEntriesInRange } from "@/lib/timer/entries";
import {
  buildEntryRows,
  createPagedQueryMock,
} from "../../helpers/paged-query";

// 仕様書: docs/specs/P6-0_サマリー集計の行数上限.md S8〜S14

const RANGE = {
  timeMin: "2026-01-01T00:00:00.000Z",
  timeMax: "2027-01-01T00:00:00.000Z",
};

describe("fetchTimeEntriesInRange のページング取得(S8〜S12)", () => {
  it("S8: 該当0件なら空配列を返し、クエリは1回だけ発行される", async () => {
    const { client, calls } = createPagedQueryMock(buildEntryRows(0));

    const entries = await fetchTimeEntriesInRange(client, RANGE);

    expect(entries).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ from: 0, to: PAGE_SIZE - 1 });
  });

  it("S9: PAGE_SIZE未満(999件)なら全件を返し、クエリは1回だけ発行される", async () => {
    const { client, calls } = createPagedQueryMock(buildEntryRows(999));

    const entries = await fetchTimeEntriesInRange(client, RANGE);

    expect(entries).toHaveLength(999);
    expect(calls).toHaveLength(1);
  });

  it("S10: ちょうどPAGE_SIZE(1000件)なら全件を返し、クエリは2回発行される", async () => {
    const { client, calls } = createPagedQueryMock(buildEntryRows(PAGE_SIZE));

    const entries = await fetchTimeEntriesInRange(client, RANGE);

    expect(entries).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2);
  });

  it("S11: PAGE_SIZE+1(1001件)なら全件を昇順で返し、クエリは2回発行される", async () => {
    const { client, calls } = createPagedQueryMock(
      buildEntryRows(PAGE_SIZE + 1),
    );

    const entries = await fetchTimeEntriesInRange(client, RANGE);

    expect(entries).toHaveLength(PAGE_SIZE + 1);
    expect(calls).toHaveLength(2);
    expect(entries[PAGE_SIZE - 1]!.title).toBe(`実績${PAGE_SIZE - 1}`);
    expect(entries[PAGE_SIZE]!.title).toBe(`実績${PAGE_SIZE}`);
  });

  it("S12: 2500件なら3ページで全件を返す", async () => {
    const { client, calls } = createPagedQueryMock(buildEntryRows(2500));

    const entries = await fetchTimeEntriesInRange(client, RANGE);

    expect(entries).toHaveLength(2500);
    expect(calls).toHaveLength(3);
  });
});

describe("fetchTimeEntriesInRange の異常系(S13・S14)", () => {
  it("S13: MAX_FETCH_ROWSを超えるとRowLimitExceededErrorを投げる(部分結果を返さない)", async () => {
    const { client } = createPagedQueryMock(buildEntryRows(MAX_FETCH_ROWS + 1));

    await expect(fetchTimeEntriesInRange(client, RANGE)).rejects.toThrow(
      RowLimitExceededError,
    );
  });

  it("S14: 2ページ目がDBエラーなら既存と同じ日本語メッセージで失敗する", async () => {
    const { client } = createPagedQueryMock(buildEntryRows(PAGE_SIZE + 1), {
      errorOnPage: 2,
    });

    await expect(fetchTimeEntriesInRange(client, RANGE)).rejects.toThrow(
      "実績の読み込みに失敗しました",
    );
  });

  it("S14: 実行中タイマーの除外と期間の絞り込み条件は従来どおり維持される", async () => {
    const { client, filters } = createPagedQueryMock(buildEntryRows(1));

    await fetchTimeEntriesInRange(client, RANGE);

    expect(filters).toContain("not:end_at:is:null");
    expect(filters).toContain(`lt:start_at:${RANGE.timeMax}`);
    expect(filters).toContain(`gt:end_at:${RANGE.timeMin}`);
  });

  it("S14: start_at同値でもページ順序が確定するよう id を第2ソートキーにする", async () => {
    const { client, orders } = createPagedQueryMock(buildEntryRows(1));

    await fetchTimeEntriesInRange(client, RANGE);

    expect(orders).toEqual(["start_at", "id"]);
  });
});
