/* GC GRAPHICS · Sync seguro Supabase (solo publishable key, RLS en Postgres) */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const state = {client:null,user:null,ready:false,queue:Promise.resolve(),snapshot:new Map(),channel:null,pending:false,timer:null,booted:false};
  const backend = () => window.GCInventory;
  const show = (message,mode="info") => {
    const button=$("cloudButton"), note=$("cloudState");
    if(button)button.textContent=mode==="ok"?"☁ Sincronizado":mode==="busy"?"☁ Guardando…":mode==="error"?"☁ Sin conexión":"☁ Conectar nube";
    if(note)note.textContent=message;
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
      manual_price:item.manualPrice??null,manual_original_price:item.manualOriginalPrice??null,stock_qty:item.stockQty??null,
      purchase_date:item.purchaseDate||null,paid_amount:item.paidAmount??null};
  }
  function itemFrom(x){return {id:x.id,order:x.sort_order,name:x.name,type:x.type,brand:x.brand,code:x.code,
    status:x.status,received:x.received,url:x.product_url,imageUrl:x.image_url,
    manualPrice:x.manual_price===null?null:Number(x.manual_price),
    manualOriginalPrice:x.manual_original_price===null?null:Number(x.manual_original_price),
    stockQty:x.stock_qty,purchaseDate:x.purchase_date,
    paidAmount:x.paid_amount===null?null:Number(x.paid_amount),
    notes:x.notes,notionUrl:x.notion_url,editedAt:x.updated_at};}
  function stable(x){return JSON.stringify(dataFrom(x,""));}
  function notify() {
    if(!state.ready||!state.user)return;
    state.pending=true;show("Guardando cambios en la base de datos…","busy");
    state.queue=state.queue.catch(()=>{}).then(async()=>{
      const desired=backend()?.getItems?.()||[];
      if(!state.user||!state.ready)return;
      const uid=state.user.id;
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
    const uid=state.user.id;
    const {data,error}=await state.client.from("inventory_items").select("*").eq("user_id",uid).order("sort_order",{ascending:true});
    if(error){show("No se pudo obtener el inventario: "+errorMessage(error),"error");return;}
    if(!state.user||state.user.id!==uid)return;
    if(initial && data.length===0){
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
    state.snapshot=new Map(items.map(p=>[p.id,stable(p)]));
    state.lastItems=new Map(items.map(p=>[p.id,{status:p.status,received:p.received}]));
    backend()?.setItemsFromCloud?.(items);
    state.ready=true;
    show("Inventario sincronizado: "+items.length+" artículos.","ok");
  }
  function subscribe(){
    if(state.channel)state.client.removeChannel(state.channel);
    if(!state.user)return;
    const uid=state.user.id;
    state.channel=state.client.channel("gc-inventory-"+uid)
      .on("postgres_changes",{event:"*",schema:"public",table:"inventory_items",filter:"user_id=eq."+uid},()=>{
        clearTimeout(state.timer);state.timer=setTimeout(()=>{if(!state.pending)loadRemote(false);},500);
      })
      .subscribe();
  }
  async function beginSession(user) {
    if(!user)return;
    state.ready=false;state.user=user;
    $("authSignOut")?.classList.remove("hidden");
    $("authForm")?.classList.add("hidden");
    show("Conectando a la base de datos…","busy");
    await loadRemote(true);
    if(state.ready){subscribe();closeLogin();}
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
    state.ready=false;state.user=null;
    if(state.channel){await state.client.removeChannel(state.channel);state.channel=null;}
    await state.client.auth.signOut();
    state.snapshot.clear();state.lastItems=new Map();
    $("authSignOut")?.classList.add("hidden");
    $("authForm")?.classList.remove("hidden");
    show("Sesión cerrada. Puedes seguir utilizando tu copia local.","info");
    closeLogin();
  }
  async function init(){
    if(state.booted)return;state.booted=true;
    $("cloudButton")?.addEventListener("click",openLogin);
    $("cloudClose")?.addEventListener("click",closeLogin);
    $("authForm")?.addEventListener("submit",login);
    $("authSignUp")?.addEventListener("click",signUp);
    $("authSignOut")?.addEventListener("click",signOut);
    try{
      const res=await fetch("./data/cloud-config.json",{cache:"no-store"});
      if(!res.ok)throw new Error("Falta configuración.");
      const config=await res.json();
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url||"")||!/^sb_publishable_/.test(config.publishableKey||""))throw new Error("La base de datos privada todavía no está activada.");
      if(!window.supabase?.createClient)throw new Error("No se pudo cargar el cliente de base de datos.");
      state.client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      state.client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"&&state.user){state.ready=false;state.user=null;show("Sesión cerrada.","info");}
      });
      const {data,error}=await state.client.auth.getUser();
      if(error && !/session/i.test(errorMessage(error)))console.warn(errorMessage(error));
      if(data?.user)await beginSession(data.user);
      else show("Para sincronizar entre dispositivos, inicia sesión.","info");
    }catch(e){show("Modo local seguro. "+errorMessage(e),"info");}
  }
  window.GCCloud={notify,ready:()=>state.ready};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
