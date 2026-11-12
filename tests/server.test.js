import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.GC_NO_LISTEN = '1';
const { allowedProductUrl, parseProduct, server } = await import('../server.js');

test('validates retailer allowlist and blocks unsupported or unsafe URLs', () => {
  assert.equal(allowedProductUrl('https://www.vevor.com/vinyl-cutter'), true);
  assert.equal(allowedProductUrl('https://eu.crealityfalcon.com/products/cover'), true);
  assert.equal(allowedProductUrl('https://www.creality.com/products/laser'), true);
  assert.equal(allowedProductUrl('https://amazon.com/dp/example'), false);
  assert.equal(allowedProductUrl('https://vevor.com.attacker.tld/'), false);
  assert.equal(allowedProductUrl('http://vevor.com/'), false);
  assert.equal(allowedProductUrl('https://127.0.0.1/'), false);
  assert.equal(allowedProductUrl('https://vevor.com:8443/products'), false);
  assert.equal(allowedProductUrl('https://evil@vevor.com/'), false);
});
test('extracts only structured price, quantity and availability', () => {
  const sample = '<html><head><meta property="og:image" content="https://assets.example.com/1.png"><script type="application/ld+json">' +
    JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product', name: 'Panel colmena',
      image: 'https://cdn.example.com/honeycomb.png',
      offers: { '@type': 'Offer', price: '99.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock', inventoryLevel: { value: 8 } }
    }) + '</script></head></html>';
  const result = parseProduct(sample, 'https://www.crealityfalcon.com/products/honeycomb');
  assert.equal(result.price, 99.99);
  assert.equal(result.currency, 'USD');
  assert.equal(result.stockQty, 8);
  assert.equal(result.availability, 'in_stock');
  assert.equal(result.image, 'https://cdn.example.com/honeycomb.png');
});
test('does not fabricate prices, stock, or availability from plain text', () => {
  const result = parseProduct('<meta property="og:title" content="Prensa"><p>Only 12 left! $79.99</p>', 'https://www.vevor.com/product');
  assert.equal(result.price, null);
  assert.equal(result.stockQty, null);
  assert.equal(result.availability, 'unknown');
  assert.equal(result.source, 'open-graph-only');
});
test('does not choose an arbitrary price from multiple offers', () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    '@type': 'Product', name: 'Multiple sizes', offers: [
      { '@type': 'Offer', price: 20, priceCurrency: 'USD' },
      { '@type': 'Offer', price: 35, priceCurrency: 'USD' }
    ]
  }) + '</script>';
  assert.equal(parseProduct(html, 'https://www.vevor.com/size').price, null);
});
test('seed has 14 items, 4 purchased+received, and no Falcon 5W', async () => {
  const file = JSON.parse(await readFile(new URL('../public/products.json', import.meta.url), 'utf8'));
  assert.equal(file.items.length, 14);
  assert.equal(file.items.filter((item) => item.bought && item.received).length, 4);
  assert.equal(file.items.filter((item) => !item.bought).length, 10);
  assert.equal(file.items.some((item) => item.title.includes('5W')), false);
  assert.ok(file.items.find((item) => item.id === 'eq-007').url.includes('p_010610190808'));
});
test('HTTP health and unsupported source are explicit', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const blocked = await fetch(base + '/api/product-preview?url=' + encodeURIComponent('https://www.amazon.com/dp/B0D9VWCHM8'));
    assert.equal(blocked.status, 422);
    assert.equal((await blocked.json()).error, 'unsupported_source');
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /GC GRAPHICS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
