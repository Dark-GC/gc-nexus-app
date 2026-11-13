import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("iOS modal lock preserves scroll and the purchase sheet cannot overflow",()=>{
 const app=read("app.js"),css=read("styles.css");
 assert.match(app,/function lockBackground/);assert.match(app,/lockedScrollY=window\.scrollY/);assert.match(app,/window\.scrollTo\(0,lockedScrollY\)/);
 assert.match(css,/body\.modal-scroll-locked\{position:fixed/);assert.match(css,/\.purchase-extra input\[type="date"\].*min-width:0/);assert.match(css,/overscroll-behavior:contain/);
});
test("Amazon stays an observed snapshot without automated scraping or live-stock claims",()=>{
 const app=read("app.js"),server=read("server.js");
 assert.match(app,/amazon-snapshot/);assert.match(app,/stock no confirmado/);assert.match(server,/const ALLOWED_SITES/);
 assert.doesNotMatch(server,/amazon.*fetchPage/i);
});
test("V1.7.2 isolates standalone gesture prevention and structurally contains the purchase date",()=>{
 const pwa=read("data/pwa.js"),html=read("index.html"),app=read("app.js"),css=read("styles.css");
 assert.match(pwa,/display-mode:standalone/);assert.match(pwa,/gesturestart/);assert.match(pwa,/insideViewer/);
 assert.match(html,/id="purchasedDate" type="text" inputmode="numeric"/);assert.match(html,/id="purchaseToday"/);
 assert.match(app,/validPurchaseDate/);assert.match(css,/\.purchase-date-control\{display:flex;min-width:0;width:100%/);
});
