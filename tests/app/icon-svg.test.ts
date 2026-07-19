// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// 仕様書: docs/specs/D-5_ロゴ作成.md S9

const appDir = join(process.cwd(), "app");

describe("SVG favicon(S9)", () => {
  it("S9: app/icon.svgが妥当なSVGでブランド群青を含み、旧favicon.icoは存在しない", () => {
    const iconPath = join(appDir, "icon.svg");
    expect(existsSync(iconPath)).toBe(true);

    const svg = readFileSync(iconPath, "utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
    expect(svg.toLowerCase()).toContain("#2f4acb");

    expect(existsSync(join(appDir, "favicon.ico"))).toBe(false);
  });
});
