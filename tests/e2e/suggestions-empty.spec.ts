import { test, expect } from "./fixtures";

// 仕様書: docs/specs/G-92_提案タブの空状態.md C6
// フィクスチャの利用者は提案の条件を満たす実績を持たないため、提案タブは空状態になる。
test("375px: 提案がないとき、提案タブに条件の説明が出て横スクロールしない", async ({
  page,
  testUser,
}) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード").fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);

  await page.getByRole("button", { name: "選択日の詳細を開く" }).click();
  await page.getByRole("tab", { name: "提案" }).click();

  await expect(page.getByText("いまは提案がありません")).toBeVisible();
  await expect(page.getByText(/表示している週より前の4週間で/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // 提案タブは下部シート内のスクロール領域にあるため、はみ出しは document の幅では分からない。
  // 提案の領域を含むスクロール領域でも、横スクロールが起きないことを確かめる
  expect(
    await page
      .getByRole("region", { name: "実績からの提案" })
      .evaluate((section) => {
        const scroller = section.closest(".overflow-y-auto")!;
        return scroller.scrollWidth <= scroller.clientWidth;
      }),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("suggestions-empty.png"),
  });
});
