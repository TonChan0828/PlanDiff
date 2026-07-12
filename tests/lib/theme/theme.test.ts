import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveThemeAttribute,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme/theme";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S13(テーマ初期化の異常系・境界値)

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("resolveThemeAttribute(S13)", () => {
  it("S13: dark / light はそのまま属性値になる", () => {
    expect(resolveThemeAttribute("dark")).toBe("dark");
    expect(resolveThemeAttribute("light")).toBe("light");
  });

  it("S13: system・不正値・未保存は属性なし(null)になる", () => {
    expect(resolveThemeAttribute("system")).toBeNull();
    expect(resolveThemeAttribute("blue")).toBeNull();
    expect(resolveThemeAttribute("")).toBeNull();
    expect(resolveThemeAttribute(null)).toBeNull();
  });
});

describe("THEME_INIT_SCRIPT(S13)", () => {
  it("S13: 保存値darkなら描画前スクリプトがdata-themeを設定する", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("S13: 不正値では属性を設定しない", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "blue");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("S13: localStorageが例外を投げても失敗せずシステム追随になる", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
