-- P13-1: 計測しっぱなしの検知とPush通知
-- 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md

-- 1) time_entries に通知済みマーカーを追加。
--    NULL = 未通知。列追加のみのため既存GRANTがそのまま有効(新規GRANT不要)
alter table public.time_entries
  add column stale_notified_at timestamptz;

-- 2) Push購読。google_tokens / pro_interest_events と同じ「ポリシーを一切作らない」パターン。
--    endpoint と鍵は「その端末へ任意の通知を送る権限」そのもので、漏洩時の影響が
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
