-- S-5: the security advisor flags extension routines exposed in public.
-- Relocation preserves object OIDs and existing GiST indexes.
alter extension btree_gist set schema extensions;
