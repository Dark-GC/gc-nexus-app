const ASIN=/^[A-Z0-9]{10}$/;
const AMAZON=/(^|\.)amazon\.(com|ca|co\.uk|de|fr|es|it|com\.mx|com\.br|co\.jp|in|ae|sa|com\.au)$/i;
const SHORT=/^(a\.co|amzn\.to)$/i;

export function amazonUrl(input) {
  try {
    const u=new URL(String(input));
    if (u.protocol!=="https:" || u.username || u.password || u.port) return null;
    return u;
  } catch { return null; }
}
export function asinFromAmazonUrl(input) {
  const u=amazonUrl(input); if(!u || !AMAZON.test(u.hostname)) return null;
  const m=u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|gp\/aw\/dp)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m&&ASIN.test(m[1].toUpperCase())?m[1].toUpperCase():null;
}
export async function resolveAmazonProductUrl(input,{fetchImpl=fetch}={}) {
  let current=amazonUrl(input); if(!current) throw Error("invalid_product_url");
  for(let hop=0;hop<4;hop++) {
    const asin=asinFromAmazonUrl(current); if(asin) return {asin,url:current.href};
    if(!SHORT.test(current.hostname)) throw Error("amazon_asin_not_found");
    const response=await fetchImpl(current,{redirect:"manual",signal:AbortSignal.timeout(8000)});
    if(![301,302,303,307,308].includes(response.status)) throw Error("short_link_unresolved");
    const location=response.headers.get("location"); if(!location) throw Error("short_link_unresolved");
    current=amazonUrl(new URL(location,current).href); if(!current) throw Error("short_link_unresolved");
  }
  throw Error("too_many_redirects");
}
export function normaliseImmediateAmazon(row,{asin,url,observedAt=Date.now()}={}) {
  if(!row || row.asin!==asin || row.served_asin!==asin) return null;
  const price=Number(row.price?.amount);
  const valid=Number.isFinite(price)&&price>=0&&row.price?.currency==="USD";
  return {asin,productUrl:url,observedUrl:row.source_url||url,servedAsin:asin,price:valid?price:null,currency:valid?"USD":null,
    priceStatus:valid?"verified":"unavailable",stockStatus:row.in_stock===true?"in_stock":row.in_stock===false?"out_of_stock":"unknown",
    seller:typeof row.seller==="string"?row.seller.slice(0,180):null,checkedAt:new Date(observedAt).toISOString(),sourceMethod:"firecrawl-alexandria"};
}
