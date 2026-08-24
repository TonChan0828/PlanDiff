# 仕様書: P13-1 計測しっぱなしの検知とPush通知

- ステータス: 承認待ち(2026-08-24 作成)
- 関連: docs/要件定義書.md の FR-05(フリータイマー)/ FR-09(PWA対応)/
  docs/specs/P3-3_PWA対応.md(Service Worker を明示的にスコープ外とした経緯。本件で初導入する)/
  docs/specs/P0-6_DBスキーマとRLS.md(`time_entries` の実行中タイマー制約)/
  docs/specs/P4-2_設定画面.md(通知セクションの設置先)/
  docs/specs/P6-5_anon権限の剥奪.md(新規テーブルのGRANT方針)
- 指示資料: なし(`docs/指示資料/` は `README.md` のみ。2026-08-24 確認)
- 発生元: ユーザー要望(2026-08-24)「12時間以上計測しているものは操作忘れだとし、
  通知やメールする機能を実装したい」

## 目的

タイマーの停止を忘れたまま12時間以上が経過した計測を検知し、ユーザーの端末へ
Web Push 通知を送って気づかせる。

放置された計測は `end_at IS NULL` のまま伸び続け、サマリー画面のズレ分析
(プロダクトの核心価値「見積もりが当たるようになる」)を汚染する。しかし
「アプリを開かないから止め忘れる」という因果のため、アプリ内表示だけでは解決しない。
アプリの外へ届く通知経路が必要になる。

### 現状(調査結果 2026-08-24)

1. **通知基盤が一切存在しない**
   - `vercel.json` / `vercel.ts` がなく、Cron Job は未設定
   - メール送信ライブラリなし(Supabase Auth の認証メールのみ)
   - Service Worker はリポジトリに1つも存在しない。`docs/specs/P3-3_PWA対応.md:74` で
     「Service Worker・オフラインキャッシュはスコープ外」と**意図的に外している**
2. **タイムゾーンが Cookie にしかない**
   `components/timezone-sync.tsx` が `Intl` で検出して Cookie に書き、サーバーはそれを読む。
   `profiles` に TZ 列はない。**cron はリクエストを持たないため Cookie を読めず、ユーザーの
   TZ を知る手段がない**。通知本文にローカル時刻を出すには TZ を DB に持つ必要がある
   (前例: `recurring_rules.timezone`)
3. **検知クエリ自体は素直**
   `time_entries` は `end_at IS NULL` = 実行中で、`one_running_timer_per_user` の
   partial unique index により1ユーザー1本が保証されている

## 決定事項(ユーザー承認済み 2026-08-24)

| 論点 | 決定 | 理由 |
|---|---|---|
| 配信チャネル | **Web Push のみ**(メールは実装しない) | 外部メール送信サービスの契約・独自ドメイン認証が不要。PWA対応(P3-3)済みで土台がある |
| 検知の頻度 | **1日1回のまとめチェック** | Vercel Cron の Hobby 制限(最小間隔=1日1回)に収まり、プランのアップグレードも `pg_cron` 導入も不要になる |
| データの扱い | **知らせるだけ。自動停止しない** | 本当に長時間作業した記録を壊すリスクを避ける。修正はユーザーが既存導線で行う |
| 通知回数 | **1計測につき1回だけ** | 自動停止しないため、毎日鳴らすと「催促」になり通知自体を切られる。見逃してもアプリ内の計測中バーで気づける |
| 閾値 | **12時間固定**(設定可能にしない) | MVPスコープ。設定項目は必要になってから足す |
| 実行基盤 | **Vercel Cron**(Supabase `pg_cron` は採用しない) | 1日1回で足りる現状に対し `pg_cron` + `pg_net` + Vault は過剰。検知ロジックを Route Handler に置くため、頻度を上げたくなった時点で呼び出し元だけ差し替えられる |

## 仕様

### 1. マイグレーション

`npx supabase migration new stale_timer_push_notifications` で作成する。

```sql
-- P13-1: 計測しっぱなしの検知とPush通知

-- 1) time_entries に通知済みマーカーを追加
--    NULL = 未通知。列追加のみのため既存GRANTがそのまま有効(新規GRANT不要)
alter table public.time_entries
  add column stale_notified_at timestamptz;

-- 2) Push購読。google_tokens / pro_interest_events と同じ「ポリシーを一切作らない」パターン。
--    endpoint と鍵は「その端末へ任意の通知を送る権限」そのものであり、漏洩時の影響が
--    アクセストークンに準じる。設定画面の有効/無効判定は pushManager.getSubscription() で
--    ブラウザ側から取れるため、クライアントがこのテーブルを読む必要が一切ない
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- ポリシーは作らない。anon / authenticated からは読み書き不可

create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function private.set_updated_at();

-- Data API への公開(明示GRANT)。service_role のみ。
-- authenticated / anon には GRANT しない(P6-5 の方針)
grant all on public.push_subscriptions to service_role;
```

列名を `auth` ではなく `auth_key` にするのは、Supabase では `auth` がスキーマ名であり
SQL 中で読み手が混乱するため。`p256dh_key` も対称性のために `_key` を付ける。

`on delete cascade` により、P4-2 のアカウント削除で購読も自動的に消える。

### 2. Service Worker(`public/sw.js`)

本リポジトリ初の Service Worker。`public/` に静的ファイルとして置き、`/sw.js` で配信されて
scope `/` を取る。**オフラインキャッシュは実装しない**(P3-3 の判断を維持する。
Push に必要な最小限のみ)。

```js
self.addEventListener("push", (event) => { /* showNotification */ });
self.addEventListener("notificationclick", (event) => { /* /track を開く or フォーカス */ });
```

- `push` ハンドラはペイロード(JSON)から `title` / `body` / `tag` を読む。
  ペイロードが壊れていても通知は出す(汎用文言にフォールバック。エラーで無音にしない)
- `tag` は `stale-timer` 固定。同じ種類の通知が積み上がらないようにする
- `notificationclick` は、既に開いている PlanDiff のウィンドウがあればそれを
  `focus()` し、なければ `clients.openWindow("/track")` する。
  遷移先を `/track`(計測画面)にするのは、停止導線がそこにあるため

### 3. 通知の設定UI(`components/notification-settings.tsx`)

`app/(app)/settings/page.tsx` の `ThemeSelector` と同じ並びに配置する client component。
**オンボーディング(P4-1)には組み込まない** — 初回体験で通知許可ダイアログを出すのは
離脱要因であり、この機能は使い始めてから必要性に気づく種類のものであるため。

表示する状態は4つ:

| 状態 | 判定 | 表示 |
|---|---|---|
| 利用不可 | `"serviceWorker" in navigator` または `"PushManager" in window` が false | iOS かつ非standalone なら「ホーム画面に追加してから有効にしてください」。それ以外は「この環境では通知を利用できません」 |
| 未許可 | `Notification.permission === "default"` かつ購読なし | 「通知を有効にする」ボタン |
| 許可済み | `pushManager.getSubscription()` が非 null | 「この端末で有効」+「無効にする」ボタン |
| ブロック済み | `Notification.permission === "denied"` | 「ブラウザの設定で通知がブロックされています」+ 戻し方の案内 |

iOS 判定は `navigator.userAgent` ではなく **機能検出を優先**する
(`"PushManager" in window` が false であること)。そのうえで、案内文を出し分けるためだけに
iOS かどうかを補助的に見る。standalone 判定は
`window.matchMedia("(display-mode: standalone)").matches`。

文言はすべて `lib/notifications/messages.ts` に集約する(CLAUDE.md のUIテキスト規約)。

### 4. 購読の登録・解除(`app/api/notifications/subscribe/route.ts`)

**POST**(登録):

1. `getSessionUser()` で本人確認。未認証は 401
2. body から `endpoint` / `keys.p256dh` / `keys.auth` / `timezone` を検証。
   欠落・型不一致は 400
3. `lib/supabase/admin.ts` の service role クライアントで `endpoint` を競合キーに **upsert**
   (`onConflict: "endpoint"`)。同じ端末での再登録・TZ変更を1行で吸収する。
   upsert 時に `user_id` も更新する(同一端末を別アカウントで使い直した場合に備える)
4. 成功は 204

**DELETE**(解除): 認証必須。body の `endpoint` に一致し、**かつ `user_id` が本人**の行を削除する。
`endpoint` だけで消せると他人の購読を消せてしまうため、必ず両方を条件にする。

### 5. cron(`app/api/cron/stale-timers/route.ts`)

**認証**: `Authorization: Bearer ${process.env.CRON_SECRET}` を検証する。
一致しなければ 401。`CRON_SECRET` が未設定の環境では**常に401**にする
(未設定を「検証なし」にフォールバックさせない)。

**処理**:

1. service role クライアントで対象を取得(条件を疑似SQLで示す)
   ```sql
   select id, user_id, title, start_at from public.time_entries
   where end_at is null
     and start_at <= :threshold   -- 実行時刻 - STALE_TIMER_THRESHOLD_HOURS
     and stale_notified_at is null
   ```
   閾値は SQL リテラルではなく `lib/notifications/stale-timer.ts` の
   `STALE_TIMER_THRESHOLD_HOURS` から算出した時刻を supabase-js の **`.lte()`** に渡す。
   SQL 側に `interval '12 hours'` を直書きすると定数が二重管理になるため。

   **比較演算子は `<` ではなく `<=`**。テストシナリオ1「経過ちょうど12時間00分の計測が
   対象になる」を満たすには境界を含める必要がある(`start_at == threshold` のとき
   `<` は false になる)。
2. `user_id` ごとにまとめ、該当ユーザーの `push_subscriptions` を引く
3. 購読ごとに `web-push` で送信する。1件の失敗が全体を止めないよう `Promise.allSettled`
4. **1件でも送信に成功したユーザーの `time_entries.stale_notified_at` を `now()` で更新**する
5. 送信結果(対象件数・成功数・失敗数・削除した購読数)をレスポンス JSON で返す。
   ログにも残すが、**endpoint や鍵は出力しない**

購読が0件のユーザーは `stale_notified_at` を更新しない。これにより、後日通知を有効にすれば
翌朝の実行で拾われる。

**失効した購読の削除**: `web-push` が 404 / 410(`WebPushError.statusCode`)を返した購読は
その場で `push_subscriptions` から削除する。放置するとゴミ行が永久に残り、毎朝失敗し続ける。

### 6. 通知の文面(`lib/notifications/stale-timer.ts`)

```
タイトル: 計測しっぱなしかもしれません
本文:    「設計レビュー」を 8月23日 21:30 から 13時間20分 計測中です
```

- 日時は購読行の `timezone` で整形する(`@date-fns/tz` の `TZDate` を使う)。
  `timezone` が不正な値のときは UTC ではなく **`Asia/Tokyo` にフォールバック**する
  (主要ユーザーがJSTのため、UTCだと9時間ずれた文面が出て混乱が大きい)
- 経過時間は「13時間20分」形式。24時間を超えても時間表記のまま(「37時間5分」)。
  日数に丸めると「止め忘れ」の異常さが伝わらないため
- タイトルが空文字の計測は「(タイトルなし)」と表示する

閾値の定数 `STALE_TIMER_THRESHOLD_HOURS = 12` はこのファイルに置き、SQL 側の
`interval '12 hours'` と二重管理にならないよう、クエリはこの定数から組み立てる。

### 7. cron の登録(`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/stale-timers", "schedule": "0 22 * * *" }
  ]
}
```

`0 22 * * *`(UTC)= **JST 7:00**。Vercel Hobby は精度が ±59分のため、実際の到達は
JST 7:00〜7:59 の間になる。1日1回の気づき用途では許容する。

`vercel.ts`(`@vercel/config`)は**採用しない**。cron 1本のために新規依存を足す価値がないため。
設定項目が増えた時点で移行を検討する。

### 8. 環境変数(3本追加)

| 変数 | 用途 | 公開 |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ブラウザの `pushManager.subscribe({ applicationServerKey })` | クライアントに載る(公開鍵なので問題ない) |
| `VAPID_PRIVATE_KEY` | サーバーの送信署名 | **サーバーのみ**。クライアントバンドル・ログ・エラーメッセージに含めない |
| `CRON_SECRET` | cron エンドポイントの認証 | **サーバーのみ** |

鍵は `npx web-push generate-vapid-keys` で生成する。
`VAPID_SUBJECT` は `mailto:` 形式が必要だが、値が固定でよいためコード内の定数とする。

**Vercel への環境変数登録はユーザー作業**(本仕様の「残タスク」に記載)。

## スコープ外

- **メール通知**。今回 Web Push を選択したため実装しない。必要になれば別項目として起票する
- **自動停止・自動丸め**。ユーザー判断で「知らせるだけ」とした
- **閾値のユーザー設定**(12時間固定)
- **通知の時間帯制御**(おやすみモード等)。1日1回の朝の通知のみのため不要
- **各ユーザーの現地時刻に合わせた配信**。cron は UTC 固定1本。
  `push_subscriptions.timezone` を持つため、将来「24本の日次 cron を時刻別に立てて
  現地7時に送る」への拡張は可能(Hobby でもジョブ数100本まで可)だが、今は実装しない
- **オフラインキャッシュ**(P3-3 の判断を維持。Service Worker は Push 専用)
- **通知の既読・履歴管理**

## テストシナリオ

### 単体(`tests/lib/notifications/stale-timer.test.ts`)

R-1 に従い、**日時はすべて `new Date(2026, 7, 24, 21, 30)` 形式でローカルTZ構築**する。
「今日」に依存する判定は `vi.useFakeTimers` + `setSystemTime` で基準時刻を固定する。
**コミット前に `TZ=UTC npx vitest run` と `TZ=Pacific/Kiritimati npx vitest run` を実行する**。

1. 経過ちょうど12時間00分の計測が対象になる(境界・包含)
2. 経過11時間59分の計測は対象外(境界・除外)
3. `end_at` が入っている計測は対象外
4. `stale_notified_at` が入っている計測は対象外
5. 経過時間の整形: 13時間20分 →「13時間20分」
6. 経過時間の整形: 37時間5分 →「37時間5分」(日数に丸めない)
7. 経過時間の整形: ちょうど12時間 →「12時間0分」
8. 本文の日時が `timezone` で整形される(`Asia/Tokyo` と `America/New_York` で表記が変わる)
9. `timezone` が不正文字列のとき `Asia/Tokyo` にフォールバックする
10. タイトルが空文字のとき「(タイトルなし)」になる
11. 通知ペイロードに `tag: "stale-timer"` が含まれる

### コンポーネント(`tests/components/notification-settings.test.tsx`)

12. `PushManager` 非対応かつ非standalone で「ホーム画面に追加」案内が出る
13. `Notification.permission === "default"` で「通知を有効にする」ボタンが出る
14. `Notification.permission === "denied"` でブロック案内が出て、有効化ボタンが出ない
15. 既存購読ありで「この端末で有効」と「無効にする」が出る
16. 「通知を有効にする」押下で `requestPermission` → `subscribe` → `POST /api/notifications/subscribe` の順に呼ばれる
17. 許可ダイアログで拒否されたとき、エラーを握りつぶさずブロック案内に切り替わる
18. `POST` が失敗したとき日本語のエラーメッセージが表示される

### 結合(`tests/integration/`)

**`push-subscribe.test.ts`**

19. 未認証の `POST` が 401
20. 正常な `POST` が 204 を返し、行が1件作られる
21. 同一 `endpoint` の再 `POST` が upsert になり、行数が増えず `timezone` が更新される
22. body の `keys.p256dh` 欠落で 400
23. `DELETE` が本人の購読のみを削除する(他ユーザーの同一 endpoint 行は残る)

**`cron-stale-timers.test.ts`**

24. `Authorization` ヘッダなしで 401
25. 誤った secret で 401
26. `CRON_SECRET` 未設定の環境で 401(検証なしにフォールバックしない)
27. 対象ありで送信され、`stale_notified_at` が更新される
28. 対象なしで 200 かつ送信0件
29. 購読が0件のユーザーは `stale_notified_at` が **更新されない**
30. 410 を返した購読が `push_subscriptions` から削除される
31. 1つの購読が失敗しても、同一ユーザーの他の購読への送信は続行される

`web-push` は `vi.mock` でモックする。

**`table-grants.test.ts`(既存ファイルに追加)**

32. `authenticated` ロールから `public.push_subscriptions` を SELECT できない
33. `anon` ロールから `public.push_subscriptions` を SELECT できない

## 検証(手動)

- [ ] `npm run check` 合格(出力を確認する)
- [ ] `npx supabase db reset` が通り、`npx supabase db diff` に意図しない差分がない
- [ ] 設定画面の通知セクションを **375px 幅**で確認(`ui-quality` Skill のチェックリスト)。
      4状態すべてで横スクロールが発生しないこと
- [ ] ローカルで cron エンドポイントを手動実行し、実機(Android Chrome / デスクトップ Chrome)に
      通知が届くこと。タップで `/track` が開くこと
- [ ] iOS: ホーム画面に追加した PWA で通知が届くこと。Safari タブでは案内文が出ること

## 残タスク(ユーザー作業)

- [ ] `npx web-push generate-vapid-keys` で鍵を生成し、Vercel に
      `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `CRON_SECRET` を登録する
- [ ] 本番 Supabase へ `npx supabase db push`(テーブル追加+列追加のため必須)
- [ ] 本番デプロイ後、Vercel ダッシュボードの Cron Jobs にジョブが登録されたことを確認する

## リスクと留意点

- **iOS はホーム画面追加が必須**。Safari のタブでは `PushManager` 自体が存在しないため、
  案内で吸収する。この制約は2026年時点でも変わっていない
- **Vercel Hobby の精度 ±59分**。通知が JST 7:00 ちょうどには来ない
- **Service Worker の初導入**。`public/sw.js` の更新はブラウザのキャッシュに影響されるため、
  内容を変えたら実機で更新が反映されるかを必ず確認する
- **`stale_notified_at` は1計測1回**の設計上、通知を見逃すと再通知されない。
  運用してみて見逃しが問題になれば、再通知間隔を持つ設計へ変更する
