import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("V1.6 preserves the protected inventory seed",()=>{
  const items=JSON.parse(read("data/items.json")).items;
  assert.equal(items.length,14);
  assert.equal(items.filter(item=>item.status==="Comprada"&&item.received).length,4);
  assert.equal(items.filter(item=>item.status==="Pendiente").length,10);
});

test("new product begins with safe link analysis and remains manually editable",()=>{
  for(const path of ["index.html","data/app.html"]){
    const html=read(path);
    assert.match(html,/Pega el enlace del producto/);
    assert.match(html,/id="itemUrl"/);
    assert.match(html,/id="analyzeProduct"/);
    assert.match(html,/id="urlPreview"/);
    assert.ok(html.indexOf('id="itemUrl"')<html.indexOf('id="itemName"'));
  }
  const app=read("app.js");
  assert.match(app,/analyzeProductUrl/);
  assert.match(app,/unsupported_source|Esta fuente no permite autocompletado seguro/);
  assert.match(app,/AbortSignal\.timeout/);
});

test("server preview enriches only allowlisted retailer data",async()=>{
  process.env.GC_NO_LISTEN="1";
  const {parseProduct}=await import("../server.js");
  const html='<meta property="og:description" content="Panel de corte premium"><script type="application/ld+json">'+JSON.stringify({
    "@type":"Product",name:"Panel colmena 500",brand:{name:"Creality"},model:"H500",category:"Accesorio",description:"Panel para grabadora",
    image:"https://cdn.example.com/panel.png",offers:{"@type":"Offer",price:"99.99",priceCurrency:"USD",availability:"https://schema.org/InStock"}
  })+'</script>';
  const result=parseProduct(html,"https://www.crealityfalcon.com/products/panel");
  assert.equal(result.brand,"Creality");
  assert.equal(result.model,"H500");
  assert.equal(result.category,"Accesorio");
  assert.equal(result.store,"crealityfalcon.com");
});

test("family access uses the administrator chosen password with server validation",()=>{
  const html=read("data/app.html"),cloud=read("data/cloud.js"),edge=read("supabase/functions/gc-family-access/index.ts");
  assert.match(html,/minlength="12"/);
  assert.match(html,/viewerPasswordStrength/);
  assert.match(cloud,/password:password/);
  assert.match(cloud,/requestPassword/);
  assert.match(edge,/validPassword/);
  assert.match(edge,/length>=12&&length<=128/);
  assert.doesNotMatch(edge,/function password\(/);
});

test("native browser dialogs and the manual price refresh button are gone",()=>{
  const paths=["app.js","cloud.js","data/cloud.js","data/growth.js","data/pwa.js","data/ui.js","server.js","supabase/functions/gc-family-access/index.ts"];
  for(const path of paths)assert.doesNotMatch(read(path),/\b(?:alert|confirm|prompt)\s*\(/,path);
  for(const path of ["index.html","data/app.html"])assert.doesNotMatch(read(path),/id="refreshFeed"/);
  const app=read("app.js");
  assert.match(app,/setInterval\(autoRefreshQuotes,5\*60\*1000\)/);
  assert.match(app,/setInterval\(\(\)=>refreshFeed\(true\),15\*60\*1000\)/);
});

test("promotions show countdowns only for confirmed end times",()=>{
  const app=read("app.js"),promos=JSON.parse(read("data/verified-promotions.json"));
  assert.match(app,/endsAtVerified===true/);
  assert.match(app,/data-promo-end/);
  assert.match(app,/countdownText/);
  assert.equal(promos.items["gc-vevor"].endsAtVerified,false);
  assert.equal(promos.items["gc-vevor"].campaignVerified,false);
});

test("premium cards are vertical on small phones and remain touch safe",()=>{
  const css=read("styles.css"),v16=css.slice(css.indexOf("Origen V1.6"));
  assert.match(v16,/@media\(max-width:520px\)[\s\S]*\.product-card\{display:flex/);
  assert.match(v16,/\.product-bottom \.btn\{min-height:46px/);
  assert.match(v16,/object-fit:contain/);
  assert.match(v16,/overflow-wrap:anywhere/);
});

test("exchange-rate card names the public source without presenting a technical CTA",()=>{
  const html=read("data/app.html"),fx=read("data/fx.js");
  assert.match(html,/id="fxRate"/);
  assert.doesNotMatch(html,/>Tasa: ExchangeRate-API</);
  assert.match(fx,/open\.er-api\.com/);
  assert.match(fx,/no es el precio real de una tienda dominicana/);
});
