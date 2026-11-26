import { test, expect } from "./fixtures";
import { expectNoHorizontalOverflow } from "./overflow";

// 仕様書: docs/specs/G-90_サマリーの途中経過と最終結果の分離.md A14
// 期間「今日〜明後日」は現在時刻がいつでも途中経過になる。
// 今日の0時台の予定は経過済み、明日の正午の予定は「これから」として分けて表示される。
// 前提: playwright.config.ts が TZ と timezoneId を Asia/Tokyo に固定している。
// テスト側の「今日」とサーバー側(TZ Cookie)の「今日」を揃えるため、TZ を変えて実行しない。
test("375px: 期間の途中では、途中経過のバッジと進み具合・このあとの予定が出る", async ({
  page,
  testUser,
}) => {
  const day = (offset: number, hour: number, minute: number) => {
    const value = new Date();
    value.setDate(value.getDate() + offset);
    value.setHours(hour, minute, 0, 0);
    return value;
  };
  const dateParam = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const events = [
    {
      id: "g90-past",
      title: "G90 今日の予定",
      start: day(0, 0, 0),
      end: day(0, 0, 30),
    },
    {
      id: "g90-future",
      title: "G90 明日の予定",
      start: day(1, 12, 0),
      end: day(1, 13, 0),
    },
  ];
  for (const event of events) {
    const { error } = await testUser.admin.from("synced_events").insert({
      user_id: testUser.userId,
      google_event_id: `app:${event.id}-${testUser.userId}`,
      source: "app",
      title: event.title,
      start_at: event.start.toISOString(),
      end_at: event.end.toISOString(),
    });
    expect(error).toBeNull();
  }

  // フィクスチャの定期予定(今日15:00)は現在時刻で「経過/これから」が変わるため外す(R-1)
  const { error: ruleError } = await testUser.admin
    .from("recurring_rules")
    .delete()
    .eq("user_id", testUser.userId);
  expect(ruleError).toBeNull();

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);

  await page.goto(
    `/summary?range=custom&from=${dateParam(day(0, 0, 0))}&to=${dateParam(day(2, 0, 0))}`,
  );

  await expect(page.getByTestId("gap-hero-partial-badge")).toContainText(
    "途中経過",
  );
  await expect(page.getByTestId("gap-hero-progress")).toHaveText(
    "経過した予定 1件 / 全 2件",
  );
  await expect(page.getByTestId("gap-hero-upcoming")).toHaveText(
    "このあと 予定 1件(計画 1:00)",
  );
  for (const id of [
    "gap-hero-partial-badge",
    "gap-hero-progress",
    "gap-hero-upcoming",
  ]) {
    await expectNoHorizontalOverflow(page.getByTestId(id));
  }
});

test("375px: 過去の期間では、途中経過の表示を出さない", async ({
  page,
  testUser,
}) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);

  await page.goto("/summary?range=custom&from=2026-01-05&to=2026-01-06");

  await expect(page.getByTestId("gap-hero-value")).toBeVisible();
  await expect(page.getByTestId("gap-hero-partial-badge")).toHaveCount(0);
  await expect(page.getByTestId("gap-hero-progress")).toHaveCount(0);
  await expect(page.getByTestId("gap-hero-upcoming")).toHaveCount(0);
});
