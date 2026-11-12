import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const catalog=JSON.parse(read("data/items.json")).items;
const amazon=JSON.parse(read("data/amazon-snapshot.json"));
const promotion=JSON.parse(read("data/verified-promotions.json"));
const images=JSON.parse(read("data/verified-images.json"));

test("exact-ASIN snapshots cover eleven catalog items with no guessed stock",()=>{
  assert.equal(catalog.length,14);
  assert.equal(Object.keys(amazon.items).length,11);
  assert.equal(Object.values(amazon.items).filter(x=>x.priceStatus==="verified").length,10);
  for(const [id,data] of Object.entries(amazon.items)){
    const item=catalog.find(p=>p.id===id);
    assert.ok(item,id);
    assert.equal(data.sourceUrl,item.url,id);
    assert.ok(/^B[A-Z0-9]{9}$/.test(data.asin),id);
    assert.ok(data.price===null||(Number.isFinite(data.price)&&data.price>0),id);
    assert.equal(data.stockQuantity,null);
    assert.ok(data.originalPrice===null||data.originalPrice>data.price,id);
  }
});
test("precise promos are tied to real source and expiry; no eternal offers",()=>{
  const src=read("app.js");
  assert.match(src,/48\*3600000/);
  assert.match(src,/promo\.validUntil/);
  assert.match(src,/observedPrice/);
  assert.match(src,/deal-flag/);
  assert.match(src,/originalPrice/);
  const p=catalog.find(x=>x.id==="gc-vevor"),pr=promotion.items["gc-vevor"];
  assert.equal(pr.sourceUrl,p.url);
  assert.ok(pr.originalPrice>pr.observedPrice);
  assert.ok(new Date(pr.validUntil)>new Date(promotion.checkedAt));
});
test("live vendor promo parser only accepts labeled original price from same VEVOR product",async()=>{
  process.env.GC_NO_LISTEN="1";
  const {vevorListPrice}=await import("../server.js");
  assert.equal(vevorListPrice('<div class="DM_dp-marketPrice js-currency" data-currency="339.9">$339.90</div>',254.93),339.9);
  assert.equal(vevorListPrice('<div class="DM_dp-marketPrice" data-currency="199">199</div>',254.93),null);
  assert.equal(vevorListPrice('<span>339.9</span>',254.93),null);
});
test("source photos and fallback are traceable and never generic substitutes",()=>{
  assert.equal(Object.keys(images.items).length,11);
  for(const [id,p] of Object.entries(images.items)){
    assert.ok(catalog.some(x=>x.id===id));
    assert.ok(p.model&&p.source&&p.url.startsWith("https://"));
  }
  const script=read("app.js");
  assert.match(script,/brokenImages\.add/);
  assert.match(script,/S\.verifiedImages/);
});
test("mobile bottom nav, visible offers, backup and touch-safe fields",()=>{
  const html=read("index.html"),css=read("styles.css"),script=read("app.js");
  for(const fragment of ['class="mobile-nav"','data-view="deals"','id="mobileImport"','name="manualOriginalPrice"'])
    assert.ok(html.includes(fragment),fragment);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/env\(safe-area-inset-bottom/);
  assert.match(css,/position:fixed/);
  assert.match(script,/S\.view==="deals"/);
  assert.match(script,/navDeals/);
  assert.match(script,/mobileImport/);
});
