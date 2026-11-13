/* GC GRAPHICS · Sync seguro Supabase (solo publishable key, RLS en Postgres) */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const state = {client:null,user:null,ready:false,queue:Promise.resolve(),snapshot:new Map(),channel:null,journalChannel:null,pending:false,timer:null,booted:false,ownerId:null,viewer:false,applyingJournal:false,backupTimer:null};
  const backend = () => window.GCInventory;
  const show = (message,mode="info") => {
    const button=$("cloudButton"), note=$("cloudState");
    if(button)button.textContent=mode==="ok"?"☁ Sincronizado":mode==="busy"?"☁ Guardando…":mode==="error"?"☁ Sin conexión":state.viewer?"👁 Vista familiar":"☁ Conectar nube";
    if(note)note.textContent=message;
    const connection=document.querySelector(".connection");
    if(connection&&connection.lastChild?.nodeType===3)connection.lastChild.nodeValue=state.ready?(state.viewer?" Vista familiar · sincronizada":" Registros sincronizados · copia local"):" Sincronización pendiente";
    const extra=$("authMessage");if(extra)extra.textContent=message;
  };
  const errorMessage=e=>String(e?.message||e||"Error de conexión").slice(0,230);
  function openLogin(){const dialog=$("cloudOverlay");if(!dialog)return;dialog.classList.remove("hidden");$("authEmail")?.focus();}
  function closeLogin(){$("cloudOverlay")?.classList.add("hidden");}
  function dataFrom(item, uid) {
    return {user_id:uid,id:item.id,sort_order:item.order||0,name:item.name,
      type:item.type,status:item.status,received:!!item.received,
      brand:item.brand||"",code:item.code||"",product_url:item.url||"",
      image_url:item.imageUrl||"",notes:item.notes||"",notion_url:item.notionUrl||"",
      manual_price:item.manualPrice??null,manual_original_price:item.manualOriginalPrice??null,local_price_dop:item.localPriceDop??null,local_shop_name:item.localShopName||"",local_price_checked_at:item.localPriceCheckedAt||null,stock_qty:item.stockQty??null,paid_currency:item.paidCurrency||"USD",purchase_country:item.purchaseCountry||null,
      purchase_date:item.purchaseDate||null,paid_amount:item.paidAmount??null};
  }
  function itemFrom(x){return {id:x.id,order:x.sort_order,name:x.name,type:x.type,brand:x.brand,code:x.code,
    status:x.status,received:x.received,url:x.product_url,imageUrl:x.image_url,
    manualPrice:x.manual_price===null?null:Number(x.manual_price),
    manualOriginalPrice:x.manual_original_price===null?null:Number(x.manual_original_price),
    localPriceDop:x.local_price_dop===null?null:Number(x.local_price_dop),localShopName:x.local_shop_name||"",localPriceCheckedAt:x.local_price_checked_at||null,
    stockQty:x.stock_qty,purchaseDate:x.purchase_date,paidCurrency:x.paid_currency||"USD",purchaseCountry:x.purchase_country||null,
    paidAmount:x.paid_amount===null?null:Number(x.paid_amount),
    notes:x.notes,notionUrl:x.notion_url,editedAt:x.updated_at};}
  function stable(x){return JSON.stringify(dataFrom(x,""));}
  function notify() {
    if(!state.ready||!state.user||state.viewer)return;
    state.pending=true;show("Guardando cambios en la base de datos…","busy");
    state.queue=state.queue.catch(()=>{}).then(async()=>{
      const desired=backend()?.getItems?.()||[];
      if(!state.user||!state.ready)return;
      const uid=state.ownerId;
      const desiredMap=new Map(desired.map(p=>[p.id,p]));
      const put=desired.filter(p=>state.snapshot.get(p.id)!==stable(p));
      const remove=[...state.snapshot.keys()].filter(id=>!desiredMap.has(id));
      if(put.length){
        const {error}=await state.client.from("inventory_items").upsert(put.map(p=>dataFrom(p,uid)),{onConflict:"user_id,id"});
        if(error)throw error;
      }
      if(remove.length){
        const {error}=await state.client.from("inventory_items").delete().eq("user_id",uid).in("id",remove);
        if(error)throw error;
      }
      // Registra movimientos de compra, recepción y eliminación en bitácora.
      const events=[];
      for(const p of put) {
        const prev=state.lastItems?.get(p.id);
        if(p.status==="Comprada"&&prev?.status!=="Comprada")events.push({user_id:uid,item_id:p.id,event_type:"purchase_confirmed",detail:{purchase_date:p.purchaseDate,paid_amount:p.paidAmount}});
        if(p.received&&!prev?.received)events.push({user_id:uid,item_id:p.id,event_type:"received_confirmed",detail:{}});
      }
      for(const id of remove)events.push({user_id:uid,item_id:id,event_type:"deleted",detail:{}});
      if(events.length)state.client.from("inventory_events").insert(events).then(({error})=>{if(error)console.warn("Bitácora:",error.message);});
      state.snapshot=new Map(desired.map(p=>[p.id,stable(p)]));
      state.lastItems=new Map(desired.map(p=>[p.id,{status:p.status,received:p.received}]));
      state.pending=false;show("Guardado en la nube. Los cambios se propagan automáticamente.","ok");
    }).catch(e=>{
      state.pending=false;
      show("Cambios locales guardados, pero falta sincronización: "+errorMessage(e),"error");
      console.error("GC GRAPHICS sync:",e);
    });
  }
  async function loadRemote(initial=false) {
    if(!state.client||!state.user||state.pending)return;
    const uid=state.ownerId;
    const {data,error}=await state.client.from("inventory_items").select("*").eq("user_id",uid).order("sort_order",{ascending:true});
    if(error){show("No se pudo obtener el inventario: "+errorMessage(error),"error");return;}
    if(!state.user||state.ownerId!==uid)return;
    if(initial && !state.viewer && data.length===0){
      const local=backend()?.getItems?.()||[];
      if(local.length){
        const {error:e}=await state.client.from("inventory_items").upsert(local.map(p=>dataFrom(p,uid)),{onConflict:"user_id,id"});
        if(e){show("La importación inicial falló: "+errorMessage(e),"error");return;}
        state.snapshot=new Map(local.map(p=>[p.id,stable(p)]));
        state.lastItems=new Map(local.map(p=>[p.id,{status:p.status,received:p.received}]));
        state.ready=true;show("Inventario importado y guardado en la nube.","ok");return;
      }
    }
    const items=data.map(itemFrom);
    // Preserve a recoverable local copy before replacing it with newer cloud data.
    try{
      if(initial&&items.length){
        const previous=backend()?.getItems?.()||[];
        if(previous.length && JSON.stringify(previous.map(x=>[x.id,x.status,x.received,x.paidAmount,x.notes]))!==JSON.stringify(items.map(x=>[x.id,x.status,x.received,x.paidAmount,x.notes]))){
          const backup={schemaVersion:1,exportedAt:new Date().toISOString(),items:previous,growth:window.GCGrowth?.getBackup?.()||null};
          localStorage.setItem("gc_graphics_precloud_recovery",JSON.stringify(backup));
        }
      }
    }catch(e){console.info("Respaldo local:",e.message);}
    state.snapshot=new Map(items.map(p=>[p.id,stable(p)]));
    state.lastItems=new Map(items.map(p=>[p.id,{status:p.status,received:p.received}]));
    backend()?.setItemsFromCloud?.(items);
    state.ready=true;
    show("Inventario sincronizado: "+items.length+" artículos.","ok");
  }
  function subscribe(){
    if(state.channel)state.client.removeChannel(state.channel);
    if(!state.user)return;
    const uid=state.ownerId;
    state.channel=state.client.channel("gc-inventory-"+uid)
      .on("postgres_changes",{event:"*",schema:"public",table:"inventory_items",filter:"user_id=eq."+uid},()=>{
        clearTimeout(state.timer);state.timer=setTimeout(()=>{if(!state.pending)loadRemote(false);},500);
      })
      .subscribe();
  }
  async function waitInventory(){
    if(backend()?.ready?.())return;
    await Promise.race([new Promise(resolve=>document.addEventListener("gc-inventory-ready",resolve,{once:true})),new Promise(resolve=>setTimeout(resolve,10000))]);
  }
  async function refreshViewers(){
    if(!state.client||!state.user||state.viewer)return;
    const {data,error}=await state.client.from("inventory_viewers").select("viewer_email").eq("owner_id",state.user.id);
    if(error){show("No se pudo consultar la lista de acceso: "+errorMessage(error),"error");return;}
    const list=$("viewerList");if(!list)return;
    list.replaceChildren();
    for(const item of data||[]){
      const row=document.createElement("div");row.className="viewer-invite";
      const label=document.createElement("span");label.textContent="👁 "+item.viewer_email;
      const remove=document.createElement("button");remove.type="button";remove.textContent="Revocar";remove.className="btn btn-secondary";
      remove.addEventListener("click",async()=>{
        if(!confirm("¿Revocar acceso de lectura a "+item.viewer_email+"?"))return;
        const r=await state.client.from("inventory_viewers").delete().eq("owner_id",state.user.id).eq("viewer_email",item.viewer_email);
        if(r.error)show("No se pudo revocar el acceso: "+errorMessage(r.error),"error");else{show("Acceso revocado.","ok");await refreshViewers();}
      });
      row.append(label,remove);list.append(row);
    }
    if(!data?.length)list.textContent="Todavía no se ha invitado a nadie.";
  }
  async function addViewer(event){
    event.preventDefault();
    if(!state.client||!state.user||state.viewer)return;
    const email=$("viewerEmail").value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254){show("Escribe un correo válido.","error");return;}
    if(email===state.user.email?.toLowerCase()){show("Este ya es tu correo de administrador.","info");return;}
    const {error}=await state.client.from("inventory_viewers").upsert({owner_id:state.user.id,viewer_email:email,role:"viewer",label:"Familia"},{onConflict:"owner_id,viewer_email"});
    if(error)show("No se pudo compartir: "+errorMessage(error),"error");
    else{$("viewerEmail").value="";show("Invitación registrada. Tu familiar debe crear su cuenta con ese correo y confirmarlo.","ok");await refreshViewers();}
  }
  async function loadGrowth(initial=false){
    if(!state.client||!state.ownerId)return;
    const {data,error}=await state.client.from("inventory_journal_state").select("document").eq("user_id",state.ownerId).maybeSingle();
    if(error){console.info("Bitácora:",error.message);return;}
    if(!data&&initial&&!state.viewer){
      const backup=window.GCGrowth?.getBackup?.();
      if(!backup)return;
      const r=await state.client.from("inventory_journal_state").upsert({user_id:state.ownerId,document:backup},{onConflict:"user_id"});
      if(r.error)show("Inventario guardado; bitácora pendiente: "+errorMessage(r.error),"error");
      return;
    }
    if(data?.document&&window.GCGrowth?.validateBackup?.(data.document)){
      state.applyingJournal=true;
      try{window.GCGrowth.restoreFromBackup(data.document);}finally{state.applyingJournal=false;}
    }
  }
  function notifyGrowth(){
    if(!state.ready||!state.user||state.viewer||state.applyingJournal)return;
    clearTimeout(state.backupTimer);
    state.backupTimer=setTimeout(async()=>{
      const backup=window.GCGrowth?.getBackup?.();
      if(!backup)return;
      const {error}=await state.client.from("inventory_journal_state").upsert({user_id:state.ownerId,document:backup},{onConflict:"user_id"});
      if(error)show("Bitácora guardada localmente, aún no en la nube: "+errorMessage(error),"error");
      else show("Bitácora sincronizada entre dispositivos.","ok");
    },350);
  }
  async function beginSession(user) {
    if(!user||state.user?.id===user.id&&state.ready)return;
    await waitInventory();
    state.ready=false;state.user=user;state.ownerId=user.id;state.viewer=false;
    show("Verificando acceso privado…","busy");
    const {data:links,error:linkError}=await state.client.from("inventory_viewers").select("owner_id,role");
    if(linkError){show("Error validando acceso: "+errorMessage(linkError),"error");return;}
    const invited=(links||[]).find(x=>x.owner_id!==user.id&&x.role==="viewer");
    if(invited){state.ownerId=invited.owner_id;state.viewer=true;}
    backend()?.setReadOnly?.(state.viewer);
    $("viewerTools")?.classList.toggle("hidden",state.viewer);
    $("authSignOut")?.classList.remove("hidden");
    $("authForm")?.classList.add("hidden");
    await loadRemote(true);
    if(!state.ready)return;
    await loadGrowth(true);
    subscribe();
    if(state.journalChannel)await state.client.removeChannel(state.journalChannel);
    state.journalChannel=state.client.channel("gc-journal-"+state.ownerId)
      .on("postgres_changes",{event:"*",schema:"public",table:"inventory_journal_state",filter:"user_id=eq."+state.ownerId},()=>{if(!state.applyingJournal)loadGrowth(false);}).subscribe();
    document.body.classList.remove("cloud-needs-auth");
    if(!state.viewer)await refreshViewers();
    closeLogin();
    show(state.viewer?"Vista familiar conectada. Puedes consultar los avances sin modificarlos.":"Administrador: inventario y bitácora sincronizados.","ok");
  }
  async function login(event){
    event.preventDefault();
    if(!state.client)return;
    const email=$("authEmail").value.trim(),password=$("authPassword").value;
    if(!email||password.length<8){show("Introduce un correo válido y contraseña de 8 caracteres como mínimo.","error");return;}
    show("Verificando credenciales…","busy");
    const result=await state.client.auth.signInWithPassword({email,password});
    if(result.error)show("No se pudo ingresar: "+errorMessage(result.error),"error");
    else if(result.data?.user)await beginSession(result.data.user);
  }
  async function signUp(){
    if(!state.client)return;
    const email=$("authEmail").value.trim(),password=$("authPassword").value;
    if(!email||password.length<8){show("Introduce un correo válido y contraseña de 8 caracteres como mínimo.","error");return;}
    show("Registrando cuenta…","busy");
    const r=await state.client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+"/"}});
    if(r.error)show("No se pudo crear la cuenta: "+errorMessage(r.error),"error");
    else if(r.data.session?.user)await beginSession(r.data.user);
    else show("Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.","ok");
  }
  async function signOut() {
    state.ready=false;state.user=null;state.viewer=false;state.ownerId=null;
    if(state.journalChannel){await state.client.removeChannel(state.journalChannel);state.journalChannel=null;}
    if(state.channel){await state.client.removeChannel(state.channel);state.channel=null;}
    await state.client.auth.signOut();
    state.snapshot.clear();state.lastItems=new Map();
    backend()?.setItemsFromCloud?.([]);
    backend()?.setReadOnly?.(true);
    document.body.classList.add("cloud-needs-auth");
    $("viewerTools")?.classList.add("hidden");
    $("authSignOut")?.classList.add("hidden");
    $("authForm")?.classList.remove("hidden");
    show("Sesión cerrada. Vuelve a ingresar para consultar datos privados.","info");
    closeLogin();
  }
  async function init(){
    if(state.booted)return;state.booted=true;
    $("cloudButton")?.addEventListener("click",openLogin);
    $("cloudClose")?.addEventListener("click",closeLogin);
    $("authForm")?.addEventListener("submit",login);
    $("authSignUp")?.addEventListener("click",signUp);
    $("authSignOut")?.addEventListener("click",signOut);
    $("viewerForm")?.addEventListener("submit",addViewer);
    window.addEventListener("online",()=>{if(state.ready&&!state.viewer){notify();notifyGrowth();}else if(state.ready)loadRemote(false);});
    try{
      const res=await fetch("./data/cloud-config.json",{cache:"no-store"});
      if(!res.ok)throw new Error("Falta configuración.");
      const config=await res.json();
      document.body.classList.add("cloud-needs-auth");
      backend()?.setReadOnly?.(true);
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url||"")||!/^sb_publishable_/.test(config.publishableKey||""))throw new Error("La base de datos privada todavía no está activada.");
      if(!window.supabase?.createClient)throw new Error("No se pudo cargar el cliente de base de datos.");
      state.client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      state.client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"&&state.user){state.ready=false;state.user=null;show("Sesión cerrada.","info");}
      });
      const {data,error}=await state.client.auth.getUser();
      if(error && !/session/i.test(errorMessage(error)))console.warn(errorMessage(error));
      if(data?.user)await beginSession(data.user);
      else {show("Inicia sesión para abrir tu inventario privado.","info");openLogin();}
    }catch(e){show("Modo local seguro. "+errorMessage(e),"info");}
  }
  window.GCCloud={notify,notifyGrowth,ready:()=>state.ready,isViewer:()=>state.viewer,ownerId:()=>state.ownerId};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
