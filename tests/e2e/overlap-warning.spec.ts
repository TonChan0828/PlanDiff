import { test, expect } from "./fixtures";
import { expectNoHorizontalOverflow } from "./overflow";

// 仕様書: docs/specs/G-94_予定の時間の重なりの警告.md H8
// 今日の固定時刻の予定を作り、同じ時刻を入力するため、実行時刻に依存しない。
test("375px: 予定の追加で重なりの警告が出て、保存ボタンまで届く", async ({
  page,
  testUser,
}) => {
  const today = new Date();
  const at = (hour: number) => {
    const value = new Date(today);
    value.setHours(hour, 0, 0, 0);
    return value;
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (hour: number, minute: number) =>
    `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T${pad(hour)}:${pad(minute)}`;
  const { error } = await testUser.admin.from("synced_events").insert({
    user_id: testUser.userId,
    google_event_id: `app:g94-${testUser.userId}`,
    source: "app",
    title: "G94 長い名前の英語学習の予定(折り返しの確認用)",
    start_at: at(10).toISOString(),
    end_at: at(11).toISOString(),
  });
  expect(error).toBeNull();

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);

  await page.getByRole("button", { name: "予定を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("開始時刻", { exact: true }).fill(local(10, 30));
  await dialog.getByLabel("終了時刻", { exact: true }).fill(local(11, 30));

  const warning = dialog.getByRole("status");
  await expect(warning).toContainText(
    "ほかの予定と時間が重なっています(保存はできます)",
  );
  await expect(warning).toContainText("10:00〜11:00 G94");
  await expectNoHorizontalOverflow(warning);
  await page.screenshot({ path: test.info().outputPath("overlap.png") });

  const save = dialog.getByRole("button", { name: "保存", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
});
