begin;

create table public.notes_members (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.notes_members enable row level security;
revoke all on public.notes_members from anon, authenticated;
grant select on public.notes_members to authenticated;
create policy "Members can see their own membership" on public.notes_members
 for select to authenticated using (user_id=(select auth.uid()));

create table public.notes_updates (
 seq bigint generated always as identity primary key,
 id uuid not null unique,
 author uuid not null default auth.uid() references auth.users(id),
 payload text not null check (length(payload) between 4 and 262144 and payload ~ '^[A-Za-z0-9+/]+={0,2}$'),
 created_at timestamptz not null default now()
);
alter table public.notes_updates enable row level security;
revoke all on public.notes_updates from anon, authenticated;
grant select, insert on public.notes_updates to authenticated;
grant usage on sequence public.notes_updates_seq_seq to authenticated;
create policy "Only our members can read the page" on public.notes_updates
 for select to authenticated using (exists(select 1 from public.notes_members where user_id=(select auth.uid())));
create policy "Only our members can add their edits" on public.notes_updates
 for insert to authenticated with check (author=(select auth.uid()) and exists(select 1 from public.notes_members where user_id=(select auth.uid())));

-- This health query exposes no notes or membership and cannot modify data.
create function public.notes_health() returns boolean language sql stable set search_path='' as $$select true$$;
revoke all on function public.notes_health() from public;
grant execute on function public.notes_health() to anon, authenticated;

alter publication supabase_realtime add table public.notes_updates;

commit;
