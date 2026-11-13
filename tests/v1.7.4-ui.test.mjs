import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("desktop installation entry is hidden by device capability, not viewport width",()=>{
  const pwa=read("data/pwa.js"),css=read("styles.css"),sw=read("data/sw.js");
  assert.match(pwa,/function isDesktopComputer\(\).*pointer: fine/);
  assert.match(pwa,/button\.hidden=standalone\|\|isDesktopComputer\(\)/);
  assert.match(css,/@media\(min-width:761px\)\{\s*#installPwa\{display:none!important\}/);
  assert.match(sw,/gc-origen-pwa-v10/);
});

test("unconfirmed source comparisons never claim a verified commercial campaign",()=>{
  const app=read("app.js");
  assert.match(app,/label:campaignVerified\?clamp\(promo\.campaignName,40\):"Rebaja observada"/);
  assert.match(app,/precio inferior a referencia/);
  assert.doesNotMatch(app,/campaignVerified===true&&promo\.campaignName\?clamp\(promo\.campaignName,40\):"Oferta verificada"/);
});

test("desktop card regions avoid overlaying promotions on images or actions",()=>{
  const app=read("app.js"),css=read("styles.css");
  assert.match(app,/<p class="product-desc">'\+notes\+'<\/p>'\+dealBadge/);
  assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/);
  assert.match(css,/\.product-price-row\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(94px,auto\)/);
  assert.match(css,/\.product-body>\.deal-flag\{position:static/);
});
