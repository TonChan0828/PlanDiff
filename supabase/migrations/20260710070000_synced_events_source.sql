-- P2-5: アプリ内予定のための source 列を synced_events に追加
-- 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md
-- 既存行は default により 'google' になる(後方互換)。
-- アプリ予定は source='app'、google_event_id='app:<uuid>' で保存する。

alter table public.synced_events
  add column source text not null default 'google'
  constraint synced_events_source_check check (source in ('google', 'app'));
