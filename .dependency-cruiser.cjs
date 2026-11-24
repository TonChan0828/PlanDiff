/** @type {import('dependency-cruiser').IConfiguration} */
// 仕様書: docs/specs/G-110_内部モジュール依存とnpmパッケージの検査.md
// 本番コード(app / components / lib とルートのエントリ)の依存方向と循環を検査する。
// tsPreCompilationDeps: false により、型だけの参照(import type)は依存に数えない。
// 未使用ファイルは、型だけの参照を使用と数えられる knip(npm run check:packages)で検出する。
// ここで no-orphans を使うと、型専用ファイルが孤立と誤判定される(lib/timer/types.ts)。
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "実行時の循環。型だけの参照は対象外(tsPreCompilationDeps: false)",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "lib-not-to-ui",
      comment: "lib は画面層(app / components)に依存しない",
      severity: "error",
      from: { path: "^lib/" },
      to: { path: "^(app|components)/" },
    },
    {
      name: "components-not-to-app",
      comment:
        "components は app に依存しない。例外: Server Action(app 配下の actions.ts / *-actions.ts)は Next.js の規約上クライアントから参照する",
      severity: "error",
      from: { path: "^components/" },
      to: {
        path: "^app/",
        // dependency-cruiser は入れ子の量指定子を含む正規表現を拒否するため、単純なパターンに分ける。
        // `/actions.ts` と `-actions.ts` だけを許可し、transactions.ts のような名前は許可しない
        pathNot: ["/actions\\.ts$", "-actions\\.ts$"],
      },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: false,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(tests|node_modules|\\.next|coverage)/" },
  },
};
