import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("invited mother can buy and later confirm physical arrival, not edit inventory",()=>{
  const script=read("app.js");
  assert.match(script,/familyBuyer/);
  assert.match(script,/Ya lo compré/);
  assert.match(script,/Ya llegó/);
  assert.match(script,/S\.readOnly&&!familyCanMark/);
  assert.match(script,/S\.readOnly&&mode!=="info"&&!\(S\.familyBuyer/);
  assert.match(script,/window\.GCCloud\.familyAction\(d\.mode,details\)/);
  assert.match(script,/S\.readOnly\)\s*{/);
  assert.match(script,/localDay\(\)/);
  assert.match(script,/p\.paidCurrency=/);
});

test("verified-email owner invite exposes buyer and viewer roles separately",()=>{
 const html=read("index.html"),client=read("data/cloud.js");
 assert.match(html,/<select id="viewerRole"/);
 assert.match(html,/value="buyer" selected/);
 assert.match(html,/value="viewer"/);
 assert.match(client,/select\("viewer_email,role"\)/);
 assert.match(client,/role==="buyer"/);
 assert.match(client,/state\.familyRole=invited\.role/);
 assert.match(client,/setReadOnly\?\.\(state\.viewer,state\.familyRole==="buyer"\)/);
 assert.match(client,/window\.GCCloud=\{notify,notifyGrowth,familyAction/);
});

test("family action is a real authenticated RPC, never an unrestricted update",()=>{
 const client=read("data/cloud.js");
 const ddl=read("database/family-buyer.sql");
 assert.match(client,/async function familyAction\(/);
 assert.match(client,/\.rpc\("gc_family_purchase_action",args\)/);
 assert.match(client,/p_owner_id:state\.ownerId/);
 assert.match(client,/p_item_id:details\.id/);
 assert.match(client,/p_action:mode/);
 assert.match(ddl,/SECURITY DEFINER/);
 assert.match(ddl,/security invoker/i);
 assert.match(ddl,/viewer_email=v_email/);
 assert.match(ddl,/v\.role='buyer'/);
 assert.match(ddl,/email_confirmed_at is not null/);
 assert.match(ddl,/ARTICLE_NOT_PENDING/);
 assert.match(ddl,/ARTICLE_NOT_AWAITING_RECEIPT/);
 assert.match(ddl,/received_confirmed/);
 assert.match(ddl,/revoke all on function public\.gc_family_purchase_action[^;]+from public,anon/);
 assert.match(ddl,/grant execute on function public\.gc_family_purchase_action[^;]+to authenticated/);
});

test("both app views and family diary preserve purchase and receipt controls",()=>{
 const root=read("index.html"),pwa=read("data/app.html");
 const cloud=read("data/cloud.js"),journal=read("data/growth.js");
 assert.match(root,/id="purchasedDate"/);
 assert.match(root,/id="viewerRole"/);
 assert.match(pwa,/id="viewerRole"/);
 assert.match(pwa,/id="purchaseExtra"/);
 assert.match(cloud,/fetchFamilyEvents\(/);
 assert.match(journal,/function setFamilyEvents\(/);
 assert.match(journal,/familyEvents/);
 assert.match(journal,/server:true/);
});
