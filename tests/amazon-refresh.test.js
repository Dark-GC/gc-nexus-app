import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonth,splitBatches,normaliseAmazonRow} from '../scripts/refresh-amazon.mjs';

test('11 Amazon ASINs require exactly three batches without duplicates', () => {
  const batches=splitBatches(Array.from({length:11},(_,i)=>i));
  assert.deepEqual(batches.map(batch=>batch.length),[5,5,1]);
  assert.equal(new Set(batches.flat()).size,11);
  assert.equal(calendarMonth(new Date('2026-11-13T04:00:00Z')),'2026-11');
});

test('Amazon buy-box offer matches the exact ASIN and preserves the original user link',()=>{
  const previous={
    asin:'B0D9VWCHM8',sourceUrl:'https://www.amazon.com/dp/B0D9VWCHM8',
    status:'Comprada',paidAmount:123.45,originalPrice:204.99
  };
  const timestamp=Date.now()-1000;
  const row={
    asin:previous.asin,served_asin:previous.asin,price:{amount:189.9,currency:'USD'},
    list_price:{amount:204.99,currency:'USD'},seller:'Official',
    in_stock:true,availability_text:'In Stock',offer_state:'featured_offer',
    source_url:previous.sourceUrl
  };
  const current=normaliseAmazonRow(row,previous,timestamp);
  assert.equal(current.price,189.9);
  assert.equal(current.listPrice,204.99);
  assert.equal(current.originalPrice,null); // Never invent a verified promotion from a list price.
  assert.equal(current.comparisonPriceType,'amazon_list_price');
  assert.equal(current.paidAmount,123.45);
  assert.equal(current.status,'Comprada');
  assert.equal(current.stockStatus,'in_stock');
  assert.equal(current.checkedAt,new Date(timestamp).toISOString());
});

test('Amazon sibling variant, malformed timestamp and supplier error cannot overwrite catalogue',()=>{
  const previous={asin:'B0D9VWCHM8',sourceUrl:'https://amazon.com/dp/B0D9VWCHM8'};
  const row={asin:'B0D9VWCHM8',served_asin:'B0D9VWCHM8',price:{amount:55,currency:'USD'},offer_state:'featured_offer'};
  assert.equal(normaliseAmazonRow({...row,served_asin:'B0FG7VSJW4'},previous,Date.now()),null);
  assert.equal(normaliseAmazonRow({...row,error:'request_failed'},previous,Date.now()),null);
  assert.equal(normaliseAmazonRow(row,previous,Date.now()+600000),null);
});

test('Missing Amazon buy-box can be represented honestly as unavailable',()=>{
  const previous={asin:'B096N8DN2H'};
  const row={asin:previous.asin,served_asin:previous.asin,price:{amount:null,currency:null},offer_state:'unavailable',in_stock:null};
  const result=normaliseAmazonRow(row,previous,Date.now());
  assert.equal(result.price,null);
  assert.equal(result.priceStatus,'unavailable');
  assert.equal(result.stockStatus,'unknown');
  assert.equal(result.originalPrice,null);
});
