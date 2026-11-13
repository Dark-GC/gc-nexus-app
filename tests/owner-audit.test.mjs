import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("owner audit is an atomic Postgres trigger with invoker security",()=>{
  const sql=read("database/owner-atomic-audit.sql");
  assert.match(sql,/security invoker/);
  assert.match(sql,/after insert or update or delete on public\.inventory_items/);
  assert.match(sql,/insert into public\.inventory_events/);
  assert.match(sql,/gc_owner_item_atomic_audit/);
  assert.match(sql,/\(select auth\.uid\(\)\) is distinct from new\.user_id/);
  for(const type of ["purchase_confirmed","received_confirmed","purchase_reverted","deleted"])
    assert.ok(sql.includes(type),type);
});
test("client cannot double-record audit movements after successful owner updates",()=>{
  for(const path of ["cloud.js","data/cloud.js"]){
    const source=read(path);
    assert.match(source,/gc_owner_item_atomic_audit/);
    assert.doesNotMatch(source,/\.from\("inventory_events"\)\.insert\(/);
    assert.match(source,/\.from\("inventory_items"\)\.upsert\(/);
    assert.match(source,/\.from\("inventory_items"\)\.delete\(/);
  }
});
