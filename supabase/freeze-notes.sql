-- First freeze the legacy writers, then export the final ordered updates.
begin;
revoke insert on public.notes_updates from anon, authenticated;
commit;
