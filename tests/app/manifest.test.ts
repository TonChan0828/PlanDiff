import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

// 仕様書: docs/specs/P3-3_PWA対応.md S1, S2

describe("app/manifest.ts", () => {
  it("S1: name/short_name/start_url/display/theme_colorが仕様通り返る", () => {
    const result = manifest();

    expect(result.name).toBe("PlanDiff");
    expect(result.short_name).toBe("PlanDiff");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
    expect(result.theme_color).toBe("#0284c7");
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
});
