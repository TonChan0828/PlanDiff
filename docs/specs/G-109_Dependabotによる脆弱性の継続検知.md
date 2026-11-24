# 仕様書: G-109 Dependabot で依存パッケージの脆弱性を継続検知する

- ステータス: 承認済み(2026-11-24)
- 関連: GitHub Issue #109(優先度P1・開発基盤) / [S-1](S-1_依存関係のセキュリティ更新.md)〜[S-6](S-6_Next.js_16.4.6への更新.md) / `.github/workflows/ci.yml`(`npm audit --audit-level=high`)
- 指示資料: なし(2026-11-24 に `docs/指示資料/` を確認。README のみ)

## 目的

CI の `npm audit` は CI が走ったときしか見ない。PR のない期間に公開された脆弱性は拾えない。
GitHub の Dependabot アラートとセキュリティ更新で、リポジトリ側から継続的に検知する。

## 現況(2026-11-24 確認)

- `security_and_analysis.dependabot_security_updates` は `disabled`
- 脆弱性アラートも無効(`GET /vulnerability-alerts` が 404)
- `.github/dependabot.yml` はない。Actions は SHA 固定済み(PR #115)のため、更新を人手で追う必要がある

## 仕様

1. **リポジトリ設定**(`gh api`): 脆弱性アラート(`PUT /repos/{repo}/vulnerability-alerts`)と
   セキュリティ更新(`PUT /repos/{repo}/automated-security-fixes`)を有効化する
   - リポジトリ設定の変更なので、実行直前にユーザーへ確認する
2. **`.github/dependabot.yml`** を追加する
   - `github-actions`: 週1回。SHA 固定の更新を1つの PR にまとめる(`groups`)
   - `npm`: **バージョン更新 PR は作らない**(`open-pull-requests-limit: 0`)。セキュリティ更新だけを対象にする。
     通常の更新は S 系仕様のとおり計画的に行うため(自動 PR の乱立を避ける)
   - コミットメッセージは既存の規約に合わせて `chore(deps):` を使う
3. **運用手順の記録**(`docs/運用/依存関係の脆弱性対応.md` を新規作成)
   - 通知先: リポジトリ所有者の GitHub 通知(Dependabot アラート)とメール
   - 判断基準: critical/high は直ちに対応(S 系の仕様書を作り更新)。moderate は週次で確認し、
     本番依存かつ到達可能なら対応、開発依存のみ・到達不能なら理由を記録して保留。low は四半期ごと
   - `npm audit --audit-level=high` の CI 閾値は変更しない(moderate は CI を止めず、アラートで拾う)
   - Dependabot の PR も通常の PR と同じく必須 CI(3ジョブ)を通す

## スコープ外

- CI の監査閾値の変更・Renovate の導入
- 既存の moderate 7件(開発依存)の解消(別途判断)

## テストシナリオ

設定・ドキュメントの変更で、アプリのコードは変わらない。次を検証する。

- D1: `dependabot.yml` が GitHub のスキーマ検証を通る(PR 上で Dependabot がエラーを出さない。`gh api` で `dependabot/alerts` が 200)
- D2: `gh api repos/{repo} -q .security_and_analysis.dependabot_security_updates.status` が `enabled`
- D3: `GET /vulnerability-alerts` が 204(有効)
- D4: actionlint(CI の `check`)が追加後も合格する。`npm run check` が合格する
- D5: 運用手順が、通知先・重大度別の判断・保留の記録方法を含む(レビューで確認)
