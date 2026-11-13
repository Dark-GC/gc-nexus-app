/* GC GRAPHICS · ORIGEN | Bitácora + ruta de evolución | módulo local v1 */
"use strict";
(()=>{
 const KEY="gc_graphics_growth_v1";
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const short=(s,max=500)=>String(s??"").trim().slice(0,max);
 const now=()=>new Date().toISOString();
 const today=()=>{const d=new Intl.DateTimeFormat("en-US",{timeZone:"America/Santo_Domingo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const parts=Object.fromEntries(d.map(x=>[x.type,x.value]));return [parts.year,parts.month,parts.day].join("-");};
 const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(v);
 const fmtDate=v=>{if(!v)return "Sin fecha";try{return new Intl.DateTimeFormat("es-DO",{timeZone:"UTC",dateStyle:"medium"}).format(new Date(v.slice(0,10)+"T12:00:00Z"));}catch{return v;}};
 const categories=["Decisión","Compra","Recepción","Prueba","Aprendizaje","Hito","Nota"];
 const phaseSeeds=[
   ["base","01 · FUNDAMENTOS","Definir el inventario inicial","Identificar máquinas, insumos y qué se ha comprado realmente."],
   ["compras","02 · EQUIPAMIENTO","Documentar las compras y recepciones","Registrar el precio realmente pagado y comprobar qué equipos llegaron."],
   ["pruebas","03 · VALIDACIÓN","Realizar pruebas con cada máquina","Dejar evidencia de configuración, resultados y fallos antes de ofrecer trabajos."],
   ["espacio","04 · PREPARACIÓN","Preparar el espacio de trabajo","Organizar energía, seguridad, materiales y ubicación de los equipos."],
   ["servicios","05 · OFERTA","Definir los servicios iniciales","Elegir qué personalizaciones y servicios podremos realizar con el equipo disponible."],
   ["experiencias","06 · APRENDIZAJE","Documentar las primeras experiencias","Registrar trabajos, errores, mejoras y decisiones sin montar todavía un ERP."]
 ];
 const defaults=()=>phaseSeeds.map(([id,phase,title,description],order)=>({id,phase,title,description,order,completedAt:null,isCustom:false}));
 const st={entries:[],milestones:defaults(),section:"journal",kind:"Todos",query:"",open:false,editing:null,initialized:false};
 function validateEntry(e){
   if(!e||typeof e!=="object"||!e.id||!e.title)return null;
   return {id:short(e.id,90),date:/^\d{4}-\d{2}-\d{2}$/.test(e.date||"")?e.date:today(),
     title:short(e.title,150),category:categories.includes(e.category)?e.category:"Nota",
     description:short(e.description,2400),itemId:short(e.itemId,90),
     createdAt:short(e.createdAt,40)||now(),updatedAt:short(e.updatedAt,40)||null,origin:e.origin==="inventory"?"inventory":"manual"};
 }
 function validateMilestone(m){
   if(!m||typeof m!=="object"||!m.id||!m.title)return null;
   return {id:short(m.id,90),phase:short(m.phase,80),title:short(m.title,170),description:short(m.description,900),
     order:Number.isFinite(m.order)?m.order:99,
     completedAt:typeof m.completedAt==="string"&&/^\d{4}-\d{2}-\d{2}/.test(m.completedAt)?m.completedAt:null,
     isCustom:!!m.isCustom};
 }
 function validBackup(data){
   if(!data||data.schemaVersion!==1||!Array.isArray(data.entries)||!Array.isArray(data.milestones)||data.entries.length>800||data.milestones.length>60)return false;
   return data.entries.every(e=>!!validateEntry(e))&&data.milestones.every(m=>!!validateMilestone(m));
 }
 function load(){
   let d=null;try{d=JSON.parse(localStorage.getItem(KEY)||"null");}catch{}
   if(d&&validBackup(d)){
     st.entries=d.entries.map(validateEntry);
     st.milestones=d.milestones.map(validateMilestone);
     // Keep milestone catalogue forward-compatible: add only missing default stages.
     for(const m of defaults())if(!st.milestones.some(x=>x.id===m.id))st.milestones.push(m);
   }
 }
 function save(){
   try{
     localStorage.setItem(KEY,JSON.stringify({schemaVersion:1,savedAt:now(),entries:st.entries,milestones:st.milestones}));
     return true;
   }catch(e){
     $("growthSaveState").textContent="No se pudo guardar localmente. Exporta una copia de seguridad y revisa el espacio del navegador.";
     return false;
   }
 }
 function items(){return window.GCInventory?.getItems?.()||[];}
 function id(){return crypto?.randomUUID?.()||"g-"+Date.now()+"-"+Math.random().toString(16).slice(2);}
 function makeEntry({date= today(),title,category="Nota",description="",itemId="",origin="manual"}){
   const e=validateEntry({id:id(),date,title,category,description,itemId,createdAt:now(),origin});
   if(!e)return;
   st.entries.unshift(e);
   if(st.entries.length>800)st.entries=st.entries.slice(0,800);
   save();if(st.open)render();
 }
 function recordInventoryAction(action,p){
   if(!p?.id||!p.name)return;
   const names={created:"Artículo añadido al inventario",edited:"Datos de equipo actualizados",buy:"Compra confirmada",receive:"Recepción física confirmada",delete:"Artículo retirado del inventario"};
   if(!names[action])return;
   const descriptions={
     created:"Se incorporó al inventario. No implica que esté comprado.",
     edited:"Se modificaron los datos registrados; consulta el inventario para ver el estado vigente.",
     buy:"Compra registrada como "+(p.received?"comprada y recibida":"comprada, pendiente de recepción")+
        ". "+(p.paidAmount!=null?"Importe pagado declarado: "+money(Number(p.paidAmount))+".":"Importe pagado no documentado."),
     receive:"Se confirmó que el equipo o material fue recibido físicamente.",
     delete:"Se retiró la ficha del inventario. Esta bitácora conserva la referencia."
   };
   makeEntry({date:action==="buy"&&p.purchaseDate?p.purchaseDate:today(),title:names[action]+" · "+p.name,
     category:action==="buy"?"Compra":action==="receive"?"Recepción":action==="delete"?"Decisión":"Nota",
     description:descriptions[action],itemId:p.id,origin:"inventory"});
 }
 function progress(){
   const total=st.milestones.length,done=st.milestones.filter(m=>m.completedAt).length;
   return {total,done,pct:total?Math.round(done/total*100):0};
 }
 function summary(){
   const products=items(),purchased=products.filter(p=>p.status==="Comprada"),
     received=purchased.filter(p=>p.received),
     paid=purchased.filter(p=>p.paidAmount!=null&&Number.isFinite(Number(p.paidAmount))),
     invested=paid.reduce((sum,p)=>sum+Number(p.paidAmount),0);
   return {products:products.length,purchased:purchased.length,received:received.length,paid:paid.length,missing:purchased.length-paid.length,invested};
 }
 function getBackup(){return {schemaVersion:1,entries:st.entries.map(e=>({...e})),milestones:st.milestones.map(m=>({...m}))};}
 function restoreFromBackup(data){
   if(!validBackup(data))return false;
   st.entries=data.entries.map(validateEntry);
   st.milestones=data.milestones.map(validateMilestone);
   for(const x of defaults())if(!st.milestones.some(m=>m.id===x.id))st.milestones.push(x);
   save();if(st.open)render();return true;
 }
 function closeForm(){const dialog=$("growthModal");dialog?.classList.add("hidden");document.body.style.overflow=st.open?"":"";
 }
 function showForm(e=null){
   st.editing=e?.id||null;
   $("growthFormTitle").textContent=e?"Editar registro":"Nuevo registro en la bitácora";
   $("growthForm").reset();
   $("growthDate").value=e?.date||today();
   $("growthTitle").value=e?.title||"";
   $("growthCategory").value=e?.category||"Nota";
   $("growthDescription").value=e?.description||"";
   const productSelect=$("growthProduct");
   productSelect.innerHTML='<option value="">Sin equipo asociado</option>'+items().map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
   productSelect.value=e?.itemId||"";
   $("growthModal").classList.remove("hidden");$("growthTitle").focus();
 }
 function saveForm(ev){
   ev.preventDefault();
   const old=st.entries.find(x=>x.id===st.editing);
   const e=validateEntry({id:old?.id||id(),createdAt:old?.createdAt||now(),origin:old?.origin||"manual",
     date:$("growthDate").value,title:$("growthTitle").value,category:$("growthCategory").value,
     description:$("growthDescription").value,itemId:$("growthProduct").value,updatedAt:now()});
   if(!e?.title)return;
   if(old)st.entries=st.entries.map(x=>x.id===e.id?e:x);else st.entries.unshift(e);
   save();closeForm();render();
 }
 function deleteEntry(entryId){
   const e=st.entries.find(x=>x.id===entryId);
   if(!e||!confirm("¿Eliminar de la bitácora «"+e.title+"»? Esta acción no borra el artículo del inventario."))return;
   st.entries=st.entries.filter(x=>x.id!==entryId);save();render();
 }
 function toggleMilestone(mid){
   const m=st.milestones.find(x=>x.id===mid);if(!m)return;
   const finished=!m.completedAt;
   m.completedAt=finished?now():null;
   makeEntry({title:(finished?"Hito completado":"Hito reabierto")+" · "+m.title,category:"Hito",
     description:finished?"Marcado como completado manualmente.":"Se reabrió este hito para continuar mejorándolo."});
   save();render();
 }
 function addMilestone(){
   const field=$("growthNewMilestone"),value=short(field?.value,160);
   if(!value)return;
   if(st.milestones.length>=60){alert("Límite de 60 hitos. Puedes cerrar o editar los actuales.");return;}
   st.milestones.push({id:id(),phase:"RUTA PERSONALIZADA",title:value,
     description:"Definido por ti; marca su finalización solo cuando sea un hecho.",order:st.milestones.length,
     completedAt:null,isCustom:true});
   field.value="";save();render();
 }
 function renderHeader(){
   const a=summary(),p=progress();
   $("growthKpis").innerHTML=[
      ["ARTÍCULOS",a.products,"Inventario registrado","▦"],
      ["RECIBIDOS",a.received,"de "+a.purchased+" compras confirmadas","✓"],
      ["INVERSIÓN DOCUMENTADA",money(a.invested),a.missing+" compras sin importe declarado","$"],
      ["RUTA COMPLETADA",p.pct+"%",p.done+" de "+p.total+" hitos confirmados","◇"]
   ].map(([label,value,caption,ico])=>'<div class="growth-stat"><div class="growth-stat-top">'+esc(label)+'<span>'+esc(ico)+'</span></div><strong>'+esc(value)+'</strong><small>'+esc(caption)+'</small></div>').join("");
   $("growthEntriesCount").textContent=st.entries.length+" registros";
   $("growthSaveState").textContent="Registro personal · guardado en este navegador. Exporta copias JSON para proteger tu historial.";
 }
 function renderLog(){
   const terms=st.query.toLocaleLowerCase("es");
   const data=st.entries.filter(e=>(st.kind==="Todos"||e.category===st.kind)&&
     (!terms||[e.title,e.description,e.category].join(" ").toLocaleLowerCase("es").includes(terms)))
     .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
   const root=$("growthEntries");
   if(!data.length){root.innerHTML='<div class="growth-empty"><span>✧</span><h3>'+ (st.entries.length?"No hay entradas con este filtro":"El comienzo queda documentado aquí") +'</h3><p>'+(st.entries.length?"Prueba otra categoría o búsqueda.":"Registra tu primera decisión, una prueba de máquina o un aprendizaje. Los movimientos futuros del inventario también quedarán anotados.")+'</p></div>';return;}
   root.innerHTML=data.map(e=>{
     const p=items().find(x=>x.id===e.itemId);
     return '<article class="growth-entry"><div class="growth-entry-marker '+(e.origin==="inventory"?"auto":"")+'">◆</div>'+
       '<div class="growth-entry-content"><div class="growth-entry-top"><span class="growth-kind">'+esc(e.category)+'</span><time datetime="'+esc(e.date)+'">'+esc(fmtDate(e.date))+'</time>'+(e.origin==="inventory"?'<span class="growth-origin">REGISTRO AUTOMÁTICO</span>':"")+'</div>'+
       '<h3>'+esc(e.title)+'</h3>'+(e.description?'<p>'+esc(e.description)+'</p>':"")+
       (p?'<span class="growth-associated">↳ '+esc(p.name)+'</span>':e.itemId?'<span class="growth-associated">↳ Artículo retirado del inventario</span>':"")+
       '<div class="growth-entry-actions"><button type="button" data-growth-action="edit" data-id="'+esc(e.id)+'">Editar</button><button type="button" data-growth-action="remove" data-id="'+esc(e.id)+'">Eliminar</button></div></div></article>';
   }).join("");
 }
 function renderRoadmap(){
   const p=progress();
   $("growthRoadProgress").style.width=p.pct+"%";
   $("growthRoadLabel").textContent=p.done+" de "+p.total+" hitos documentados · "+p.pct+"%";
   $("growthMilestones").innerHTML=st.milestones.slice().sort((a,b)=>a.order-b.order).map((m,i)=>
     '<article class="growth-milestone '+(m.completedAt?"done":"")+'">'+
     '<div class="growth-milestone-count">'+(m.completedAt?"✓":String(i+1).padStart(2,"0"))+'</div>'+
     '<div class="growth-milestone-body"><small>'+esc(m.phase||"MI RUTA")+'</small><h3>'+esc(m.title)+'</h3><p>'+esc(m.description||"")+'</p>'+
     '<div class="growth-milestone-foot">'+(m.completedAt?'<span class="growth-done">Confirmado el '+esc(fmtDate(m.completedAt))+'</span>':'<span>Por completar · no se presume realizado</span>')+
     '<button type="button" data-growth-action="milestone" data-id="'+esc(m.id)+'">'+(m.completedAt?"Reabrir":"Marcar completado")+'</button></div></div></article>'
   ).join("");
 }
 function render(){
   if(!$("growthScreen"))return;
   renderHeader();
   $("growthTabJournal").classList.toggle("active",st.section==="journal");
   $("growthTabRoadmap").classList.toggle("active",st.section==="roadmap");
   $("growthJournalPane").classList.toggle("hidden",st.section!=="journal");
   $("growthRoadmapPane").classList.toggle("hidden",st.section!=="roadmap");
   if(st.section==="journal")renderLog();else renderRoadmap();
 }
 function open(section="journal"){
   st.open=true;st.section=section;
   $("growthScreen").classList.remove("hidden");
   document.body.classList.add("growth-active");
   document.querySelectorAll("[data-growth-nav]").forEach(b=>b.classList.add("active"));
   document.querySelectorAll("[data-view]").forEach(b=>b.classList.remove("active"));
   $("growthScreen").scrollIntoView({block:"start",behavior:"instant"});
   document.querySelector(".crumbs b").textContent="ORIGEN";
   render();
 }
 function close(){
   st.open=false;document.body.classList.remove("growth-active");
   $("growthScreen").classList.add("hidden");
   document.querySelectorAll("[data-growth-nav]").forEach(b=>b.classList.remove("active"));
   document.querySelector(".crumbs b").textContent="INVENTARIO";
 }
 function init(){
   if(st.initialized)return;st.initialized=true;load();
   document.querySelectorAll("[data-growth-nav]").forEach(b=>b.addEventListener("click",()=>open("journal")));
   document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",close));
   $("growthTabJournal").addEventListener("click",()=>{st.section="journal";render();});
   $("growthTabRoadmap").addEventListener("click",()=>{st.section="roadmap";render();});
   $("growthAddEntry").addEventListener("click",()=>showForm());
   $("growthCloseModal").addEventListener("click",closeForm);
   $("growthCancelModal").addEventListener("click",closeForm);
   $("growthForm").addEventListener("submit",saveForm);
   $("growthKindFilter").addEventListener("change",e=>{st.kind=e.target.value;renderLog();});
   $("growthSearch").addEventListener("input",e=>{st.query=e.target.value;renderLog();});
   $("growthEntries").addEventListener("click",e=>{
     const b=e.target.closest("[data-growth-action]");if(!b)return;
     if(b.dataset.growthAction==="edit")showForm(st.entries.find(x=>x.id===b.dataset.id));
     if(b.dataset.growthAction==="remove")deleteEntry(b.dataset.id);
   });
   $("growthMilestones").addEventListener("click",e=>{
     const b=e.target.closest("[data-growth-action='milestone']");if(b)toggleMilestone(b.dataset.id);
   });
   $("growthNewMilestoneBtn").addEventListener("click",addMilestone);
   $("growthNewMilestone").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addMilestone();}});
   $("growthModal").addEventListener("click",e=>{if(e.target===$("growthModal"))closeForm();});
   document.addEventListener("keydown",e=>{if(e.key==="Escape")closeForm();});
 }
 window.GCGrowth={getBackup,restoreFromBackup,validateBackup:validBackup,recordInventoryAction,isOpen:()=>st.open,reassertNav:()=>{
   if(st.open)document.querySelectorAll("[data-view]").forEach(b=>b.classList.remove("active"));
 }};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
