import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test as base } from "@playwright/test";

const TEST_PASSWORD = "local-e2e-only-password";

type E2EUser = {
  admin: SupabaseClient;
  userId: string;
  email: string;
  password: string;
  date: string;
  appEventId: string;
  appEventKey: string;
  crossMidnightStartAt: string;
  crossMidnightEndAt: string;
  crossMidnightActualId: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} must point to the disposable local Supabase instance`,
    );
  }
  return value;
}

function timestampOnDay(
  base: Date,
  dayOffset: number,
  hour: number,
  minute: number,
) {
  const value = new Date(base);
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

function dateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

async function createE2EUser(): Promise<E2EUser> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const hostname = new URL(supabaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    throw new Error("E2E users may only be created in local Supabase");
  }
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const uniqueId = randomUUID();
  const email = `e2e-${uniqueId}@example.com`;
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Playwright E2E" },
    });
  if (createError || !created.user) {
    throw new Error(`Could not create local E2E user: ${createError?.message}`);
  }

  try {
    const baseDay = new Date();
    baseDay.setHours(12, 0, 0, 0);
    const date = dateString(baseDay);
    const { error: profileError } = await admin
      .from("profiles")
      .update({ onboarded_at: baseDay.toISOString() })
      .eq("id", created.user.id);
    if (profileError) {
      throw new Error(
        `Could not prepare local E2E profile: ${profileError.message}`,
      );
    }

    const appEventKey = `app:${randomUUID()}`;
    const crossMidnightStartAt = timestampOnDay(baseDay, -1, 23, 30);
    const crossMidnightEndAt = timestampOnDay(baseDay, 0, 0, 30);
    const { data: appEvent, error: appEventError } = await admin
      .from("synced_events")
      .insert({
        user_id: created.user.id,
        google_event_id: appEventKey,
        source: "app",
        title: "日またぎ予定 E2E",
        start_at: crossMidnightStartAt,
        end_at: crossMidnightEndAt,
      })
      .select("id")
      .single();
    if (appEventError || !appEvent) {
      throw new Error(
        `Could not seed local E2E event: ${appEventError?.message}`,
      );
    }

    const { error: actualError } = await admin.from("time_entries").insert({
      user_id: created.user.id,
      title: "日またぎ実績 E2E",
      start_at: crossMidnightStartAt,
      end_at: crossMidnightEndAt,
    });
    if (actualError) {
      throw new Error(
        `Could not seed local E2E actual: ${actualError.message}`,
      );
    }
    const { data: crossMidnightActual, error: actualLookupError } = await admin
      .from("time_entries")
      .select("id")
      .eq("user_id", created.user.id)
      .eq("title", "日またぎ実績 E2E")
      .single();
    if (actualLookupError || !crossMidnightActual) {
      throw new Error(
        `Could not read local E2E actual: ${actualLookupError?.message}`,
      );
    }

    const { error: recurringError } = await admin
      .from("recurring_rules")
      .insert({
        user_id: created.user.id,
        title: "定期予定 E2E",
        pattern: "daily",
        weekdays: null,
        start_time: "15:00",
        end_time: "15:30",
        timezone: "Asia/Tokyo",
        starts_on: date,
        ends_on: date,
      });
    if (recurringError) {
      throw new Error(
        `Could not seed local E2E recurring rule: ${recurringError.message}`,
      );
    }

    return {
      admin,
      userId: created.user.id,
      email,
      password: TEST_PASSWORD,
      date,
      appEventId: appEvent.id,
      appEventKey,
      crossMidnightStartAt,
      crossMidnightEndAt,
      crossMidnightActualId: crossMidnightActual.id,
    };
  } catch (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw error;
  }
}

export const test = base.extend<{ testUser: E2EUser }>({
  testUser: async ({}, setFixture) => {
    const testUser = await createE2EUser();
    try {
      await setFixture(testUser);
    } finally {
      const { error } = await testUser.admin.auth.admin.deleteUser(
        testUser.userId,
      );
      if (error) {
        throw new Error(`Could not delete local E2E user: ${error.message}`);
      }
    }
  },
});

export { expect };
