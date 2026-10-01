import { test, expect } from "./fixtures";

const THEME_STORAGE_KEY = "plandiff-theme";
const INITIALIZED_MARKER = "__d7_theme_e2e_initialized__";

const THEMES = {
  light: {
    color: "#2f4acb",
    iconColor: "#2f4acb",
    iconHref: "/icons/favicon-light.svg",
  },
  dark: {
    color: "#0e1116",
    iconColor: "#4c6ef5",
    iconHref: "/icons/favicon-dark.svg",
  },
  structured: {
    color: "#f9f7f3",
    iconColor: "#a05f58",
    iconHref: "/icons/favicon-structured.svg",
  },
} as const;

type BrowserTheme = keyof typeof THEMES;

async function seedInitialTheme(
  page: import("@playwright/test").Page,
  theme: BrowserTheme,
) {
  await page.addInitScript(
    ({ storageKey, marker, initialTheme }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(storageKey, initialTheme);
        sessionStorage.setItem(marker, "1");
      }
    },
    {
      storageKey: THEME_STORAGE_KEY,
      marker: INITIALIZED_MARKER,
      initialTheme: theme,
    },
  );
}

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);
}

async function expectThemeMetadata(
  page: import("@playwright/test").Page,
  theme: BrowserTheme,
) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

  const themeColors = page.locator('meta[name="theme-color"]');
  await expect(themeColors).toHaveCount(2);
  const lightThemeColor = page.locator(
    'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
  );
  await expect(lightThemeColor).toHaveCount(1);
  await expect(lightThemeColor).toHaveAttribute("content", THEMES[theme].color);
  const darkThemeColor = page.locator(
    'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
  );
  await expect(darkThemeColor).toHaveCount(1);
  await expect(darkThemeColor).toHaveAttribute("content", THEMES[theme].color);

  const icons = page.locator('link[rel~="icon"]');
  await expect
    .poll(async () => {
      const hrefs = await icons.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      );
      return (
        hrefs.length > 0 &&
        hrefs.every((href) => href === THEMES[theme].iconHref)
      );
    })
    .toBe(true);
  const href = THEMES[theme].iconHref;

  const iconResponse = await page.request.get(
    new URL(href, page.url()).toString(),
  );
  expect(iconResponse.ok()).toBe(true);
  const iconSvg = (await iconResponse.text()).toLowerCase();
  expect(iconSvg).toContain(THEMES[theme].iconColor);
  for (const otherTheme of Object.keys(THEMES) as BrowserTheme[]) {
    if (otherTheme !== theme) {
      expect(iconSvg).not.toContain(THEMES[otherTheme].iconColor);
    }
  }

  return href;
}

async function expectStreamedMetadataToSync(
  page: import("@playwright/test").Page,
  theme: BrowserTheme,
) {
  await page.evaluate(() => {
    const themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = "#ffffff";
    themeColor.media = "(prefers-color-scheme: light)";
    themeColor.dataset.e2eStreamedThemeColor = "true";

    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = "/icon.svg";
    icon.dataset.e2eStreamedIcon = "true";

    document.head.append(themeColor, icon);
  });

  await expect(
    page.locator('meta[data-e2e-streamed-theme-color="true"]'),
  ).toHaveAttribute("content", THEMES[theme].color);
  await expect(
    page.locator('link[data-e2e-streamed-icon="true"]'),
  ).toHaveAttribute("href", THEMES[theme].iconHref);

  await page
    .locator('[data-e2e-streamed-theme-color="true"]')
    .evaluate((node) => node.remove());
  await page
    .locator('[data-e2e-streamed-icon="true"]')
    .evaluate((node) => node.remove());
}

for (const theme of Object.keys(THEMES) as BrowserTheme[]) {
  test(`S7: 保存済み${theme}テーマを初期表示に反映する`, async ({
    page,
    testUser,
  }) => {
    await seedInitialTheme(page, theme);
    await signIn(page, testUser.email, testUser.password);
    await expectThemeMetadata(page, theme);
    await expectStreamedMetadataToSync(page, theme);

    if (theme !== "light") return;

    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("link", { name: "設定" })
      .click();
    await expect(page).toHaveURL(/\/settings(?:\?|$)/);

    const originalTimeOrigin = await page.evaluate(
      () => performance.timeOrigin,
    );
    const initialIconHref = await page
      .locator('link[rel~="icon"]')
      .first()
      .getAttribute("href");

    await page.getByText("ダーク", { exact: true }).click();
    const darkIconHref = await expectThemeMetadata(page, "dark");
    expect(darkIconHref).not.toBe(initialIconHref);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(
      originalTimeOrigin,
    );

    await page.getByText("Structured", { exact: true }).click();
    await expectThemeMetadata(page, "structured");
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(
      originalTimeOrigin,
    );

    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("link", { name: "カレンダー" })
      .click();
    await expect(page).toHaveURL(/\/calendar(?:\?|$)/);
    await expectThemeMetadata(page, "structured");
  });
}
