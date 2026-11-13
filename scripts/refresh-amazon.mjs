/**
 * GC GRAPHICS ORIGEN — Amazon observation refresh (Firecrawl Alexandria).
 * Server-only. No purchase data, login/session state or API credentials are published.
 * Run: FIRECRAWL_API_KEY=... node scripts/refresh-amazon.mjs
 */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SNAPSHOT = resolve(ROOT, 'data/amazon-snapshot.json');
const HISTORY = resolve(ROOT, 'data/amazon-price-history.json');
const LEDGER = resolve(ROOT, '.automation/amazon-budget.json');
const API = 'https://api.firecrawl.dev/v2/scrape';
const PROVIDER = 'amazon-com';
const CAPABILITY = 'products/prices';
const PER_BATCH_CREDITS = 5;
const MONTHLY_CAP = 500;
const MAX_BATCH = 5;
const MAX_ASINS = 25; // Explicit safety limit for this private inventory.

export const calendarMonth = (date) => date.toISOString().slice(0, 7);
export const splitBatches = (arr, size = MAX_BATCH) =>
  Array.from({length: Math.ceil(arr.length / size)}, (_, i) => arr.slice(i * size, (i + 1) * size));
export const batchKey = batch => batch.map(([, item]) => item.asin).join(',');
export const dailyReservationKey = (day, batch) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('invalid daily reservation date');
  return 'daily:' + day + ':' + batchKey(batch);
};
// Old ledgers did not have a status. A recorded chargedCredits entry is a completed
// run from that format, never a reason to issue the same day's requests again.
export const completedRun = run => run?.status === 'completed' ||
  (run && !run.status && Number.isFinite(run.chargedCredits));
export const pendingBatches = (groups, run) => {
  const completed = new Set(Array.isArray(run?.completedBatchKeys) ? run.completedBatchKeys : []);
  return groups.filter(batch => !completed.has(batchKey(batch)));
};

export function normaliseAmazonRow(row, previous, timestamp) {
  if (!row || !previous || row.asin !== previous.asin || row.served_asin !== previous.asin) {
    return null; // Never substitute a sibling ASIN or overwrite a different product.
  }
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000) return null;
  if (row.error) return null;
  const amount = row.price?.amount;
  const validPrice = Number.isFinite(amount) && amount >= 0 && row.price?.currency === 'USD';
  const offerState = row.offer_state;
  if (!validPrice && !['unavailable', 'see_all_buying_options', 'unknown'].includes(offerState)) return null;
  const stock = row.in_stock === true ? 'in_stock' : row.in_stock === false ? 'out_of_stock' : 'unknown';
  const listAmount = row.list_price?.amount;
  const listPrice = validPrice && Number.isFinite(listAmount) && listAmount > amount
    ? listAmount : null;
  return {
    ...previous,
    observedUrl: row.source_url || previous.observedUrl,
    checkedAt: new Date(timestamp).toISOString(),
    provider: 'amazon-snapshot',
    sourceMethod: 'firecrawl-alexandria',
    servedAsin: row.served_asin,
    price: validPrice ? amount : null,
    // A list price does NOT prove a promotional discount: no 'originalPrice' badge.
    originalPrice: null,
    listPrice,
    comparisonPriceType: listPrice === null ? null : 'amazon_list_price',
    currency: validPrice ? 'USD' : null,
    priceStatus: validPrice ? 'verified' : 'unavailable',
    stockStatus: stock,
    stockQuantity: null,
    seller: typeof row.seller === 'string' ? row.seller.slice(0, 180) : null,
    availabilityText: typeof row.availability_text === 'string' ? row.availability_text.slice(0, 180) : null,
    marketplace: 'US',
    deliveryZipVerified: false,
    error: validPrice ? null : 'Sin oferta destacada verificable para este ASIN'
  };
}

async function readJSON(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function writeAtomic(path, value) {
  await mkdir(resolve(path, '..'), {recursive: true});
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, path);
}
async function retrieve(asins, key) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
    body: JSON.stringify({alexandria:{provider:PROVIDER, capability:CAPABILITY, options:{asins}}}),
    signal: AbortSignal.timeout(60000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Firecrawl HTTP ' + response.status + (data?.code ? ' ' + data.code : ''));
  const item = data?.data?.alexandria?.find?.(x => x.provider === PROVIDER && x.capability === CAPABILITY);
  if (!item || item.error || !Array.isArray(item.data?.results)) throw new Error('Invalid Alexandria response');
  return {records: item.data.results, timestamp: item.data.observed_at_ms, credits: data.data.creditsCost ?? PER_BATCH_CREDITS};
}

export async function refreshAmazon({key, date = new Date(), fetchBatch = retrieve, budget = null} = {}) {
  if (!key) throw new Error('FIRECRAWL_API_KEY missing: no requests executed');
  const day = date.toISOString().slice(0,10);
  const month = calendarMonth(date);
  const snapshot = await readJSON(SNAPSHOT);
  const history = await readJSON(HISTORY, {schemaVersion:1,items:{}});
  if (history.schemaVersion !== 1 || !history.items) throw new Error('Invalid Amazon observation history');
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.items) throw new Error('Invalid Amazon snapshot');
  const products = Object.entries(snapshot.items);
  if (!products.length || products.length > MAX_ASINS || products.some(([,x]) => !/^[A-Z0-9]{10}$/.test(x.asin))) {
    throw new Error('Unexpected ASIN inventory: no provider requests executed');
  }
  const groups = splitBatches(products);
  const old = await readJSON(LEDGER, {month, spent:0, runs:[]});
  const ledger = old.month === month ? old : {month, spent:0, runs:[]};
  let run = ledger.runs.find(item => item.day === day);
  if (completedRun(run)) {
    return {status:'already_checked_today',day,checked:0,spent:ledger.spent};
  }
  if (!run) {
    run = {day, status:'in_progress', chargedCredits:0, checked:0, unavailable:0, rejected:0, completedBatchKeys:[]};
    ledger.runs.push(run);
    await writeAtomic(LEDGER, ledger);
  } else {
    run.status = 'in_progress';
    run.chargedCredits = Number.isFinite(run.chargedCredits) ? run.chargedCredits : 0;
    run.checked = Number.isFinite(run.checked) ? run.checked : 0;
    run.unavailable = Number.isFinite(run.unavailable) ? run.unavailable : 0;
    run.rejected = Number.isFinite(run.rejected) ? run.rejected : 0;
    run.completedBatchKeys = Array.isArray(run.completedBatchKeys) ? run.completedBatchKeys : [];
  }
  const reserved = pendingBatches(groups, run).length * PER_BATCH_CREDITS;
  if (ledger.spent + reserved > MONTHLY_CAP) throw new Error('Monthly automation credit cap reached');
  let checked = 0, unavailable = 0, rejected = 0;
  let spentThisRun = 0;
  for (const batch of groups) {
    const keyForBatch = batchKey(batch);
    if (run.completedBatchKeys.includes(keyForBatch)) continue;
    if (ledger.spent + PER_BATCH_CREDITS > MONTHLY_CAP) break;
    const centralKey=dailyReservationKey(day,batch);
    if(budget){
      const reservation=await budget.reserve(centralKey,PER_BATCH_CREDITS,'daily',month);
      if(!reservation?.accepted)throw new Error('Central monthly budget cap reached');
      if(!reservation.new){
        if(reservation.state==='committed'){run.completedBatchKeys.push(keyForBatch);continue;}
        throw new Error('Central reservation '+reservation.state+' requires review');
      }
    }
    const ids = batch.map(([,v]) => v.asin);
    let result;
    try { result = await fetchBatch(ids, key); }
    catch(error){ if(budget)await budget.finalize(centralKey,'unknown'); throw error; }
    // Treat price quoted by the provider as the upper bound for this request.
    const credits = Number(result.credits);
    if (!Number.isInteger(credits) || credits < 0 || credits > PER_BATCH_CREDITS) throw new Error('Unexpected provider credit charge');
    ledger.spent += credits;
    spentThisRun += credits;
    run.chargedCredits += credits;
    await writeAtomic(LEDGER, ledger); // Preserve spent credit accounting across failures.
    if(budget)await budget.finalize(centralKey,'committed');
    if (result.records.length !== batch.length) throw new Error('Incomplete batch response');
    for (const [id, previous] of batch) {
      const row = result.records.find(r => r.asin === previous.asin);
      const next = normaliseAmazonRow(row, previous, result.timestamp);
      if (!next) {rejected++;run.rejected++;continue;}
      snapshot.items[id] = next;
      const previousEvents = Array.isArray(history.items[id]) ? history.items[id] : [];
      history.items[id] = [...previousEvents.filter(x => x.checkedAt !== next.checkedAt), {
        asin:next.asin,checkedAt:next.checkedAt,price:next.price,currency:next.currency,
        priceStatus:next.priceStatus,listPrice:next.listPrice,seller:next.seller,stockStatus:next.stockStatus
      }].slice(-90);
      checked++;run.checked++;
      if (next.priceStatus !== 'verified') {unavailable++;run.unavailable++;}
    }
    snapshot.generatedAt = new Date(result.timestamp).toISOString();
    await writeAtomic(SNAPSHOT, snapshot); // Partial successful batches retained if the next fails.
    await writeAtomic(HISTORY, history);
    run.completedBatchKeys.push(keyForBatch);
    await writeAtomic(LEDGER, ledger);
  }
  run.status = 'completed';
  run.completedAt = new Date().toISOString();
  ledger.runs = ledger.runs.slice(-45);
  await writeAtomic(LEDGER, ledger);
  return {status:'checked',day,checked,unavailable,rejected,spentThisRun,monthSpent:ledger.spent};
}

export function supabaseBudget(url,key) {
  if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for central budget');
  const call=async(name,body)=>{
    const res=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await res.json().catch(()=>null);if(!res.ok)throw Error('central_budget_'+res.status);return json;
  };
  return {reserve:(p_key,p_credits,p_source,month)=>call('gc_reserve_amazon_quote',{p_key,p_credits,p_source,p_month:month+'-01'}),finalize:(p_key,p_state)=>call('gc_finalize_amazon_quote',{p_key,p_state})};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  refreshAmazon({key:process.env.FIRECRAWL_API_KEY,budget:supabaseBudget(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)}).then(result => {
    console.log(JSON.stringify(result));
    if (result.status === 'checked' && !result.checked) process.exitCode = 1;
  }).catch(error => { console.error('GC Amazon refresh blocked:', error.message); process.exitCode = 1; });
}
