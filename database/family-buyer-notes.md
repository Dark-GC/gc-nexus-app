-- GC GRAPHICS · Family buyer role: write privileges restricted to buying and receiving.
-- Migrated on dedicated GC GRAPHICS Supabase project.
-- Authorized buyer: verified email invitation role='buyer'.
-- private.gc_family_purchase_action: security-definer action with owner+item checks.
-- public.gc_family_purchase_action: invoker-only RPC facade.
-- All other inventory fields and journal remain owner-managed.
Details: migration `family_buyer_purchase_receipt_permissions` applied to project `wldbhuvlmrzfltbhmqvl`. RPC arguments: `p_owner_id`, `p_item_id`, `p_action` = buy | receive, optional `p_purchase_date`, `p_paid_amount`, `p_paid_currency`, `p_purchase_country`, `p_received`.

RLS continues to prevent invited buyers from issuing direct UPDATE, INSERT or DELETE on inventory records; RPC changes purchase and receipt fields only, logging atomic events.
