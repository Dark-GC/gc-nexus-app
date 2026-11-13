import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveAmazonProductUrl, normaliseImmediateAmazon } from './lib/amazon-quote.js';

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

const APP_ORIGIN='https://gc-graphics-inventory.onrender.com';
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': APP_ORIGIN,
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

async function jsonBody(req) {
  let body=''; for await (const chunk of req) { body+=chunk; if(body.length>10000) throw Error('body_too_large'); }
  try{return JSON.parse(body||'{}');}catch{throw Error('invalid_json');}
}
function privateConfig() {
  const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,FIRECRAWL_API_KEY}=process.env;
  return SUPABASE_URL&&SUPABASE_SERVICE_ROLE_KEY&&FIRECRAWL_API_KEY?{SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,FIRECRAWL_API_KEY}:null;
}
async function supabase(config,path,options={}) {
  const response=await fetch(config.SUPABASE_URL+path,{...options,headers:{apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,...options.headers}});
  const data=await response.json().catch(()=>null); if(!response.ok) throw Error('supabase_'+response.status); return data;
}
async function immediateAmazonQuote(body,token) {
  const config=privateConfig(); if(!config) return {status:503,body:{error:'amazon_quotes_not_configured'}};
  const who=await fetch(config.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+token}});
  const user=await who.json().catch(()=>null);
  if(!who.ok||!user?.id||user.app_metadata?.gc_admin!==true) return {status:403,body:{error:'owner_required'}};
  if(typeof body.itemId!=='string'||!/^gc-[a-z0-9-]{3,100}$/i.test(body.itemId)) return {status:422,body:{error:'invalid_item_id'}};
  let product;try{product=await resolveAmazonProductUrl(body.url);}catch(e){return {status:422,body:{error:String(e.message||'invalid_amazon_url')}};}
  const saved=await supabase(config,'/rest/v1/inventory_items?select=product_url&user_id=eq.'+encodeURIComponent(user.id)+'&id=eq.'+encodeURIComponent(body.itemId));
  if(!Array.isArray(saved)||saved.length!==1)return {status:404,body:{error:'inventory_item_not_found'}};
  let savedProduct;try{savedProduct=await resolveAmazonProductUrl(saved[0].product_url);}catch{return {status:422,body:{error:'stored_item_not_amazon'}};}
  if(savedProduct.asin!==product.asin)return {status:409,body:{error:'asin_does_not_match_stored_item'}};
  const requestKey='immediate:'+user.id+':'+product.asin;
  const reserve=await supabase(config,'/rest/v1/rpc/gc_reserve_amazon_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:requestKey,p_credits:5,p_source:'immediate'})});
  if(!reserve?.accepted)return {status:429,body:{error:'monthly_budget_exhausted'}};
  if(!reserve.new)return {status:reserve.state==='committed'?409:503,body:{error:reserve.state==='committed'?'quote_already_recorded':'quote_pending_review'}};
  await supabase(config,'/rest/v1/rpc/gc_mark_private_amazon_request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner_id:user.id,p_item_id:body.itemId,p_asin:product.asin,p_product_url:product.url,p_request_key:requestKey,p_status:'running'})});
  try {
    const reply=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{Authorization:'Bearer '+config.FIRECRAWL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({alexandria:{provider:'amazon-com',capability:'products/prices',options:{asins:[product.asin]}}}),signal:AbortSignal.timeout(60000)});
    const raw=await reply.json().catch(()=>null); if(!reply.ok)throw Error('firecrawl_'+reply.status);
    const result=raw?.data?.alexandria?.find(x=>x.provider==='amazon-com'&&x.capability==='products/prices');
    const quote=normaliseImmediateAmazon(result?.data?.results?.[0],{...product,observedAt:result?.data?.observed_at_ms}); if(!quote)throw Error('unverified_provider_response');
    await supabase(config,'/rest/v1/rpc/gc_record_private_amazon_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner_id:user.id,p_item_id:body.itemId,p_asin:quote.asin,p_price:quote.price,p_currency:quote.currency,p_stock_status:quote.stockStatus,p_seller:quote.seller,p_product_url:quote.productUrl,p_observed_url:quote.observedUrl,p_observed_at:quote.checkedAt,p_verification_status:quote.priceStatus,p_request_key:requestKey})});
    await supabase(config,'/rest/v1/rpc/gc_finalize_amazon_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:requestKey,p_state:'committed'})});
    return {status:200,body:{quote}};
  }catch(error){
    await supabase(config,'/rest/v1/rpc/gc_mark_private_amazon_request',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({p_owner_id:user.id,p_item_id:body.itemId,p_asin:product.asin,p_product_url:product.url,p_request_key:requestKey,p_status:'failed',p_error:String(error.message||'provider_error').slice(0,120)})
    }).catch(()=>{});
    // A network/provider failure may still have been charged. Preserve it as unknown; never silently release spend.
    await supabase(config,'/rest/v1/rpc/gc_finalize_amazon_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:requestKey,p_state:'unknown'})}).catch(()=>{});
    return {status:503,body:{error:'amazon_quote_unavailable'}};
  }
}

export const server = http.createServer(async (req, res) => {
  try {
    const target = new URL(req.url || '/', 'http://localhost');
    if (target.pathname==='/api/private/amazon-quotes' && req.method==='OPTIONS') {
      if(req.headers.origin!==APP_ORIGIN)return send(res,403,JSON.stringify({error:'origin_not_allowed'}));
      res.writeHead(204,{'Access-Control-Allow-Origin':APP_ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin','Cache-Control':'no-store'});return res.end();
    }
    if (req.method==='POST' && target.pathname==='/api/private/amazon-quotes') {
      const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      if(!token)return send(res,401,JSON.stringify({error:'authentication_required'}));
      const answer=await immediateAmazonQuote(await jsonBody(req),token);
      return send(res,answer.status,JSON.stringify(answer.body));
    }
    if (req.method !== 'GET') return send(res, 405, JSON.stringify({ error: 'method_not_allowed' }));
    if (target.pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, app: 'gc-graphics-inventory', version: '1.7.4' }));
    if (target.pathname === '/api/product-preview') {
      const link = target.searchParams.get('url');
      const isAmazonLink=/^https:\/\/(?:www\.)?(?:amazon\.[^/]+|a\.co|amzn\.to)\//i.test(link||'');
      if(isAmazonLink) try {
        const amazon=await resolveAmazonProductUrl(link);
        return send(res,200,JSON.stringify({title:'Producto Amazon identificado',store:'amazon.com',asin:amazon.asin,productUrl:link,requestedUrl:link,price:null,currency:null,availability:'unknown',source:'amazon-link',checkedAt:new Date().toISOString(),note:'ASIN identificado. El precio se consulta de forma privada después de guardar el artículo.'}));
      } catch (error) {
        return send(res,422,JSON.stringify({error:'amazon_asin_not_found',message:'No se pudo identificar el ASIN exacto de este enlace Amazon.'}));
      }
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
