import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeSelector } from "@/components/theme-selector";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S10〜S12(テーマの手動切替)
//         docs/specs/D-6_Structuredテーマ.md S9〜S11(Structuredの選択肢追加)

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("外観の表記(G-99 F1)", () => {
  it("選択肢はすべて日本語で、「あたたかい色」の説明が出る", () => {
    render(<ThemeSelector />);

    for (const name of [
      "ライト",
      "ダーク",
      "システムに合わせる",
      "あたたかい色",
    ]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByText(
        "「あたたかい色」は、暖色系の明るい配色です(端末のダーク設定に関係なく明るい表示になります)。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Structured")).not.toBeInTheDocument();
  });
});

describe("ThemeSelector(S10〜S12 / D-6 S9〜S11)", () => {
  it("S9: 保存値なしでは4択が表示され「システムに合わせる」が選択済み", () => {
    render(<ThemeSelector />);

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "ライト" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "ダーク" })).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "あたたかい色" }),
    ).not.toBeChecked();
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

  it("S10: Structuredを選択するとdata-theme=structuredで保存される", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    await user.click(screen.getByRole("radio", { name: "あたたかい色" }));

    expect(document.documentElement.dataset.theme).toBe("structured");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("structured");
    expect(screen.getByRole("radio", { name: "あたたかい色" })).toBeChecked();
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

  it("S11: 保存値structuredで開くとStructuredが選択済みになる(再訪の復元)", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "structured");
    render(<ThemeSelector />);

    expect(screen.getByRole("radio", { name: "あたたかい色" })).toBeChecked();
  });
});
