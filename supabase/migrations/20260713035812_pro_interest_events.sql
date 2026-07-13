-- P4-4 料金ページ: 「Proに興味あり」クリック率計測用のイベントテーブル
-- 個人情報は保存しない(user_id・IP等の列を持たない)ため、
-- P4-2のデータ全削除の対象外(docs/specs/P4-4_料金ページ.md)

create table public.pro_interest_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('view', 'click')),
  created_at timestamptz not null default now()
);

-- RLS有効化。ポリシーは一切付けない(google_tokensと同じパターン):
-- anon / authenticated からは読み書き不可。service role経由のRoute Handlerのみが書き込む
alter table public.pro_interest_events enable row level security;

-- Data APIへの公開(明示GRANT。auto_expose無効のため)。
-- anon / authenticated にはGRANTしない(service role のみ)
grant all on public.pro_interest_events to service_role;
