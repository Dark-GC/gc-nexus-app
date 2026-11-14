import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {asinFromAmazonUrl,resolveAmazonProductUrl,normaliseImmediateAmazon} from '../lib/amazon-quote.js';
process.env.GC_NO_LISTEN='1';
const {server}=await import('../server.js');

test('accepts exact Amazon ASIN routes and rejects lookalikes',()=>{
  assert.equal(asinFromAmazonUrl('https://www.amazon.com/dp/B0D9VWCHM8?tag=x'),'B0D9VWCHM8');
  assert.equal(asinFromAmazonUrl('https://amazon.com/gp/product/B0D9VWCHM8'),'B0D9VWCHM8');
  assert.equal(asinFromAmazonUrl('https://amazon.com.attacker.tld/dp/B0D9VWCHM8'),null);
});
test('resolves a.co only through bounded redirect and exact final ASIN',async()=>{
  const result=await resolveAmazonProductUrl('https://a.co/demo',{fetchImpl:async()=>new Response('',{status:302,headers:{location:'https://www.amazon.com/dp/B0D9VWCHM8'}})});
  assert.equal(result.asin,'B0D9VWCHM8');
});
test('never accepts a provider response for a sibling ASIN',()=>{
  const params={asin:'B0D9VWCHM8',url:'https://amazon.com/dp/B0D9VWCHM8',observedAt:0};
  assert.equal(normaliseImmediateAmazon({asin:'B000000000',served_asin:'B000000000'},params),null);
  const quote=normaliseImmediateAmazon({asin:params.asin,served_asin:params.asin,price:{amount:12.5,currency:'USD'},in_stock:true},params);
  assert.equal(quote.price,12.5);assert.equal(quote.stockStatus,'in_stock');
});
test('Amazon quote endpoint answers an actual CORS preflight only for the app origin',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const ok=await fetch(base+'/api/private/amazon-quotes',{method:'OPTIONS',headers:{Origin:'https://gc-graphics-inventory.onrender.com','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type'}});
    assert.equal(ok.status,204);assert.equal(ok.headers.get('access-control-allow-headers'),'Authorization, Content-Type');
    const rejected=await fetch(base+'/api/private/amazon-quotes',{method:'OPTIONS',headers:{Origin:'https://attacker.example','Access-Control-Request-Method':'POST'}});
    assert.equal(rejected.status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('quota validation uses PostgreSQL-compatible pattern and explicit 500-character limit',()=>{
  const v2=readFileSync(new URL('../database/amazon-budget-v2.sql',import.meta.url),'utf8');
  assert.ok(!v2.includes('{8,500}'));
  assert.ok(v2.includes('length(p_key) not between 8 and 500'));
  assert.ok(v2.includes('[A-Za-z0-9:,_-]+'));
});
test('unverified Amazon articles offer a manual retry without creating another record',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.ok(app.includes('data-action="quote-retry"'));
  assert.ok(app.includes('if(b.dataset.action==="quote-retry")return void requestAmazonQuote(p);'));
  assert.ok(app.includes('if(!current&&isAmazonUrl(vals.url))void requestAmazonQuote(vals);'));
});
