/* GC GRAPHICS install interface */
(()=>{"use strict";let promptEvent=null;const embedded=location.pathname.startsWith("/data/");
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();promptEvent=e;});
async function install(){if(!embedded){location.href="/data/app.html#instalar";return;}
if(promptEvent){await promptEvent.prompt();promptEvent=null;return;}
alert(/iPhone|iPad|iPod/.test(navigator.userAgent)?
"Para instalar GC GRAPHICS, abre esta página en Safari, toca Compartir y después «Añadir a pantalla de inicio».":
"En el menú de tu navegador, selecciona «Instalar aplicación» o «Añadir a pantalla de inicio».");}
function init(){document.getElementById("installPwa")?.addEventListener("click",install);
if(embedded&&"serviceWorker" in navigator)navigator.serviceWorker.register("/data/sw.js",{scope:"/data/"}).catch(console.info);
if(matchMedia("(display-mode:standalone)").matches||navigator.standalone===true)document.getElementById("installPwa")?.setAttribute("hidden","");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
