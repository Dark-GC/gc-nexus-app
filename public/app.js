const STORAGE_KEY = 'gc-graphics-inventory-v1';
const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const isWebUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
};
const safeLink = (value) => isWebUrl(value) ? value : '';
const safeImage = (value) => {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(value) && value.length < 1700000) return value;
  return isWebUrl(value) ? value : '';
};
const supportedStore = (value) => {
  if (!isWebUrl(value)) return false;
  const h = new URL(value).hostname.toLowerCase();
  return ['vevor.com', 'crealityfalcon.com', 'creality.com'].some((part) => h === part || h.endsWith('.' + part));
};
const now = () => new Date().toISOString();
const dateText = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(+date) ? '' : date.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
};
const money = (value, currency) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: currency || 'USD' }).format(Number(value));
  } catch { return String(value); }
};

let items = [];
let activeView = 'all';
let activeKind = 'all';
let activeCategory = 'all';
let sortMode = 'default';
let search = '';
let editingId = null;
let imageCandidate = '';
let confirmCallback = null;
let busy = false;

function toast(message, error = false) {
  const container = $('#toastRegion');
  const node = el('div', 'toast' + (error ? ' error' : ''), message);
  container.append(node);
  setTimeout(() => node.remove(), 4900);
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, updatedAt: now(), items }));
    return true;
  } catch {
    toast('No hay espacio disponible para guardar en este navegador. Exporta un respaldo y reduce fotos.', true);
    return false;
  }
}
async function load() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) {
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed.items)) return parsed.items.map(normalize).filter(Boolean);
    } catch { toast('No se pudo leer el guardado local. Se cargará la lista inicial.', true); }
  }
  const response = await fetch('/products.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('initial_inventory_unavailable');
  const seed = await response.json();
  return seed.items.map(normalize).filter(Boolean);
}
function normalize(item) {
  if (!item || typeof item !== 'object' || !String(item.title || '').trim()) return null;
  const stock = ['in_stock', 'out_of_stock', 'preorder', 'unknown'].includes(item.stock) ? item.stock : 'unknown';
  const p = item.price === null || item.price === '' || item.price === undefined ? null : Number(item.price);
  const qty = Number(item.quantity);
  const units = Number(item.stockQty);
  return {
    id: String(item.id || ('user-' + crypto.randomUUID())).slice(0, 90),
    title: String(item.title).slice(0, 160).trim(),
    brand: String(item.brand || '').slice(0, 70),
    category: String(item.category || 'Otros').slice(0, 60),
    kind: ['Máquina', 'Accesorio', 'Consumible'].includes(item.kind) ? item.kind : 'Accesorio',
    code: String(item.code || (/^eq-\d+$/.test(item.id) ? item.id.toUpperCase() : '')).slice(0, 40),
    url: safeLink(item.url),
    image: safeImage(item.image),
    bought: Boolean(item.bought),
    received: Boolean(item.received),
    boughtAt: item.boughtAt || null,
    quantity: Number.isInteger(qty) && qty > 0 && qty <= 100000 ? qty : 1,
    price: p === null || !Number.isFinite(p) || p < 0 ? null : p,
    currency: ['USD', 'DOP', 'EUR'].includes(item.currency) ? item.currency : 'USD',
    priceSource: ['manual', 'store'].includes(item.priceSource) ? item.priceSource : 'none',
    priceCheckedAt: item.priceCheckedAt || null,
    stock, stockQty: Number.isSafeInteger(units) && units >= 0 && item.stockQty !== null ? units : null,
    notes: String(item.notes || '').slice(0, 1200),
    updatedAt: item.updatedAt || null
  };
}
function selectedItems() {
  const q = search.trim().toLocaleLowerCase('es');
  const filtered = items.filter((p) => {
    if (activeView === 'pending' && p.bought) return false;
    if (activeView === 'bought' && !p.bought) return false;
    if (activeView === 'received' && !p.received) return false;
    if (activeKind !== 'all' && p.kind !== activeKind) return false;
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;
    if (q && ![p.title, p.brand, p.category, p.kind, p.code, p.notes].join(' ').toLocaleLowerCase('es').includes(q)) return false;
    return true;
  });
  if (sortMode === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  if (sortMode === 'status') filtered.sort((a, b) => Number(a.bought) - Number(b.bought));
  if (sortMode === 'recent') filtered.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return filtered;
}
function stockLabel(p) {
  if (p.stock === 'out_of_stock') return ['Agotado', 'sold', 'Tienda indica sin existencias'];
  if (p.stock === 'in_stock') {
    const count = p.stockQty !== null ? p.stockQty + ' unidades' : 'Disponible';
    return [count, 'available', p.stockQty !== null ? 'Cantidad indicada por tienda' : 'Unidades no publicadas'];
  }
  if (p.stock === 'preorder') return ['Preventa', 'preorder', 'Disponibilidad condicionada'];
  return ['Sin verificar', 'unknown', 'Consultar tienda'];
}
function renderRow(p) {
  const link = safeLink(p.url);
  const photo = safeImage(p.image);
  const stock = stockLabel(p);
  const priceLabel = p.price === null ? 'Precio sin verificar' :
    p.priceSource === 'store' ? 'Tienda · ' + (dateText(p.priceCheckedAt) || 'fecha desconocida') : 'Precio manual';
  const imagePart = photo
    ? '<img class="product-photo" src="' + escapeHTML(photo) + '" alt="' + escapeHTML(p.title) + '" loading="lazy">'
    : '<span class="placeholder-icon" aria-hidden="true">▧</span>';
  const storeLink = link ? '<a class="text-btn" href="' + escapeHTML(link) + '" target="_blank" rel="noopener noreferrer">Ver tienda ↗</a>' : '';
  const buyButton = p.bought
    ? (!p.received ? '<button type="button" class="action-buy" data-action="receive" data-id="' + escapeHTML(p.id) + '">Marcar recibida</button>' : '')
    : '<button type="button" class="action-buy" data-action="buy" data-id="' + escapeHTML(p.id) + '">✓ Comprada</button>';
  const checked = p.bought ? '<span class="buy-pill bought">✓ Comprada</span>' : '<span class="buy-pill pending">○ Pendiente</span>';
  const boughtText = p.received ? 'Recibida ✓' : p.bought ? 'Recepción pendiente' : 'No comprada';
  return '<article class="product-row" data-row-id="' + escapeHTML(p.id) + '">' +
    '<div class="product-ident"><div class="product-image">' + imagePart + '</div><div class="product-info">' +
    '<div class="product-title">' + escapeHTML(p.title) + '</div>' +
    '<div class="product-sub">' + escapeHTML([p.brand, p.kind, p.category].filter(Boolean).join(' · ')) + '</div>' +
    (p.code ? '<span class="product-ref">' + escapeHTML(p.code) + '</span>' : '') +
    '</div></div>' +
    '<div><div class="price-main">' + escapeHTML(money(p.price, p.currency)) + '</div><span class="price-label">' + escapeHTML(priceLabel) + '</span></div>' +
    '<div><span class="avail-pill ' + stock[1] + '">' + escapeHTML(stock[0]) + '</span><div class="avail-meta">' + escapeHTML(stock[2]) + '</div></div>' +
    '<div>' + checked + '<div class="buy-meta">' + escapeHTML(boughtText) + '</div></div>' +
    '<div class="row-actions"><button class="icon-btn" title="Editar artículo" aria-label="Editar ' + escapeHTML(p.title) + '" type="button" data-action="edit" data-id="' + escapeHTML(p.id) + '">✎</button>' +
    '<button class="icon-btn" title="Consultar precio e imagen" aria-label="Consultar tienda" type="button" data-action="refresh" data-id="' + escapeHTML(p.id) + '">↻</button>' +
    '<button class="icon-btn" title="Eliminar" aria-label="Eliminar ' + escapeHTML(p.title) + '" type="button" data-action="delete" data-id="' + escapeHTML(p.id) + '">×</button>' +
    '<div class="actions-details">' + buyButton + storeLink + '</div></div></article>';
}
function refreshCategories() {
  const select = $('#categorySelect');
  const values = Array.from(new Set(items.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  const prior = select.value || activeCategory;
  select.replaceChildren();
  select.append(new Option('Todas las categorías', 'all'));
  values.forEach((value) => select.append(new Option(value, value)));
  if (values.includes(prior)) select.value = prior;
  else { select.value = 'all'; activeCategory = 'all'; }
}
function render() {
  const filtered = selectedItems();
  $('#statTotal').textContent = items.length;
  $('#statBought').textContent = items.filter((p) => p.bought).length;
  $('#statPending').textContent = items.filter((p) => !p.bought).length;
  $('#statPriced').textContent = items.filter((p) => p.price !== null).length;
  $('#statBoughtSub').textContent = items.filter((p) => p.received).length + ' recibidos confirmados';
  $('#sideCount').textContent = items.length;
  $('#listCount').textContent = filtered.length;
  const list = $('#productList');
  if (filtered.length) {
    list.innerHTML = filtered.map(renderRow).join('');
    list.querySelectorAll('.product-photo').forEach((img) => {
      img.addEventListener('error', () => img.replaceWith(el('span', 'placeholder-icon', '▧')), { once: true });
    });
  } else {
    list.innerHTML = '<div class="empty-state"><strong>Sin resultados</strong><p>No encontramos productos con estos filtros. Prueba otra búsqueda o agrega un artículo nuevo.</p><button class="btn btn-secondary" id="clearSearch" type="button">Limpiar filtros</button></div>';
    $('#clearSearch').addEventListener('click', () => {
      search = ''; $('#searchInput').value = ''; activeView = 'all'; activeKind = 'all'; activeCategory = 'all';
      $('#categorySelect').value = 'all'; setNav(); setChips(); render();
    });
  }
}
function setNav() {
  document.querySelectorAll('.side-item[data-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === activeView);
  });
}
function setChips() {
  document.querySelectorAll('.chip').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.filter === activeKind);
  });
}
function openEditor(id = null) {
  editingId = id;
  const p = id ? items.find((x) => x.id === id) : null;
  $('#editorForm').reset();
  $('#drawerTitle').textContent = p ? 'Editar artículo' : 'Nuevo artículo';
  $('#fieldId').value = p?.id || '';
  $('#fieldTitle').value = p?.title || '';
  $('#fieldBrand').value = p?.brand || '';
  $('#fieldKind').value = p?.kind || 'Máquina';
  $('#fieldCategory').value = p?.category || '';
  $('#fieldUrl').value = p?.url || '';
  $('#fieldQuantity').value = p?.quantity || 1;
  $('#fieldCode').value = p?.code || '';
  $('#fieldPrice').value = p?.price ?? '';
  $('#fieldCurrency').value = p?.currency || 'USD';
  $('#fieldNotes').value = p?.notes || '';
  $('#fieldBought').checked = Boolean(p?.bought);
  $('#fieldReceived').checked = Boolean(p?.received);
  imageCandidate = p?.image || '';
  $('#fieldImage').value = imageCandidate.startsWith('https://') ? imageCandidate : '';
  $('#imageFile').value = '';
  previewImage();
  $('#editorOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#fieldTitle').focus();
}
function previewImage() {
  const preview = $('#imagePreview');
  const photo = safeImage(imageCandidate);
  preview.replaceChildren();
  preview.hidden = !photo;
  if (photo) {
    const img = el('img');
    img.src = photo;
    img.alt = 'Miniatura del artículo';
    preview.append(img);
  }
}
function closeEditor() {
  $('#editorOverlay').hidden = true;
  document.body.style.overflow = '';
  editingId = null;
}
function openConfirm(title, message, action, danger = false) {
  confirmCallback = action;
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmGlyph').textContent = danger ? '×' : '✓';
  $('#confirmGlyph').classList.toggle('danger', danger);
  $('#confirmAccept').className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  $('#confirmAccept').textContent = danger ? 'Eliminar' : 'Confirmar';
  $('#confirmOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#confirmCancel').focus();
}
function closeConfirm() {
  $('#confirmOverlay').hidden = true;
  confirmCallback = null;
  if ($('#editorOverlay').hidden) document.body.style.overflow = '';
}
async function refreshOne(id, quiet = false) {
  const item = items.find((p) => p.id === id);
  if (!item) return false;
  if (!supportedStore(item.url)) {
    if (!quiet) toast('Para este producto no hay consulta automática autorizada. Abre la tienda o registra un precio manual.', true);
    return false;
  }
  try {
    const response = await fetch('/api/product-preview?url=' + encodeURIComponent(item.url), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      if (!quiet) toast(data.message || 'La tienda no permitió verificar los datos.', true);
      return false;
    }
    // Only structured Product schema prices can overwrite prices stored as store-sourced.
    if (data.source === 'json-ld-product' && typeof data.price === 'number' && data.currency) {
      item.price = data.price;
      item.currency = ['USD', 'EUR', 'DOP'].includes(data.currency) ? data.currency : item.currency;
      item.priceSource = 'store';
      item.priceCheckedAt = data.checkedAt;
    }
    if (data.source === 'json-ld-product') {
      item.stock = ['in_stock', 'out_of_stock', 'preorder'].includes(data.availability) ? data.availability : 'unknown';
      item.stockQty = Number.isSafeInteger(data.stockQty) && data.stockQty >= 0 ? data.stockQty : null;
    }
    if (data.image && isWebUrl(data.image) && !item.image) item.image = data.image;
    item.updatedAt = now();
    save();
    render();
    if (!quiet) toast(data.price === null ? 'Miniatura/datos consultados. Precio y/o existencias no publicados de forma verificable.' : 'Datos actualizados desde la ficha estructurada de la tienda. Verifica la variante antes de comprar.');
    $('#syncStatus').textContent = '✓ Consultado ' + dateText(now());
    return true;
  } catch {
    if (!quiet) toast('No se pudo consultar la tienda. Inténtalo más tarde.', true);
    return false;
  }
}
async function refreshMany(quiet = false, source = null) {
  if (busy) return;
  const candidates = (source || items).filter((p) => supportedStore(p.url));
  if (!candidates.length) {
    if (!quiet) toast('No hay fuentes compatibles con consulta automática en esta selección.');
    return;
  }
  busy = true;
  const btn = $('#refreshVisible');
  btn.disabled = true;
  $('#syncStatus').textContent = '↻ Consultando ' + candidates.length + ' tiendas...';
  let success = 0;
  // Keep requests serial and low-volume; not a bulk crawler.
  for (const item of candidates) {
    if (await refreshOne(item.id, true)) success += 1;
  }
  busy = false;
  btn.disabled = false;
  $('#syncStatus').textContent = '✓ ' + success + '/' + candidates.length + ' consultados · ' + dateText(now());
  if (!quiet) toast(success + ' de ' + candidates.length + ' productos consultados. Las tiendas no compatibles o sin datos mantienen estado sin verificar.');
}
function exportData() {
  const result = { app: 'GC GRAPHICS Inventory', schema: 1, exportedAt: now(), items };
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = 'gc-graphics-inventario-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Respaldo JSON exportado.');
}
function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 2000000) return toast('El respaldo supera los 2 MB permitidos.', true);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!Array.isArray(data.items) || data.items.length > 500 || data.items.length === 0) throw new Error('invalid');
      const next = data.items.map(normalize);
      if (next.some((x) => !x)) throw new Error('invalid');
      if (new Set(next.map((x) => x.id)).size !== next.length) throw new Error('duplicate_ids');
      openConfirm('Importar respaldo', 'Se reemplazarán los ' + items.length + ' artículos actuales por ' + next.length + ' del respaldo. Exporta una copia antes si necesitas conservar los datos actuales.', () => {
        const previous = items;
        items = next;
        if (!save()) { items = previous; return; }
        refreshCategories();
        render();
        toast('Respaldo importado: ' + items.length + ' artículos.');
      });
    } catch {
      toast('Archivo no válido. Importa un respaldo JSON de GC GRAPHICS Inventory.', true);
    }
  };
  reader.readAsText(file);
}
function bindEvents() {
  $('#addBtn').addEventListener('click', () => openEditor());
  $('#searchInput').addEventListener('input', (event) => { search = event.target.value; render(); });
  $('#categorySelect').addEventListener('change', (e) => { activeCategory = e.target.value; render(); });
  $('#sortSelect').addEventListener('change', (e) => { sortMode = e.target.value; render(); });
  document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    activeView = btn.dataset.view; setNav(); render();
  }));
  $('#filterChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    activeKind = chip.dataset.filter;
    setChips(); render();
  });
  $('#productList').addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const item = items.find((x) => x.id === button.dataset.id);
    if (!item) return;
    const action = button.dataset.action;
    if (action === 'edit') return openEditor(item.id);
    if (action === 'refresh') return refreshOne(item.id);
    if (action === 'delete') {
      return openConfirm('Eliminar artículo', '¿Eliminar “' + item.title + '” de este inventario? Esta acción no elimina nada en Notion. Exporta un respaldo si quieres conservar el registro.', () => {
        items = items.filter((x) => x.id !== item.id);
        save(); refreshCategories(); render(); toast('Artículo eliminado.');
      }, true);
    }
    if (action === 'buy') {
      return openConfirm('Confirmar compra', '¿Confirmas que compraste “' + item.title + '”? La recepción se marca por separado cuando llegue a tus manos.', () => {
        item.bought = true; item.boughtAt = now(); item.updatedAt = now(); save(); render(); toast('Compra confirmada: ' + item.title);
      });
    }
    if (action === 'receive') {
      return openConfirm('Confirmar recepción', '¿Confirmas que recibiste físicamente “' + item.title + '”?', () => {
        item.bought = true; item.received = true; item.updatedAt = now(); save(); render(); toast('Recepción confirmada.');
      });
    }
  });
  document.querySelectorAll('.close-editor').forEach((b) => b.addEventListener('click', closeEditor));
  $('#editorOverlay').addEventListener('click', (e) => { if (e.target.id === 'editorOverlay') closeEditor(); });
  $('#confirmCancel').addEventListener('click', closeConfirm);
  $('#confirmOverlay').addEventListener('click', (e) => { if (e.target.id === 'confirmOverlay') closeConfirm(); });
  $('#confirmAccept').addEventListener('click', () => {
    const run = confirmCallback;
    closeConfirm();
    if (run) run();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#confirmOverlay').hidden) closeConfirm();
    else if (!$('#editorOverlay').hidden) closeEditor();
  });
  $('#fieldReceived').addEventListener('change', (e) => {
    if (e.target.checked) $('#fieldBought').checked = true;
  });
  $('#fieldBought').addEventListener('change', (e) => {
    if (!e.target.checked) $('#fieldReceived').checked = false;
  });
  $('#fieldImage').addEventListener('input', (e) => {
    imageCandidate = safeImage(e.target.value.trim()); previewImage();
  });
  document.querySelector('.file-upload').addEventListener('click', () => $('#imageFile').click());
  $('#imageFile').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1000000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast('Usa JPG, PNG o WEBP de máximo 1 MB.', true);
    const reader = new FileReader();
    reader.onload = () => { imageCandidate = String(reader.result); $('#fieldImage').value = ''; previewImage(); };
    reader.readAsDataURL(file);
  });
  $('#editorForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#fieldTitle').value.trim();
    const url = $('#fieldUrl').value.trim();
    if (!title) return toast('Escribe el nombre del artículo.', true);
    if (url && !isWebUrl(url)) return toast('La URL del producto debe comenzar con https://', true);
    const old = editingId ? items.find((p) => p.id === editingId) : null;
    const priceInput = $('#fieldPrice').value.trim();
    const price = priceInput === '' ? null : Number(priceInput);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return toast('El precio no es válido.', true);
    const changedPrice = !old || price !== old.price || $('#fieldCurrency').value !== old.currency;
    const bought = $('#fieldBought').checked || $('#fieldReceived').checked;
    const received = $('#fieldReceived').checked;
    const item = normalize({
      ...old,
      id: old?.id || ('user-' + crypto.randomUUID()),
      title, url,
      brand: $('#fieldBrand').value.trim(),
      category: $('#fieldCategory').value.trim() || 'Otros',
      code: $('#fieldCode').value.trim(),
      kind: $('#fieldKind').value,
      quantity: Number($('#fieldQuantity').value),
      price,
      currency: $('#fieldCurrency').value,
      priceSource: price === null ? 'none' : changedPrice ? 'manual' : old?.priceSource || 'manual',
      priceCheckedAt: changedPrice ? null : old?.priceCheckedAt,
      image: safeImage(imageCandidate),
      notes: $('#fieldNotes').value.trim(),
      bought, received,
      boughtAt: bought ? old?.boughtAt || now() : null,
      updatedAt: now()
    });
    if (!item) return toast('Datos incompletos.', true);
    if (old) items = items.map((p) => p.id === old.id ? item : p);
    else items.unshift(item);
    if (!save()) return;
    closeEditor(); refreshCategories(); render(); toast(old ? 'Artículo actualizado.' : 'Artículo agregado al inventario.');
  });
  $('#refreshVisible').addEventListener('click', () => refreshMany(false, selectedItems()));
  $('#refreshAll').addEventListener('click', () => refreshMany());
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importData);
  window.addEventListener('storage', async (e) => {
    if (e.key === STORAGE_KEY) {
      items = await load();
      refreshCategories(); render(); toast('Datos actualizados desde otra pestaña.');
    }
  });
}
async function main() {
  $('#today').textContent = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
  bindEvents();
  try {
    items = await load();
    save(); refreshCategories(); render();
    // Only stores with approved public metadata endpoints are queried. Amazon is excluded.
    refreshMany(true);
  } catch {
    $('#productList').innerHTML = '<div class="empty-state"><strong>Error de inicio</strong><p>No se pudo cargar el inventario inicial. Recarga la página.</p></div>';
    toast('Error al cargar los productos iniciales.', true);
  }
}
main();
