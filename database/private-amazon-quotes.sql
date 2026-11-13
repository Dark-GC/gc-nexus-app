-- Private, server-only quotes for immediately added Amazon products.
begin;
create table if not exists private.amazon_quote_budget(
  month date primary key check (month=date_trunc('month',month)::date), monthly_cap integer not null default 500 check(monthly_cap between 1 and 500),
  committed_credits integer not null default 0 check(committed_credits>=0), reserved_credits integer not null default 0 check(reserved_credits>=0), updated_at timestamptz not null default now()
);
create table if not exists private.amazon_quote_requests(
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, item_id text not null check(length(item_id) between 3 and 100),
  asin text not null check(asin ~ '^[A-Z0-9]{10}$'), product_url text not null, request_key text not null unique, status text not null check(status in ('queued','running','succeeded','failed','blocked')),
  error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists private.amazon_quote_history(
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, item_id text not null, asin text not null check(asin ~ '^[A-Z0-9]{10}$'),
  price numeric(12,2), currency text, stock_status text not null default 'unknown', seller text, product_url text not null, observed_url text not null,
  source_method text not null, observed_at timestamptz not null, verification_status text not null check(verification_status in ('verified','unavailable','failed')), created_at timestamptz not null default now()
);
create table if not exists private.amazon_quote_reservations(
  request_key text primary key, month date not null references private.amazon_quote_budget(month) on delete cascade,
  credits integer not null check(credits between 1 and 5), state text not null default 'reserved' check(state in ('reserved','committed','released')),
  created_at timestamptz not null default now()
);
create index if not exists amazon_quote_history_owner_item_time on private.amazon_quote_history(owner_id,item_id,observed_at desc);
alter table private.amazon_quote_budget enable row level security;
alter table private.amazon_quote_requests enable row level security;
alter table private.amazon_quote_history enable row level security;
alter table private.amazon_quote_reservations enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
-- The API and scheduled workflow use service_role only. No browser grants exist.
create or replace function private.reserve_amazon_quote(p_key text,p_credits integer,p_month date default date_trunc('month',now())::date)
returns boolean language plpgsql security definer set search_path='' as $$
declare inserted boolean;
begin
  if p_credits<1 or p_credits>5 or p_key !~ '^[A-Za-z0-9:,_-]{8,500}$' then raise exception 'invalid reservation'; end if;
  insert into private.amazon_quote_budget(month) values(p_month) on conflict(month) do nothing;
  perform 1 from private.amazon_quote_budget where month=p_month for update;
  if exists(select 1 from private.amazon_quote_reservations where request_key=p_key) then return true; end if;
  select committed_credits+reserved_credits+p_credits<=monthly_cap into inserted from private.amazon_quote_budget where month=p_month;
  if not inserted then return false; end if;
  insert into private.amazon_quote_reservations(request_key,month,credits) values(p_key,p_month,p_credits);
  update private.amazon_quote_budget set reserved_credits=reserved_credits+p_credits,updated_at=now() where month=p_month;
  return true;
end $$;
revoke all on function private.reserve_amazon_quote(text,integer,date) from public, anon, authenticated;
grant execute on function private.reserve_amazon_quote(text,integer,date) to service_role;
create or replace function private.finish_amazon_quote_reservation(p_key text,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r private.amazon_quote_reservations%rowtype;
begin
  select * into r from private.amazon_quote_reservations where request_key=p_key for update;
  if not found or r.state<>'reserved' then return; end if;
  update private.amazon_quote_budget set reserved_credits=reserved_credits-r.credits,
    committed_credits=committed_credits+case when p_success then r.credits else 0 end,updated_at=now() where month=r.month;
  update private.amazon_quote_reservations set state=case when p_success then 'committed' else 'released' end where request_key=p_key;
end $$;
revoke all on function private.finish_amazon_quote_reservation(text,boolean) from public, anon, authenticated;
grant execute on function private.finish_amazon_quote_reservation(text,boolean) to service_role;
create or replace function public.gc_record_private_amazon_quote(p_owner_id uuid,p_item_id text,p_asin text,p_price numeric,p_currency text,p_stock_status text,p_seller text,p_product_url text,p_observed_url text,p_observed_at timestamptz,p_verification_status text,p_request_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private.amazon_quote_requests(owner_id,item_id,asin,product_url,request_key,status)
    values(p_owner_id,p_item_id,p_asin,p_product_url,p_request_key,'succeeded')
    on conflict(request_key) do update set status='succeeded',updated_at=now(),error_code=null;
  insert into private.amazon_quote_history(owner_id,item_id,asin,price,currency,stock_status,seller,product_url,observed_url,source_method,observed_at,verification_status)
    values(p_owner_id,p_item_id,p_asin,p_price,p_currency,p_stock_status,p_seller,p_product_url,p_observed_url,'firecrawl-alexandria',p_observed_at,p_verification_status);
end $$;
revoke all on function public.gc_record_private_amazon_quote(uuid,text,text,numeric,text,text,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.gc_record_private_amazon_quote(uuid,text,text,numeric,text,text,text,text,text,timestamptz,text,text) to service_role;
commit;
