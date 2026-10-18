import { test, expect } from "./fixtures";

// 既存の使い捨てローカルユーザーで、375pxの実際の保存操作まで確認する。
test("375px: 休止を提案し、翌日から休止・再開できる", async ({
  page,
  testUser,
}) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: rule, error } = await testUser.admin
    .from("recurring_rules")
    .insert({
      user_id: testUser.userId,
      title: "読書の休止確認",
      pattern: "daily",
      weekdays: null,
      start_time: "09:00",
      end_time: "09:30",
      timezone: "Asia/Tokyo",
      starts_on: since.toISOString().slice(0, 10),
      ends_on: null,
      origin: "suggestion",
      inactivity_since: since.toISOString(),
      last_learned_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);
  await page.getByText(/記録が途絶えた予定（1件）/).click();
  const card = page.getByRole("article", { name: "読書の休止確認" });
  await expect(card.getByText(/記録がありません。休止しますか/)).toBeVisible();
  await expect(
    card.getByRole("button", { name: "14日後に再確認" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/plandiff-pause-mobile-light.png",
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: "/tmp/plandiff-pause-mobile-dark.png",
    fullPage: true,
  });
  await card.getByRole("button", { name: "休止する", exact: true }).click();
  await expect(page.getByText(/休止中の予定（1件）/)).toBeVisible();
  await page.getByText(/休止中の予定（1件）/).click();
  await expect(
    card.getByRole("button", { name: "翌日から再開する" }),
  ).toBeVisible();
  const { data: pauses } = await testUser.admin
    .from("recurring_rule_pauses")
    .select("starts_on, ends_on")
    .eq("rule_id", rule!.id);
  expect(pauses).toHaveLength(1);
  expect(pauses![0]!.ends_on).toBeNull();
  const { data: future } = await testUser.admin
    .from("synced_events")
    .select("id")
    .eq("user_id", testUser.userId)
    .like("google_event_id", `rec:${rule!.id}:%`)
    .gte("start_at", `${pauses![0]!.starts_on}T00:00:00+09:00`);
  expect(future).toEqual([]);
  await card.getByRole("button", { name: "翌日から再開する" }).click();
  await expect(card.getByText("翌日から再開予定です")).toBeVisible();
  const { data: resumed } = await testUser.admin
    .from("recurring_rule_pauses")
    .select("ends_on")
    .eq("rule_id", rule!.id);
  expect(resumed![0]!.ends_on).toBe(pauses![0]!.starts_on);
});
