import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=new URL("../",import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),"utf8");
test("catálogo verificado: 14, 4 compradas y recibidas, 10 pendientes",()=>{
  const data=JSON.parse(read("data/items.json"));
  assert.equal(data.items.length,14);
  assert.equal(data.items.filter(p=>p.status==="Comprada"&&p.received).length,4);
  assert.equal(data.items.filter(p=>p.status==="Pendiente").length,10);
});
test("falcon 5w descartada, 10w comprada y recibida",()=>{
  const items=JSON.parse(read("data/items.json")).items;
  assert.ok(!items.some(x=>/Falcon\s*5W/i.test(x.name)));
  const ten=items.find(x=>/Falcon\s*10W/i.test(x.name));
  assert.ok(ten&&ten.status==="Comprada"&&ten.received);
});
test("todos los productos tienen enlace y código único",()=>{
  const items=JSON.parse(read("data/items.json")).items;
  assert.equal(new Set(items.map(x=>x.id)).size,items.length);
  assert.ok(items.every(x=>/^https:\/\//.test(x.url)&&x.name&&x.type));
  assert.equal(new Set(items.filter(x=>x.code).map(x=>x.code)).size,items.filter(x=>x.code).length);
});
test("VEVOR actualizado (enlace nuevo), nunca el viejo",()=>{
  const data=read("data/items.json");
  assert.match(data,/p_010610190808/);
  assert.doesNotMatch(data,/0[6]nrkbv7/i);
});
test("html enlaza archivos y formularios de compra",()=>{
  const html=read("index.html");
  for(const name of ['id="productGrid"','id="itemForm"','id="confirmDecision"','id="purchaseReceived"','id="importFile"','src="./app.js"'])assert.ok(html.includes(name),name);
});
test("precios sin inventar en caché inicial",()=>{
  const data=JSON.parse(read("data/price-cache.json"));
  assert.equal(data.schemaVersion,1);
  for(const obj of Object.values(data.items))assert.ok(obj.priceStatus!=="estimated");
});
test("proveedores con allowlist, sin claves expuestas",()=>{
  const text=read("scripts/refresh-prices.mjs");
  assert.ok(text.includes("allowed = new Set"));
  assert.ok(text.includes('provider==="amazon"'));
  assert.ok(text.includes("precio y stock requieren API autorizada"));
});
