"use strict";
(() => {
  const KEY = "gc_graphics_inventory_v1";
  const CATEGORIES = ["Todas", "Maquinaria", "Accesorio", "Consumible"];
  const $ = id => document.getElementById(id);
  const S = {items: [], feed: {items: {}}, amazonFeed:{items:{}}, liveQuotes:{}, verifiedImages:{}, brokenImages:new Set(), view: "all", category: "Todas", query: "", sort: "order", editing: null, pendingPhoto: null, decision: null, incoming: null};
  const safeText = v => String(v == null ? "" : v);
  const esc = v => safeText(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const urlOK = v => /^https:\/\/[^\s]+$/i.test(safeText(v)) || /^http:\/\/[^\s]+$/i.test(safeText(v));
  const imageOK = v => urlOK(v) || /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(safeText(v));
  const priceText = (v, c) => Number.isFinite(v) ? new Intl.NumberFormat("en-US", {style: "currency", currency: c || "USD", maximumFractionDigits: 2}).format(v) : "";
  const dateText = v => {try {return v ? new Intl.DateTimeFormat("es-DO", {dateStyle: "medium"}).format(new Date(v)) : "";} catch {return "";}};
  const now = () => new Date().toISOString();
  const clamp = (v, max = 1200) => safeText(v).trim().slice(0, max);
  const toNum = value => value === "" || value == null ? null : (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null);
  const icon = type => type === "Consumible" ? "◫" : type === "Accesorio" ? "◇" : "▤";
  const titleInitials = text => safeText(text).replace(/[—\-–]/g, " ").trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase();
  let toastTimeout = null;

  function toast(message, isError = false) {
    const el = $("toast"); el.textContent = message;
    el.className = "toast" + (isError ? " error" : "");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.add("hidden"), 3400);
  }
  let suppressCloudSave = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({schemaVersion: 1, savedAt: now(), items: S.items}));
      if (!suppressCloudSave) window.GCCloud?.notify?.();
      return true;
    } catch {
      toast("No se pudo guardar: espacio local agotado. Exporta un respaldo JSON.", true);
      return false;
    }
  }
  function safeItem(p) {
    return {
      id: clamp(p.id, 90) || (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "gc-" + Date.now() + "-" + Math.random().toString(16).slice(2)),
      order: Number.isFinite(Number(p.order)) ? Number(p.order) : Date.now(),
      name: clamp(p.name, 140), type: CATEGORIES.includes(p.type) && p.type !== "Todas" ? p.type : "Maquinaria",
      brand: clamp(p.brand, 70), code: clamp(p.code, 35),
      status: ["Pendiente","Comprada","Revisar","Cancelada"].includes(p.status) ? p.status : "Pendiente",
      received: p.received === true,
      url: urlOK(p.url) ? clamp(p.url, 1500) : "",
      imageUrl: imageOK(p.imageUrl) ? safeText(p.imageUrl).slice(0, 180000) : "",
      manualPrice: toNum(p.manualPrice), manualOriginalPrice:toNum(p.manualOriginalPrice), stockQty: p.stockQty === 0 ? 0 : (Number.isInteger(Number(p.stockQty)) && p.stockQty !== "" && p.stockQty != null && Number(p.stockQty) >= 0 ? Number(p.stockQty) : null),
      purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(safeText(p.purchaseDate)) ? p.purchaseDate : null,
      paidAmount: toNum(p.paidAmount), notes: clamp(p.notes, 1200),
      notionUrl: urlOK(p.notionUrl) ? p.notionUrl : "",
      editedAt: p.editedAt || null
    };
  }
  function feedOf(p) {
    const archived=(S.feed.items||{})[p.id],amazon=(S.amazonFeed.items||{})[p.id],live=S.liveQuotes[p.id];
    const official=archived?.sourceUrl===p.url?archived:null;
    const verifiedAmazon=amazon?.sourceUrl===p.url?amazon:null;
    const older=official?.priceStatus==="verified"?official:(verifiedAmazon?.priceStatus==="verified"?verifiedAmazon:official||verifiedAmazon);
    if(live?.sourceUrl!==p.url)return older;
    if(live.priceStatus==="verified"||live.stockStatus==="out_of_stock"||live.stockStatus==="in_stock"){
      if(live.originalPrice==null&&older?.price===live.price&&older?.currency===live.currency)
        return {...live,originalPrice:older.originalPrice};
      return live;
    }
    return older||live;
  }
  function statusCaption(f) {
    if (!f || !f.checkedAt) return "Precio no verificado";
    let hour = "";
    try {hour = new Intl.DateTimeFormat("es-DO",{timeZone:"America/Santo_Domingo",hour:"2-digit",minute:"2-digit"}).format(new Date(f.checkedAt));}catch{}
    const age=Date.now()-new Date(f.checkedAt).getTime();
    const label=f.provider==="official"?"Tienda oficial · consulta":f.provider==="amazon-snapshot"?(age>86400000?"Amazon · precio de referencia":"Amazon · consulta puntual"):"Última captura";
    return label+" · "+dateText(f.checkedAt)+(hour?" "+hour:"");
  }
  function productPrice(p) {
    const f=feedOf(p);
    let value=null,currency="USD",label="Consultar en la tienda",kind="unknown",orig=null;
    if(f&&f.priceStatus==="verified"&&Number.isFinite(f.price)&&f.price>=0&&/^[A-Z]{3}$/.test(f.currency||"")){
      value=f.price;currency=f.currency;label=statusCaption(f);kind=f.provider==="amazon-snapshot"?"snapshot":"online";orig=f.originalPrice;
    }else if(Number.isFinite(p.manualPrice)){
      value=p.manualPrice;label="Precio introducido manualmente";kind="manual";orig=p.manualOriginalPrice;
    }
    const originalPrice=Number.isFinite(orig)&&Number.isFinite(value)&&orig>value&&orig<=value*10?orig:null;
    const discountPercent=originalPrice===null?null:Math.round((1-value/originalPrice)*100);
    return {value,currency,label,kind,originalPrice,discountPercent:discountPercent>0?discountPercent:null};
  }
  function productStock(p) {
    const f = feedOf(p);
    if (f && f.stockStatus === "out_of_stock") return {text: "Agotado", kind: "out"};
    if (f && f.stockStatus === "in_stock") {
      return Number.isInteger(f.stockQuantity) && f.stockQuantity >= 0 ? {text: f.stockQuantity + " unid. en tienda", kind: ""} : {text: "Disponible", kind: ""};
    }
    if (p.stockQty != null && Number.isInteger(p.stockQty)) return p.stockQty === 0 ? {text: "0 unid. publicadas", kind: "out"} : {text: p.stockQty + " unid. indicadas", kind: ""};
    return {text: "Stock sin verificar", kind: "unknown"};
  }
  function productImageCandidates(p) {
    const f = feedOf(p);
    const choices=[p.imageUrl,S.liveQuotes[p.id]?.imageUrl,S.verifiedImages[p.id]?.url,f?.imageUrl,S.amazonFeed.items?.[p.id]?.imageUrl];
    return [...new Set(choices.filter(imageOK).filter(u=>!S.brokenImages.has(u)))];
  }
  function productImage(p) {return productImageCandidates(p)[0] || "";}

  function flag(p) {
    if (p.status === "Comprada") return {text: p.received ? "✓ COMPRADA Y RECIBIDA" : "◷ COMPRADA · POR RECIBIR", css: "bought"};
    if (p.status === "Revisar") return {text:"⚑ REVISAR",css:"review"};
    if (p.status === "Cancelada") return {text:"× CANCELADA",css:"canceled"};
    return {text:"◷ PENDIENTE",css:"pending"};
  }
  function counts() {
    const data = S.items; const purchase = data.filter(i => i.status === "Comprada");
    return {all:data.length,purchased:purchase.length,received:purchase.filter(p => p.received).length,pending:data.filter(i => i.status === "Pendiente").length,
      out:data.filter(i => productStock(i).kind === "out").length,deals:data.filter(i=>productPrice(i).discountPercent>0).length,review:data.filter(i => i.status === "Revisar").length,
      spent: data.reduce((n,p) => n + (p.status === "Comprada" && p.paidAmount != null ? p.paidAmount : 0),0)};
  }
  function statCard(label, value, caption, symbol, css) {
    return '<div class="stat-card ' + css + '"><div class="stat-top"><span>' + label + '</span><span class="stat-ico">' + symbol + '</span></div><div class="stat-num">' + value + '</div><div class="stat-foot">' + caption + '</div></div>';
  }
  function renderStats() {
    const k = counts();
    $("statGrid").innerHTML = statCard("Total de artículos",k.all,"Equipos, consumibles y accesorios","▦","") +
      statCard("Comprados",k.purchased,k.received + " recibidos físicamente","✓","purchased") +
      statCard("Por comprar",k.pending,"Artículos pendientes de adquirir","◷","pending") +
      statCard("Existencias agotadas",k.out,"Solo proveedores con dato confirmado","⊘","stock");
    [["navAll",k.all],["navPending",k.pending],["navPurchased",k.purchased],["navOut",k.out],["navDeals",k.deals]].forEach(x => $(x[0]).textContent = x[1]);
  }
  function renderCategories() {
    const root = $("filterChips");
    root.innerHTML = CATEGORIES.map(cat => '<button type="button" class="chip ' + (S.category===cat?"selected":"") + '" data-category="' + cat + '">' + cat + (cat === "Todas" ? "" : " (" + S.items.filter(p=>p.type===cat).length + ")") + '</button>').join("");
  }
  function visibleItems() {
    let data = S.items.filter(p => (S.view === "pending" ? p.status === "Pendiente" : S.view === "purchased" ? p.status === "Comprada" : S.view === "out" ? productStock(p).kind === "out" : S.view==="deals" ? productPrice(p).discountPercent>0 : true));
    if(S.category !== "Todas") data = data.filter(p => p.type === S.category);
    const query = S.query.trim().toLocaleLowerCase("es");
    if(query) data = data.filter(p => [p.name,p.brand,p.code,p.notes,p.type].join(" ").toLocaleLowerCase("es").includes(query));
    const sorters = {
      order:(a,b)=>(a.order-b.order) || a.name.localeCompare(b.name,"es"),
      name:(a,b)=>a.name.localeCompare(b.name,"es"),
      status:(a,b)=>a.status.localeCompare(b.status,"es") || a.order-b.order,
      recent:(a,b)=>safeText(b.editedAt).localeCompare(safeText(a.editedAt)) || a.order-b.order
    };
    return [...data].sort(sorters[S.sort] || sorters.order);
  }
  function productCard(p) {
    const s = productStock(p), f = flag(p), price = productPrice(p), image = productImage(p);
    const thumb = image ? '<img loading="lazy" data-product-id="'+ esc(p.id) +'" referrerpolicy="no-referrer" src="' + esc(image) + '" alt="Imagen del producto '+ esc(p.name) +'">' : '<div class="product-symbol">' + esc(titleInitials(p.brand || p.name)) + '</div>';
    const dealBadge=price.discountPercent?'<span class="deal-flag">-'+price.discountPercent+'% OFERTA</span>':"";
    const offerMeta=price.originalPrice!==null?'<div class="old-price-row"><del>'+esc(priceText(price.originalPrice,price.currency))+'</del><span>Ahorras '+esc(priceText(price.originalPrice-price.value,price.currency))+'</span></div>':"";
    const name = esc(p.name), encoded = esc(p.id), notes = esc(p.notes || "Sin descripción adicional.");
    const link = p.url ? '<a class="open-link" href="'+esc(p.url)+'" target="_blank" rel="noreferrer noopener" aria-label="Visitar tienda de '+name+'" title="Ver en tienda">↗</a>' : "";
    const buy = p.status !== "Comprada" ? '<button type="button" class="btn btn-bought" data-action="buy" data-id="' + encoded + '">✓ Confirmar compra</button>' : (p.received ? '<button class="btn btn-secondary" disabled>✓ Recibido</button>' : '<button class="btn btn-bought" data-action="receive" data-id="'+encoded+'">✓ Marcar recibido</button>');
    return '<article class="product-card">' +
      '<div class="product-image">' + thumb + '<span class="product-flag '+ f.css +'">'+esc(f.text)+'</span>'+dealBadge+'<div class="product-menu"><button data-action="edit" data-id="'+encoded+'" title="Editar" aria-label="Editar '+name+'">✎</button><button data-action="delete" data-id="'+encoded+'" title="Eliminar" aria-label="Eliminar '+name+'">×</button></div></div>' +
      '<div class="product-body"><div class="product-meta">'+ esc(p.type) + (p.code ? " · " + esc(p.code) : "") + '</div>' +
      '<h3 class="product-name" title="'+name+'">'+name+'</h3><p class="product-desc">'+notes+'</p>'+
      '<div class="product-price-row"><div><div class="price-num '+(price.value==null?'unknown':'')+'">'+(price.value==null?'Consultar precio':esc(priceText(price.value,price.currency)))+'</div>'+offerMeta+'<span class="price-detail">'+esc(price.label)+'</span></div>'+
      '<span class="stock-pill '+s.kind+'">'+esc(s.text)+'</span></div>'+
      '<div class="product-bottom">'+buy+link+'</div></div></article>';
  }
  function render() {
    renderStats(); renderCategories();
    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("active",b.dataset.view === S.view);
      if(b.classList.contains("mobile-tab"))b.setAttribute("aria-current",b.dataset.view===S.view?"page":"false");
    });
    const names = {all:["Todos los artículos","Equipos, materiales y accesorios en un solo lugar."],pending:["Pendientes de compra","Artículos que todavía necesitamos adquirir."],purchased:["Comprados","Compras confirmadas y productos recibidos."],out:["Sin existencias","Artículos con agotamiento confirmado o cantidad manual igual a cero."],deals:["Ofertas verificadas","Promociones con precio anterior y ahorro comprobables en el proveedor."]};
    $("sectionTitle").firstChild.textContent = names[S.view][0] + " ";
    $("sectionSubtitle").textContent=names[S.view][1];
    const current = visibleItems();
    $("resultTotal").textContent=current.length;
    $("productGrid").innerHTML=current.map(productCard).join("");
    $("emptyState").classList.toggle("hidden",current.length > 0);
    $("productGrid").querySelectorAll("img").forEach(img => img.addEventListener("error", () => {
      S.brokenImages.add(img.getAttribute("src"));
      const item=S.items.find(p=>p.id===img.dataset.productId);
      const options=item?productImageCandidates(item):[];
      if(options.length)img.src=options[0];
      else img.outerHTML='<div class="product-symbol">◎</div>';
    }));
    const amazonCount=Object.values(S.amazonFeed.items||{}).filter(x=>x.priceStatus==="verified").length;
    $("feedLine").textContent = "VEVOR/Creality: consultas automáticas al abrir y cada 5 min. Amazon: "+amazonCount+" precios observados en consulta puntual, con fecha; verifica el valor actual antes de comprar.";
  }
  function setView(v) {S.view=v;S.category="Todas";$("searchInput").value="";S.query="";render();}
  function showOverlay(id) {$(id).classList.remove("hidden"); document.body.style.overflow="hidden";}
  function closeOverlays() {["formOverlay","decisionOverlay"].forEach(id=>$(id).classList.add("hidden"));document.body.style.overflow=""; S.editing=null; S.pendingPhoto=null; S.decision=null;}
  function showForm(item=null) {
    closeOverlays();S.editing=item ? item.id : null;S.pendingPhoto=null;
    $("formTitle").textContent=item?"Editar artículo":"Nuevo artículo";
    const form=$("itemForm");form.reset();
    const p=item||{};
    ["name","brand","code","type","status","url","imageUrl","manualPrice","manualOriginalPrice","stockQty","notes"].forEach(k=>{
      const el=form.elements.namedItem(k); if(el) el.value=p[k] == null ? (k==="type"?"Maquinaria":k==="status"?"Pendiente":"") : p[k];
    });
    form.elements.namedItem("received").checked=!!p.received;
    showOverlay("formOverlay"); $("itemName").focus();
  }
  function showDecision(mode,p) {
    closeOverlays();S.decision={mode,id:p?.id};$("purchaseExtra").classList.toggle("hidden",mode!=="buy");
    $("decisionKicker").textContent=mode==="delete"?"ELIMINACIÓN":mode==="buy"?"REGISTRO DE COMPRA":mode==="receive"?"RECEPCIÓN":mode==="import"?"RESTAURAR DATOS":"INFORMACIÓN";
    $("decisionTitle").textContent=mode==="delete"?"¿Eliminar este artículo?":mode==="buy"?"Confirmar compra":mode==="receive"?"Confirmar recepción":mode==="import"?"¿Restaurar la copia?":"Actualización de precios";
    $("decisionMessage").textContent=mode==="delete"?"Se eliminará «"+p.name+"» del catálogo de este navegador. Antes puedes exportar una copia JSON.":mode==="buy"?"¿Confirmas la compra de «"+p.name+"»? Se registrará como comprado, con opción de indicar la recepción.":mode==="receive"?"¿Confirmas que recibiste físicamente «"+p.name+"»?":mode==="import"?"Se reemplazarán los artículos actuales por "+(S.incoming?.length || 0)+" artículos de la copia seleccionada.": "El sistema publica capturas de proveedores con fecha y procedencia. Amazon y algunas tiendas pueden bloquear las consultas. Nunca mostramos cifras supuestas como precios o cantidades reales; para nuevos datos debe ejecutarse la actualización automática en GitHub.";
    const confirm=$("confirmDecision");confirm.textContent=mode==="delete"?"Eliminar":mode==="buy"?"Registrar compra":mode==="receive"?"Marcar como recibido":mode==="import"?"Restaurar inventario":"Entendido";
    confirm.className="btn "+(mode==="delete"?"btn-danger":"btn-primary");
    if(mode==="buy"){$("purchasedDate").value=new Date().toISOString().slice(0,10);$("paidAmount").value="";document.querySelectorAll('input[name="purchaseReceivedChoice"]').forEach(x=>x.checked=false);}
    showOverlay("decisionOverlay");
  }
  async function shrinkImage(file) {
    if(!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 8_000_000) throw new Error("La foto debe ser JPG, PNG o WebP y pesar menos de 8 MB.");
    return new Promise((resolve,reject)=>{
      const tmp=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{try{const ratio=Math.min(1,650/img.width,650/img.height);const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(tmp);resolve(canvas.toDataURL("image/jpeg",.72));}catch(e){reject(e);}};
      img.onerror=()=>{URL.revokeObjectURL(tmp);reject(new Error("No se pudo leer la foto."));};img.src=tmp;
    });
  }
  function recordForm(ev) {
    ev.preventDefault();const form=ev.currentTarget;const current=S.items.find(p=>p.id===S.editing);
    const get=k=>form.elements.namedItem(k).value;
    const url=clamp(get("url"),1500),img=S.pendingPhoto || clamp(get("imageUrl"),180000);
    if(url && !urlOK(url)) return toast("El enlace debe comenzar por http:// o https://",true);
    if(img && !imageOK(img)) return toast("Imagen inválida: introduce una URL http(s) o sube una fotografía.",true);
    const vals={...current,id:current?.id||("gc-"+Date.now()+"-"+Math.random().toString(16).slice(2)),order:current?.order??(Math.max(0,...S.items.map(p=>p.order))+1),
      name:clamp(get("name"),140),brand:clamp(get("brand"),70),code:clamp(get("code"),35),type:get("type"),status:get("status"),
      received:form.elements.namedItem("received").checked,url,imageUrl:img,manualPrice:toNum(get("manualPrice")),manualOriginalPrice:toNum(get("manualOriginalPrice")),
      stockQty:get("stockQty")===""?null:Number.parseInt(get("stockQty"),10),
      notes:clamp(get("notes"),1200),editedAt:now()};
    if(!vals.name)return toast("Agrega el nombre del artículo.",true);
    if(vals.status!=="Comprada") vals.received=false;
    if(current)S.items=S.items.map(p=>p.id===current.id?safeItem(vals):p);else S.items.push(safeItem(vals));
    save();closeOverlays();render();toast(current?"Artículo actualizado.":"Artículo agregado al inventario.");
    if(supportsLive(vals))getLiveQuote(vals);
  }
  function confirmDecision() {
    const d=S.decision; if(!d)return closeOverlays();
    if(d.mode==="info")return closeOverlays();
    if(d.mode==="import"){
      if(!Array.isArray(S.incoming))return closeOverlays();
      S.items=S.incoming.map(safeItem);S.incoming=null;save();closeOverlays();S.view="all";render();return toast("Inventario restaurado.");
    }
    const p=S.items.find(x=>x.id===d.id);if(!p)return closeOverlays();
    if(d.mode==="delete")S.items=S.items.filter(x=>x.id!==p.id);
    if(d.mode==="receive")p.received=true;
    if(d.mode==="buy"){const choice=document.querySelector('input[name="purchaseReceivedChoice"]:checked')?.value;if(!choice)return toast("Selecciona si ya recibiste físicamente la compra.",true);p.status="Comprada";p.received=choice==="yes";p.purchaseDate=$("purchasedDate").value||new Date().toISOString().slice(0,10);p.paidAmount=toNum($("paidAmount").value);}
    if(d.mode!=="delete")p.editedAt=now();
    save();closeOverlays();render();toast(d.mode==="delete"?"Artículo eliminado.":d.mode==="receive"?"Recepción registrada.":"Compra registrada correctamente.");
  }
  function download(name,text,type){
    const blob=new Blob([text],{type});const link=document.createElement("a");const object=URL.createObjectURL(blob);link.href=object;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(object),1000);
  }
  function exportJSON(){download("GC-GRAPHICS-inventario-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify({schemaVersion:1,exportedAt:now(),items:S.items},null,2),"application/json");toast("Respaldo JSON descargado.");}
  function exportCSV(){
    const cols=["name","type","brand","code","status","received","url","manualPrice","stockQty","purchaseDate","paidAmount","notes"];
    const cell=x=>'"'+safeText(x).replace(/^[=+\-@\t\r]/,"'").replace(/"/g,'""')+'"';
    const text="\uFEFF"+[cols.join(","),...S.items.map(p=>cols.map(k=>cell(p[k])).join(","))].join("\r\n");
    download("GC-GRAPHICS-compras.csv",text,"text/csv;charset=utf-8");toast("Archivo CSV descargado.");
  }
  async function importJSON(file){
    if(!file)return;try{
      if(file.size>3_000_000)throw new Error("Respaldo demasiado grande (máximo 3 MB).");
      const data=JSON.parse(await file.text());
      if(!data||!Array.isArray(data.items)||data.items.length>500||data.items.some(p=>!p||typeof p.name!=="string"||!p.name.trim()))throw new Error("Archivo inválido o contiene más de 500 artículos.");
      const ids=data.items.map(p=>String(p.id));
      if(new Set(ids).size!==ids.length)throw new Error("El archivo contiene IDs duplicados.");
      S.incoming=data.items;showDecision("import");
    }catch(e){toast(e.message||"Error al cargar respaldo.",true);}finally{$("importFile").value="";}
  }
  async function refreshFeed(silent=false){
    try{
      const res=await fetch("./data/price-cache.json?t="+Date.now(),{cache:"no-store"});
      if(!res.ok)throw new Error("No hay feed publicado");
      const data=await res.json();
      if(data&&typeof data.items==="object"){S.feed=data;render();if(!silent)toast(data.generatedAt?"Capturas de proveedores revisadas.":"Todavía no hay una captura automática disponible.");}
    }catch {if(!silent)toast("No se pudo consultar el feed. Tus datos locales están intactos.",true);}
  }
  const API_ORIGIN = "https://gc-graphics-prices-api.onrender.com";
  let liveTimer = null;
  function supportsLive(p){
    try{
      const u=new URL(p.url),h=u.hostname.toLowerCase();
      return u.protocol==="https:" && (h==="www.vevor.com"||h==="vevor.com"||h==="www.crealityfalcon.com"||h==="crealityfalcon.com");
    }catch{return false;}
  }
  async function getLiveQuote(p){
    try{
      const url=API_ORIGIN+"/api/product-preview?url="+encodeURIComponent(p.url);
      const response=await fetch(url,{signal:AbortSignal.timeout(50000),cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const info=await response.json();
      if(!info||info.productUrl!==p.url)return;
      const v=Number(info.price);
      const f={
        sourceUrl:p.url,provider:"official",checkedAt:info.checkedAt,
        price:(info.price != null && Number.isFinite(v) && v>=0)?v:null,
        originalPrice:(info.originalPrice!=null&&Number.isFinite(Number(info.originalPrice))&&Number(info.originalPrice)>v)?Number(info.originalPrice):null,
        currency:/^[A-Z]{3}$/.test(info.currency||"")?info.currency:null,
        priceStatus:info.price!=null&&info.currency?"verified":"unavailable",
        stockStatus:info.availability==="in_stock"?"in_stock":info.availability==="out_of_stock"?"out_of_stock":"unknown",
        stockQuantity:Number.isInteger(info.stockQty)&&info.stockQty>=0?info.stockQty:null,
        imageUrl:imageOK(info.image)?info.image:"",
        error:null
      };
      S.liveQuotes[p.id]=f;
      if(S.items.some(x=>x.id===p.id&&x.url===p.url))render();
    }catch(e){console.info("GC live quote unavailable for "+p.id+":",e.message);}
  }
  function autoRefreshQuotes(){
    if(document.visibilityState==="hidden")return;
    for(const p of S.items.filter(supportsLive))getLiveQuote(p);
  }
  function scheduleLiveQuotes(){
    if(liveTimer)return;
    autoRefreshQuotes();
    liveTimer=setInterval(autoRefreshQuotes,5*60*1000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")autoRefreshQuotes();});
  }
  function bind(){
    document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
    $("filterChips").addEventListener("click",e=>{const el=e.target.closest("[data-category]");if(el){S.category=el.dataset.category;render();}});
    $("productGrid").addEventListener("click",e=>{
      const b=e.target.closest("button[data-action]");if(!b)return;
      const p=S.items.find(x=>x.id===b.dataset.id);if(!p)return;
      if(b.dataset.action==="edit")showForm(p);
      if(b.dataset.action==="buy"||b.dataset.action==="delete"||b.dataset.action==="receive")showDecision(b.dataset.action,p);
    });
    $("searchInput").addEventListener("input",e=>{S.query=e.target.value;render();});
    $("sortSelect").addEventListener("change",e=>{S.sort=e.target.value;render();});
    ["addItem","sideAdd","emptyAdd"].forEach(id=>$(id).addEventListener("click",()=>showForm()));
    ["closeForm","cancelForm","closeDecision","cancelDecision"].forEach(id=>$(id).addEventListener("click",closeOverlays));
    $("itemForm").addEventListener("submit",recordForm);$("confirmDecision").addEventListener("click",confirmDecision);
    $("uploadPhoto").addEventListener("change",async e=>{if(!e.target.files?.length)return;try{S.pendingPhoto=await shrinkImage(e.target.files[0]);toast("Foto optimizada y lista para guardar.");}catch(err){toast(err.message,true);}});
    ["sideExport","exportJson"].forEach(id=>$(id).addEventListener("click",exportJSON));
    $("exportCsv").addEventListener("click",exportCSV);
    ["sideImport","mobileImport"].forEach(id=>$(id)?.addEventListener("click",()=>$("importFile").click()));
    $("importFile").addEventListener("change",e=>importJSON(e.target.files[0]));
    $("refreshFeed").addEventListener("click",()=>refreshFeed());
    $("learnFeed").addEventListener("click",()=>showDecision("info"));
    ["formOverlay","decisionOverlay"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))closeOverlays();}));
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeOverlays();});
  }
  async function init(){
    bind();
    let stored=null;try{stored=JSON.parse(localStorage.getItem(KEY)||"null");}catch{}
    if(stored&&Array.isArray(stored.items)){S.items=stored.items.map(safeItem);}
    else{
      try{const r=await fetch("./data/items.json",{cache:"no-store"});if(!r.ok)throw Error("No se cargó el catálogo inicial");const data=await r.json();S.items=data.items.map(safeItem);save();}
      catch(e){S.items=[];toast("No se pudo cargar el catálogo inicial. Prueba recargar.",true);}
    }
    render();await refreshFeed(true);
    try{
      const r=await fetch("./data/amazon-snapshot.json",{cache:"no-store"});
      if(r.ok){const data=await r.json();if(data.schemaVersion===1&&data.items&&typeof data.items==="object"){S.amazonFeed=data;render();}}
    }catch{}
    try {
      const response=await fetch("./data/verified-images.json",{cache:"no-store"});
      if(response.ok){const extra=await response.json();S.verifiedImages=extra.items||{};render();}
    }catch{}
    scheduleLiveQuotes();
  }
  window.GCInventory = {
    getItems: () => S.items.map(p => ({...p})),
    setItemsFromCloud: items => {
      suppressCloudSave = true;
      S.items = Array.isArray(items) ? items.map(safeItem) : S.items;
      save(); render(); suppressCloudSave = false;
    }
  };
  document.addEventListener("DOMContentLoaded",init);
})();
