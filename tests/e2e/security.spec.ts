import { test, expect } from "./fixtures";

test("S9: every public page has a fresh matching nonce and blocks untrusted inline scripts", async ({
  page,
}) => {
  let previous = "";
  for (const path of [
    "/",
    "/pricing",
    "/privacy",
    "/terms",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ]) {
    // Fetch outside the route callback: avoid nested request/tracing lifetimes
    // while the browser is navigating. Preserve CSP but not transport encoding.
    const fetched = await page.request.get(path);
    const html = (await fetched.text()).replace(
      "</head>",
      "<script>window.__securityInjected = true</script></head>",
    );
    const responseHeaders = { ...fetched.headers() };
    for (const key of [
      "content-encoding",
      "transfer-encoding",
      "content-length",
    ])
      delete responseHeaders[key];
    const target = new URL(path, fetched.url()).href;
    await page.route(
      target,
      (route) =>
        route.fulfill({
          status: fetched.status(),
          headers: responseHeaders,
          body: html,
        }),
      { times: 1 },
    );
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    const csp = response!.headers()["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    const nonce = await page
      .locator("script[nonce]")
      .first()
      .evaluate((e: HTMLScriptElement) => e.nonce ?? "");
    expect(nonce.length).toBeGreaterThan(16);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(nonce).not.toBe(previous);
    previous = nonce;
    const executed = await page.evaluate(
      () =>
        (window as unknown as { __securityInjected?: boolean })
          .__securityInjected === true,
    );
    expect(executed).toBe(false);
  }
});

test("S9/S10: protected pages retain nonce and working controls after sign in", async ({
  page,
  testUser,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|violates.*directive/i.test(message.text())
    )
      violations.push(message.text());
  });
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(testUser.email);
  await page.getByLabel("パスワード", { exact: true }).fill(testUser.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar/);
  for (const path of [
    "/calendar",
    "/track",
    "/summary",
    "/settings",
    "/onboarding",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response!.headers()["content-security-policy"]).toContain(
      "'strict-dynamic'",
    );
    expect(await page.locator("script[nonce]").count()).toBeGreaterThan(0);
    await expect(page.locator("body")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(violations).toEqual([]);
});

test("S9: frame embedding is refused", async ({ page, baseURL }) => {
  await page.goto("/login");
  await page.evaluate((url) => {
    const frame = document.createElement("iframe");
    frame.id = "forbidden-frame";
    frame.src = url;
    document.body.append(frame);
  }, `${baseURL}/pricing`);
  await expect
    .poll(
      () => page.frames().filter((f) => f.url().endsWith("/pricing")).length,
    )
    .toBe(0);
});

test("S10: pricing view and click are recorded through the protected API", async ({
  page,
}) => {
  const view = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/pro-interest") &&
      response.request().method() === "POST",
  );
  await page.goto("/pricing");
  expect((await view).status()).toBe(204);
  const click = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/pro-interest") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Proに興味あり", exact: true })
    .click();
  expect((await click).status()).toBe(204);
  await expect(page.getByRole("status")).toHaveText(
    "興味を受け付けました。ありがとうございます!",
  );
});
