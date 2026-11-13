import test from 'node:test';
import assert from 'node:assert/strict';
import {asinFromAmazonUrl,resolveAmazonProductUrl,normaliseImmediateAmazon} from '../lib/amazon-quote.js';

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
