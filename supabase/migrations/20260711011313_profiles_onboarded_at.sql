-- P4-1: オンボーディング既読管理用カラム
-- NULL = 未完了(初回 /calendar 訪問時にオンボーディングへリダイレクト)
-- 既存の profiles_select_own / profiles_update_own ポリシーが本人限定の読み書きを担保するため
-- 新規ポリシーは不要
alter table public.profiles
  add column onboarded_at timestamptz;
