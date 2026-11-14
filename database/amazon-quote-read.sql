begin;
create or replace function public.gc_get_private_amazon_quote(p_owner_id uuid,p_item_id text)
returns table(asin text,price numeric,currency text,stock_status text,seller text,product_url text,observed_url text,observed_at timestamptz,verification_status text)
language sql security definer set search_path='' as $$
  select h.asin,h.price,h.currency,h.stock_status,h.seller,h.product_url,h.observed_url,h.observed_at,h.verification_status
  from private.amazon_quote_history h where h.owner_id=p_owner_id and h.item_id=p_item_id order by h.observed_at desc limit 1
$$;
revoke all on function public.gc_get_private_amazon_quote(uuid,text) from public,anon,authenticated;
grant execute on function public.gc_get_private_amazon_quote(uuid,text) to service_role;
commit;
