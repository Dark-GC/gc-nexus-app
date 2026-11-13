/* GC GRAPHICS install interface */
(()=>{"use strict";let promptEvent=null;const embedded=location.pathname.startsWith("/data/");
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();promptEvent=e;updateInstallVisibility();});
async function install(){if(!embedded){location.href="/data/app.html#instalar";return;}
if(promptEvent){await promptEvent["prompt"]();promptEvent=null;return;}
await window.GCDialog?.notice?.({title:"Instalar GC GRAPHICS",kicker:"APLICACIÓN PRIVADA",message:/iPhone|iPad|iPod/.test(navigator.userAgent)?
"Abre esta página en Safari, toca Compartir y después «Añadir a pantalla de inicio».":
"En el menú de tu navegador, selecciona «Instalar aplicación» o «Añadir a pantalla de inicio»."});}
function installStandaloneGesturePolicy(){
 const standalone=matchMedia("(display-mode:standalone)").matches||navigator.standalone===true;if(!standalone)return;
 document.documentElement.classList.add("gc-standalone");
 const insideViewer=target=>Boolean(target.closest?.("#imageOverlay:not(.hidden) .image-viewer-stage"));
 document.addEventListener("gesturestart",e=>{if(!insideViewer(e.target))e.preventDefault();},{passive:false});
 document.addEventListener("gesturechange",e=>{if(!insideViewer(e.target))e.preventDefault();},{passive:false});
 document.addEventListener("touchmove",e=>{if(e.touches.length>1&&!insideViewer(e.target))e.preventDefault();},{passive:false});
 let lastTap=0;document.addEventListener("touchend",e=>{const t=Date.now();if(t-lastTap<280&&!insideViewer(e.target))e.preventDefault();lastTap=t;},{passive:false});
}
function isDesktopComputer(){return matchMedia("(min-width: 761px) and (pointer: fine)").matches;}
function updateInstallVisibility(){
 const standalone=matchMedia("(display-mode:standalone)").matches||navigator.standalone===true;
 const button=document.getElementById("installPwa");
 if(button)button.hidden=standalone||isDesktopComputer();
}
function init(){document.getElementById("installPwa")?.addEventListener("click",install);installStandaloneGesturePolicy();
if(embedded&&"serviceWorker" in navigator)navigator.serviceWorker.register("/data/sw.js",{scope:"/data/"}).catch(console.info);
 updateInstallVisibility();
 matchMedia("(display-mode:standalone)").addEventListener?.("change",updateInstallVisibility);
 matchMedia("(pointer: fine)").addEventListener?.("change",updateInstallVisibility);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
