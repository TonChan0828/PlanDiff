# 仕様書: P1-1 Google認証(ログイン/ログアウト・refresh token取得・再認可導線)

> **後継注記(2026-07-09)**: 本項目は
> [P1-3_メール認証とGoogle任意連携](P1-3_メール認証とGoogle任意連携.md) に引き継がれた。
> Googleをログイン手段とする本仕様の実装(`app/auth/callback/route.ts`、
> `components/google-sign-in-button.tsx`、`lib/supabase/auth-options.ts`、
> `app/(app)/auth/reauthorize/page.tsx`)はP1-3で削除され、Googleカレンダー連携は
> ログイン後に任意で行う独立したOAuth2フローに置き換わる。本ファイルは経緯の記録として残す。

- ステータス: 承認済み(2026-07-05。実装計画承認による一括承認)。**P1-3により置き換え(2026-07-09)**
- 関連: docs/要件定義書.md の FR-01 / §7.1 / §12(refresh token取得リスク)、docs/開発計画.md P1-1
- 依存: P0-1(Supabaseプロジェクト)、P0-2(Google OAuthクライアント)、P0-6(google_tokensテーブル)
- 指示資料: なし(docs/指示資料/ を確認済み、2026-07-05時点でREADMEのみ)

## 目的

Supabase Auth(Googleプロバイダ)でログイン/ログアウトを実装し、
カレンダー読み取りに必要な `provider_refresh_token` を**確実に取得して `google_tokens` に保存**する。
最大の技術リスク(refresh tokenが返らないケース)への**再認可導線**まで含めて疎通を完了させる。

## 仕様

### 画面・ルーティング

| ルート | ファイル | 認証 | 内容 |
|---|---|---|---|
| `/login` | `app/(marketing)/login/page.tsx` | 不要 | 「Googleでログイン」ボタン。エラー時は日本語メッセージ表示 |
| `/auth/callback` | `app/auth/callback/route.ts` | — | OAuthコールバック(Route Handler) |
| `/auth/reauthorize` | `app/(app)/auth/reauthorize/page.tsx` | 必要 | 再認可の説明+「カレンダー連携をやり直す」ボタン |
| `/calendar` | `app/(app)/calendar/page.tsx` | 必要 | プレースホルダー(ログイン確認用。表示名+ログアウトボタンのみ。本実装はP2-1) |

- `(app)` グループの `layout.tsx` でセッションを検証し、未ログインは `/login` へリダイレクト
- ログイン済みユーザーが `/login` にアクセスした場合は `/calendar` へリダイレクト

### Supabaseクライアント基盤(lib/supabase/)

| ファイル | 内容 |
|---|---|
| `lib/supabase/server.ts` | `@supabase/ssr` の `createServerClient`(cookie連携)。Server Component / Route Handler / Server Action 用 |
| `lib/supabase/browser.ts` | `createBrowserClient`。クライアントコンポーネント用 |
| `lib/supabase/admin.ts` | service role クライアント。`import "server-only"` を付け、クライアントバンドル混入をビルドエラーで防ぐ。google_tokens の読み書き専用 |

- セッショントークンの更新はNext.jsのリクエスト前処理(Next 16の規約に従う。実装時に `node_modules/next/dist/docs/` のmiddleware/proxy相当のガイドを必ず確認)で行う

### ログインフロー

1. `/login` の「Googleでログイン」ボタン押下で `signInWithOAuth` を呼ぶ:
   - `provider: "google"`
   - `options.redirectTo: <サイトURL>/auth/callback`
   - `options.scopes: "https://www.googleapis.com/auth/calendar.events.readonly"`
   - `options.queryParams: { access_type: "offline", prompt: "consent" }`(**refresh token取得の必須条件**)
   - OAuth認可URLの組み立てはヘルパー関数 `lib/supabase/auth-options.ts`(仮)に切り出し、単体テスト可能にする
2. `/auth/callback`(Route Handler)で:
   1. `code` クエリパラメータを `exchangeCodeForSession(code)` でセッションに交換
   2. 返却セッションの `provider_refresh_token` を確認:
      - **あり** → `google_tokens` に service role クライアントで upsert(キー: user_id)→ `/calendar` へリダイレクト
      - **なし** → `/auth/reauthorize` へリダイレクト(セッション自体は有効なのでログイン状態は維持)
   3. `provider_refresh_token` はセッションに永続しないため、**このタイミング以外では取得できない**(CLAUDE.mdハマりどころ)。callback以外でトークン保存を試みる実装にしない

### 再認可導線(refresh token不取得時のフォールバック)

- `/auth/reauthorize`: 「カレンダーを読み取るための許可が完了していません」という説明と再試行ボタンを表示
- 再試行ボタンはログインと同一の `signInWithOAuth` オプション(`prompt=consent` 付き)で認可をやり直す
- カレンダー同期(P1-2)側でも、`google_tokens` に行がない/refresh tokenが失効しているユーザーはこのページへ誘導する(導線の受け口を本項目で用意)

### ログアウト

- Server Action で `supabase.auth.signOut()` → `/login` へリダイレクト
- `google_tokens` の行は**削除しない**(再ログインで再利用。削除はP4-2のデータ全削除で行う)

### データ変更

- `google_tokens` への upsert(user_id, refresh_token, updated_at)。**service role 経由のみ**
- profiles はP0-6のトリガーで自動作成されるため、本項目では書き込まない

### エラー時の挙動(メッセージはすべて日本語)

| ケース | 挙動 |
|---|---|
| ユーザーがGoogle同意画面でキャンセル(`error` パラメータ付きでcallbackに戻る) | `/login?error=auth` へリダイレクトし「ログインがキャンセルされました。もう一度お試しください」を表示 |
| callback に `code` がない | 同上(`/login?error=auth`) |
| `exchangeCodeForSession` が失敗 | `/login?error=failed` へリダイレクトし「ログインに失敗しました。時間をおいてもう一度お試しください」を表示 |
| `provider_refresh_token` なし | `/auth/reauthorize` へ(上記) |

> **実装時の補記(2026-07-05)**: ドラフトでは「キャンセル/codeなし」と「セッション交換失敗」が
> 同じ `/login?error=auth` に集約されていたが、表示メッセージが異なるため区別できない。
> 交換失敗は `/login?error=failed` に分離し、両方の規定メッセージを表示可能にした。
> また、Next.js 16 では Middleware が `proxy.ts` に改名されているため、
> セッショントークン更新は `proxy.ts`(プロジェクトルート)で実装した。
| google_tokens への保存が失敗(DB障害等) | `/auth/reauthorize` へ(ログインは成立させ、連携のみ再試行可能にする)。サーバーログにはエラー種別のみ記録し、**トークン値・コードは絶対にログに出さない** |

### セキュリティ(CLAUDE.md「やってはいけないこと」の再確認)

- refresh token / access token / 認可コードをクライアントバンドル・ログ・エラーメッセージ・URLに含めない
- service role キーは `lib/supabase/admin.ts`(server-only)以外でimportしない
- スコープは `calendar.events.readonly` のみ。writeスコープは追加しない

## スコープ外

- カレンダーAPI呼び出し・トークン自動更新(P1-2)
- オンボーディング画面(P4-1)。MVP疎通はログイン→ /calendar 直行
- 設定画面の連携状態表示・データ全削除(P4-2)
- refresh token の失効検知(P1-2でAPI呼び出し時に検知し、本項目の `/auth/reauthorize` へ誘導する)
- メール/パスワード等Google以外の認証手段

## テストシナリオ

結合テストはP0-6で整備した `tests/integration/`(ローカルSupabase)を使用。
Google本体のOAuth画面はテスト対象外(自動化不能)のため、`exchangeCodeForSession` 等のSupabase SDK境界をモックする結合テストと、実Googleアカウントでの手動疎通確認(DoD項目)を組み合わせる。

- S1 [単体] 正常系: Given 認可オプション生成ヘルパー When 呼び出す Then `access_type=offline`・`prompt=consent`・readonlyスコープ・`redirectTo=<サイトURL>/auth/callback` がすべて含まれる
- S2 [結合] 正常系: Given `provider_refresh_token` を含むセッションを返すモック When `/auth/callback` を `code` 付きで呼ぶ Then google_tokens に該当ユーザーの行が保存され(ローカルDBをservice roleで検証)、`/calendar` へリダイレクトされる
- S3 [結合] 異常系: Given `provider_refresh_token` を含まないセッションを返すモック When `/auth/callback` を呼ぶ Then google_tokens に行が作られず、`/auth/reauthorize` へリダイレクトされる
- S4 [単体] 異常系: Given `code` パラメータなし(またはGoogleからの `error` パラメータ付き)のリクエスト When `/auth/callback` を呼ぶ Then `/login?error=auth` へリダイレクトされる
- S5 [単体] 異常系: Given `exchangeCodeForSession` がエラーを返すモック When `/auth/callback` を呼ぶ Then `/login?error=failed` へリダイレクトされ、エラーログにコード・トークン値が含まれない
- S6 [結合] 境界値: Given 既に google_tokens に行があるユーザー When 新しい refresh token でログイン(callback成功) Then 行が upsert で置き換わり1行のまま、refresh_token が新しい値になっている
- S7 [結合] 正常系: Given ログイン済みセッション When ログアウトのServer Actionを実行 Then セッションが無効化され、google_tokens の行は残っている
- S8 [結合] 異常系: Given 未ログイン状態 When `/calendar` にアクセス Then `/login` へリダイレクトされる
- S9 [単体] 正常系: Given ログインページ(error=authクエリ付き) When レンダリング Then 日本語のエラーメッセージと再試行ボタンが表示される
- S10 [単体] 正常系: Given 再認可ページ When レンダリング Then 説明文と再試行ボタンが表示され、ボタンはS1と同一の認可オプションを使用する

### 手動疎通確認(自動テストの補完。DoDに含める)

- M1: 実Googleアカウントで初回ログイン → google_tokens に refresh token が保存されること(ローカルSupabaseのStudioで確認)
- M2: 一度連携済みのアカウントで `prompt=consent` なしの挙動を確認し、再認可導線が機能すること
