import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const r=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("PWA installation starts inside its service worker scope, not the root-only static path",()=>{
 const m=JSON.parse(r("data/manifest.webmanifest"));
 const app=r("data/app.html");
 const worker=r("data/sw.js");
 assert.equal(m.start_url,"/data/app.html");
 assert.equal(m.scope,"/data/");
 assert.equal(m.display,"standalone");
 assert.ok(m.icons.some(x=>x.type==="image/svg+xml"&&x.sizes==="any"));
 assert.ok(app.includes('<base href="../">'));
 assert.ok(app.includes('rel="manifest"'));
 assert.match(worker,/req.method!=="GET"/);
 assert.match(worker,/cloud-config/);
 assert.match(worker,/startsWith\("\/api\/"\)/);
 assert.ok(worker.includes("caches.match"));
});
test("Supabase configuration is a public-only key for a separate project",()=>{
 const config=JSON.parse(r("data/cloud-config.json"));
 assert.match(config.url,/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
 assert.match(config.publishableKey,/^sb_publishable_/);
 assert.doesNotMatch(JSON.stringify(config),/service_role|sb_secret_/i);
});
test("family invitations require verified email and enforce viewer read only in RLS and app",()=>{
 const schema=r("database/family-sharing.sql"),cloud=r("data/cloud.js"),app=r("app.js");
 assert.match(schema,/email_confirmed_at is not null/);
 assert.match(schema,/role='viewer'/);
 assert.match(schema,/gc_is_invited/);
 assert.match(cloud,/state\.viewer=true/);
 assert.match(cloud,/setReadOnly/);
 assert.match(cloud,/ownerId!==uid/);
 assert.match(app,/S\.readOnly/);
 assert.match(cloud,/inventory_viewers/);
});
test("journey and purchases have independent private cloud sync",()=>{
 const sql=r("database/journal-sharing.sql"),growth=r("data/growth.js"),cloud=r("data/cloud.js");
 assert.match(sql,/enable row level security/);
 assert.match(sql,/gc_journal_owner_or_viewer_select/);
 assert.match(growth,/notifyGrowth/);
 assert.match(cloud,/inventory_journal_state/);
 assert.match(cloud,/loadGrowth/);
});
test("USD to DOP conversion never assumes local shop price or actual checkout",()=>{
 const fx=r("data/fx.js"),html=r("index.html"),app=r("app.js"),sql=r("database/local-quotes.sql");
 assert.match(fx,/open\.er-api\.com\/v6\/latest\/USD/);
 assert.match(fx,/time_last_update_unix/);
 assert.match(html,/ExchangeRate-API/);
 assert.match(app,/localPriceDop/);
 assert.match(app,/purchaseCountry/);
 assert.match(app,/paidCurrency/);
 assert.match(sql,/local_price_dop/);
 assert.match(app,/gc-fx-updated/);
});

test("family buyer has a declared RPC action, not merely a reference on window",()=>{
 const client=r("data/cloud.js"),app=r("app.js");
 assert.match(client,/async function familyAction\s*\(/);
 assert.match(client,/\.rpc\("gc_family_purchase_action",args\)/);
 assert.match(client,/state\.familyRole!=="buyer"/);
 assert.match(client,/await loadRemote\(false\)/);
 assert.match(app,/window\.GCCloud\?\.familyAction/);
});

test("family purchase receipts surface as server-authored, noneditable diary entries",()=>{
 const cloud=r("data/cloud.js"),growth=r("data/growth.js");
 assert.match(cloud,/async function fetchFamilyEvents\s*\(/);
 assert.match(cloud,/await fetchFamilyEvents\(\)/);
 assert.match(growth,/function setFamilyEvents\s*\(/);
 assert.match(growth,/e\.detail\?\.actor_role!=="buyer"/);
 assert.match(growth,/e\.server\?'\s*'/);
 assert.match(growth,/st\.familyEvents/);
});
