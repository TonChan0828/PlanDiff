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
  // フィクスチャの日またぎ実績(今日の0:00〜0:30)は続きの印と同じ時間帯で、列が半分(約24px)になる。
  // どんな文字も収まらない幅になるため外し、1列の場合の読みやすさを確かめる
  const { error: removeError } = await testUser.admin
    .from("time_entries")
    .delete()
    .eq("id", testUser.crossMidnightActualId);
  expect(removeError).toBeNull();
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
  // 前日の夜から今日の朝まで続く実績。今日の列には「続き」の印が出る
  const { error: overnightError } = await testUser.admin
    .from("time_entries")
    .insert({
      user_id: testUser.userId,
      title: "G104 夜間",
      start_at: new Date(
        new Date(today(21)).getTime() - 24 * 3_600_000,
      ).toISOString(),
      end_at: today(7),
    });
  expect(overnightError).toBeNull();

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

  // J7: 続きの日の印の文字が、印の高さに収まって最後まで読める。
  // 今日が月曜だと前日は表示中の週の外になるが、今日の列の印は出る
  const mark = page.getByText("前日から継続(省略)");
  await mark.scrollIntoViewIfNeeded();
  const markBlock = page
    .getByTestId("actual-block")
    .filter({ hasText: "前日から継続(省略)" });
  const [markBlockBox, markBox] = await Promise.all([
    markBlock.boundingBox(),
    mark.boundingBox(),
  ]);
  expect(markBox!.y + markBox!.height).toBeLessThanOrEqual(
    markBlockBox!.y + markBlockBox!.height + 0.5,
  );
  await expect(markBlock.getByRole("button", { name: /を再計測/ })).toHaveCount(
    0,
  );
  await page.screenshot({ path: test.info().outputPath("long-week-cont.png") });
});
