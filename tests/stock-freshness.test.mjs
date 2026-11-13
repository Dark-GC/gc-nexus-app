import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("  function stockFeedFresh(f, now=Date.now())");
const end=source.indexOf("  function productImageCandidates(p)",start);
assert.ok(start>0&&end>start,"Expected actual stock helper implementation");
const fragment=source.slice(start,end);
const context=vm.createContext({feedOf:product=>product.feed});
vm.runInContext(fragment+"\nthis.stockQA={fresh:stockFeedFresh,stock:productStock};",context);
const {fresh,stock}=context.stockQA;
const now=Date.now(),observed=offset=>new Date(now-offset).toISOString();

test("Amazon snapshot never qualifies as live inventory evidence, even when captured now",()=>{
  assert.equal(fresh({provider:"amazon-snapshot",checkedAt:observed(0),stockStatus:"in_stock"},now),false);
  const item={feed:{provider:"amazon-snapshot",checkedAt:observed(0),stockStatus:"out_of_stock"},stockQty:null};
  assert.equal(stock(item).kind,"unknown");
  assert.match(stock(item).text,/stock no confirmado/);
});

test("merchant availability is allowed only within a 24-hour freshness window",()=>{
  const checked=observed(60*60*1000);
  assert.equal(fresh({provider:"official",checkedAt:checked},now),true);
  const freshItem={feed:{provider:"official",checkedAt:checked,stockStatus:"in_stock",stockQuantity:3},stockQty:null};
  assert.match(stock(freshItem).text,/3 unid/);
  const staleItem={feed:{provider:"official",checkedAt:observed(25*60*60*1000),stockStatus:"out_of_stock"},stockQty:null};
  assert.equal(stock(staleItem).kind,"unknown");
  assert.match(stock(staleItem).text,/consulta antigua/);
});

test("untrusted future timestamps and missing timestamps do not claim stock",()=>{
  assert.equal(fresh({provider:"official",checkedAt:new Date(now+3600000).toISOString()},now),false);
  assert.equal(fresh({provider:"official"},now),false);
  assert.equal(fresh({provider:"official",checkedAt:"not a date"},now),false);
});

test("user-entered quantities remain distinct from unverifiable vendor stock",()=>{
  const item={feed:{provider:"amazon-snapshot",checkedAt:observed(0),stockStatus:"in_stock"},stockQty:7};
  assert.match(stock(item).text,/indicadas manualmente/);
  assert.equal(stock({...item,stockQty:0}).kind,"out");
});
