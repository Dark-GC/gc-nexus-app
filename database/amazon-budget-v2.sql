-- V2: a single, fail-closed budget for scheduled and immediate observations.
begin;
alter table private.amazon_quote_reservations drop constraint if exists amazon_quote_reservations_state_check;
alter table private.amazon_quote_reservations add constraint amazon_quote_reservations_state_check check(state in ('reserved','committed','unknown','released'));
alter table private.amazon_quote_reservations add column if not exists source text not null default 'immediate' check(source in ('immediate','daily'));
alter table private.amazon_quote_reservations add column if not exists finalized_at timestamptz;

-- The existing November daily run consumed 15 credits. Seed only if no central row exists.
insert into private.amazon_quote_budget(month,monthly_cap,committed_credits,reserved_credits)
values ('2026-11-01',500,15,0) on conflict(month) do nothing;

create or replace function private.reserve_amazon_quote_v2(p_key text,p_credits integer,p_source text,p_month date default date_trunc('month',now())::date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.amazon_quote_reservations%rowtype; allowed boolean;
begin
  if p_credits<1 or p_credits>5 or p_source not in ('immediate','daily') or p_key !~ '^[A-Za-z0-9:,_-]{8,500}$' then raise exception 'invalid reservation'; end if;
  insert into private.amazon_quote_budget(month) values(p_month) on conflict(month) do nothing;
  perform 1 from private.amazon_quote_budget where month=p_month for update;
  select * into r from private.amazon_quote_reservations where request_key=p_key for update;
  if found then return jsonb_build_object('accepted',r.state in ('reserved','committed'),'new',false,'state',r.state,'credits',r.credits); end if;
  select committed_credits+reserved_credits+p_credits<=monthly_cap into allowed from private.amazon_quote_budget where month=p_month;
  if not allowed then return jsonb_build_object('accepted',false,'new',false,'state','budget_exhausted'); end if;
  insert into private.amazon_quote_reservations(request_key,month,credits,source) values(p_key,p_month,p_credits,p_source);
  update private.amazon_quote_budget set reserved_credits=reserved_credits+p_credits,updated_at=now() where month=p_month;
  return jsonb_build_object('accepted',true,'new',true,'state','reserved','credits',p_credits);
end $$;
revoke all on function private.reserve_amazon_quote_v2(text,integer,text,date) from public,anon,authenticated;
grant execute on function private.reserve_amazon_quote_v2(text,integer,text,date) to service_role;

create or replace function private.finalize_amazon_quote_v2(p_key text,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.amazon_quote_reservations%rowtype;
begin
  if p_state not in ('committed','unknown','released') then raise exception 'invalid final state'; end if;
  select * into r from private.amazon_quote_reservations where request_key=p_key for update;
  if not found then raise exception 'reservation not found'; end if;
  if r.state<>'reserved' then return jsonb_build_object('state',r.state,'changed',false); end if;
  update private.amazon_quote_budget set reserved_credits=reserved_credits-r.credits,
    committed_credits=committed_credits+case when p_state in ('committed','unknown') then r.credits else 0 end,updated_at=now() where month=r.month;
  update private.amazon_quote_reservations set state=p_state,finalized_at=now() where request_key=p_key;
  return jsonb_build_object('state',p_state,'changed',true);
end $$;
revoke all on function private.finalize_amazon_quote_v2(text,text) from public,anon,authenticated;
grant execute on function private.finalize_amazon_quote_v2(text,text) to service_role;

create or replace function public.gc_reserve_amazon_quote(p_key text,p_credits integer,p_source text,p_month date default date_trunc('month',now())::date)
returns jsonb language sql security definer set search_path='' as $$ select private.reserve_amazon_quote_v2(p_key,p_credits,p_source,p_month) $$;
create or replace function public.gc_finalize_amazon_quote(p_key text,p_state text)
returns jsonb language sql security definer set search_path='' as $$ select private.finalize_amazon_quote_v2(p_key,p_state) $$;
revoke all on function public.gc_reserve_amazon_quote(text,integer,text,date) from public,anon,authenticated;
revoke all on function public.gc_finalize_amazon_quote(text,text) from public,anon,authenticated;
grant execute on function public.gc_reserve_amazon_quote(text,integer,text,date) to service_role;
grant execute on function public.gc_finalize_amazon_quote(text,text) to service_role;
commit;
