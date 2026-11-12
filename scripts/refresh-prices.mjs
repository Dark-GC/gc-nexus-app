/**
 * GC GRAPHICS Inventory — capturas verificables de catálogos públicos
 * Node 22+, sin dependencias externas ni API secreta.
 * No se inventan precios/stock y no se eluden bloqueos de proveedores.
 * Amazon: consulta de precios requiere proveedor/API autorizada; no se raspa.
 */
import fs from "node:fs/promises";
import {URL} from "node:url";

const ROOT = new URL("../", import.meta.url);
const file = path => new URL(path, ROOT);
const data = JSON.parse(await fs.readFile(file("data/items.json"), "utf8"));
const old = await fs.readFile(file("data/price-cache.json"), "utf8").then(JSON.parse).catch(()=>({items:{}}));
const checked = new Date().toISOString();
const feed = {schemaVersion:1,generatedAt:checked,items:{},notes:"Capturas de páginas públicas; fecha de revisión, sin garantía de datos en caja. Los artículos Amazon requieren una API autorizada para precio/stock."};
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

function validHttp(value) {
  try {const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:" ? u : null;} catch {return null;}
}
function providerOf(address) {
  const u = validHttp(address);
  if (!u) return "unknown";
  const h = u.hostname.toLowerCase();
  if (h === "a.co" || h.endsWith(".amazon.com") || h === "amazon.com") return "amazon";
  if (h === "www.crealityfalcon.com" || h === "crealityfalcon.com") return "creality";
  if (h === "vevor.com" || h === "www.vevor.com") return "vevor";
  return "unknown";
}
async function fetchText(url, type="text/html") {
  const allowed = new Set(["www.vevor.com","vevor.com","www.crealityfalcon.com","crealityfalcon.com"]);
  const target = validHttp(url);
  if (!target || !allowed.has(target.hostname)) throw Error("Origen no permitido");
  const response = await fetch(target,{signal:AbortSignal.timeout(17000),redirect:"follow",headers:{"accept":type,"user-agent":"GCGraphicsInventory/1.0 (+https://github.com/Dark-GC/gc-nexus-app; inventory monitoring)"}});
  if(!response.ok)throw Error("HTTP "+response.status);
  const final = new URL(response.url);
  if(!allowed.has(final.hostname))throw Error("Redirección fuera de dominio permitido");
  const length = Number(response.headers.get("content-length")||0);
  if(length>4_000_000)throw Error("Documento demasiado grande");
  const body=await response.text();
  if(body.length>4_000_000)throw Error("Documento demasiado grande");
  return body;
}
function decode(value){
  return String(value??"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function parseTags(html){
  const out = {};
  for(const t of html.matchAll(/<meta\b[^>]*>/ig)){
    const tag=t[0],attrs={};
    for(const a of tag.matchAll(/([a-zA-Z_:][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
      attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]??"");
    const k=(attrs.property||attrs.name||"").toLowerCase();
    if(k && attrs.content && !out[k])out[k]=attrs.content;
  }
  return out;
}
function structuredProducts(html){
  const all=[];
  for(const found of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig)){
    try{
      const value=JSON.parse(found[1]);
      const stack=Array.isArray(value)?value:[value];
      while(stack.length){
        const item=stack.shift();if(!item||typeof item!=="object")continue;
        if(Array.isArray(item["@graph"]))stack.push(...item["@graph"]);
        if(Array.isArray(item))stack.push(...item);
        if(String(item["@type"]||"").toLowerCase().includes("product"))all.push(item);
      }
    }catch{/* malformed JSON-LD */}
  }
  return all;
}
function parseOffer(html){
  const tags=parseTags(html),products=structuredProducts(html);
  const result={price:null,currency:null,stockStatus:"unknown",stockQuantity:null,imageUrl:"",priceStatus:"unavailable"};
  const image=tags["og:image"]||tags["twitter:image"]||products.map(p=>Array.isArray(p.image)?p.image[0]:p.image).find(Boolean)||"";
  const src=typeof image==="object"?image.url:image;
  if(validHttp(src))result.imageUrl=src;
  for(const p of products){
    const offers=Array.isArray(p.offers)?p.offers:[p.offers].filter(Boolean);
    if(offers.length!==1)continue;
    const offer=offers[0]||{};
    const value=Number(offer.price??offer.lowPrice??null);
    const currency=String(offer.priceCurrency||"").toUpperCase();
    if(Number.isFinite(value)&&value>0&&value<1_000_000&&/^[A-Z]{3}$/.test(currency)){result.price=value;result.currency=currency;result.priceStatus="verified";}
    const av=String(offer.availability||"").toLowerCase();
    if(av.endsWith("outofstock")||av.endsWith("soldout"))result.stockStatus="out_of_stock";
    else if(av.endsWith("instock")||av.endsWith("limitedavailability"))result.stockStatus="in_stock";
    const exact=offer.inventoryLevel?.value??offer.inventoryLevel?.quantity;
    if(Number.isInteger(Number(exact))&&exact!=null&&Number(exact)>=0)result.stockQuantity=Number(exact);
    if(result.priceStatus==="verified")return result;
  }
  if(result.priceStatus!=="verified"){
    const value=Number(tags["product:price:amount"]||tags["og:price:amount"]||"");
    const currency=(tags["product:price:currency"]||tags["og:price:currency"]||"").toUpperCase();
    if(Number.isFinite(value)&&value>0&&/^[A-Z]{3}$/.test(currency)){result.price=value;result.currency=currency;result.priceStatus="verified";}
  }
  return result;
}
async function shopify(address){
  const u=validHttp(address);
  const handle=u?.pathname.match(/^\/products\/([^/?]+)/)?.[1];
  if(!handle)throw Error("No se encontró el identificador de producto");
  const prod=JSON.parse(await fetchText("https://www.crealityfalcon.com/products/"+handle+".js","application/json"));
  const variants=(prod.variants||[]).filter(v=>v.available);
  const all=prod.variants||[];
  const prices=[...new Set(variants.map(v=>v.price).filter(Number.isFinite))];
  const found=prices.length===1?prices[0]:null;
  const candidate=prod.featured_image||prod.images?.[0]||"";
  const src=typeof candidate==="string"?candidate:(candidate?.src||"");
  const imageUrl=src.startsWith("//")?"https:"+src:src;
  return {price:found===null?null:found/100,currency:found===null?null:"USD",priceStatus:found===null?"unavailable":"verified",
    stockStatus:all.length>0&&variants.length===0?"out_of_stock":(variants.length===1?"in_stock":"unknown"),
    stockQuantity:variants.length===1&&Number.isInteger(variants[0].inventory_quantity)&&variants[0].inventory_quantity>=0?variants[0].inventory_quantity:null,
    imageUrl:validHttp(imageUrl)?imageUrl:""};
}
for(const p of data.items){
  const provider=providerOf(p.url);
  const base={sourceUrl:p.url,provider,checkedAt:checked,price:null,currency:null,priceStatus:"unavailable",stockStatus:"unknown",stockQuantity:null,imageUrl:"",error:null};
  try{
    if(provider==="amazon"){base.error="Amazon: precio y stock requieren API autorizada. Imagen y precio se pueden añadir manualmente.";}
    else if(provider==="creality")Object.assign(base,await shopify(p.url));
    else if(provider==="vevor")Object.assign(base,parseOffer(await fetchText(p.url)));
    else base.error="Proveedor no conectado";
  }catch(err){base.error=(err?.message||"Error desconocido").slice(0,180);}
  const previous=old.items?.[p.id];
  if(!base.imageUrl&&previous?.sourceUrl===p.url&&validHttp(previous.imageUrl))base.imageUrl=previous.imageUrl;
  feed.items[p.id]=base;
  console.log(p.id+": "+provider+" "+(base.priceStatus==="verified"?(base.currency+" "+base.price):"precio no verificado")+" "+base.stockStatus+(base.error?" — "+base.error:""));
  await sleep(350);
}
await fs.writeFile(file("data/price-cache.json"),JSON.stringify(feed,null,2)+"\n","utf8");
console.log("Registros revisados: "+Object.keys(feed.items).length);
