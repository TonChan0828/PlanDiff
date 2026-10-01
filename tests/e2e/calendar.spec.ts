import { test, expect } from "./fixtures";

const TEST_EVENT_TITLE = "日またぎ予定 E2E";
const TEST_ACTUAL_TITLE = "日またぎ実績 E2E";

async function signInAndOpenCalendar(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  date: string,
) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);
  await page.goto(`/calendar?view=day&date=${date}`);
  await expect(
    page.getByRole("button", { name: "選択日の詳細を開く" }),
  ).toBeVisible();
}

async function openDayDetails(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "選択日の詳細を開く" }).click();
  return page.getByRole("complementary", { name: "選択日の詳細" });
}

test("375px: 日またぎ予定を翌日の詳細から編集して元の日時を保つ", async ({
  page,
  testUser,
}) => {
  await signInAndOpenCalendar(
    page,
    testUser.email,
    testUser.password,
    testUser.date,
  );
  const details = await openDayDetails(page);
  const crossMidnightTime = details
    .getByText(/\d+\/\d+ 23:30〜\d+\/\d+ 00:30/)
    .first();
  await expect(details.getByRole("heading", { name: "予定" })).toBeVisible();
  await expect(
    details.getByRole("button", { name: `${TEST_EVENT_TITLE}の予定を編集` }),
  ).toBeVisible();
  await expect(crossMidnightTime).toBeVisible();

  await details
    .getByRole("button", { name: `${TEST_EVENT_TITLE}の予定を編集` })
    .click();
  await expect(details).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "予定を編集" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);

  await dialog.getByLabel("タイトル").fill("日またぎ予定 E2E 編集済み");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => {
      const { data, error } = await testUser.admin
        .from("synced_events")
        .select("title, start_at, end_at")
        .eq("id", testUser.appEventId)
        .single();
      if (error) throw error;
      return {
        title: data.title,
        start_at: new Date(data.start_at).getTime(),
        end_at: new Date(data.end_at).getTime(),
      };
    })
    .toMatchObject({
      title: "日またぎ予定 E2E 編集済み",
      start_at: new Date(testUser.crossMidnightStartAt).getTime(),
      end_at: new Date(testUser.crossMidnightEndAt).getTime(),
    });
});

test("375px: 定期予定の編集で詳細シートを閉じて回の編集を表示する", async ({
  page,
  testUser,
}) => {
  await signInAndOpenCalendar(
    page,
    testUser.email,
    testUser.password,
    testUser.date,
  );
  const details = await openDayDetails(page);
  await details
    .getByRole("button", { name: "定期予定 E2Eの予定を編集" })
    .click();
  await expect(details).toHaveCount(0);
  const choice = page.getByRole("dialog", {
    name: "編集する範囲を選んでください",
  });
  await expect(choice).toBeVisible();
  await choice.getByRole("button", { name: "この予定のみ" }).click();
  const editDialog = page.getByRole("dialog", { name: "予定を編集" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("タイトル")).toHaveValue("定期予定 E2E");
});

test("375px: 日またぎ実績の削除確認でフォーカスを閉じ込めEscapeで戻る", async ({
  page,
  testUser,
}) => {
  await signInAndOpenCalendar(
    page,
    testUser.email,
    testUser.password,
    testUser.date,
  );
  const details = await openDayDetails(page);
  await expect(
    details.getByRole("button", { name: `${TEST_ACTUAL_TITLE}の実績を編集` }),
  ).toBeVisible();
  await expect(
    details.getByText(/\d+\/\d+ 23:30〜\d+\/\d+ 00:30/).first(),
  ).toBeVisible();
  await details
    .getByRole("button", { name: `${TEST_ACTUAL_TITLE}の実績を編集` })
    .click();
  await expect(details).toHaveCount(0);

  const dialog = page.getByRole("dialog", { name: "実績を編集" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await dialog.getByRole("button", { name: "削除", exact: true }).click();
  await expect(dialog.getByText("この実績を削除しますか?")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const { data, error } = await testUser.admin
    .from("time_entries")
    .select("id")
    .eq("id", testUser.crossMidnightActualId)
    .single();
  expect(error).toBeNull();
  expect(data).not.toBeNull();
});

test("フリータイマーを開始・停止してサマリーを開ける", async ({
  page,
  testUser,
}) => {
  await signInAndOpenCalendar(
    page,
    testUser.email,
    testUser.password,
    testUser.date,
  );
  const title = "E2E作業タイマー";
  await page.getByLabel("作業内容(空欄可)").fill(title);
  await page.getByRole("button", { name: "フリータイマーを開始" }).click();
  await expect(page.getByTestId("running-timer-bar")).toContainText(title);
  await expect
    .poll(async () => {
      const { data, error } = await testUser.admin
        .from("time_entries")
        .select("id, end_at")
        .eq("user_id", testUser.userId)
        .eq("title", title)
        .maybeSingle();
      if (error) throw error;
      return data?.end_at ?? "running";
    })
    .toBe("running");

  await page
    .getByTestId("running-timer-bar")
    .getByRole("button", { name: "停止" })
    .click();
  await expect(page.getByTestId("free-timer-bar")).toBeVisible();
  await expect
    .poll(async () => {
      const { data, error } = await testUser.admin
        .from("time_entries")
        .select("end_at")
        .eq("user_id", testUser.userId)
        .eq("title", title)
        .maybeSingle();
      if (error) throw error;
      return data?.end_at ?? null;
    })
    .not.toBeNull();

  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("link", { name: "サマリー" })
    .click();
  await expect(page).toHaveURL(/\/summary(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "サマリー" }).first(),
  ).toBeVisible();
});
