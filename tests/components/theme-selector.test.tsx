import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeSelector } from "@/components/theme-selector";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S10〜S12(テーマの手動切替)

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeSelector(S10〜S12)", () => {
  it("S10: 保存値なしでは3択が表示され「システムに合わせる」が選択済み", () => {
    render(<ThemeSelector />);

    expect(screen.getByRole("radio", { name: "ライト" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "ダーク" })).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "システムに合わせる" }),
    ).toBeChecked();
  });

  it("S11: ダークを選択するとdata-themeとlocalStorageに反映される", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    await user.click(screen.getByRole("radio", { name: "ダーク" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
  });

  it("S11: ライトを選択するとdata-theme=lightで保存される", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    await user.click(screen.getByRole("radio", { name: "ライト" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("S12: ダーク選択後にシステムへ戻すと属性が除去されsystemが保存される", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    await user.click(screen.getByRole("radio", { name: "ダーク" }));
    await user.click(screen.getByRole("radio", { name: "システムに合わせる" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("S10: 保存値darkで開くとダークが選択済みになる(再訪の復元)", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSelector />);

    expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
  });
});
