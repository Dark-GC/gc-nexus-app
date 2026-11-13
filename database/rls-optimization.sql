begin;
drop policy if exists "gc_insert_own" on public.inventory_items;
drop policy if exists "gc_update_own" on public.inventory_items;
drop policy if exists "gc_delete_own" on public.inventory_items;
create policy "gc_insert_own" on public.inventory_items for insert to authenticated
 with check ((select auth.uid())=user_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
create policy "gc_update_own" on public.inventory_items for update to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "gc_delete_own" on public.inventory_items for delete to authenticated
 using ((select auth.uid())=user_id);

drop policy if exists "gc_events_insert_own" on public.inventory_events;
create policy "gc_events_insert_own" on public.inventory_events for insert to authenticated
 with check ((select auth.uid())=user_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

drop policy if exists "gc_invite_owner_insert" on public.inventory_viewers;
create policy "gc_invite_owner_insert" on public.inventory_viewers for insert to authenticated
 with check ((select auth.uid())=owner_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

drop policy if exists "gc_journal_owner_insert" on public.inventory_journal_state;
create policy "gc_journal_owner_insert" on public.inventory_journal_state for insert to authenticated
 with check ((select auth.uid())=user_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
commit;