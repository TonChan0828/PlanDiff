import { describe, expect, it } from "vitest";
import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import { RowLimitExceededError } from "@/lib/errors/row-limit";
import { MAX_FETCH_ROWS, PAGE_SIZE } from "@/lib/supabase/paged-fetch";
import {
  buildEventRows,
  createPagedQueryMock,
} from "../../helpers/paged-query";

// 仕様書: docs/specs/P6-0_サマリー集計の行数上限.md S1〜S7

const RANGE = {
  timeMin: "2026-01-01T00:00:00.000Z",
  timeMax: "2027-01-01T00:00:00.000Z",
};

describe("fetchSyncedEventsInRange のページング取得(S1〜S5)", () => {
  it("S1: 該当0件なら空配列を返し、クエリは1回だけ発行される", async () => {
    const { client, calls } = createPagedQueryMock(buildEventRows(0));

    const events = await fetchSyncedEventsInRange(client, RANGE);

    expect(events).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ from: 0, to: PAGE_SIZE - 1 });
  });

  it("S2: PAGE_SIZE未満(999件)なら全件を返し、クエリは1回だけ発行される", async () => {
    const { client, calls } = createPagedQueryMock(buildEventRows(999));

    const events = await fetchSyncedEventsInRange(client, RANGE);

    expect(events).toHaveLength(999);
    expect(calls).toHaveLength(1);
  });

  it("S3: ちょうどPAGE_SIZE(1000件)なら全件を返し、クエリは2回発行される", async () => {
    const { client, calls } = createPagedQueryMock(buildEventRows(PAGE_SIZE));

    const events = await fetchSyncedEventsInRange(client, RANGE);

    expect(events).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 });
  });

  it("S4: PAGE_SIZE+1(1001件)なら全件を昇順で返し、クエリは2回発行される", async () => {
    const rows = buildEventRows(PAGE_SIZE + 1);
    const { client, calls } = createPagedQueryMock(rows);

    const events = await fetchSyncedEventsInRange(client, RANGE);

    expect(events).toHaveLength(PAGE_SIZE + 1);
    expect(calls).toHaveLength(2);
    // ページ境界(1000件目と1001件目)で順序が崩れないこと
    expect(events[PAGE_SIZE - 1]!.googleEventId).toBe(`g${PAGE_SIZE - 1}`);
    expect(events[PAGE_SIZE]!.googleEventId).toBe(`g${PAGE_SIZE}`);
  });

  it("S5: 2500件なら3ページで全件を返す", async () => {
    const { client, calls } = createPagedQueryMock(buildEventRows(2500));

    const events = await fetchSyncedEventsInRange(client, RANGE);

    expect(events).toHaveLength(2500);
    expect(calls).toHaveLength(3);
  });
});

describe("fetchSyncedEventsInRange の異常系(S6・S7)", () => {
  it("S6: MAX_FETCH_ROWSを超えるとRowLimitExceededErrorを投げる(部分結果を返さない)", async () => {
    const { client } = createPagedQueryMock(buildEventRows(MAX_FETCH_ROWS + 1));

    await expect(fetchSyncedEventsInRange(client, RANGE)).rejects.toThrow(
      RowLimitExceededError,
    );
  });

  it("S7: 2ページ目がDBエラーなら既存と同じ日本語メッセージで失敗する", async () => {
    const { client } = createPagedQueryMock(buildEventRows(PAGE_SIZE + 1), {
      errorOnPage: 2,
    });

    await expect(fetchSyncedEventsInRange(client, RANGE)).rejects.toThrow(
      "予定の読み込みに失敗しました",
    );
  });

  it("S7/P6-2 S1: 重なり判定は範囲型の生成列で行う(全履歴スキャンを避ける)", async () => {
    const { client, filters } = createPagedQueryMock(buildEventRows(1));

    await fetchSyncedEventsInRange(client, RANGE);

    expect(filters).toContain(
      `overlaps:span:[${RANGE.timeMin},${RANGE.timeMax})`,
    );
    // 片側境界しか使えない旧条件は残さない
    expect(filters).not.toContain(`lt:start_at:${RANGE.timeMax}`);
    expect(filters).not.toContain(`gt:end_at:${RANGE.timeMin}`);
  });

  it("S7: start_at同値でもページ順序が確定するよう id を第2ソートキーにする", async () => {
    const { client, orders } = createPagedQueryMock(buildEventRows(1));

    await fetchSyncedEventsInRange(client, RANGE);

    expect(orders).toEqual(["start_at", "id"]);
  });
});
