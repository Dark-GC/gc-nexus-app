-- GC GRAPHICS ORIGEN: atomic event history for owner-written items.
-- Safe additive migration: never modifies existing records or backfills events.
-- Both the item mutation and audit INSERT happen in one Postgres transaction.
-- Family buyer RPC logs its own events and is intentionally excluded.
begin;
create or replace function public.gc_owner_event_from_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if (select auth.uid()) = old.user_id then
      insert into public.inventory_events(user_id,item_id,event_type,detail)
      values(old.user_id,old.id,'deleted',
        jsonb_build_object('actor_role','owner'));
    end if;
    return old;
  end if;

  -- Family buyers have a separate atomically audited purchase RPC. Never
  -- duplicate the buyer's events from this owner-only trigger.
  if (select auth.uid()) is distinct from new.user_id then
    return new;
  end if;

  if new.status='Comprada' and
     (tg_op='INSERT' or old.status is distinct from 'Comprada') then
    insert into public.inventory_events(user_id,item_id,event_type,detail)
    values(new.user_id,new.id,'purchase_confirmed',
      jsonb_build_object(
        'actor_role','owner',
        'purchase_date',new.purchase_date,
        'paid_amount',new.paid_amount,
        'paid_currency',new.paid_currency,
        'purchase_country',new.purchase_country));
  end if;

  if new.received and
     (tg_op='INSERT' or old.received is distinct from true) then
    insert into public.inventory_events(user_id,item_id,event_type,detail)
    values(new.user_id,new.id,'received_confirmed',
      jsonb_build_object('actor_role','owner'));
  end if;

  if tg_op='UPDATE' and
     old.status='Comprada' and new.status is distinct from 'Comprada' then
    insert into public.inventory_events(user_id,item_id,event_type,detail)
    values(new.user_id,new.id,'purchase_reverted',
      jsonb_build_object('actor_role','owner'));
  end if;

  return new;
end;
$$;

drop trigger if exists gc_owner_item_atomic_audit on public.inventory_items;
create trigger gc_owner_item_atomic_audit
after insert or update or delete on public.inventory_items
for each row execute function public.gc_owner_event_from_item();
commit;
