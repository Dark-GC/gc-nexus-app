import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, 'public');
const PORT = Number(process.env.PORT || 3000);
const MAX_HTML = 1800000;
const ALLOWED_SITES = ['vevor.com', 'crealityfalcon.com', 'creality.com'];

export function allowedProductUrl(input) {
  try {
    if (!input || String(input).length > 2048) return false;
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return ALLOWED_SITES.some((domain) => host === domain || host.endsWith('.' + domain));
  } catch {
    return false;
  }
}

function decodeEntities(text) {
  return String(text || '').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function getMeta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    const re = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
    let m;
    while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = decodeEntities(m[3]);
    if (attrs.property === key || attrs.name === key) return attrs.content || '';
  }
  return '';
}

function pickProduct(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const part of value) {
      const found = pickProduct(part);
      if (found) return found;
    }
    return null;
  }
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some((type) => typeof type === 'string' && /(^|\/)product$/i.test(type))) return value;
  for (const key of ['@graph', 'mainEntity']) {
    const found = pickProduct(value[key]);
    if (found) return found;
  }
  return null;
}

function cleanImage(value) {
  const v = Array.isArray(value) ? value[0] : value;
  const str = typeof v === 'object' && v ? (v.url || v.contentUrl) : v;
  try {
    const url = new URL(String(str));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function cleanText(value, max=600) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0,max) || null;
}
function brandName(value) {
  if (typeof value === 'string') return cleanText(value, 80);
  if (value && typeof value === 'object') return cleanText(value.name, 80);
  return null;
}

// VEVOR shows its original list price in a separate market-price DOM element.
// Only trust the explicitly labeled amount on the SAME product page.
export function vevorListPrice(html, current) {
  if (!Number.isFinite(current) || current <= 0) return null;
  const match = html.match(/<div\b(?=[^>]*class=["'][^"']*\bDM_dp-marketPrice\b)(?=[^>]*data-currency=["']([\d.]+)["'])[^>]*>/i);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > current && number <= current * 10
    ? Math.round(number * 100) / 100 : null;
}

export function parseProduct(html, pageUrl) {
  let product = null;
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    if (!/application\/ld\+json/i.test(match[1])) continue;
    try {
      product = pickProduct(JSON.parse(match[2]));
      if (product) break;
    } catch {
      // Ignore invalid structured data; never guess a price from visible text.
    }
  }
  let offers = product?.offers || null;
  if (Array.isArray(offers)) offers = offers.length === 1 ? offers[0] : null;
  if (offers && offers['@type'] === 'AggregateOffer') offers = null;
  const rawPrice = offers && (offers.price ?? offers.priceSpecification?.price);
  const price = rawPrice !== null && rawPrice !== undefined && rawPrice !== ''
    ? Number(rawPrice) : null;
  const verifiedPrice = price !== null && Number.isFinite(price) && price >= 0 ? price : null;
  const currency = offers?.priceCurrency || offers?.priceSpecification?.priceCurrency || null;
  const available = String(offers?.availability || '').toLowerCase();
  let availability = 'unknown';
  if (available.endsWith('/instock') || available === 'instock') availability = 'in_stock';
  if (available.endsWith('/outofstock') || available === 'outofstock' || available.endsWith('/soldout')) availability = 'out_of_stock';
  if (available.endsWith('/preorder') || available.endsWith('/backorder')) availability = 'preorder';
  const rawQty = offers?.inventoryLevel?.value ?? offers?.inventoryLevel ?? offers?.availableQuantity;
  const stockQty = rawQty !== null && rawQty !== undefined && /^\d+$/.test(String(rawQty))
    ? Number(rawQty) : null;
  const title = typeof product?.name === 'string' ? product.name : getMeta(html, 'og:title');
  const image = cleanImage(product?.image) || cleanImage(getMeta(html, 'og:image'));
  const description=cleanText(product?.description||getMeta(html,'og:description')||getMeta(html,'description'));
  const brand=brandName(product?.brand);
  const model=cleanText(product?.model||product?.mpn||product?.sku,100);
  const category=cleanText(product?.category,100);
  const store=new URL(pageUrl).hostname.toLowerCase().replace(/^www\./,'');
  const hasStructuredData = Boolean(product);
  return {
    title: title ? title.slice(0, 280) : null,
    image,
    brand,model,category,description,store,
    price: verifiedPrice,
    originalPrice: pageUrl.includes('vevor.com') ? vevorListPrice(html, verifiedPrice) : null,
    currency: currency ? String(currency).toUpperCase().slice(0, 5) : null,
    availability,
    stockQty: Number.isSafeInteger(stockQty) ? stockQty : null,
    source: hasStructuredData ? 'json-ld-product' : 'open-graph-only',
    checkedAt: new Date().toISOString(),
    productUrl: pageUrl,
    note: hasStructuredData
      ? 'Datos públicos estructurados de la tienda. Confirma la variante y el envío en el enlace original.'
      : 'La tienda no publicó información estructurada de precio/existencias verificable.'
  };
}

async function fetchPage(url) {
  let current = url;
  const signal = AbortSignal.timeout(11000);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!allowedProductUrl(current)) throw new Error('domain_not_supported');
    const response = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'GCGraphicsInventory/0.1 (+product-reference; no-bot-bypass)', Accept: 'text/html,application/xhtml+xml' }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get('location');
      if (!target) throw new Error('redirect_without_location');
      current = new URL(target, current).href;
      continue;
    }
    if (!response.ok) throw new Error('store_http_' + response.status);
    if (!String(response.headers.get('content-type') || '').includes('text/html')) throw new Error('not_html');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty_response');
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HTML) {
        await reader.cancel();
        throw new Error('page_too_large');
      }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks).toString('utf8'), url: current };
  }
  throw new Error('too_many_redirects');
}

// Storefront API for exact Creality product pages (no login, cookies or bypass).
const quoteCache=new Map();
async function getShopifyQuote(input){
  const link=new URL(input);
  const match=link.pathname.match(/^\/products\/([a-z0-9-]+)\/?$/i);
  if(!match || !/^(www\.)?crealityfalcon\.com$/.test(link.hostname))throw Error('storefront_not_supported');
  const query=new URL("https://www.crealityfalcon.com/products/"+match[1]+".js");
  const response=await fetch(query,{signal:AbortSignal.timeout(13000),redirect:"error",headers:{Accept:"application/json","User-Agent":"GCGraphicsInventory/2.0"}});
  if(!response.ok)throw Error("store_http_"+response.status);
  const body=await response.text();if(body.length>2_000_000)throw Error("storefront_response_too_large");
  const p=JSON.parse(body), all=Array.isArray(p.variants)?p.variants:[],available=all.filter(v=>v.available===true);
  const prices=[...new Set(available.map(v=>v.price).filter(v=>Number.isFinite(v)&&v>0))];
  const availableCompare=available.filter(v=>prices.length===1 && v.price===prices[0]);
  const compareValues=[...new Set(availableCompare.map(v=>v.compare_at_price).filter(v=>Number.isFinite(v)&&v>prices[0]))];
  const originalPrice=compareValues.length===1?compareValues[0]/100:null;
  const img=typeof p.featured_image==="string"?p.featured_image:(p.featured_image?.src||p.images?.[0]||"");
  const normalized=img.startsWith("//")?"https:"+img:img;
  return {title:p.title||null,image:cleanImage(normalized),brand:cleanText(p.vendor,80),model:null,category:cleanText(p.product_type,100),description:cleanText(p.description||p.body_html),store:"crealityfalcon.com",price:prices.length===1?prices[0]/100:null,
    originalPrice,
    currency:prices.length===1?"USD":null,
    availability:all.length>0&&available.length===0?"out_of_stock":available.length?"in_stock":"unknown",
    stockQty:null,checkedAt:new Date().toISOString(),source:"shopify-storefront-json",
    productUrl:input,note:prices.length>1?"Precio variable según variante; elige variante en la tienda.":"Precio y stock reportados por la tienda; confirmar variante antes de comprar."};
}
async function previewProduct(url){
  const cache=quoteCache.get(url);
  if(cache&&Date.now()-cache.time<180000)return cache.value;
  const domain=new URL(url).hostname.toLowerCase();
  const value=domain.endsWith("crealityfalcon.com")?
    await getShopifyQuote(url):
    await fetchPage(url).then(page=>parseProduct(page.html,page.url));
  value.requestedUrl=url;
  quoteCache.set(url,{time:Date.now(),value});
  if(quoteCache.size>150)quoteCache.delete(quoteCache.keys().next().value);
  return value;
}
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/products.json': ['products.json', 'application/json; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': 'https://gc-graphics-inventory.onrender.com',
    'Vary': 'Origin',
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  res.end(data);
}

export const server = http.createServer(async (req, res) => {
  try {
    const target = new URL(req.url || '/', 'http://localhost');
    if (req.method !== 'GET') return send(res, 405, JSON.stringify({ error: 'method_not_allowed' }));
    if (target.pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, app: 'gc-graphics-inventory', version: '1.6.0' }));
    if (target.pathname === '/api/product-preview') {
      const link = target.searchParams.get('url');
      if (!allowedProductUrl(link)) {
        return send(res, 422, JSON.stringify({
          error: 'unsupported_source',
          message: 'Consulta automatizada disponible solamente para dominios oficiales VEVOR/Creality. Amazon requiere una integración autorizada; usa el enlace de compra y los campos manuales.'
        }));
      }
      try {
        return send(res, 200, JSON.stringify(await previewProduct(link)));
      } catch (error) {
        const reason = error.name === 'TimeoutError' ? 'timeout' : String(error.message || 'store_unreachable');
        return send(res, 503, JSON.stringify({ error: 'store_unavailable', reason, message: 'No se pudieron verificar datos de esta tienda en este momento. No se inventará precio ni stock.' }));
      }
    }
    const spec = files[target.pathname];
    if (!spec) return send(res, 404, JSON.stringify({ error: 'not_found' }));
    const body = await readFile(join(PUBLIC, spec[0]));
    return send(res, 200, body, spec[1]);
  } catch {
    return send(res, 500, JSON.stringify({ error: 'internal_error' }));
  }
});

if (process.env.GC_NO_LISTEN !== '1') {
  server.listen(PORT, '0.0.0.0', () => {
    process.stdout.write('GC GRAPHICS Inventory listening on ' + PORT + '\n');
  });
}
