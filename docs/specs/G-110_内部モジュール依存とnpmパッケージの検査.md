# 仕様書: G-110 内部モジュールと npm パッケージの依存関係を CI で検査する

- ステータス: 承認済み(2026-11-24)
- 関連: GitHub Issue #110(優先度P1・開発基盤) / `eslint.config.mjs` / `.github/workflows/ci.yml`
- 指示資料: なし(2026-11-24 に `docs/指示資料/` を確認。README のみ)

## 目的

依存方向(`lib` が `app`/`components` を参照しない等)と循環、未使用・未宣言の npm パッケージを CI で検出する。
現状は検査がなく、Issue 時点の静的調査で「実行時の循環 0 件・型参照を含む循環 2 件」だった。

## 仕様

### 内部モジュール(dependency-cruiser)

- `dependency-cruiser` を devDependency に追加し、`.dependency-cruiser.cjs` と `npm run check:deps` を用意する
- 解析対象は `app` `components` `lib`(本番コード)。`tests/` はテストが本番コードを参照する一方向のみ許可する
- `tsPreCompilationDeps: false` で**型だけの参照(`import type`)を依存から除外**する。実行時の循環のみを違反にする
- 禁止ルール(違反で終了コード非0):
  1. `no-circular`: 実行時の循環
  2. `lib-not-to-ui`: `lib/**` から `app/**` `components/**` への参照
  3. `components-not-to-app`: `components/**` から `app/**` への参照。**例外**: Server Action(`app/**/actions.ts` 等、`"use server"` を持つファイル)は
     Next.js の規約上クライアントから参照するため許可する(実装時に実測し、例外の一覧をルール内にコメントで残す)
  4. `no-orphans`: どこからも参照されない本番ファイル(Next.js の規約ファイル `page` `layout` `route` `proxy` 等は除外)
- 実装前に現状の依存グラフを実測し、既存の違反が出る場合は**直せるものは本 PR で直し**、直せないものだけを理由つきで
  `forbidden` の許可リストに入れる(隠さず記録する)

### npm パッケージ(knip)

- `knip` を devDependency に追加し、`knip.json` と `npm run check:packages` を用意する
- エントリにテスト・設定・スクリプト・Playwright・`scripts/*.mjs` を含め、それらからのみ使う依存が「未使用」と誤判定されないようにする
- 検査対象: 未使用の dependencies/devDependencies、未宣言の import、未使用ファイル。**未使用の export は対象外**
  (Issue の範囲外で、既存コードの変更が大きくなるため。件数は記録のみ)

### CI

- 既存の `check` ジョブに `check:deps` `check:packages` を追加する(新しいジョブは作らない。必須チェック名を変えないため)
- `npm run check`(完了の定義)にも含める

## エラー時の挙動

- 違反時は違反したファイルと理由を出して CI を失敗させる。ルールの無効化や許可リストの拡大で通すことはしない

## スコープ外

- 未使用 export の検査
- 境界の細分化(`lib` 内のサブモジュール間の依存方向)

## テストシナリオ

- E1 [単体]: 実行時の循環を持つ最小のフィクスチャ(`tests/fixtures/deps/`、本番の解析対象外)で `no-circular` が違反を報告する
- E2 [単体]: `import type` だけで閉じる循環は違反にならない
- E3 [単体]: `lib` から `components` を参照するフィクスチャが `lib-not-to-ui` で違反になる
- E4 [単体]: `components` から `app/**/actions.ts` の参照は許可され、それ以外の `app` 参照は違反になる
- E5 [単体]: dependency-cruiser のルールをフィクスチャに対して実行するテスト(Vitest から `cruise` API を呼ぶ)を追加し、
  ルールの退行を検出する
- E6 [実測]: 本番コードに対して `npm run check:deps` が 0 違反で通る
- E7 [実測]: 未使用の npm パッケージを一時的に追加すると `check:packages` が失敗し、削除すると通る(手動で確認し、ログに記録)
- E8 [CI]: `check` ジョブで両コマンドが実行され、合格する
