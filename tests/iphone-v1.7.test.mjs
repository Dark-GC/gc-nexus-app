import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("V1.7 reserves iPhone safe-area space for the fixed mobile navigation",()=>{
  const css=read("styles.css");
  assert.match(css,/--mobile-nav-height/);
  assert.match(css,/padding-bottom:calc\(var\(--mobile-nav-height\) \+ env\(safe-area-inset-bottom/);
  assert.match(css,/backdrop-filter:blur/);
  assert.match(css,/\.mobile-tab:active/);
});

test("V1.7 uses a full-image viewer without changing browser accessibility zoom",()=>{
  const html=read("index.html"),app=read("app.js"),css=read("styles.css");
  assert.match(html,/id="imageOverlay"/);
  assert.match(html,/id="imageViewerStage"/);
  assert.match(app,/data-action="view-image"/);
  assert.match(app,/function bindImageZoom/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/touch-action:none/);
  assert.doesNotMatch(html,/user-scalable=no/);
});

test("V1.7 bottom-sheet purchase controls remain keyboard-safe and touch-sized",()=>{
  const css=read("styles.css"),html=read("index.html");
  assert.match(html,/id="purchaseExtra"/);
  assert.match(css,/\.purchase-extra input,.purchase-extra select\{min-height:46px;font-size:16px/);
  assert.match(css,/\.modal\.compact\{max-height:calc\(100dvh/);
  assert.match(css,/\.modal-foot\{position:sticky/);
});

test("V1.7 keeps countdowns absolute, stable-width and refreshed after foregrounding",()=>{
  const app=read("app.js"),css=read("styles.css");
  assert.match(app,/Date\.parse\(value\)-Date\.now\(\)/);
  assert.match(app,/visibilitychange/);
  assert.match(app,/String\(seconds\)\.padStart/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});
