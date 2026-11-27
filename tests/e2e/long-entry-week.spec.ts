import { test, expect } from "./fixtures";

// 仕様書: docs/specs/G-104_週表示の長時間実績の省略表示.md J7
// 今日の固定時刻(8:00〜20:38)の実績を作るため、実行時刻に依存しない(未来の時刻でも表示される)。
// 週表示のグリッドは意図して横スクロールするため、横はみ出しの共通関数は使わない(R-2)。
test("375px: 週表示の長時間の実績は省略され、実際の長さが読める", async ({
  page,
  testUser,
}) => {
  const today = (hour: number, minute = 0) => {
    const value = new Date();
    value.setHours(hour, minute, 0, 0);
    return value.toISOString();
  };
  const planKey = `app:g104-${testUser.userId}`;
  const { error: planError } = await testUser.admin
    .from("synced_events")
    .insert({
      user_id: testUser.userId,
      google_event_id: planKey,
      source: "app",
      title: "G104 副業",
      start_at: today(8),
      end_at: today(8, 30),
    });
  expect(planError).toBeNull();
  const { error } = await testUser.admin.from("time_entries").insert({
    user_id: testUser.userId,
    title: "G104 副業",
    google_event_id: planKey,
    start_at: today(8),
    end_at: today(20, 38),
  });
  expect(error).toBeNull();

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);
  await page.goto("/calendar?view=week");

  const label = page.getByText("省略 12時間38分");
  await label.scrollIntoViewIfNeeded();
  await expect(label).toBeInViewport();
  // 文字がブロックの中に収まっている(下端で切れていない)
  const block = page
    .getByTestId("actual-block")
    .filter({ hasText: "省略 12時間38分" });
  const [blockBox, labelBox] = await Promise.all([
    block.boundingBox(),
    label.boundingBox(),
  ]);
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(
    blockBox!.y + blockBox!.height,
  );
  expect(Math.round(blockBox!.height)).toBeLessThanOrEqual(113); // 2時間 × 56px
  await page.screenshot({ path: test.info().outputPath("long-week.png") });
});
