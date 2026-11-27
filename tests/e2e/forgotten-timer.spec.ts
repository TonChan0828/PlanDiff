import { test, expect } from "./fixtures";
import { expectNoHorizontalOverflow } from "./overflow";

// 仕様書: docs/specs/G-91_タイマーの止め忘れ対策.md I8
// 実行中は「現在の7時間前」に開始するので、いつ実行しても長時間かつ予定超過になる。
// 完了した実績は今日の固定時刻(0〜7時)に置き、右パネルと編集パネルで確かめる。
test("375px: 止め忘れの警告と終了時刻の候補が崩れずに使える", async ({
  page,
  testUser,
}) => {
  const hoursAgo = (hours: number) =>
    new Date(Date.now() - hours * 3_600_000).toISOString();
  const today = (hour: number) => {
    const value = new Date();
    value.setHours(hour, 0, 0, 0);
    return value.toISOString();
  };
  const runningKey = `app:g91-run-${testUser.userId}`;
  const doneKey = `app:g91-done-${testUser.userId}`;
  for (const [key, title, start, end] of [
    [runningKey, "G91 実行中の予定", hoursAgo(7), hoursAgo(6)],
    [doneKey, "G91 完了の予定", today(0), today(1)],
  ] as const) {
    const { error } = await testUser.admin.from("synced_events").insert({
      user_id: testUser.userId,
      google_event_id: key,
      source: "app",
      title,
      start_at: start,
      end_at: end,
    });
    expect(error).toBeNull();
  }
  const { error } = await testUser.admin.from("time_entries").insert([
    {
      user_id: testUser.userId,
      title: "G91 実行中の予定",
      google_event_id: runningKey,
      start_at: hoursAgo(7),
      end_at: null,
    },
    {
      user_id: testUser.userId,
      title: "G91 完了の予定",
      google_event_id: doneKey,
      start_at: today(0),
      end_at: today(7),
    },
  ]);
  expect(error).toBeNull();

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);

  const bar = page.getByTestId("running-timer-bar");
  await expect(
    bar.getByText("6時間以上計測しています。止め忘れではありませんか?"),
  ).toBeVisible();
  await expect(bar.getByText(/予定の終了\(.+\)を過ぎて計測/)).toBeVisible();
  await expectNoHorizontalOverflow(bar);
  await expect(bar.getByRole("button", { name: "停止" })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("running.png") });

  await page.getByRole("button", { name: "選択日の詳細を開く" }).click();
  await page
    .getByRole("button", { name: "G91 完了の予定の実績を編集", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const apply = dialog.getByRole("button", {
    name: "終了を予定の終了(01:00)にする",
  });
  await expect(
    dialog.getByText("止め忘れの可能性があります(6時間以上)"),
  ).toBeVisible();
  await apply.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(apply);
  await page.screenshot({ path: test.info().outputPath("edit.png") });
  await apply.click();
  await expect(apply).toHaveCount(0);

  await page.goto("/track");
  const hero = page.getByTestId("running-timer-hero");
  await expect(hero.getByText(/止め忘れではありませんか/)).toBeVisible();
  await expectNoHorizontalOverflow(hero);
});
