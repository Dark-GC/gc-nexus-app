/* GC GRAPHICS: USD/DOP reference only, not checkout or banking rate */
(() => {"use strict";
 const KEY="gc_graphics_fx_usd_dop_v1";
 const SOURCE="https://www.exchangerate-api.com";
 const ENDPOINT="https://open.er-api.com/v6/latest/USD";
 let current=null;
 function valid(x){return x&&x.base==="USD"&&Number.isFinite(x.rate)&&x.rate>30&&x.rate<120&&Number.isFinite(x.updatedAt)&&x.updatedAt>0;}
 function loadCached(){try{const x=JSON.parse(localStorage.getItem(KEY)||"null");if(valid(x))return x;}catch{}return null;}
 current=loadCached();
 function fxText(usd){
   if(!valid(current)||!Number.isFinite(usd)||usd<0)return "";
   return "≈ "+new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(usd*current.rate);
 }
 function status(){
   const el=document.getElementById("fxStatus"),rateEl=document.getElementById("fxRate");
   if(!el||!rateEl)return;
   if(!valid(current)){rateEl.textContent="Conversión RD$ no disponible";el.textContent="El precio en US$ se mantiene; volveremos a intentar automáticamente.";return;}
   const date=new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeZone:"America/Santo_Domingo"}).format(new Date(current.updatedAt));
   const stale=Date.now()-current.updatedAt>2*24*3600*1000;
   rateEl.textContent="US$1 ≈ RD$"+current.rate.toFixed(2)+(stale?" · referencia desactualizada":"");
   el.textContent="Fuente pública: open.er-api.com · "+date+" · Conversión estimada; no es el precio real de una tienda dominicana.";
 }
 async function refresh(){
   try{
     const response=await fetch(ENDPOINT,{cache:"no-cache",signal:AbortSignal.timeout(12000)});
     if(!response.ok)throw Error("FX HTTP "+response.status);
     const data=await response.json();
     const x={base:"USD",rate:Number(data.rates?.DOP),updatedAt:Number(data.time_last_update_unix)*1000,provider:SOURCE};
     if(data.result!=="success"||!valid(x))throw Error("Tasa inválida");
     current=x;
     try{localStorage.setItem(KEY,JSON.stringify(current));}catch{}
     window.dispatchEvent(new Event("gc-fx-updated"));
   }catch(e){console.info("FX temporalmente no disponible:",e.message);}
   status();
 }
 function boot(){status();if(!current||Date.now()-current.updatedAt>12*3600*1000)refresh();setInterval(()=>{if(document.visibilityState!=="hidden"&&(!current||Date.now()-current.updatedAt>12*3600*1000))refresh();},60*60*1000);}
 window.GCFX={convert:fxText,get:()=>current,refresh};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
