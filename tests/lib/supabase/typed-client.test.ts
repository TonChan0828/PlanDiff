import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { nullableRpcArg, type AppSupabaseClient } from "@/lib/supabase/types";

// 仕様書: docs/specs/G-114_Supabaseデータベース型の生成とずれの検出.md F1〜F3
// 型検査(npm run typecheck)で固定する。クエリは組み立てるだけで実行しない(ネットワークに出ない)。
// `@ts-expect-error` は、その行がコンパイルエラーでなくなると未使用エラーになるため、
// 「誤った呼び出しが型で弾かれる」ことの検査になる。

const client: AppSupabaseClient = createClient<Database>(
  "http://127.0.0.1:54321",
  "test-key",
);

describe("DB固有の型(G-114)", () => {
  it("F1: 存在しない列・テーブルはコンパイルエラーになる", () => {
    // @ts-expect-error フィルタの列名の誤り
    client.from("time_entries").select("id").eq("no_such_column", 1);
    // @ts-expect-error 存在しないテーブル
    client.from("no_such_table");
    // @ts-expect-error 存在しない列への書き込み
    client.from("time_entries").insert({ no_such_column: 1 });

    expect(true).toBe(true);
  });

  it("F2: 存在しないRPC・誤った引数名や型はコンパイルエラーになる", () => {
    // @ts-expect-error 存在しないRPC
    client.rpc("no_such_function");
    // @ts-expect-error 引数名の誤り
    client.rpc("start_timer", { title: "x" });
    // @ts-expect-error 引数の型の誤り(p_title は文字列)
    client.rpc("start_timer", { p_title: 1 });
    // @ts-expect-error 必須の引数が足りない
    client.rpc("update_recurring_rule", { p_rule_id: "x" });

    expect(true).toBe(true);
  });

  it("F3: 正しい呼び出しは通り、行の型は列の型になる", () => {
    client.rpc("start_timer", { p_title: "x" });
    client.rpc("stop_timer");

    expectTypeOf<
      Database["public"]["Tables"]["time_entries"]["Row"]["title"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      Database["public"]["Tables"]["time_entries"]["Row"]["end_at"]
    >().toEqualTypeOf<string | null>();

    expect(true).toBe(true);
  });

  it("nullableRpcArg は値を変えず、null もそのまま返す", () => {
    expect(nullableRpcArg(null)).toBeNull();
    expect(nullableRpcArg("a")).toBe("a");
    expect(nullableRpcArg([1, 2])).toEqual([1, 2]);
  });
});
