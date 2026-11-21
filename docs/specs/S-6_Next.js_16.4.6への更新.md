# 仕様書: S-6 Next.js 16.4.6 への更新

- ステータス: 承認済み(2026-11-21)
- 関連: [S-1](S-1_依存関係のセキュリティ更新.md) / [S-2](S-2_依存関係アドバイザリの再解消.md) / [S-5](S-5_セキュリティ調査の全指摘対応.md) / `.github/workflows/ci.yml`
- 指示資料: なし(2026-11-21 に `docs/指示資料/` を確認。README のみ)
- 経緯: P10-3 の作業中、`next build` が Next.js 16.4.3 の既知の脆弱性で毎回1回目に停止した(SecurityFatalError)。
  コミット時の pre-commit フックも同じ理由で再実行が必要だった

## 目的

`next` を脆弱性の修正版へ更新し、ビルドとコミットが1回で通る状態に戻す。

## 現況(2026-11-21)

- `next` と `eslint-config-next` はどちらも `16.4.3`(完全一致で固定)
- `npm audit --omit=dev` は `next 16.0.0 - 16.4.4` に moderate 1件(7つの Advisory)を報告。修正版は `16.4.6`
  - GHSA-mfr8-8qww-v76h / GHSA-vc7v-qv4w-wrv8 / GHSA-rhh4-g77r-r9qj / GHSA-vvgp-ww4w-46vf: `use cache`・Cache Components
  - GHSA-7qx7-33qx-rqx2: 画像最適化の SVG 判定
  - GHSA-f3mh-rxg3-f5g2: Edge runtime のルート
  - GHSA-pc58-hwjq-p385: セルフホストで fetch の応答を転送する構成
- 本アプリは `use cache`・`unstable_cache`・Edge runtime・Cache Components を使っておらず、Vercel 上で動くため、
  実害の可能性は低い。ただしビルドが止まるため更新する
- 16.4.x の最新は `16.4.6`(2026-11-09 公開)。16.5 は canary のみ

## 仕様

- `package.json` の `next` と `eslint-config-next` を `16.4.6` に更新する(パッチ更新。完全一致の固定は維持する)
- `package-lock.json` は `npm install` で更新する。更新に伴う推移依存の変化は lockfile の差分で確認する
- アプリコード・設定・CI の監査閾値は変更しない
- `npm audit fix --force` は使わない
- データベースの変更はない。そのため本番への migration は不要で、マージ後に通常どおり公開される

## エラー時の挙動

更新後にテスト・ビルド・E2E のいずれかが失敗した場合は、原因を調べてユーザーに報告する。
テストの無効化や監査の抑制で通すことはしない。必要なら 16.4.3 のまま別の対応を相談する。

## スコープ外

- Next.js 16.5 以降(canary のみのため)
- React・Supabase など他の依存の更新(`npm audit` に指摘があっても今回の PR には混ぜない。見つけたら記録する)
- S-3 の `braces` の上流パッチ待ち

## テストシナリオ

依存のパッチ更新で新しい振る舞いはないため、新規テストは追加しない。既存のテスト全体を回帰テストとして使う。

- V1 [単体]: Given 16.4.6 に更新 When `npm audit --omit=dev` Then `next` の指摘が出ない
- V2 [単体]: Given 更新後 When `npm run check` Then typecheck・lint・単体／画面テスト全件・build が合格し、
  build が1回目で SecurityFatalError を出さずに完了する
- V3 [単体]: Given 更新後 When 日時依存のテストを `TZ=UTC`・`TZ=Pacific/Kiritimati` で実行 Then 合格(R-1)
- V4 [結合]: Given ローカル Supabase When `npm run test:integration` Then 全件合格(Server Action〜DB・RLS の流れ)
- V5 [結合]: Given ローカルで起動したアプリ When E2E(375px)の `calendar.spec.ts`・`rule-pausing.spec.ts` を実行
  Then 全件合格(ログイン・カレンダー表示・予定編集・タイマーの主要動線)
- V6 [単体]: Given 更新後 When `git commit` Then pre-commit フックが再実行なしで通る
- V7 [結合]: Given マージ後の本番 When `plandiff.vercel.app/login` を開く Then 200 を返し、デプロイが Ready になる
