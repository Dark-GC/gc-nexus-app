/* GC GRAPHICS ORIGEN — PWA v8. Shell-only cache; private APIs never cached. */
const CACHE="gc-origen-pwa-v9";
const STATIC=[
  "/data/app.html","/index.html","/app.js","/styles.css",
  "/favicon.svg","/data/icon-192.png",
  "/data/cloud.js","/data/ui.js","/data/growth.js","/data/growth.css",
  "/data/login.css","/data/pwa.js","/data/fx.js",
  "/data/manifest.json","/data/items.json",
  "/data/verified-images.json","/data/verified-promotions.json"
];
const NETWORK_FIRST=new Set([
  "/data/cloud.js","/data/ui.js","/app.js","/data/login.css","/styles.css",
  "/data/app.html","/data/pwa.js","/data/growth.js",
  "/data/manifest.json"
]);
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(STATIC.map(path=>cache.add(new Request(path,{cache:"reload"}))));
    // Fixes an issue where stale login/access code remained active until all tabs closed.
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith("gc-origen-pwa-")&&n!==CACHE).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const req=event.request,url=new URL(req.url),path=url.pathname;
  if(req.method!=="GET"||url.origin!==self.location.origin)return;
  if(path.startsWith("/api/")||path.includes("cloud-config"))return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(async response=>{
      if(response.ok&&path==="/data/app.html"){
        const cache=await caches.open(CACHE);await cache.put("/data/app.html",response.clone());
      }
      return response;
    }).catch(async()=>await caches.match("/data/app.html")||Response.error()));
    return;
  }
  if(path==="/data/price-cache.json"||path==="/data/amazon-snapshot.json"){
    event.respondWith(fetch(req).catch(()=>caches.match(req)));
    return;
  }
  if(NETWORK_FIRST.has(path)){
    event.respondWith(fetch(req).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE);await cache.put(path,response.clone());}
      return response;
    }).catch(async()=>await caches.match(path)||Response.error()));
    return;
  }
  if(STATIC.includes(path)){
    event.respondWith(caches.match(path).then(cached=>cached||fetch(req).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE);await cache.put(path,response.clone());}
      return response;
    })));
  }
});
