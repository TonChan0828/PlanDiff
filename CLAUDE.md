@AGENTS.md

# CLAUDE.md — PlanDiff

Googleカレンダーの「予定」とタイムトラッキングの「実績」を同一タイムラインに重ね、
計画と現実のギャップを可視化するWebアプリ(PWA)。メインターゲットはソフトウェアエンジニアで、
「見積もりが当たるようになる」を価値の核に据える。詳細は `docs/要件定義書.md` を参照。

## 開発方針(必須・最優先)

1. **仕様書なし・ユーザー承認なしの実装禁止**。実装前に `docs/specs/` に仕様書を作成し、ユーザーの承認を得てから着手する
2. **TDDで開発する**(Red → Green → Refactor)。テストケースの無効化(`skip` / `todo` / コメントアウト / `--passWithNoTests`)をもって「全件通過」と判断してはならない
3. **不明点は必ずユーザーに確認する**。推測で勝手に実装・変更しない
4. **タスク着手時に `docs/指示資料/` を必ず確認する**。ユーザーが指示のために置いた資料(メモ・ラフ・参考記事等)があれば仕様書に反映し、要件定義書等と矛盾する場合はユーザーに確認する
5. **行動履歴を必ず残す**。作業のたびに `docs/logs/YYYY-MM-DD.md` へ「何を・なぜ・結果」を追記する
6. **仕様書からテストシナリオを展開してからテストを実装・実行する**。シナリオは仕様書内に `## テストシナリオ` として記載する
7. **同じバグを3回出したら、ルール化する**。下の「バグ由来ルール」セクションに再発防止ルールを追記する(発生回数は `docs/logs/` から判断)

実装作業の詳細手順は `.claude/skills/spec-driven-dev` Skill に従うこと。
開発項目と優先度は `docs/開発計画.md` で管理する。**着手する項目は必ずここから選び、状態を更新する**。

**プロジェクトSkill**(該当作業の前に必ず呼び出す):
- `spec-driven-dev` … あらゆる実装(仕様書→承認→シナリオ→TDD→ログ)
- `db-migration` … スキーマ・RLS・Postgres関数の変更
- `ui-quality` … UI実装と375px検証・オーバーレイ規約

**外部Skill**(skills.sh から導入。該当作業時に参照する。プロジェクトSkill・本書と矛盾する場合は本書を優先):
- `supabase` / `supabase-postgres-best-practices` … Supabase実装・Postgres/RLS設計
- `vercel-react-best-practices` … React/Next.jsコードの実装・レビュー
- `frontend-design` … オーバーレイUI等のビジュアルデザイン
- `find-skills` … 新しいスキルの探索・導入

## 完了の定義(Definition of Done)

タスクを「完了」と報告する前に、すべて満たすこと:

1. `npm run check`(typecheck + lint + test + build)が通る。**出力を実際に確認してから報告する**
2. テストが仕様書のテストシナリオと対応している(無効化・削除による通過は禁止)
3. **機能実装の完了時は、単体テストと結合テストが網羅的に作成され、全件合格していること**
   - 単体: ロジック・コンポーネント単位(正常系・異常系・境界値をカバー)
   - 結合: Route Handler / Server Action〜DB(RLS含む)を跨ぐ流れ、コンポーネント間の連携
   - 「全件合格」は実行結果の出力で確認する。skip・コメントアウト・対象除外で件数を減らして合格と見なすことは禁止
4. UI変更なら 375px 幅での表示確認済み(`ui-quality` Skill のチェックリスト)
5. `docs/logs/YYYY-MM-DD.md` に記録済み、`docs/開発計画.md` の状態を更新済み
6. コミットは pre-commit フックを通す。`--no-verify` を使ったら理由をログに残す

## バグ由来ルール

同じバグが3回発生した際に追記する再発防止ルール。現時点ではなし。

## 技術スタック

- Next.js 16(App Router)+ TypeScript(strict)+ React 19
- Supabase: Auth(Googleプロバイダ)/ Postgres / RLS
- Vercel(ホスティング)
- Tailwind CSS v4
- Google Calendar API(`calendar.events.readonly` のみ。writeスコープは使わない)
- Vitest + Testing Library(ユニット/コンポーネントテスト)

## コマンド

```bash
npm run dev          # 開発サーバー
npm run build        # ビルド(コミット前に必ず通すこと)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest(単発実行)
npm run test:watch   # Vitest(watch。TDD中はこちら)
npx vitest run path/to/file.test.ts   # 単一テストファイルの実行
npm run test:coverage # カバレッジ付きテスト
npm run format       # Prettier整形(Tailwindクラス順も整列)
npm run check        # typecheck + lint + test + build を一括実行(完了報告前に必ず)
npx supabase db diff # マイグレーション差分の確認
```

pre-commitフック(`.githooks/pre-commit`)が format:check / typecheck / lint / test / build を強制する。
クローン直後は `git config core.hooksPath .githooks` の設定が必要。

## ディレクトリ構成方針

```
app/                  # ルーティング(App Router)
  (marketing)/        # LP・料金・プライバシーポリシー(未ログイン)
  (app)/              # 認証必須の本体(カレンダー、サマリー、設定)
  api/                # Route Handlers(Google API呼び出しはここに集約)
components/           # UIコンポーネント
lib/
  supabase/           # server / browser クライアントの生成
  google/             # Calendar API クライアント、トークン更新ロジック
supabase/migrations/  # マイグレーション(スキーマ変更は必ずここで管理)
docs/                 # 要件定義書ほか
  specs/              # 機能別仕様書(実装前に作成し承認を得る)
  logs/               # 行動履歴(日付ごと)
  指示資料/            # ユーザーが指示のために置く資料。タスク着手時に必ず確認する
tests/                # テスト(unit / component。対象と同じ構造でミラーリング)
```

## アーキテクチャ原則

1. **Server Components をデフォルト**にする。`"use client"` はタイマー操作・カレンダーのインタラクションなど必要な葉コンポーネントに限定する
2. **Google APIの呼び出しはサーバーサイドのみ**(Route Handler / Server Action)。クライアントにGoogleのトークンを渡さない
3. データ取得はServer Component→propsを基本とし、タイマーなどリアルタイム性が要る箇所のみクライアントフェッチ+楽観的更新
4. マイグレーションを経ないスキーマ変更(ダッシュボード直編集)は禁止

## データモデル(コアテーブル)

```
profiles       … auth.users と 1:1 のプロフィール
google_tokens  … provider refresh token 保管(サーバーのみアクセス)
synced_events  … Google カレンダー予定のキャッシュ(google_event_id, title, start_at, end_at, synced_at)
time_entries   … 実績記録(title, start_at, end_at, google_event_id nullable)
                 end_at IS NULL = 実行中タイマー
```

- 予定と実績は `time_entries.google_event_id` で紐づく(nullable = フリータイマー/割り込み作業)
- 新規タイマー開始時は既存の実行中タイマーを**自動停止**する(エラーにしない)
- 同期対象はプライマリカレンダーのみ、取得範囲は表示中の週 ± 1週間

## DB / RLS 規約

- 全テーブルでRLSを有効化する。ポリシーなしのテーブルを作らない
- RLSヘルパー関数は `private` スキーマに `SECURITY DEFINER` で作成し、`search_path` を明示的に固定する(家計簿アプリと同じパターン)
- `google_tokens` テーブルは **クライアントから一切アクセス不可**(SELECTポリシーも付けない)。service role経由のサーバー処理のみで読み書きする
- 実行中タイマーは1本: `time_entries` に `end_at IS NULL` の partial unique index(user_id単位)で保証する。アプリ側のチェックだけに頼らない

## Googleカレンダー連携の注意(ハマりどころ)

- Supabase AuthのGoogleログインで `access_type=offline` と `prompt=consent` をクエリパラメータで指定しないと `provider_refresh_token` が返らない。**返らなかった場合のフォールバック(再認可導線)を必ず実装する**
- `provider_refresh_token` はセッションに永続しないため、取得したタイミングで `google_tokens` テーブルに保存する
- スコープは `https://www.googleapis.com/auth/calendar.events.readonly` のみ。**writeスコープを追加するPRは出さない**(OAuth審査要件が変わるため。必要になったら人間が判断する)
- 同期はオンデマンド(画面ロード時+手動リフレッシュ)。webhook / push channel はMVPでは実装しない
- APIレスポンスは `synced_events` にキャッシュし、UIはキャッシュ表示→バックグラウンド同期の順で描画する

## コーディング規約

- TypeScript strict。`any` 禁止(やむを得ない場合は理由をコメント)
- 日時は**すべてUTCでDB保存、表示時にユーザーのタイムゾーンへ変換**。`Date` の直接演算を避け、date-fns等を使う
- コンポーネントは関数コンポーネント+named export
- エラーは握りつぶさない。ユーザー向けメッセージは日本語で表示
- UIテキストは日本語。将来のi18nを見据えてハードコードは1箇所に寄せる(MVPでは辞書化までは不要)

## やってはいけないこと

- Googleのトークン・APIキーをクライアントバンドル・ログ・エラーメッセージに含める
- RLSなしのテーブル作成、`anon` キーでの `google_tokens` アクセス
- カレンダーデータを本機能(表示・ギャップ分析)以外の目的で保存・加工する(Google Limited Use要件)
- MVPスコープ外の機能(書き戻し、複数カレンダー、レポート出力、課金実装)を先回りで作り込む
- テストの無効化・削除によってテストを「通す」こと

## 作業の進め方

- 大きめの変更は実装前に方針を短く提示してから着手する
- スキーマ変更を含むタスクは、マイグレーションSQL→RLSポリシー→アプリコードの順で提示する
- UI変更時はモバイル幅(375px)での表示崩れを必ず確認する(モバイルファースト)
- オーバーレイ表示(予定=左寄せ薄い塗り、実績=右寄せ濃い塗り)がプロダクトの「顔」。UI品質はここに最優先で投資する
