-- The owner approved publicly readable/editable notes. Existing text is retained.
begin;
alter table public.notes_updates alter column author drop not null;
grant select, insert on public.notes_updates to anon;
grant usage on sequence public.notes_updates_seq_seq to anon;
create policy "Visitors can read the shared page" on public.notes_updates
 for select to anon, authenticated using (true);
create policy "Visitors can append their edits" on public.notes_updates
 for insert to anon, authenticated with check (author is null or author=(select auth.uid()));
commit;
