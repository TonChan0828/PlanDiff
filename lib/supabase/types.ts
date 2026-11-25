import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * DB固有の型(テーブル・列・RPCの引数)を持つ Supabase クライアント。
 * lib の関数はこの型で受け取り、マイグレーションの変更に型検査で追従させる(G-114)。
 */
export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * RPC の引数に null を渡すための型の補正。
 * `supabase gen types` は RPC 引数の null 可否を表現できず、null を受け付ける引数も
 * 非 null として出力する(DB関数は null を受け付け、実行時の挙動は変わらない)。
 * 値は変えず、型だけを緩める。呼び出し箇所を限定して見つけやすくするため、ここに集約する。
 */
export function nullableRpcArg<T>(value: T | null): T {
  return value as T;
}
