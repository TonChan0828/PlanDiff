import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service role クライアント。google_tokens の読み書き専用。
// "server-only" によりクライアントバンドルへの混入をビルドエラーで防ぐ。
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabaseの環境変数(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)が設定されていません",
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type GetGoogleRefreshTokenResult =
  { ok: true; refreshToken: string | null } | { ok: false };

/**
 * google_tokens から refresh token を読み取る。
 * 行がない場合は ok: true / refreshToken: null(=再認可が必要)、
 * DB障害は ok: false で区別する(誤って再認可へ誘導しない)。
 */
export async function getGoogleRefreshToken(
  userId: string,
): Promise<GetGoogleRefreshTokenResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("google_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("google_tokensの読み取りに失敗しました:", error.code);
      return { ok: false };
    }
    return { ok: true, refreshToken: data?.refresh_token ?? null };
  } catch (cause) {
    console.error(
      "google_tokensの読み取りに失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return { ok: false };
  }
}

/**
 * 失効した refresh token の行を削除する(仕様書P1-2 確認事項2)。
 * 削除失敗は再認可導線の妨げにならないためログのみ残す。
 */
export async function deleteGoogleRefreshToken(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("google_tokens")
      .delete()
      .eq("user_id", userId);
    if (error) {
      console.error("google_tokensの削除に失敗しました:", error.code);
    }
  } catch (cause) {
    console.error(
      "google_tokensの削除に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
  }
}

/**
 * アカウントとデータの全削除(仕様書P4-2)。auth.users の削除により
 * profiles / google_tokens / synced_events / time_entries は cascade で消える(P0-6)。
 * 成功で true。失敗はエラー種別のみログに残す。
 */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("アカウントの削除に失敗しました:", error.code);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      "アカウントの削除に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return false;
  }
}

/**
 * Google の refresh token を google_tokens に upsert する(成功で true)。
 * 失敗時はエラー種別のみログに残す。トークン値・認可コードは絶対にログに出さない。
 */
export async function saveGoogleRefreshToken(
  userId: string,
  refreshToken: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("google_tokens")
      .upsert({ user_id: userId, refresh_token: refreshToken });
    if (error) {
      console.error("google_tokensへの保存に失敗しました:", error.code);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      "google_tokensへの保存に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return false;
  }
}
