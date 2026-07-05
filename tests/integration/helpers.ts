import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

// 結合テストはローカルSupabase(npx supabase start)前提。
// 未起動・未設定の場合はskipせず失敗させる(仕様書P0-6の規定)。
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `環境変数 ${name} が未設定です。ローカルSupabase(npx supabase start)を起動し、` +
        `.env.local に値が設定されているか確認してください`,
    );
  }
  return value;
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function createAnonClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// RLS・GRANTを経由しないDB状態の直接検証用(pg_classの確認、cascade削除の確認など)
export function createDbSql() {
  const url =
    process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  return postgres(url, { max: 1, onnotice: () => {} });
}

const TEST_PASSWORD = "plandiff-integration-test-pw";

export interface TestUser {
  id: string;
  email: string;
  /** anonキー+パスワードサインイン済みの、本人文脈(authenticated)クライアント */
  client: SupabaseClient;
}

export async function createTestUser(
  admin: SupabaseClient,
  displayName = "テストユーザー",
): Promise<TestUser> {
  const email = `it-${crypto.randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { name: displayName },
  });
  if (error || !data.user) {
    throw new Error(`テストユーザーの作成に失敗しました: ${error?.message}`);
  }
  const client = createAnonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    throw new Error(
      `テストユーザーのサインインに失敗しました: ${signInError.message}`,
    );
  }
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`テストユーザーの削除に失敗しました: ${error.message}`);
  }
}
