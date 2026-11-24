import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { cruise } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

// 仕様書: docs/specs/G-110_内部モジュール依存とnpmパッケージの検査.md E1〜E5
// 実際のルール(.dependency-cruiser.cjs)を、意図的に違反させた最小のフィクスチャへ当てて、
// ルールが退行(無効化・誤設定)していないことを固定する。

const require = createRequire(import.meta.url);
const config = require("../../../.dependency-cruiser.cjs") as {
  forbidden: unknown[];
  options: Record<string, unknown>;
};

async function violationsOf(fixture: string): Promise<string[]> {
  const baseDir = path.resolve(__dirname, "../../fixtures/deps", fixture);
  const result = await cruise(
    ["app", "components", "lib"].filter((dir) =>
      // 存在しないディレクトリは cruise がエラーにするため、フィクスチャにあるものだけ渡す
      existsSync(path.join(baseDir, dir)),
    ),
    {
      ...config.options,
      baseDir,
      tsConfig: undefined,
      validate: true,
      ruleSet: { forbidden: config.forbidden },
    } as never,
  );
  const output = result.output as {
    summary: { violations: { rule: { name: string } }[] };
  };
  return output.summary.violations.map((v) => v.rule.name);
}

describe("依存関係のルール(G-110)", () => {
  it("E1: 実行時の循環は no-circular で違反になる", async () => {
    expect(await violationsOf("circular")).toContain("no-circular");
  });

  it("E2: import type だけで閉じる循環は違反にならない", async () => {
    expect(await violationsOf("type-only-cycle")).toEqual([]);
  });

  it("E3: lib から components への参照は lib-not-to-ui で違反になる", async () => {
    expect(await violationsOf("lib-to-ui")).toContain("lib-not-to-ui");
  });

  it("E4: components から app の通常のファイルへの参照は違反になる", async () => {
    expect(await violationsOf("component-to-app")).toContain(
      "components-not-to-app",
    );
  });

  it("E4: 名前が actions.ts で終わるだけのファイル(transactions.ts)への参照は違反になる", async () => {
    expect(await violationsOf("component-to-lookalike")).toContain(
      "components-not-to-app",
    );
  });

  it("E4: components から Server Action(actions.ts)への参照は許可される", async () => {
    expect(await violationsOf("component-to-actions")).toEqual([]);
  });
});
