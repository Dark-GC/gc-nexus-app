-- GC GRAPHICS shared family inventory: private read-only invitations (verified email required).
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.inventory_viewers (
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewer_email text not null check (viewer_email=lower(trim(viewer_email)) and viewer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(viewer_email)<=254),
  label text not null default '' check (length(label)<=80),
  role text not null default 'viewer' check (role='viewer'),
  created_at timestamptz not null default now(),
  primary key (owner_id,viewer_email)
);
alter table public.inventory_viewers enable row level security;
revoke all on public.inventory_viewers from anon, authenticated;
grant select,insert,update,delete on public.inventory_viewers to authenticated;

create or replace function private.gc_is_invited(p_owner_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null
    and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
    and exists (
      select 1
      from public.inventory_viewers v
      join auth.users u on u.id=(select auth.uid())
      where v.owner_id=p_owner_id
        and v.viewer_email=lower(u.email)
        and u.email_confirmed_at is not null
        and v.role='viewer'
    );
$$;
revoke all on function private.gc_is_invited(uuid) from public, anon;
grant execute on function private.gc_is_invited(uuid) to authenticated;

create policy "gc_invite_owner_read" on public.inventory_viewers for select to authenticated
 using ((select auth.uid())=owner_id or private.gc_is_invited(owner_id));
create policy "gc_invite_owner_insert" on public.inventory_viewers for insert to authenticated
 with check ((select auth.uid())=owner_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy "gc_invite_owner_update" on public.inventory_viewers for update to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy "gc_invite_owner_delete" on public.inventory_viewers for delete to authenticated
 using ((select auth.uid())=owner_id);

drop policy if exists "gc_select_own" on public.inventory_items;
create policy "gc_select_owner_or_family" on public.inventory_items for select to authenticated
 using ((select auth.uid())=user_id or private.gc_is_invited(user_id));

drop policy if exists "gc_events_select_own" on public.inventory_events;
create policy "gc_events_select_owner_or_family" on public.inventory_events for select to authenticated
 using ((select auth.uid())=user_id or private.gc_is_invited(user_id));

alter table public.inventory_items
 add column if not exists manual_original_price numeric(12,2) check(manual_original_price>=0),
 add column if not exists paid_currency text not null default 'USD' check(paid_currency in ('USD','DOP')),
 add column if not exists purchase_country text check(purchase_country in ('US','DO'));

-- Avoid accidentally transferring the record to a viewer: the existing insert/update RLS stays owner-only.
commit;