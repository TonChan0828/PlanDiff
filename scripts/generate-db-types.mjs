// マイグレーションを適用したローカルDBから Supabase のデータベース型を生成する(G-114)。
// 前提: `supabase start` と `supabase db reset --local` が済んでいること。
// 生成に失敗したら既存のファイルを壊さない(空ファイルで CI の差分検出を通さないため、成功時だけ書き込む)。
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUTPUT = "lib/supabase/database.types.ts";
const HEADER = `// 自動生成ファイル。手で編集しない。
// マイグレーションを変更したら \`npm run db:types\` で再生成してコミットする(CI が差分を検出する)。
// 仕様書: docs/specs/G-114_Supabaseデータベース型の生成とずれの検出.md
`;

const generated = execFileSync(
  "supabase",
  ["gen", "types", "typescript", "--local", "--schema", "public"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

if (!generated.includes("export type Database")) {
  console.error(
    "生成結果に Database 型が含まれていません。ファイルは更新しません。",
  );
  process.exit(1);
}

writeFileSync(OUTPUT, `${HEADER}\n${generated}`);
console.log(`${OUTPUT} を更新しました`);
