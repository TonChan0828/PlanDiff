# 仕様書: P1-3 メール認証とGoogle任意連携(既存Google認証の分離)

- ステータス: 承認済み(2026-07-09)
- 関連: docs/要件定義書.md の FR-01(改定)/ FR-02(改定)/ §12(refresh token取得リスクは
  「連携時のみ」発生するリスクに縮小)、docs/開発計画.md P1-3
- 依存: P0-6(google_tokensテーブル・profilesトリガー)、P1-1(Google認証。本仕様は
  P1-1の大部分を置き換える。`lib/google/token.ts` のfetchパターン、
  `lib/supabase/admin.ts` の google_tokens操作関数は流用)
- 指示資料: なし(docs/指示資料/ を確認済み、2026-07-09時点でREADMEのみ)

## 目的

これまでGoogleログイン一体型だった認証を、(1) メール/パスワードによるアカウント作成・ログイン
(必須の主要導線)と、(2) ログイン後に任意で行うGoogleカレンダー連携(OAuth2、任意)に分離する。

- 独自ドメイン取得・Google OAuth審査(P0-5)の完了を待たずに、一般ユーザーがアカウントを
  作成して使い始められるようにする
- Googleアカウントを持たない・連携したくないユーザーでもPlanDiffを使い始められる
  (フリータイマー=FR-05はGoogle非依存で完結する)
- Google連携が未完了・失効していても `/calendar` 自体は表示できる(現状は同期401で
  強制的にログイン/再認可へ弾かれる仕様になっているが、これをやめる)
- Googleの認可エラーとアカウント認証エラーの責務を分離する

## 仕様

### 画面・ルーティング(新規/変更)

| ルート | ファイル | 認証 | 内容 |
|---|---|---|---|
| `/signup` | `app/(marketing)/signup/page.tsx` | 不要 | メール+パスワードでアカウント作成 |
| `/login` | `app/(marketing)/login/page.tsx` | 不要 | メール+パスワードでログイン(書き換え。Googleボタン廃止) |
| `/forgot-password` | `app/(marketing)/forgot-password/page.tsx` | 不要 | 登録メールへパスワード再設定メールを送る |
| `/reset-password` | `app/(marketing)/reset-password/page.tsx` | リンク経由のセッションのみ有効 | 新パスワードの入力・更新 |
| `/auth/confirm` | `app/auth/confirm/route.ts` | — | signup確認リンクの検証(Route Handler) |
| `/auth/confirm-recovery` | `app/auth/confirm-recovery/route.ts` | — | recovery確認リンクの検証(Route Handler。遷移先が異なるためsignupと別ルート) |
| `/api/google/connect` | `app/api/google/connect/route.ts` | 必要 | Google OAuth2認可URLへのリダイレクト起点 |
| `/api/google/callback` | `app/api/google/callback/route.ts` | 必要(cookieのstateで検証) | Googleコールバック。トークン交換+保存 |
| `/(app)/settings` | `app/(app)/settings/page.tsx` | 必要 | Google連携状況の表示・連携/解除(新設) |
| `/calendar` | `app/(app)/calendar/page.tsx` | 必要 | Google未連携でも表示。予定レーンは空+バナー、フリータイマーは動作 |

- `app/auth/callback/route.ts`(Supabase OAuthコールバック)は削除。Google連携は
  `/api/google/callback` が担う
- `app/(app)/auth/reauthorize/page.tsx` は削除し、再認可導線は `/settings` の
  連携ボタン(未連携/失効時は同じボタンが「連携する」表示になる)に統合する

### 設計判断: なぜGoogle連携をSupabase Authプロバイダ経由からGoogle OAuth2直接方式に変えるか

- 現行は「ログイン=Google OAuth」前提で、`signInWithOAuth` が作るSupabaseセッション自体が
  Googleアカウントに紐づく。メール/パスワードでログイン中のユーザーが同じ `signInWithOAuth`
  を呼ぶと、Supabase側のセッションが別アカウントに切り替わる恐れがある(Identity Linking機能を
  使わない限り安全に「カレンダーだけ連携」できない)
- そのためGoogle連携は、Supabase Authを経由しない独立したOAuth2認可コードフローとして実装する
  (`lib/google/token.ts` のfetchベース実装パターンを踏襲し、認可コード交換版を追加する)
- ログインユーザーの識別は既存のSupabaseセッション(cookie)で行う。`state` にCSRF対策の
  ランダム値を載せ、Googleからのコールバックが本人の遷移であることを検証する

### サインアップフロー(メール/パスワード)

1. `/signup` でメール・パスワード(・確認用パスワード)を入力し送信
2. `supabase.auth.signUp({ email, password, options: { emailRedirectTo: "${origin}/auth/confirm" } })`
3. 成功時: 「確認メールを送信しました」の案内画面を表示(この時点ではログインさせない)
4. バリデーション:
   - メール形式不正 → 「メールアドレスの形式が正しくありません」(送信前にフロントで弾く)
   - パスワード8文字未満 → 「パスワードは8文字以上で入力してください」(フロント側で先に適用)
   - 既に登録済みのメール → 新規時と同一の「確認メールを送信しました」画面を表示する
     (メールアドレス存在の推測を防ぐ)

### メール確認フロー(`/auth/confirm` / `/auth/confirm-recovery`)

- `@supabase/ssr` はデフォルトでPKCEフローを使うため、確認メールのリンクはSupabaseの
  `/auth/v1/verify` エンドポイントを経由し、検証後に `redirect_to`(=下記の各Route Handler)へ
  **認可コード(`?code=...`)** 付きでリダイレクトされる(`token_hash`ではない。実機確認で判明)。
  `redirect_to` はSupabaseの許可リスト(`supabase/config.toml` の `additional_redirect_urls`。
  クエリ文字列は照合時に無視されるため、遷移先ごとに別ルートの固定URLを登録する)に事前登録が必要
- `app/auth/confirm/route.ts`(signup用)・`app/auth/confirm-recovery/route.ts`(recovery用)は
  いずれも `supabase.auth.exchangeCodeForSession(code)` を呼ぶ(`lib/supabase/server.ts` は
  cookieベースのSSRクライアントで `detectSessionInUrl` を持たないため、サーバー側での
  `exchangeCodeForSession` がこのプロジェクト構成での正しい方式。既存の `/auth/callback`
  (P1-1)と同じ関数を使うが、Supabase Authの識別情報そのものではなく確認/リカバリーの
  完了処理として呼ぶ点が異なる)
- signup成功 → `/calendar` へリダイレクト(`/auth/confirm`)
- recovery成功 → `/reset-password` へリダイレクト(リカバリーセッションが確立している。
  `/auth/confirm-recovery`)
- 失敗(期限切れ・使用済み・不正な `code`):
  - signup(`/auth/confirm`) → `/login?error=confirm_failed`(「確認リンクの有効期限が切れています。
    再度サインアップするか、ログインしてから確認メールを再送してください」)
  - recovery(`/auth/confirm-recovery`) → `/forgot-password?error=expired`(「リンクの有効期限が切れています。
    もう一度パスワード再設定をお試しください」)

### ログインフロー(メール/パスワード)

1. `/login` でメール・パスワードを入力し送信 → `supabase.auth.signInWithPassword({ email, password })`
2. 成功 → `/calendar`
3. 失敗:
   - パスワード不一致・未登録メール → 同一メッセージ「メールアドレスまたはパスワードが
     正しくありません」(アカウント存在の推測を防ぐ)
   - メール未確認でのログイン試行 → 「メールアドレスの確認が完了していません。確認メールを
     ご確認ください」+ 確認メール再送導線

### パスワード再設定フロー(forgot/reset)

1. `/forgot-password` でメールアドレスを送信
   → `supabase.auth.resetPasswordForEmail(email, { redirectTo: "${origin}/auth/confirm-recovery" })`
2. 存在有無に関わらず同一の成功メッセージを表示する(「ご入力のメールアドレスが登録されている
   場合、パスワード再設定用のメールをお送りしました」)
3. `/reset-password` で新しいパスワードを入力 → `supabase.auth.updateUser({ password })`
4. 成功 → `/login` へリダイレクトし「パスワードを再設定しました。新しいパスワードでログイン
   してください」
5. リカバリーセッションがない状態(期限切れ・再利用)で `/reset-password` を開いた場合は
   「リンクの有効期限が切れています」+ `/forgot-password` への導線を表示する

### Google連携(オプション)フロー

1. `/settings` の「Googleカレンダーと連携する」ボタン → `/api/google/connect` へ遷移
2. `/api/google/connect`(GET):
   - `createClient()`(SSR)でログインユーザーを確認。未ログインは `/login` へ
   - CSRF対策の `state`(ランダム値)を生成し、httpOnly cookie(短寿命、例10分)に保存
   - Google OAuth2認可URLへ302(`client_id`, `redirect_uri=${origin}/api/google/callback`,
     `response_type=code`, `scope=calendar.events.readonly`, `access_type=offline`,
     `prompt=consent`, `state`)
3. `/api/google/callback`(GET):
   - `state` クエリとcookieの値を比較。不一致・欠落 → `/settings?error=google_state`
   - `code` なし/Googleからの `error` パラメータ → `/settings?error=google_auth`
   - `code` をGoogleのtoken endpointに `grant_type=authorization_code` で交換
   - `refresh_token` が返らない → `/settings?error=google_no_refresh_token`
   - 成功 → ログインユーザーのidで `saveGoogleRefreshToken`(既存関数を再利用)
     → `/settings?connected=1`。stateのcookieは使用後に削除する

### `/calendar` のGoogle未連携時の挙動

- 現行の `components/calendar-view.tsx` は同期401で強制的に `/login` または
  `/auth/reauthorize` へ `router.push` していたが、この強制遷移を削除する
- `/api/calendar/sync` は「google_tokensに行がない」場合 `401 { error: "not_connected" }` を
  返すよう変更する(既存の「連携済みだが失効」を示す `reauthorize` とは区別する)
- `CalendarView` は401 `not_connected` / `reauthorize` を受け取ったら遷移せず、新規
  `GoogleConnectionBanner` を表示する。バナーには `/settings` への導線を置く
- 予定(左レーン)は空のまま表示され、フリータイマー(右下 `FreeTimerBar`)は連携状態に
  関わらず常に動作する(FR-05はGoogle非依存であることの明示)
- `app/(app)/calendar/page.tsx` でも初回描画時に連携状態を取得し、`CalendarView` に
  `googleConnected: boolean` として渡す(クライアント側の401判定を待たずに初期表示できる)

### ログアウト(既存・変更なし)

- `signOutAction` は変更なし。`google_tokens` の行は削除しない

### データ変更

- `google_tokens` への読み書きは既存の `saveGoogleRefreshToken` / `getGoogleRefreshToken` /
  `deleteGoogleRefreshToken` をそのまま再利用(スキーマ変更なし。呼び出し元が
  `/auth/callback` から `/api/google/callback` に変わるのみ)
- `profiles` はP0-6のトリガーで自動作成される。メール/パスワードの `signUp` でも同じ
  トリガーが発火することを結合テストで確認する

### エラー時の挙動一覧(すべて日本語)

| ケース | 遷移先/表示 |
|---|---|
| サインアップ: メール形式不正 | フォーム内エラー |
| サインアップ: パスワード8文字未満 | フォーム内エラー |
| サインアップ: 登録済みメール | 成功画面と同一表示 |
| メール確認: リンク期限切れ・使用済み(signup) | `/login?error=confirm_failed` |
| パスワード再設定リンク: 期限切れ・使用済み(recovery) | `/forgot-password?error=expired` |
| ログイン: メール/パスワード不一致 | フォーム内エラー(共通メッセージ) |
| ログイン: メール未確認 | フォーム内エラー+確認メール再送導線 |
| forgot-password 送信後 | 存在有無に関わらず同一の成功メッセージ |
| reset-password: セッションなし | 「リンクの有効期限が切れています」+forgot-password導線 |
| Google連携: state不一致 | `/settings?error=google_state` |
| Google連携: 認可キャンセル/codeなし | `/settings?error=google_auth` |
| Google連携: トークン交換失敗 | `/settings?error=google_failed` |
| Google連携: refresh_token取得できず | `/settings?error=google_no_refresh_token` |
| `/calendar`: 未連携 | バナー表示(遷移なし) |
| `/calendar`: 連携失効 | バナー表示(遷移なし、再連携を促す文言) |

### セキュリティ(CLAUDE.md「やってはいけないこと」の再確認)

- パスワードは平文でログ・エラーメッセージに出さない
- Google連携の `state` はhttpOnly + `SameSite=Lax` cookieで検証する(CSRF対策)
- refresh token / access token / 認可コードはクライアントバンドル・ログ・URLに含めない
- service roleキーは引き続き `lib/supabase/admin.ts` のみ

## スコープ外

- Google以外のソーシャルログイン、2段階認証・パスキー、メールアドレス変更フロー
- アカウント削除(P4-2)
- Google連携の自動再試行・バックグラウンド更新(P1-2の失効検知は維持)
- 要件定義書FR-01/FR-02文言の詳細な書き直し(見出し部分は本仕様の承認と合わせて反映済み。
  本文中の説明文更新は別途)
- Supabaseのメール確認・パスワードリカバリー用メールテンプレートの文面変更

## テストシナリオ

### 単体(サインアップ)

- S1 [単体] 正常系: Given 有効なメール・8文字以上のパスワード When 送信 Then `signUp` が
  `emailRedirectTo: "${origin}/auth/confirm"` 付きで呼ばれ「確認メールを送信しました」画面になる
- S2 [単体] 異常系: Given 不正なメール形式 When 送信 Then `signUp` を呼ばずフォーム内エラーを表示
- S3 [単体] 境界値: Given 7文字のパスワード When 送信 Then エラー表示。8文字ちょうどなら送信される
- S4 [単体] 異常系: Given `signUp` が既存ユーザー相当のレスポンスを返すモック When 送信 Then
  通常成功時と同一の「確認メールを送信しました」画面が表示される(存在を明かさない)

### 結合(サインアップ〜メール確認。ローカルSupabase)

- S5 [結合] 正常系: Given ローカルSupabaseで新規 `signUp` を実行 Then `profiles` に行が
  作成されている(確認前でもトリガーが発火することを検証)
- S6 [結合] 正常系: Given signup確認メールの有効な認可コード When `/auth/confirm` を呼ぶ Then
  `exchangeCodeForSession` によりセッションが確立し `/calendar` へリダイレクトされる
- S7 [結合] 異常系: Given 期限切れ/使用済みの認可コード When
  `/auth/confirm` を呼ぶ Then `/login?error=confirm_failed` へリダイレクトされる

### 単体(ログイン)

- S8 [単体] 異常系: Given 誤ったパスワード When ログイン送信 Then 「メールアドレスまたは
  パスワードが正しくありません」が表示される
- S9 [単体] 異常系: Given 未確認メールでのログイン試行(Supabaseの `email_not_confirmed` 相当)
  When 送信 Then 未確認メッセージと確認メール再送導線が表示される

### 単体/結合(forgot-password・reset-password)

- S10 [単体] 正常系: Given 登録済みメール When `/forgot-password` 送信 Then
  `resetPasswordForEmail` が `redirectTo: "${origin}/auth/confirm-recovery"` 付きで呼ばれ、成功
  メッセージが表示される
- S11 [単体] 異常系: Given 未登録メール When `/forgot-password` 送信 Then S10と同一の
  成功メッセージが表示される(内部での呼び出し自体はS10と同じ)
- S12 [結合] 異常系: Given 期限切れ/使用済みの認可コード When
  `/auth/confirm-recovery` を呼ぶ Then `/forgot-password?error=expired` へリダイレクトされる
- S13 [単体] 正常系: Given 有効なリカバリーセッションで `/reset-password` を表示 When
  新パスワードを入力し送信 Then `updateUser` が呼ばれ `/login` へ「再設定しました」で遷移する
- S14 [単体] 異常系: Given リカバリーセッションが無い状態で `/reset-password` を開く When
  送信(またはレンダリング) Then 「リンクの有効期限が切れています」とforgot-password導線が表示される

### 単体(Google連携: `/api/google/connect`, `/api/google/callback`)

- S15 [単体] 正常系: Given ログイン中ユーザー When `/api/google/connect` を呼ぶ Then
  `state` がcookieに保存され、`access_type=offline` / `prompt=consent` /
  `scope=calendar.events.readonly` / `redirect_uri=${origin}/api/google/callback` を含む
  Google認可URLへ302リダイレクトされる
- S16 [単体] 異常系: Given `state` クエリがcookieの値と一致しない When
  `/api/google/callback` を呼ぶ Then `google_tokens` に保存されず
  `/settings?error=google_state` へリダイレクトされる
- S17 [単体] 異常系: Given `code` なし(またはGoogleからの `error` パラメータ付き) When
  `/api/google/callback` を呼ぶ Then `/settings?error=google_auth` へリダイレクトされる
- S18 [単体] 異常系: Given トークン交換fetchが非200を返すモック When
  `/api/google/callback` を呼ぶ Then `/settings?error=google_failed` へリダイレクトされ、
  エラーログにコード・トークン値が含まれない

### 結合(Google連携: ローカルSupabase)

- S19 [結合] 正常系: Given 正しい `state` + トークン交換成功(`refresh_token` あり)の
  モック When `/api/google/callback` を呼ぶ Then `google_tokens` にservice role経由で
  保存され `/settings?connected=1` へリダイレクトされる
- S20 [結合] 異常系: Given トークン交換は成功するが `refresh_token` が返らないモック When
  `/api/google/callback` を呼ぶ Then `google_tokens` に行が作られず
  `/settings?error=google_no_refresh_token` へリダイレクトされる

### 単体(設定画面: 連携状態・解除)

- S21 [単体] 正常系: Given `google_tokens` に行がある状態で `/settings` を描画 When
  レンダリング Then 「連携済み」表示と解除ボタンが表示される
- S22 [単体] 正常系: Given 解除ボタンをタップ When 実行 Then
  `deleteGoogleRefreshToken` が呼ばれ、「連携する」ボタン表示に戻る

### 単体(calendar-view: 未連携バナー・削除された強制遷移)

- S23 [単体] 正常系: Given `googleConnected=false`(props) When 描画 Then
  `GoogleConnectionBanner` が表示され、予定レーンは空、`FreeTimerBar` は操作可能なまま
- S24 [単体] 異常系: Given `/api/calendar/sync` が `401 { error: "not_connected" }` を
  返す When マウント時同期 Then 画面遷移せず未連携バナーが表示される
  (`router.push("/login")` 等は発生しない)
- S25 [単体] 異常系: Given `/api/calendar/sync` が `401 { error: "reauthorize" }` を返す
  When 同期 Then 画面遷移せず「連携の有効期限が切れています」バナーが表示される

### 結合(`/api/calendar/sync` の未連携判定)

- S26 [結合] 正常系: Given `google_tokens` に行がないユーザー When
  `/api/calendar/sync` を呼ぶ Then `401 { error: "not_connected" }` が返る

### 手動疎通確認(自動テストの補完。DoDに含める)

- M1: 実メールアドレスでサインアップ→確認メール受信→リンクから `/calendar` に遷移することを確認
- M2: パスワード再設定を実メールで一連確認(forgot→メール→reset→新パスワードでログイン)
- M3: 実Googleアカウントで `/settings` から連携→`google_tokens` に保存されることを確認
- M4: Google未連携のままアカウント作成→ログイン→`/calendar` が表示され、フリータイマーが
  動作することを確認(375px)
