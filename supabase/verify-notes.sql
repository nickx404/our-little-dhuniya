-- Temporary identities and edits are rolled back; no real accounts or notes are changed.
begin;
insert into auth.users(id,email) values
 ('fb034408-54ab-4d23-9a4e-cd11e30e53c1','notes-test-member@example.invalid'),
 ('fb034408-54ab-4d23-9a4e-cd11e30e53c2','notes-test-outsider@example.invalid');
insert into public.notes_members(user_id) values('fb034408-54ab-4d23-9a4e-cd11e30e53c1');
set local role authenticated;
select set_config('request.jwt.claim.sub','fb034408-54ab-4d23-9a4e-cd11e30e53c1',true);
insert into public.notes_updates(id,payload) values('fb034408-54ab-4d23-9a4e-cd11e30e53c3','AAA=');
do $$begin
 if not exists(select 1 from public.notes_updates where id='fb034408-54ab-4d23-9a4e-cd11e30e53c3') then raise exception 'Member read failed';end if;
end$$;
select set_config('request.jwt.claim.sub','fb034408-54ab-4d23-9a4e-cd11e30e53c2',true);
do $$begin
 if exists(select 1 from public.notes_updates) then raise exception 'Nonmember could read notes';end if;
 begin
  insert into public.notes_updates(id,payload) values('fb034408-54ab-4d23-9a4e-cd11e30e53c4','AAA=');
  raise exception 'Nonmember could write notes';
 exception when insufficient_privilege then null;
 end;
end$$;
reset role;
rollback;
select 'Private access checks passed; temporary data rolled back.' as result;
