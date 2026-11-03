create schema if not exists notes_private;
revoke all on schema notes_private from public, anon, authenticated;
create table notes_private.access (
 singleton boolean primary key default true check(singleton),
 invite_hash text not null check(length(invite_hash)=64)
);
revoke all on notes_private.access from public, anon, authenticated;

create function public.join_notes(invite text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or length(invite)<>43 or not exists(
  select 1 from notes_private.access
  where invite_hash=encode(sha256(convert_to(invite,'UTF8')),'hex')
 ) then raise exception 'This private link is not valid.' using errcode='42501';end if;
 insert into public.notes_members(user_id) values(auth.uid()) on conflict do nothing;
 return true;
end;
$$;
revoke all on function public.join_notes(text) from public, anon;
grant execute on function public.join_notes(text) to authenticated;
