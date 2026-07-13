import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "tinyglobby";

// 仕様書: docs/specs/P4-5_磨き込み.md S7
// D-1トークン化の回帰防止: 直書きカラークラスとdark:バリアントを禁止する
// (テーマはデザイントークン+data-themeで表現し、OS追随のdark:は使わない)

const ROOT = path.resolve(__dirname, "../../..");
const BANNED =
  /(?:^|[\s"'`:])(?:dark:|(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|accent|caret|shadow)-(?:zinc|red|emerald|sky|amber|gray|neutral|stone|slate|green|blue|yellow|orange)-\d)/;

describe("デザイントークン規約(S7)", () => {
  it("S7: app/・components/ のソースに直書きカラークラスとdark:バリアントが存在しない", () => {
    const files = globSync(["app/**/*.tsx", "components/**/*.tsx"], {
      cwd: ROOT,
      absolute: true,
    });
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (BANNED.test(line)) {
          violations.push(`${path.relative(ROOT, file)}:${index + 1}`);
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
