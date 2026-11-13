/* GC GRAPHICS PWA - static shell only, no private API caching */
const CACHE="gc-origen-pwa-v2", STATIC=["/data/app.html","/index.html","/app.js","/styles.css","/favicon.svg","/data/cloud.js","/data/growth.js","/data/growth.css","/data/pwa.js","/data/manifest.webmanifest","/data/items.json","/data/verified-images.json","/data/verified-promotions.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(STATIC.map(u=>c.add(new Request(u,{cache:"reload"})))))));
self.addEventListener("activate",e=>e.waitUntil(Promise.all([caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith("gc-origen-pwa-")&&n!==CACHE).map(n=>caches.delete(n)))),self.clients.claim()])));
self.addEventListener("fetch",e=>{const req=e.request,url=new URL(req.url);if(req.method!=="GET"||url.origin!==location.origin)return;
if(url.pathname.includes("cloud-config")||url.pathname.startsWith("/api/"))return;
if(req.mode==="navigate"){e.respondWith(fetch(req).catch(()=>caches.match("/data/app.html")));return;}
if(url.pathname==="/data/price-cache.json"||url.pathname==="/data/amazon-snapshot.json"){e.respondWith(fetch(req).catch(()=>caches.match(req)));return;}
if(STATIC.includes(url.pathname)){e.respondWith(caches.match(url.pathname).then(cache=>cache||fetch(req).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(url.pathname,res.clone()));return res})));}});
