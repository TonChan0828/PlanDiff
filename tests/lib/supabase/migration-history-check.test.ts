import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertMigrationHistoryMatches,
  parseMigrationHistory,
  readMigrationHistory,
} from "../../../scripts/check-migration-history.mjs";

const matchingOutput = `
 LOCAL          | REMOTE         | TIME (UTC)
----------------|----------------|---------------------
 20260824222006 | 20260824222006 | 2026-08-24 22:20:06
 20260930104758 | 20260930104758 | 2026-09-30 10:47:58
`;

describe("本番migration履歴ゲート", () => {
  it("S1: local/remoteとmigrationファイルのtimestampが一致すれば通過する", () => {
    const history = parseMigrationHistory(matchingOutput);

    expect(() =>
      assertMigrationHistoryMatches(history, [
        "20260824222006",
        "20260930104758",
      ]),
    ).not.toThrow();
  });

  it("S2: localだけの未適用migrationを検出する", () => {
    const history = parseMigrationHistory(`
 LOCAL | REMOTE | TIME (UTC)
-------|--------|----------
 20260824222006 | 20260824222006 | 2026-08-24 22:20:06
 20260930104758 |                | 2026-09-30 10:47:58
`);

    expect(() =>
      assertMigrationHistoryMatches(history, [
        "20260824222006",
        "20260930104758",
      ]),
    ).toThrow(/remote-missing: 20260930104758/);
  });

  it("S3: remote-only履歴とファイルにないlocal履歴を検出する", () => {
    const remoteOnly = parseMigrationHistory(`
 LOCAL | REMOTE | TIME (UTC)
-------|--------|----------
                | 20260824222006 | 2026-08-24 22:20:06
`);
    const localOnlyUnknown = parseMigrationHistory(`
 LOCAL | REMOTE | TIME (UTC)
-------|--------|----------
 20260824222006 | 20260824222006 | 2026-08-24 22:20:06
 20260930104758 | 20260930104758 | 2026-09-30 10:47:58
`);

    expect(() =>
      assertMigrationHistoryMatches(remoteOnly, ["20260824222006"]),
    ).toThrow(/remote-only: 20260824222006/);
    expect(() =>
      assertMigrationHistoryMatches(localOnlyUnknown, ["20260824222006"]),
    ).toThrow(/local-not-in-files: 20260930104758/);
  });

  it("S4: CLIエラーや不正・重複表は失敗し、生のエラーを含めない", () => {
    const secret = "postgres://user:super-secret@db.example.test";
    let command: string[] = [];

    expect(() =>
      readMigrationHistory("linked", "pw", (name, args) => {
        command = [name, ...args];
        return { status: 1, stdout: "", stderr: secret };
      }),
    ).toThrowError(
      new RegExp(`^(?!.*${secret}).*Supabase CLI migration list failed`),
    );
    expect(command).toEqual([
      "supabase",
      "migration",
      "list",
      "--linked",
      "--password",
      "pw",
    ]);
    expect(() => parseMigrationHistory(`${secret}\n${matchingOutput}`)).toThrow(
      /unexpected migration history output/,
    );
    expect(() =>
      parseMigrationHistory(
        `${matchingOutput}\n 20260930104758 | 20260930104758 | 2026-09-30 10:47:58`,
      ),
    ).toThrow(/duplicate migration version/);
  });

  it("S5: local modeはmigration list --localだけを実行する", () => {
    let command = "";
    const history = readMigrationHistory("local", undefined, (name, args) => {
      command = [name, ...args].join(" ");
      return { status: 0, stdout: matchingOutput, stderr: "" };
    });

    expect(command).toBe("supabase migration list --local");
    expect(() =>
      assertMigrationHistoryMatches(history, [
        "20260824222006",
        "20260930104758",
      ]),
    ).not.toThrow();
  });

  it("S6: production workflowはmain/manualのみで起動し、DBを書き換えない", () => {
    const workflow = readFileSync(
      ".github/workflows/production-migration-gate.yml",
      "utf8",
    );
    const operationsGuide = readFileSync(
      "docs/運用/P17-2_本番migration適用前デプロイゲート.md",
      "utf8",
    );

    expect(workflow).toMatch(/push:[\s\S]*branches:\s*\[main\]/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/environment:\s*production-migration-check/);
    expect(workflow).toMatch(/Production migration history/);
    expect(workflow).not.toMatch(/supabase\s+(?:db\s+push|migration\s+repair)/);
    expect(operationsGuide).toMatch(/Deployment Checks/);
    expect(operationsGuide).toMatch(/SUPABASE_ACCESS_TOKEN/);
    expect(operationsGuide).toMatch(/Force Promote/);
  });
});
