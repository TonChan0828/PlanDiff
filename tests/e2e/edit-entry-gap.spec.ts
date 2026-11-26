import { test, expect } from "./fixtures";
import { expectNoHorizontalOverflow } from "./overflow";

// 仕様書: docs/specs/G-98_実績編集の予定との差分表示.md E9
// 今日の固定時刻の予定と実績を作るため、実行時刻に依存しない(未来の時刻でもカレンダーには表示される)。
test("375px: 実績の編集で予定とのズレが出て、保存ボタンまで届く", async ({
  page,
  testUser,
}) => {
  const today = (hour: number, minute: number) => {
    const value = new Date();
    value.setHours(hour, minute, 0, 0);
    return value.toISOString();
  };
  const planKey = `app:g98-${testUser.userId}`;
  const { error: planError } = await testUser.admin
    .from("synced_events")
    .insert({
      user_id: testUser.userId,
      google_event_id: planKey,
      source: "app",
      title: "G98 設計",
      start_at: today(9, 0),
      end_at: today(10, 0),
    });
  expect(planError).toBeNull();
  const { error: entryError } = await testUser.admin
    .from("time_entries")
    .insert({
      user_id: testUser.userId,
      title: "G98 設計",
      google_event_id: planKey,
      start_at: today(9, 8),
      end_at: today(10, 14),
    });
  expect(entryError).toBeNull();

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);

  await page.getByRole("button", { name: "選択日の詳細を開く" }).click();
  await page
    .getByRole("button", { name: "G98 設計の実績を編集", exact: true })
    .click();

  const box = page.getByRole("group", { name: "予定とのズレ" });
  await expect(box.getByText("予定 09:00〜10:00(1時間)")).toBeVisible();
  await expect(box.getByText("開始 +8分 遅れ")).toBeVisible();
  await expect(box.getByText("所要 +6分 超過")).toBeVisible();
  await expectNoHorizontalOverflow(box);
  await page.screenshot({ path: test.info().outputPath("edit-gap.png") });

  const save = page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
});
