begin;
create table if not exists public.inventory_journal_state(
 user_id uuid primary key references auth.users(id) on delete cascade,
 document jsonb not null default '{}'::jsonb check(jsonb_typeof(document)='object' and pg_column_size(document)<=512000),
 updated_at timestamptz not null default now()
);
alter table public.inventory_journal_state enable row level security;
revoke all on public.inventory_journal_state from anon,authenticated;
grant select,insert,update,delete on public.inventory_journal_state to authenticated;
create policy "gc_journal_owner_or_viewer_select" on public.inventory_journal_state for select to authenticated
 using((select auth.uid())=user_id or private.gc_is_invited(user_id));
create policy "gc_journal_owner_insert" on public.inventory_journal_state for insert to authenticated
 with check((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy "gc_journal_owner_update" on public.inventory_journal_state for update to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "gc_journal_owner_delete" on public.inventory_journal_state for delete to authenticated
 using((select auth.uid())=user_id);
create or replace function private.gc_touch_journal() returns trigger language plpgsql security invoker set search_path=''
as $$begin new.updated_at=now();return new;end;$$;
create trigger gc_journal_updated before update on public.inventory_journal_state
for each row execute function private.gc_touch_journal();
do $$begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_journal_state')
 then alter publication supabase_realtime add table public.inventory_journal_state;end if;
end$$;
commit;