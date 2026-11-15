-- Reuse an already paid Amazon observation for another private item with the
-- same owner and ASIN.  This creates an item-scoped history row but never a
-- reservation and therefore cannot consume additional Firecrawl credits.
begin;

create or replace function public.gc_reuse_private_amazon_quote(
  p_owner_id uuid,
  p_item_id text,
  p_asin text,
  p_product_url text
)
returns table(
  asin text,
  price numeric,
  currency text,
  stock_status text,
  seller text,
  product_url text,
  observed_url text,
  observed_at timestamptz,
  verification_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached private.amazon_quote_history%rowtype;
begin
  if p_owner_id is null or p_item_id !~ '^gc-[A-Za-z0-9-]{3,100}$'
     or p_asin !~ '^[A-Z0-9]{10}$' or p_product_url !~ '^https://'
  then
    raise exception 'invalid private Amazon quote cache request';
  end if;

  select * into cached
  from private.amazon_quote_history h
  where h.owner_id = p_owner_id and h.asin = p_asin
  order by h.observed_at desc, h.created_at desc
  limit 1;

  if not found then return; end if;

  insert into private.amazon_quote_history(
    owner_id,item_id,asin,price,currency,stock_status,seller,product_url,
    observed_url,source_method,observed_at,verification_status
  ) values (
    p_owner_id,p_item_id,cached.asin,cached.price,cached.currency,
    cached.stock_status,cached.seller,p_product_url,cached.observed_url,
    'firecrawl-alexandria-cache',cached.observed_at,cached.verification_status
  );

  return query select cached.asin,cached.price,cached.currency,cached.stock_status,
    cached.seller,p_product_url,cached.observed_url,cached.observed_at,
    cached.verification_status;
end;
$$;

revoke all on function public.gc_reuse_private_amazon_quote(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gc_reuse_private_amazon_quote(uuid,text,text,text) to service_role;
commit;
