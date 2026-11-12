-- GC GRAPHICS Inventory v2 · Supabase Postgres (independent project)
-- No shared tables with DropTik. Run only in dedicated gc-graphics-inventory project.
begin;
create table if not exists public.inventory_items (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (length(id) between 3 and 100),
 sort_order integer not null default 0,
 name text not null check (length(trim(name)) between 1 and 160),
 type text not null check (type in ('Maquinaria','Accesorio','Consumible')),
 status text not null check (status in ('Pendiente','Comprada','Revisar','Cancelada')),
 received boolean not null default false,
 brand text not null default '',
 code text not null default '',
 product_url text not null default '',
 image_url text not null default '',
 notes text not null default '',
 notion_url text not null default '',
 manual_price numeric(12,2) check (manual_price >= 0),
 manual_original_price numeric(12,2) check (manual_original_price >= 0),
 stock_qty integer check (stock_qty >= 0),
 purchase_date date,
 paid_amount numeric(12,2) check (paid_amount >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint inventory_items_pk primary key(user_id,id),
 constraint received_only_if_bought check (not received or status='Comprada')
);
create index if not exists idx_gc_items_user_status on public.inventory_items(user_id,status);
create index if not exists idx_gc_items_user_updated on public.inventory_items(user_id,updated_at desc);
create or replace function public.gc_touch_inventory_updated() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists gc_touch_inventory_updated on public.inventory_items;
create trigger gc_touch_inventory_updated before update on public.inventory_items
for each row execute function public.gc_touch_inventory_updated();

alter table public.inventory_items enable row level security;
drop policy if exists "gc_select_own" on public.inventory_items;
drop policy if exists "gc_insert_own" on public.inventory_items;
drop policy if exists "gc_update_own" on public.inventory_items;
drop policy if exists "gc_delete_own" on public.inventory_items;
create policy "gc_select_own" on public.inventory_items for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy "gc_insert_own" on public.inventory_items for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy "gc_update_own" on public.inventory_items for update to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true')
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy "gc_delete_own" on public.inventory_items for delete to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
revoke all on public.inventory_items from anon;
grant select,insert,update,delete on public.inventory_items to authenticated;

-- Event history for purchase and physical receipt changes, tamper-resistant client writer.
create table if not exists public.inventory_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid primary key default gen_random_uuid(),
 item_id text not null,
 event_type text not null check (event_type in ('purchase_confirmed','received_confirmed','purchase_reverted','edited','deleted')),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
 event_at timestamptz not null default now()
);
create index if not exists idx_gc_events_user_time on public.inventory_events(user_id,event_at desc);
alter table public.inventory_events enable row level security;
drop policy if exists "gc_events_select_own" on public.inventory_events;
drop policy if exists "gc_events_insert_own" on public.inventory_events;
create policy "gc_events_select_own" on public.inventory_events for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy "gc_events_insert_own" on public.inventory_events for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
revoke all on public.inventory_events from anon;
grant select,insert on public.inventory_events to authenticated;

-- Client realtime notifications; never expose rows to other users.
do $$begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_items') then
    alter publication supabase_realtime add table public.inventory_items;
  end if;
end$$;
commit;
