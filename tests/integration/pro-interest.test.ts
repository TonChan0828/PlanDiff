import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/pro-interest/route";
import { createAdminClient, createAnonClient } from "./helpers";

// 仕様書: docs/specs/P4-4_料金ページ.md S8〜S10
// POST /api/pro-interest 〜 pro_interest_events(RLS)の結合検証

const admin = createAdminClient();

function postRequest(body: string): Request {
  return new Request("http://localhost/api/pro-interest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function countRows(): Promise<number> {
  const { count, error } = await admin
    .from("pro_interest_events")
    .select("*", { count: "exact", head: true });
  expect(error).toBeNull();
  return count ?? 0;
}

beforeEach(async () => {
  const { error } = await admin
    .from("pro_interest_events")
    .delete()
    .not("id", "is", null);
  expect(error).toBeNull();
});

describe("POST /api/pro-interest(結合)", () => {
  it("S8: view / click それぞれのPOSTで pro_interest_events に1行ずつ記録され204が返る", async () => {
    const clickResponse = await POST(
      postRequest(JSON.stringify({ event: "click" })),
    );
    expect(clickResponse.status).toBe(204);

    const viewResponse = await POST(
      postRequest(JSON.stringify({ event: "view" })),
    );
    expect(viewResponse.status).toBe(204);

    const { data, error } = await admin
      .from("pro_interest_events")
      .select("event_type")
      .order("created_at", { ascending: true });
    expect(error).toBeNull();
    expect(data?.map((row) => row.event_type).sort()).toEqual([
      "click",
      "view",
    ]);
  });

  it("S9: 不正なbody({}・不明なevent・非JSON)は400と日本語エラーが返り、行は増えない", async () => {
    for (const body of [
      "{}",
      JSON.stringify({ event: "other" }),
      "汚れたJSON",
    ]) {
      const response = await POST(postRequest(body));
      expect(response.status, `body=${body}`).toBe(400);
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toBe("不正なリクエストです");
    }
    expect(await countRows()).toBe(0);
  });

  it("S10: anonキーからは pro_interest_events をSELECT/INSERTできない(RLS)", async () => {
    const { error: seedError } = await admin
      .from("pro_interest_events")
      .insert({ event_type: "view" });
    expect(seedError).toBeNull();

    const anon = createAnonClient();
    const { data: selectData, error: selectError } = await anon
      .from("pro_interest_events")
      .select();
    // ポリシー不存在のため「行が返らない」または「権限エラー」のいずれかであること
    if (selectError === null) {
      expect(selectData).toHaveLength(0);
    } else {
      expect(selectError).not.toBeNull();
    }

    const { error: insertError } = await anon
      .from("pro_interest_events")
      .insert({ event_type: "click" });
    expect(insertError).not.toBeNull();
    expect(await countRows()).toBe(1);
  });
});
