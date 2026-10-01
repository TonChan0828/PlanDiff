// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// 仕様書: docs/specs/D-5_ロゴ作成.md S9

const appDir = join(process.cwd(), "app");
const publicDir = join(process.cwd(), "public");

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

  it.each([
    ["light", "#2f4acb"],
    ["dark", "#4c6ef5"],
    ["structured", "#a05f58"],
  ])("D-7: %s用faviconはテーマ固有色でロゴ形状を保つ", (theme, color) => {
    const iconPath = join(publicDir, "icons", `favicon-${theme}.svg`);
    expect(existsSync(iconPath)).toBe(true);

    const svg = readFileSync(iconPath, "utf-8");
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toMatch(
      new RegExp(`rect\\s*\\{\\s*color:\\s*${color};\\s*\\}`),
    );
    expect(svg).toMatch(
      /<rect\s+x="3\.1"\s+y="3\.1"\s+width="12\.8"\s+height="12\.8"\s+rx="3"\s+stroke="currentColor"\s+stroke-width="2\.2"\s+stroke-opacity="0\.55"\s*\/>/,
    );
    expect(svg).toMatch(
      /<rect\s+x="9"\s+y="9"\s+width="12"\s+height="12"\s+rx="3"\s+fill="currentColor"\s*\/>/,
    );
    expect(svg).not.toMatch(/prefers-color-scheme|@media/i);
  });
});
