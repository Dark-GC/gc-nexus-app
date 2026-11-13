-- GC GRAPHICS private family buyer migration: apply after family-sharing.sql.

begin;

alter table public.inventory_viewers drop constraint if exists inventory_viewers_role_check;

alter table public.inventory_viewers add constraint inventory_viewers_role_check check(role in ('viewer','buyer'));

CREATE OR REPLACE FUNCTION private.gc_is_invited(p_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (select auth.uid()) is not null
 and ((select auth.jwt())->>'is_anonymous') is distinct from 'true'
 and exists(
  select 1 from public.inventory_viewers v
  join auth.users u on u.id=(select auth.uid())
  where v.owner_id=p_owner_id
    and v.viewer_email=lower(u.email)
    and u.email_confirmed_at is not null
    and v.role in ('viewer','buyer')
 );
$function$
;

revoke all on function private.gc_is_invited(uuid) from public,anon;

grant execute on function private.gc_is_invited(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.gc_family_purchase_action(p_owner_id uuid, p_item_id text, p_action text, p_purchase_date date DEFAULT NULL::date, p_paid_amount numeric DEFAULT NULL::numeric, p_paid_currency text DEFAULT 'USD'::text, p_purchase_country text DEFAULT NULL::text, p_received boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=(select auth.uid());
 v_email text;
 v_allowed boolean:=false;
 v_item public.inventory_items%rowtype;
 v_event text;
begin
 if v_actor is null or ((select auth.jwt())->>'is_anonymous')='true' then
   raise exception 'AUTH_REQUIRED' using errcode='42501';
 end if;
 if p_owner_id is null or p_item_id is null or length(trim(p_item_id))<3 or p_action not in ('buy','receive') then
   raise exception 'INVALID_REQUEST' using errcode='22023';
 end if;
 select lower(email) into v_email from auth.users
   where id=v_actor and email_confirmed_at is not null;
 if v_email is null then raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode='42501'; end if;
 select exists(
   select 1 from public.inventory_viewers v
   where v.owner_id=p_owner_id and v.viewer_email=v_email and v.role='buyer'
 ) into v_allowed;
 if not v_allowed then raise exception 'BUYER_PERMISSION_REQUIRED' using errcode='42501'; end if;
 select * into v_item from public.inventory_items
  where user_id=p_owner_id and id=p_item_id for update;
 if not found then raise exception 'ARTICLE_NOT_FOUND' using errcode='P0002'; end if;

 if p_action='buy' then
   if v_item.status not in ('Pendiente','Revisar') then
     raise exception 'ARTICLE_NOT_PENDING' using errcode='22023';
   end if;
   if p_paid_currency not in ('USD','DOP')
      or (p_paid_amount is not null and (p_paid_amount<0 or p_paid_amount>=10000000000))
      or (p_purchase_country is not null and p_purchase_country not in ('US','DO'))
      or (p_purchase_date is not null and p_purchase_date>current_date+1) then
     raise exception 'INVALID_PURCHASE_DETAILS' using errcode='22023';
   end if;
   update public.inventory_items
      set status='Comprada',received=coalesce(p_received,false),
          purchase_date=coalesce(p_purchase_date,current_date),
          paid_amount=p_paid_amount,paid_currency=p_paid_currency,
          purchase_country=p_purchase_country
    where user_id=p_owner_id and id=p_item_id returning * into v_item;
   insert into public.inventory_events(user_id,item_id,event_type,detail)
   values(p_owner_id,p_item_id,'purchase_confirmed',
      pg_catalog.jsonb_build_object('actor_user_id',v_actor,'actor_role','buyer',
        'paid_amount',v_item.paid_amount,'paid_currency',v_item.paid_currency,
        'purchase_date',v_item.purchase_date,'purchase_country',v_item.purchase_country,
        'received',v_item.received));
   if v_item.received then
      insert into public.inventory_events(user_id,item_id,event_type,detail)
      values(p_owner_id,p_item_id,'received_confirmed',
        pg_catalog.jsonb_build_object('actor_user_id',v_actor,'actor_role','buyer','confirmed_with_purchase',true));
   end if;
 else
   if v_item.status<>'Comprada' or v_item.received then
     raise exception 'ARTICLE_NOT_AWAITING_RECEIPT' using errcode='22023';
   end if;
   update public.inventory_items set received=true
     where user_id=p_owner_id and id=p_item_id returning * into v_item;
   insert into public.inventory_events(user_id,item_id,event_type,detail)
   values(p_owner_id,p_item_id,'received_confirmed',
      pg_catalog.jsonb_build_object('actor_user_id',v_actor,'actor_role','buyer'));
 end if;
 return pg_catalog.jsonb_build_object('id',v_item.id,'status',v_item.status,
   'received',v_item.received,'updated_at',v_item.updated_at);
end;
$function$
;

revoke all on function private.gc_family_purchase_action(uuid,text,text,date,numeric,text,text,boolean) from public,anon;

grant execute on function private.gc_family_purchase_action(uuid,text,text,date,numeric,text,text,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.gc_family_purchase_action(p_owner_id uuid, p_item_id text, p_action text, p_purchase_date date DEFAULT NULL::date, p_paid_amount numeric DEFAULT NULL::numeric, p_paid_currency text DEFAULT 'USD'::text, p_purchase_country text DEFAULT NULL::text, p_received boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.gc_family_purchase_action(p_owner_id,p_item_id,p_action,p_purchase_date,
    p_paid_amount,p_paid_currency,p_purchase_country,p_received);
$function$
;

revoke all on function public.gc_family_purchase_action(uuid,text,text,date,numeric,text,text,boolean) from public,anon;

grant execute on function public.gc_family_purchase_action(uuid,text,text,date,numeric,text,text,boolean) to authenticated;

commit;
