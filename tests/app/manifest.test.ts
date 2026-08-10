import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

// 仕様書: docs/specs/P3-3_PWA対応.md S1, S2, S8

describe("app/manifest.ts", () => {
  it("S1: name/short_name/start_url/display/theme_colorが仕様通り返る", () => {
    const result = manifest();

    expect(result.name).toBe("PlanDiff");
    expect(result.short_name).toBe("PlanDiff");
    // start_url を "/" (LP) に戻すと、LPは認証状態を見ないため
    // ログイン済みでも起動のたびに「ログイン」CTAが出る(2026-08-10の実機で発生)。
    // 起動先は必ず認証必須グループ配下にする
    expect(result.start_url).toBe("/calendar");
    expect(result.display).toBe("standalone");
    // D-1-2: ブランド色を群青に変更(docs/specs/D-1-2_デザイン刷新.md)
    expect(result.theme_color).toBe("#2f4acb");
  });

  it("S2: iconsに192x192(any)と512x512(any/maskable)がimage/pngで含まれる", () => {
    const result = manifest();
    const icons = result.icons ?? [];

    const icon192 = icons.filter(
      (icon) => icon.sizes === "192x192" && icon.purpose === "any",
    );
    const icon512Any = icons.filter(
      (icon) => icon.sizes === "512x512" && icon.purpose === "any",
    );
    const icon512Maskable = icons.filter(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    );

    expect(icon192).toHaveLength(1);
    expect(icon192[0]?.type).toBe("image/png");
    expect(icon512Any).toHaveLength(1);
    expect(icon512Any[0]?.type).toBe("image/png");
    expect(icon512Maskable).toHaveLength(1);
    expect(icon512Maskable[0]?.type).toBe("image/png");
  });

  it("S8: id と scope が明示されている", () => {
    const result = manifest();

    // id の既定値は start_url。明示しないと start_url を変えたときに
    // Chrome が別アプリと認識し、既存インストールが更新されず二重登録になる
    expect(result.id).toBe("/");
    // 既定 scope は start_url のディレクトリ。ログアウト先の /login などが
    // scope 外に落ちて外部ブラウザで開かれるのを防ぐため、ルートを明示する
    expect(result.scope).toBe("/");
  });

  it("S9: start_url が scope の内側にある", () => {
    const result = manifest();

    expect(result.start_url?.startsWith(result.scope ?? "/")).toBe(true);
  });
});
