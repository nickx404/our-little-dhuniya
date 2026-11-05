-- Run only after the final frozen export is restored and checked on Oracle.
-- The legacy rows remain recoverable by the database owner.
begin;
revoke all on public.notes_updates from anon, authenticated;
revoke all on sequence public.notes_updates_seq_seq from anon, authenticated;
commit;
