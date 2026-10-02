import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^\d{14}$/;
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;

function fail(message) {
  throw new Error(message);
}

function columns(line) {
  return line
    .replace(/[│┃]/g, "|")
    .split("|")
    .map((column) => column.trim());
}

function addVersion(set, value) {
  if (!value) return;
  if (!VERSION_PATTERN.test(value)) {
    fail("unexpected migration history output");
  }
  if (set.has(value)) {
    fail(`duplicate migration version: ${value}`);
  }
  set.add(value);
}

export function parseMigrationHistory(output) {
  if (typeof output !== "string") {
    fail("unexpected migration history output");
  }

  const lines = output.replace(ANSI_PATTERN, "").split(/\r?\n/);
  let headerIndex = -1;
  let localIndex = -1;
  let remoteIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const header = columns(lines[index]).map((value) => value.toLowerCase());
    const foundLocal = header.indexOf("local");
    const foundRemote = header.indexOf("remote");
    if (foundLocal !== -1 && foundRemote !== -1) {
      headerIndex = index;
      localIndex = foundLocal;
      remoteIndex = foundRemote;
      break;
    }
  }

  if (headerIndex === -1) fail("unexpected migration history output");
  if (lines.slice(0, headerIndex).some((line) => line.trim())) {
    fail("unexpected migration history output");
  }

  let separatorIndex = -1;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const row = columns(lines[index]);
    if (
      /^[\s-–—]+$/.test(row[localIndex] ?? "") &&
      /^[\s-–—]+$/.test(row[remoteIndex] ?? "")
    ) {
      separatorIndex = index;
      break;
    }
    if (lines[index].trim()) fail("unexpected migration history output");
  }

  if (separatorIndex === -1) fail("unexpected migration history output");

  const local = new Set();
  const remote = new Set();
  for (const line of lines.slice(separatorIndex + 1)) {
    if (!line.trim()) continue;
    if (!/[|│┃]/.test(line)) fail("unexpected migration history output");

    const row = columns(line);
    if (row.length <= Math.max(localIndex, remoteIndex)) {
      fail("unexpected migration history output");
    }
    addVersion(local, row[localIndex]);
    addVersion(remote, row[remoteIndex]);
  }

  return { local, remote };
}

function difference(left, right) {
  return [...left].filter((version) => !right.has(version)).sort();
}

export function assertMigrationHistoryMatches(history, expectedVersions) {
  const expected = new Set(expectedVersions);
  if ([...expected].some((version) => !VERSION_PATTERN.test(version))) {
    fail("invalid local migration filename");
  }

  const localMissing = difference(expected, history.local);
  const localNotInFiles = difference(history.local, expected);
  const remoteMissing = difference(expected, history.remote);
  const remoteOnly = difference(history.remote, history.local);
  const remoteNotInFiles = difference(history.remote, expected);
  const localOnly = difference(history.local, history.remote);

  const mismatches = [
    ["local-missing", localMissing],
    ["local-not-in-files", localNotInFiles],
    ["remote-missing", remoteMissing],
    ["remote-only", remoteOnly],
    ["remote-not-in-files", remoteNotInFiles],
    ["local-only", localOnly],
  ].filter(([, versions]) => versions.length > 0);

  if (mismatches.length > 0) {
    const details = mismatches
      .map(([label, versions]) => `${label}: ${versions.join(",")}`)
      .join("; ");
    fail(`migration history mismatch (${details})`);
  }
}

export function listMigrationVersions(
  migrationsDirectory = join(process.cwd(), "supabase/migrations"),
) {
  const versions = [];
  for (const filename of readdirSync(migrationsDirectory).filter((name) =>
    name.endsWith(".sql"),
  )) {
    const match = /^(\d{14})_.+\.sql$/.exec(filename);
    if (!match) fail("invalid local migration filename");
    versions.push(match[1]);
  }

  if (new Set(versions).size !== versions.length) {
    fail("duplicate local migration version");
  }
  return versions.sort();
}

/**
 * @typedef {(command: string, args: string[], options: { encoding: "utf8", maxBuffer: number }) => { status: number | null, stdout: string, stderr: string }} MigrationCommandRunner
 * @param {"local" | "linked"} mode
 * @param {string | undefined} password
 * @param {MigrationCommandRunner} [runner]
 */
export function readMigrationHistory(mode, password, runner) {
  if (mode !== "local" && mode !== "linked") {
    fail("use --local or --linked");
  }
  if (mode === "linked" && !password) {
    fail("SUPABASE_DB_PASSWORD is required");
  }

  const args = ["migration", "list", `--${mode}`];
  if (mode === "linked") args.push("--password", password);

  const execute = runner ?? spawnSync;
  const result = execute("supabase", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) fail("Supabase CLI migration list failed");
  return parseMigrationHistory(result.stdout);
}

function main() {
  const mode = process.argv[2]?.replace(/^--/, "");
  const history = readMigrationHistory(mode, process.env.SUPABASE_DB_PASSWORD);
  assertMigrationHistoryMatches(history, listMigrationVersions());
  console.log("Supabase migration history matches the repository.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "migration history check failed",
    );
    process.exitCode = 1;
  }
}
