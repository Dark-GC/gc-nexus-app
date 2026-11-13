-- GC GRAPHICS · ORIGEN · Additive SQL for dedicated Supabase project ONLY.
-- NOT YET DEPLOYED: does not create a project or bypass Auth.
-- Apply database/schema.sql FIRST once a new independent project is approved.
begin;

create table if not exists public.growth_entries (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (char_length(id) between 3 and 90),
 entry_date date not null,
 category text not null check (category in ('Nota','Decisión','Compra','Recepción','Prueba','Aprendizaje','Hito')),
 title text not null check (char_length(trim(title)) between 1 and 150),
 description text not null default '' check (char_length(description)<=2400),
 item_id text not null default '' check (char_length(item_id)<=90),
 origin text not null default 'manual' check (origin in ('manual','inventory')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,id)
);
create index if not exists gc_growth_entries_user_date
 on public.growth_entries(user_id,entry_date desc,created_at desc);

create table if not exists public.growth_milestones (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (char_length(id) between 3 and 90),
 phase text not null default '' check (char_length(phase)<=80),
 title text not null check (char_length(trim(title)) between 1 and 170),
 description text not null default '' check (char_length(description)<=900),
 sort_order integer not null default 0,
 completed_at timestamptz,
 is_custom boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,id)
);
create index if not exists gc_growth_milestones_order
 on public.growth_milestones(user_id,sort_order);

alter table public.growth_entries enable row level security;
alter table public.growth_milestones enable row level security;
revoke all on public.growth_entries from anon,authenticated;
revoke all on public.growth_milestones from anon,authenticated;
grant select,insert,update,delete on public.growth_entries to authenticated;
grant select,insert,update,delete on public.growth_milestones to authenticated;

drop policy if exists growth_entries_read_own on public.growth_entries;
drop policy if exists growth_entries_insert_own on public.growth_entries;
drop policy if exists growth_entries_update_own on public.growth_entries;
drop policy if exists growth_entries_delete_own on public.growth_entries;
create policy growth_entries_read_own on public.growth_entries for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy growth_entries_insert_own on public.growth_entries for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy growth_entries_update_own on public.growth_entries for update to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true')
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy growth_entries_delete_own on public.growth_entries for delete to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');

drop policy if exists growth_milestones_read_own on public.growth_milestones;
drop policy if exists growth_milestones_insert_own on public.growth_milestones;
drop policy if exists growth_milestones_update_own on public.growth_milestones;
drop policy if exists growth_milestones_delete_own on public.growth_milestones;
create policy growth_milestones_read_own on public.growth_milestones for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy growth_milestones_insert_own on public.growth_milestones for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy growth_milestones_update_own on public.growth_milestones for update to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true')
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy growth_milestones_delete_own on public.growth_milestones for delete to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');

-- Do not add these tables to Realtime until needed; polling/on-demand fetch is simpler for a private journal.
commit;
