import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("deployed cloud module and root alias stay identical",()=>{
  assert.equal(read("data/cloud.js"),read("cloud.js"));
});
test("cloud loading cannot overwrite a pending, errored or switched session",()=>{
  const src=read("data/cloud.js");
  const begin=src.indexOf("async function loadRemote("),end=src.indexOf("function subscribe()",begin);
  assert.ok(begin>0&&end>begin,"loadRemote must be declared");
  const fn=src.slice(begin,end);
  assert.match(fn,/state\.pending\|\|state\.inventoryError\)return/);
  assert.match(fn,/const uid=state\.ownerId,epoch=state\.epoch/);
  const request=fn.indexOf('.from("inventory_items").select("*")');
  const after=fn.indexOf('state.epoch!==epoch||state.pending||state.inventoryError');
  assert.ok(request>0&&after>request,"verify edits and session after awaited server response");
  assert.match(fn,/state\.ownerId!==uid/);
});
test("client relies on transactional owner audit trigger and does not duplicate event insert",()=>{
  const js=read("data/cloud.js");
  assert.match(js,/gc_owner_item_atomic_audit/);
  assert.doesNotMatch(js,/\.from\("inventory_events"\)\.insert\(/);
  assert.match(read("database/owner-atomic-audit.sql"),/after insert or update or delete on public\.inventory_items/);
});
