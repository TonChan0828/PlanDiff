import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyThemePreference,
  resolveThemeAttribute,
  resolveThemePreference,
  THEME_INIT_SCRIPT,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from "@/lib/theme/theme";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S13(テーマ初期化の異常系・境界値)
//         docs/specs/D-6_Structuredテーマ.md S1〜S8(structuredテーマの追加)

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("resolveThemeAttribute(S13 / D-6 S1・S3)", () => {
  it("S13: dark / light はそのまま属性値になる", () => {
    expect(resolveThemeAttribute("dark")).toBe("dark");
    expect(resolveThemeAttribute("light")).toBe("light");
  });

  it("S1: structured はそのまま属性値になる", () => {
    expect(resolveThemeAttribute("structured")).toBe("structured");
  });

  it("S3: system・不正値・未保存は属性なし(null)になる", () => {
    expect(resolveThemeAttribute("system")).toBeNull();
    expect(resolveThemeAttribute("blue")).toBeNull();
    expect(resolveThemeAttribute("")).toBeNull();
    expect(resolveThemeAttribute(null)).toBeNull();
  });
});

describe("resolveThemePreference(D-6 S2)", () => {
  it("S2: structured はそのまま選択状態になる", () => {
    expect(resolveThemePreference("structured")).toBe("structured");
  });

  it("S2: 既知の値はそのまま、不正値・未保存はsystem扱いになる", () => {
    expect(resolveThemePreference("light")).toBe("light");
    expect(resolveThemePreference("dark")).toBe("dark");
    expect(resolveThemePreference("system")).toBe("system");
    expect(resolveThemePreference("blue")).toBe("system");
    expect(resolveThemePreference(null)).toBe("system");
  });
});

describe("applyThemePreference(D-6 S7)", () => {
  it("S7: structuredを適用するとDOM属性とlocalStorageの両方が更新される", () => {
    applyThemePreference("structured");

    expect(document.documentElement.dataset.theme).toBe("structured");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("structured");
  });

  it("S7: systemへ戻すと属性が除去されlocalStorageにはsystemが残る", () => {
    applyThemePreference("structured");
    applyThemePreference("system");

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });
});

describe("THEME_INIT_SCRIPT(S13 / D-6 S4〜S6・S8)", () => {
  it("S13: 保存値darkなら描画前スクリプトがdata-themeを設定する", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("S4: 保存値structuredなら描画前スクリプトがdata-themeを設定する", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "structured");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("structured");
  });

  it("S5: 不正値では属性を設定しない", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "blue");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("S6: localStorageが例外を投げても失敗せずシステム追随になる", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  // THEME_PREFERENCES に値を足したのにスクリプト側を直し忘れる事故を検出する。
  // スクリプトは列挙をハードコードせずTHEME_PREFERENCESから組み立てること
  it("S8: THEME_PREFERENCESのsystem以外すべてが描画前スクリプトで属性になる", () => {
    for (const preference of THEME_PREFERENCES) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem(THEME_STORAGE_KEY, preference);

      new Function(THEME_INIT_SCRIPT)();

      expect(document.documentElement.dataset.theme).toBe(
        preference === "system" ? undefined : preference,
      );
    }
  });
});
