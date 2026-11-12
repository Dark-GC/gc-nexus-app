import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = p => fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("receipt decision is mandatory and has both physical states",()=>{
 const html=read("index.html"),js=read("app.js");
 assert.ok(html.includes('name="purchaseReceivedChoice" value="yes"'));
 assert.ok(html.includes('name="purchaseReceivedChoice" value="no"'));
 assert.match(js,/Selecciona si ya recibiste físicamente la compra/);
 assert.match(js,/COMPRADA · POR RECIBIR/);
 assert.ok(!js.includes('$("purchaseReceived").checked'));
});
test("cloud backend uses owner-scoped RLS and emits events",()=>{
 const ddl=read("database/schema.sql"),cloud=read("cloud.js");
 assert.match(ddl,/enable row level security/);
 assert.match(ddl,/auth\.uid\(\)/);
 assert.match(ddl,/onConflict:"user_id,id"/);
 assert.ok(!cloud.includes("service_role"));
 assert.match(cloud,/inventory_events/);
 assert.match(cloud,/postgres_changes/);
});
test("quote fetch verifies HTTPS retailer allowlist, real-time auto refresh",()=>{
 const server=read("server.js"),client=read("app.js");
 assert.match(server,/allowedProductUrl\(input\)/);
 assert.match(server,/getShopifyQuote/);
 assert.match(client,/scheduleLiveQuotes/);
 assert.match(client,/visibilitychange/);
 assert.match(client,/priceStatus/);
});
test("photo fallback data is only for exact products and app handles broken photos",()=>{
 const data=JSON.parse(read("data/verified-images.json")),client=read("app.js");
 assert.equal(Object.keys(data.items).length,4);
 assert.match(client,/productImageCandidates/);
 assert.match(client,/imageAttempt/);
 assert.match(client,/img\.addEventListener\("error"/);
});
test("cloud config does not expose a secret key",()=>{
 const config=JSON.parse(read("data/cloud-config.json"));
 assert.equal(config.url,"");
 assert.equal(config.publishableKey,"");
 assert.ok(!JSON.stringify(config).toLowerCase().includes("service_role"));
});
