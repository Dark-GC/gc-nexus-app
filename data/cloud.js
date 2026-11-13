/* GC GRAPHICS · Sync seguro Supabase (solo publishable key, RLS en Postgres) */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const state = {client:null,user:null,ready:false,queue:Promise.resolve(),snapshot:new Map(),channel:null,journalChannel:null,pending:false,timer:null,booted:false,ownerId:null,viewer:false,familyRole:null,applyingJournal:false,backupTimer:null,pendingCount:0,syncError:false,inventoryError:false,journalError:false,epoch:0,sessionClosing:false};
  const backend = () => window.GCInventory;
  const show = (message,mode="info") => {
    const button=$("cloudButton"), note=$("cloudState");
    if(button)button.textContent=mode==="busy"?"☁ Guardando…":mode==="error"?"⚠ Revisar acceso":state.viewer?(state.familyRole==="buyer"?"🛒 Compras familiares":"👁 Vista familiar"):state.ready?"👥 Cuentas familiares":"🔒 Ingresar";
    if(note)note.textContent=message;
    const connection=document.querySelector(".connection");
    if(connection&&connection.lastChild?.nodeType===3)connection.lastChild.nodeValue=state.ready?(state.viewer?" Vista familiar · sincronizada":" Registros sincronizados · copia local"):" Sincronización pendiente";
    const extra=$("authMessage");if(extra){extra.textContent=message;extra.dataset.state=mode;}
  };
  const errorMessage=e=>String(e?.message||e||"Error de conexión").slice(0,230);
  function hideCredentials(){
    if($("familyCredentialsText"))$("familyCredentialsText").value="";
    $("familyCredentials")?.classList.add("hidden");
  }
  function updatePasswordStrength(){
    const input=$("viewerPassword"),meter=$("viewerPasswordStrength");if(!input||!meter)return;
    const result=window.GCDialog?.passwordStrength?.(input.value)||{score:0,label:"Débil"};
    meter.dataset.score=String(result.score);
    const suffix=input.value.length<12?" · faltan "+(12-input.value.length)+" caracteres":"";
    meter.querySelector("small").textContent="Fortaleza: "+result.label+suffix;
  }
  function openLogin(){
    const overlay=$("cloudOverlay");if(!overlay)return;
    const loggedIn=!!(state.ready&&state.user);
    overlay.classList.remove("hidden");
    overlay.classList.toggle("gc-authorized",loggedIn);
    $("gcLoginView")?.classList.toggle("hidden",loggedIn);
    $("gcAccountView")?.classList.toggle("hidden",!loggedIn);
    if(loggedIn){
      if($("gcAccountHeading"))$("gcAccountHeading").textContent=state.viewer?"Tu cuenta":"Gestionar accesos";
      $("viewerTools")?.classList.toggle("hidden",state.viewer);
      if(!state.viewer)refreshViewers();
    }
    else $("authEmail")?.focus();
  }
  function closeLogin(){
    if(!state.ready)return; // A private inventory cannot be exposed before authentication.
    hideCredentials();
    $("cloudOverlay")?.classList.add("hidden");
  }
  function revealCredentials(data){
    if(!data?.ok||!data.email||!data.password)return;
    const role=data.role==="buyer"?"Compras y recepción":data.role==="viewer"?"Solo lectura":null;
    const message="GC GRAPHICS · TU ACCESO\n\n"+
      "Enlace: "+(data.loginUrl||location.origin+"/data/app.html")+"\n"+
      "Correo: "+data.email+"\n"+
      "Contraseña: "+data.password+"\n\n"+
      "Abre el enlace, escribe tus datos y toca «Entrar a GC GRAPHICS»."+
      (role?"\nPermiso: "+role:"");
    $("familyCredentialsText").value=message;
    $("familyCredentials")?.classList.remove("hidden");
    $("familyCredentialsText")?.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  async function memberRequest(body){
    const {data,error}=await state.client.functions.invoke("gc-family-access",{body});
    if(error){
      let code="";
      try{const details=await error.context?.json?.();code=details?.error||details?.message||"";}catch{}
      const descriptions={
        "ADMIN_ONLY":"Esta cuenta no tiene permisos de administración.",
        "USER_CREATION_FAILED":"No se pudo crear la cuenta. Revisa si el correo ya tiene una.",
        "INVITATION_FAILED":"La cuenta no se vinculó. Vuelve a intentarlo.",
        "PASSWORD_RESET_FAILED":"No se pudo renovar la contraseña.",
        "WEAK_PASSWORD":"La contraseña debe tener entre 12 y 128 caracteres.",
        "NOT_YOUR_MEMBER":"Este usuario no pertenece a tu inventario.",
        "NOT_A_MANAGED_USER":"Esta cuenta no fue creada desde este panel.",
        "LOGIN_REQUIRED":"Tu sesión terminó. Vuelve a entrar."
      };
      throw new Error(descriptions[code]||"No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.");
    }
    if(!data?.ok)throw new Error("El servidor no confirmó la operación.");
    return data;
  }
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
    if(!state.ready||!state.user||state.viewer||state.sessionClosing)return;
    const epoch=state.epoch,uid=state.ownerId,userId=state.user.id;
    state.pendingCount++;state.pending=true;
    show("Guardando cambios del inventario…","busy");
    state.queue=state.queue.catch(()=>{}).then(async()=>{
      if(epoch!==state.epoch||!state.ready||state.viewer||state.user?.id!==userId)return;
      const desired=backend()?.getItems?.()||[];
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
      // The DB trigger gc_owner_item_atomic_audit writes history atomically
      // with each owner INSERT/UPDATE/DELETE. Never send a second event batch.
      // If a database write fails, the matching movement is rolled back too.
      state.snapshot=new Map(desired.map(p=>[p.id,stable(p)]));
      state.lastItems=new Map(desired.map(p=>[p.id,{status:p.status,received:p.received}]));

    }).then(()=>{
      if(epoch!==state.epoch)return;
      state.pendingCount=Math.max(0,state.pendingCount-1);
      state.pending=state.pendingCount>0;
      if(!state.pending){state.inventoryError=false;state.syncError=state.inventoryError||state.journalError;show(state.syncError?"Inventario guardado; la bitácora necesita sincronización.":"Inventario y movimientos guardados en la nube.",state.syncError?"error":"ok");}
    }).catch(e=>{
      if(epoch!==state.epoch)return;
      state.pendingCount=Math.max(0,state.pendingCount-1);
      state.pending=state.pendingCount>0;
      state.inventoryError=true;state.syncError=true;
      show("Atención: hay cambios locales no sincronizados. "+errorMessage(e),"error");
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
        clearTimeout(state.timer);state.timer=setTimeout(async()=>{if(!state.pending){await loadRemote(false);await fetchFamilyEvents();}},500);
      })
      .subscribe();
  }
  async function waitInventory(){
    if(backend()?.ready?.())return;
    await Promise.race([new Promise(resolve=>document.addEventListener("gc-inventory-ready",resolve,{once:true})),new Promise(resolve=>setTimeout(resolve,10000))]);
  }
  async function refreshViewers(){
    if(!state.client||!state.user||state.viewer)return;
    const {data,error}=await state.client.from("inventory_viewers").select("viewer_email,role").eq("owner_id",state.user.id);
    if(error){show("No se pudieron consultar las cuentas familiares.","error");return;}
    const list=$("viewerList");if(!list)return;
    list.replaceChildren();
    for(const item of data||[]){
      const row=document.createElement("div");row.className="viewer-invite";
      const label=document.createElement("span");label.textContent="👤 "+item.viewer_email;
      const permission=document.createElement("select");
      permission.setAttribute("aria-label","Permisos de "+item.viewer_email);
      for(const [value,title] of [["buyer","Compras y recepción"],["viewer","Solo lectura"]]){
        const option=document.createElement("option");option.value=value;option.textContent=title;permission.append(option);
      }
      permission.value=item.role;
      permission.addEventListener("change",async()=>{
        permission.disabled=true;const chosen=permission.value;
        const {error}=await state.client.from("inventory_viewers").update({role:chosen})
          .eq("owner_id",state.user.id).eq("viewer_email",item.viewer_email);
        if(error){permission.value=item.role;show("No se pudieron cambiar los permisos.","error");}
        else{item.role=chosen;show("Permisos actualizados.","ok");}
        permission.disabled=false;
      });
      const reset=document.createElement("button");reset.type="button";reset.textContent="Activar / nueva clave";reset.className="btn btn-secondary";
      reset.addEventListener("click",async()=>{
        const passwords=await window.GCDialog?.requestPassword?.({title:"Nueva contraseña para "+item.viewer_email,message:"La contraseña anterior dejará de funcionar. Elige una nueva de al menos 12 caracteres y compártela de forma privada.",confirmLabel:"Renovar contraseña"});
        if(!passwords)return;
        reset.disabled=true;reset.textContent="Guardando…";
        try{const result=await memberRequest({action:"reset",email:item.viewer_email,password:passwords.uiPassword});hideCredentials();revealCredentials(result);
          show("Contraseña renovada. Copia los nuevos datos y envíaselos de forma privada.","ok");
        }catch(e){show(e.message,"error");}
        finally{reset.disabled=false;reset.textContent="Nueva clave";}
      });
      const remove=document.createElement("button");remove.type="button";remove.textContent="Revocar";remove.className="btn btn-secondary";
      remove.addEventListener("click",async()=>{
        const accepted=await window.GCDialog?.confirm?.({title:"Revocar acceso familiar",kicker:"CUENTAS FAMILIARES",message:"¿Quitar el acceso a "+item.viewer_email+"? No podrá consultar ni registrar compras.",confirmLabel:"Revocar acceso",danger:true});
        if(!accepted)return;
        remove.disabled=true;
        const {error}=await state.client.from("inventory_viewers").delete().eq("owner_id",state.user.id).eq("viewer_email",item.viewer_email);
        if(error){show("No se pudo revocar el acceso.","error");remove.disabled=false;}
        else{show("Acceso revocado.","ok");hideCredentials();await refreshViewers();}
      });
      row.append(label,permission,reset,remove);list.append(row);
    }
    if(!data?.length)list.textContent="Aún no hay cuentas familiares. Crea la primera con el formulario.";
  }
  async function addViewer(event){
    event.preventDefault();
    if(!state.client||!state.user||state.viewer||state.user.app_metadata?.gc_admin!==true)return;
    const email=$("viewerEmail").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){
      show("Escribe un correo electrónico válido.","error");return;
    }
    if(email===state.user.email?.toLowerCase()){
      show("Tu cuenta administradora ya tiene acceso.","info");return;
    }
    const role=$("viewerRole").value==="viewer"?"viewer":"buyer";
    const password=$("viewerPassword").value,confirmation=$("viewerPasswordConfirm").value;
    if(password.length<12){show("La contraseña debe tener al menos 12 caracteres.","error");$("viewerPassword").focus();return;}
    if(password.length>128){show("La contraseña es demasiado larga.","error");return;}
    if(password!==confirmation){show("Las contraseñas no coinciden.","error");$("viewerPasswordConfirm").focus();return;}
    const submit=$("createFamilyButton");submit.disabled=true;submit.textContent="Creando acceso seguro…";
    try{
      const result=await memberRequest({action:"create",email,role,password});
      hideCredentials();revealCredentials(result);
      $("viewerEmail").value="";
      $("viewerPassword").value="";$("viewerPasswordConfirm").value="";updatePasswordStrength();
      show("¡Cuenta creada! Copia sus datos para enviarlos a tu familiar.","ok");
      await refreshViewers();
    }catch(e){show(e.message,"error");}
    finally{submit.disabled=false;submit.textContent="＋ Crear acceso familiar";}
  }
  async function fetchFamilyEvents(){
    if(!state.client||!state.ownerId||!state.user)return;
    const owner=state.ownerId;
    const {data,error}=await state.client.from("inventory_events")
      .select("event_id,item_id,event_type,detail,event_at").eq("user_id",owner)
      .order("event_at",{ascending:false}).limit(300);
    if(error){console.info("Movimientos familiares:",error.message);return;}
    if(owner===state.ownerId)window.GCGrowth?.setFamilyEvents?.(data||[]);
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
  async function flushGrowth(){
    if(!state.ready||!state.user||state.viewer||state.applyingJournal)return true;
    clearTimeout(state.backupTimer);
    const owner=state.ownerId,epoch=state.epoch,backup=window.GCGrowth?.getBackup?.();
    if(!backup)return true;
    try{
      const {error}=await state.client.from("inventory_journal_state").upsert({user_id:owner,document:backup},{onConflict:"user_id"});
      if(error)throw error;
      if(epoch===state.epoch){state.journalError=false;state.syncError=state.inventoryError||state.journalError;show("Bitácora guardada en la nube.","ok");}
      return true;
    }catch(e){
      if(epoch===state.epoch){state.journalError=true;state.syncError=true;show("Atención: bitácora pendiente de sincronizar. "+errorMessage(e),"error");}
      return false;
    }
  }
  function notifyGrowth(){
    if(!state.ready||!state.user||state.viewer||state.applyingJournal||state.sessionClosing)return;
    clearTimeout(state.backupTimer);
    state.backupTimer=setTimeout(()=>{flushGrowth();},350);
  }
  async function familyAction(mode, details) {
    if(!state.ready||!state.user||!state.viewer||state.familyRole!=="buyer")
      throw new Error("No tienes permiso para confirmar compras.");
    if(!["buy","receive"].includes(mode)||typeof details?.id!=="string"||!details.id)
      throw new Error("Acción o artículo inválido.");
    if(state.pending)throw new Error("Hay una actualización en curso.");
    const epoch=state.epoch;
    state.pending=true;
    show("Guardando confirmación familiar…","busy");
    try {
      const args={
        p_owner_id:state.ownerId,p_item_id:details.id,p_action:mode,
        p_purchase_date:mode==="buy"?(details.purchaseDate||null):null,
        p_paid_amount:mode==="buy"?(details.paidAmount??null):null,
        p_paid_currency:mode==="buy"?(details.paidCurrency||"USD"):"USD",
        p_purchase_country:mode==="buy"?(details.purchaseCountry||null):null,
        p_received:mode==="buy"&&details.received===true
      };
      const {data,error}=await state.client.rpc("gc_family_purchase_action",args);
      if(error){
        const codes={
          "ARTICLE_NOT_PENDING":"Este artículo ya cambió de estado. Actualiza la ficha.",
          "ARTICLE_NOT_AWAITING_RECEIPT":"Este artículo no está pendiente de recepción.",
          "BUYER_PERMISSION_REQUIRED":"Tu permiso de compras fue revocado.",
          "VERIFIED_EMAIL_REQUIRED":"Primero confirma tu correo electrónico.",
          "ARTICLE_NOT_FOUND":"La ficha ya no existe en este inventario."
        };
        const message=Object.keys(codes).find(k=>String(error.message||"").includes(k));
        throw new Error(message?codes[message]:String(error.message||"No se pudo registrar.").slice(0,180));
      }
      state.pending=false;
      if(epoch!==state.epoch)throw new Error("La sesión cambió durante la compra; vuelve a ingresar.");
      await loadRemote(false);
      await fetchFamilyEvents();
      show(mode==="buy"?"Compra confirmada y registrada en la bitácora de movimientos.":"Recepción física confirmada y registrada.","ok");
      return data;
    }catch(e){
      state.pending=false;
      show("No se guardó el cambio: "+errorMessage(e),"error");
      throw e;
    }
  }

  async function beginSession(user) {
    if(!user||state.user?.id===user.id&&state.ready)return;
    await waitInventory();
    state.epoch++;state.pendingCount=0;state.pending=false;state.syncError=false;state.inventoryError=false;state.journalError=false;state.sessionClosing=false;
    state.ready=false;state.user=user;state.ownerId=user.id;state.viewer=false;
    show("Verificando acceso privado…","busy");
    const {data:links,error:linkError}=await state.client.from("inventory_viewers").select("owner_id,role");
    if(linkError){show("Error validando acceso: "+errorMessage(linkError),"error");return;}
    const invited=(links||[]).find(x=>x.owner_id!==user.id&&["viewer","buyer"].includes(x.role));
    const isAdmin=user.app_metadata?.gc_admin===true&&!!user.email_confirmed_at;
    if(!invited&&!isAdmin){
      state.ready=false;state.user=null;state.ownerId=null;state.viewer=false;state.familyRole=null;
      backend()?.setItemsFromCloud?.([]);window.GCGrowth?.clearPrivateView?.();
      backend()?.setReadOnly?.(true);document.body.classList.add("cloud-needs-auth");
      await state.client.auth.signOut();
      show("Este correo no tiene acceso a GC GRAPHICS. Pide al administrador que cree tu cuenta.","error");
      openLogin();return;
    }
    if(invited){state.ownerId=invited.owner_id;state.viewer=true;state.familyRole=invited.role;}else state.familyRole=null;
    backend()?.setReadOnly?.(state.viewer,state.familyRole==="buyer");
    $("viewerTools")?.classList.toggle("hidden",state.viewer);
    $("authSignOut")?.classList.remove("hidden");
    $("authForm")?.classList.add("hidden");
    $("gcLoginView")?.classList.add("hidden");
    $("gcAccountView")?.classList.remove("hidden");
    await loadRemote(true);
    if(!state.ready)return;
    await loadGrowth(true);
    await fetchFamilyEvents();
    subscribe();
    if(state.journalChannel)await state.client.removeChannel(state.journalChannel);
    state.journalChannel=state.client.channel("gc-journal-"+state.ownerId)
      .on("postgres_changes",{event:"*",schema:"public",table:"inventory_journal_state",filter:"user_id=eq."+state.ownerId},()=>{if(!state.applyingJournal)loadGrowth(false);}).subscribe();
    document.body.classList.remove("cloud-needs-auth");
    if(!state.viewer)await refreshViewers();
    closeLogin();
    show(state.viewer?(state.familyRole==="buyer"?"Vista familiar: puedes confirmar compras y recepciones.":"Vista familiar: solo consulta."):"Administrador: inventario y bitácora sincronizados.","ok");
  }
  async function login(event){
    event.preventDefault();
    if(!state.client){show("No hay conexión con la base de datos. Vuelve a intentar.","error");return;}
    const email=$("authEmail").value.trim().toLowerCase(),password=$("authPassword").value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8){
      show("Revisa tu correo y contraseña para continuar.","error");return;
    }
    const button=$("authLoginButton");button.disabled=true;
    show("Verificando tu acceso…","busy");
    try{
      const result=await state.client.auth.signInWithPassword({email,password});
      if(result.error){show("Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.","error");return;}
      $("authPassword").value="";
      if(result.data?.user)await beginSession(result.data.user);
      else show("No se pudo abrir la sesión. Vuelve a intentarlo.","error");
    }catch(e){show("No hay conexión. Revisa internet y vuelve a intentarlo.","error");}
    finally{button.disabled=false;}
  }
  async function signOut() {
    if(state.sessionClosing)return;
    state.sessionClosing=true;
    backend()?.setReadOnly?.(true);
    if(state.pendingCount>0){show("Finalizando sincronización antes de salir…","busy");await state.queue;}
    if(!state.viewer)await flushGrowth();
    if(state.syncError){
      state.sessionClosing=false;backend()?.setReadOnly?.(state.viewer);
      show("No se puede cerrar sesión todavía: hay movimientos sin respaldo en la nube. Descarga primero una copia JSON del inventario y vuelve a intentar guardar.","error");
      return;
    }
    state.epoch++;state.pendingCount=0;state.pending=false;
    state.ready=false;state.user=null;state.viewer=false;state.familyRole=null;state.ownerId=null;
    clearTimeout(state.backupTimer);clearTimeout(state.timer);
    if(state.journalChannel){await state.client.removeChannel(state.journalChannel);state.journalChannel=null;}
    if(state.channel){await state.client.removeChannel(state.channel);state.channel=null;}
    const {error}=await state.client.auth.signOut();
    if(error){state.sessionClosing=false;show("No se pudo cerrar sesión: "+errorMessage(error),"error");return;}
    state.snapshot.clear();state.lastItems=new Map();
    backend()?.setItemsFromCloud?.([]);
    window.GCGrowth?.clearPrivateView?.();
    backend()?.setReadOnly?.(true);
    document.body.classList.add("cloud-needs-auth");
    $("viewerTools")?.classList.add("hidden");
    $("authSignOut")?.classList.add("hidden");
    $("authForm")?.classList.remove("hidden");
    hideCredentials();
    $("gcAccountView")?.classList.add("hidden");$("gcLoginView")?.classList.remove("hidden");
    show("Sesión cerrada. Se limpió la copia visible de este dispositivo.","info");
    state.sessionClosing=false;
    closeLogin();openLogin();
  }
  async function init(){
    if(state.booted)return;state.booted=true;
    $("cloudButton")?.addEventListener("click",openLogin);
    $("cloudClose")?.addEventListener("click",closeLogin);
    $("authForm")?.addEventListener("submit",login);
    $("authTogglePassword")?.addEventListener("click",()=>{
      const input=$("authPassword"),toggle=$("authTogglePassword");
      const reveal=input.type==="password";input.type=reveal?"text":"password";
      toggle.textContent=reveal?"Ocultar":"Mostrar";toggle.setAttribute("aria-pressed",String(reveal));
      toggle.setAttribute("aria-label",reveal?"Ocultar contraseña":"Mostrar contraseña");
    });
    $("copyFamilyCredentials")?.addEventListener("click",async()=>{
      const value=$("familyCredentialsText")?.value;
      if(!value)return;
      try{await navigator.clipboard.writeText(value);show("Datos copiados. Pégalos en el chat privado con tu familiar.","ok");}
      catch{$("familyCredentialsText")?.select();show("Selecciona y copia el mensaje para compartirlo.","info");}
    });
    $("shareFamilyCredentials")?.addEventListener("click",async()=>{
      const value=$("familyCredentialsText")?.value;if(!value)return;
      if(navigator.share){
        try{await navigator.share({title:"Acceso privado a GC GRAPHICS",text:value});}
        catch(e){if(e.name!=="AbortError")show("No se pudo abrir Compartir. Usa «Copiar datos».","error");}
      }else{
        try{await navigator.clipboard.writeText(value);show("Datos copiados. Pégalos en WhatsApp.","ok");}
        catch{show("Selecciona y copia los datos para enviarlos.","info");}
      }
    });
    $("hideFamilyCredentials")?.addEventListener("click",hideCredentials);
    $("authSignOut")?.addEventListener("click",signOut);
    $("viewerForm")?.addEventListener("submit",addViewer);
    $("viewerPassword")?.addEventListener("input",updatePasswordStrength);
    $("viewerPasswordConfirm")?.addEventListener("input",()=>{
      const confirmation=$("viewerPasswordConfirm"),password=$("viewerPassword");
      confirmation.setCustomValidity(confirmation.value&&confirmation.value!==password.value?"Las contraseñas no coinciden.":"");
    });
    $("copyFamilyLink")?.addEventListener("click",async()=>{
      const link=window.location.origin+"/data/app.html";
      try{await navigator.clipboard.writeText(link);show("Enlace copiado. Compártelo por WhatsApp con tu madre.","ok");}
      catch{await window.GCDialog?.notice?.({title:"Enlace de la aplicación",kicker:"ACCESO FAMILIAR",message:"Copia este enlace y envíalo por un canal privado.",fields:[{id:"uiFamilyLink",label:"Enlace",value:link,readonly:true}]});}
    });
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
        if(event==="SIGNED_OUT"&&state.user){
          state.epoch++;state.ready=false;state.user=null;state.viewer=false;state.ownerId=null;
          backend()?.setItemsFromCloud?.([]);window.GCGrowth?.clearPrivateView?.();
          backend()?.setReadOnly?.(true);document.body.classList.add("cloud-needs-auth");
          show("La sesión terminó. Inicia sesión de nuevo para acceder.","info");openLogin();
        }
      });
      const {data,error}=await state.client.auth.getUser();
      if(error && !/session/i.test(errorMessage(error)))console.warn(errorMessage(error));
      if(data?.user)await beginSession(data.user);
      else {show("Inicia sesión para abrir tu inventario privado.","info");openLogin();}
    }catch(e){document.body.classList.add("cloud-needs-auth");show("No se pudo conectar a la nube: "+errorMessage(e)+". Revisa internet y vuelve a abrir la aplicación.","error");openLogin();}
  }
  window.GCCloud={notify,notifyGrowth,familyAction,ready:()=>state.ready,isViewer:()=>state.viewer,canPurchase:()=>state.viewer&&state.familyRole==="buyer",ownerId:()=>state.ownerId};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
