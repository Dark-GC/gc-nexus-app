# GC GRAPHICS Inventory

**Web para controlar las compras de maquinaria, herramientas, materiales y accesorios del negocio.**

## Estado (12/11/2026)

- Interfaz web responsive y personalizada para **GC GRAPHICS**.
- 14 referencias iniciales importadas de la lista validada en Notion: **4 compradas y recibidas**, **10 pendientes**. No incluye la Creality Falcon 5W, retirada a petición del propietario.
- Alta, edición, eliminación con confirmación, filtros, búsqueda y marcado **Comprado** / **Recibido**.
- Fecha de compra, importe pagado opcional, enlace al vendedor, foto personal o URL de imagen.
- Exportaciones JSON (respaldo/restauración) y CSV.
- Capturas periódicas de precio, miniatura y disponibilidad para proveedores compatibles mediante GitHub Actions (cada 3 horas). Se muestran fecha, estado y fuente; **no son precios garantizados en tiempo real**.
- Cuando la tienda no publica una cantidad de stock, se muestra **«Stock sin verificar»**, no un número supuesto.

## Uso

Abrir \`index.html\` desde un servidor HTTP. Esta aplicación es estática y no necesita instalación ni dependencias Node en el navegador.

\`\`\`bash
python -m http.server 8080
# Abre http://localhost:8080
\`\`\`

**¡Importante!** El catálogo empieza con los artículos de Notion pero, actualmente, los cambios que haces en la web se guardan **en el navegador de ese dispositivo**, no en Notion ni en GitHub. Exporta el JSON regularmente para no perderlos. Si cambias de equipo, restaura el JSON. No se debe prometer sincronización multidispositivo sin backend de datos.

## Precios y disponibilidad

\`scripts/refresh-prices.mjs\` consulta únicamente páginas públicas de orígenes permitidos. Funciona con:

| Proveedor | Integración | Observaciones |
|---|---|---|
| Creality Falcon | Shopify product JSON público | Precio de variante si es único y disponible. Stock numérico solo si la API lo publica explícitamente. |
| VEVOR | JSON-LD y metaetiquetas del sitio oficial | Puede omitir precio, stock o imagen si no hay datos confiables; no se infieren unidades. |
| Amazon / a.co | Consulta puntual de ASINs mediante proveedor externo | `data/amazon-snapshot.json` registra 10 precios observados para 11 productos (12/11/2026), con marca temporal; sin actualización automática ni stock numérico. Una API autorizada sigue pendiente. |
| Nuevos productos añadidos solo en el navegador | Sin actualización automática | Deben conectarse a un backend/sincronización para integrarse en el monitor de proveedores. Se pueden usar precio e imagen manuales mientras tanto. |

La captura automatizada de VEVOR/Creality se escribe en \`data/price-cache.json\`; las consultas puntuales de Amazon se mantienen aparte. cada entrada incluye el enlace exacto, fecha, estado del dato y procedencia. El botón «↻» descarga la última captura publicada, **no ejecuta una consulta directa a las tiendas**. La frecuencia programada es cada 3 h, pero GitHub puede retrasar o suspender las ejecuciones automáticas.

Si se genera un bloqueo, variante ambigua o respuesta incompleta, la app muestra el campo como no verificado. En ningún caso se inventan datos. Los precios no incluyen automáticamente envío, impuestos o aduanas dominicanas.

Para actualizar manualmente por CLI:

\`\`\`bash
node scripts/refresh-prices.mjs
\`\`\`

## Publicación

- Repositorio original reutilizado: \`Dark-GC/gc-nexus-app\`, **completamente vacío** antes de este trabajo.
- Render Static Site: publicar la rama \`panda\` con \`buildCommand: mkdir -p dist && cp index.html app.js styles.css favicon.svg dist/ && cp -r data dist/data\` y \`publishPath: dist\`.
- Si el repositorio cambia de nombre a \`gc-graphics-inventory\`, actualizar el origen en Render y los enlaces del script.
- La renombración de repositorio requiere permisos de administración de GitHub y no está disponible en el conector utilizado aquí: GitHub → Settings → General → Repository name.

## Seguridad y continuidad

- **Sin tokens secretos en el frontend.** No publicar claves de Amazon, Supabase o claves administrativas en este repositorio público.
- Los datos de compra quedan en localStorage; son sensibles al borrado de datos del navegador.
- Las imágenes externas se obtienen de la URL de producto, metadatos públicos o de una fotografía aportada por el propietario; pueden fallar si el proveedor bloquea hotlinking. No se cargan imágenes de productos distintos por aproximación.
- Los artículos se pueden editar y eliminar individualmente, pero la fuente original en Notion **no se modifica automáticamente**.
- Si se habilita cloud sync, usar un proyecto dedicado con usuarios autenticados, autorización por propietario y controles de acceso a filas. No reutilizar credenciales de otras aplicaciones.

## Próxima fase para producción

1. Sincronización privada y multidispositivo (base de datos dedicada, autorización por usuario, historial de cambios).
2. Adaptadores de precios autorizados para Amazon y otros marketplaces; imágenes oficiales, variantes, vendedor y stock verificable.
3. Alertas de precio, umbrales y dashboard de presupuestos/mantenimiento.
4. Migración inicial automática de los registros de Notion, evitando duplicados y conflictos.

## Pruebas

\`\`\`bash
node --test tests/*.test.mjs
\`\`\`

**Estado:** V1.2 funcional desplegada, pero sin nube sincronizada y sin monitor automático de Amazon. No afirmar «tiempo real» absoluto, sincronización Notion o todas las imágenes garantizadas mientras no se validen las integraciones y dispositivos.


## V1.2 — catálogo de ofertas y sitio móvil (12/11/2026)

**Interfaz:** se conserva el diseño original en escritorio. En teléfonos se incorpora barra de navegación fija con zona segura inferior, fichas compactas en una columna a 520 px o menos, filtros desplazables, formulario táctil a pantalla casi completa, opciones de exportar **e importar** copias sin ordenador, y tamaños de entrada de 16 px para evitar zoom involuntario en iOS.

**Ofertas:** se muestra precio actual, precio anterior tachado, ahorro y porcentaje solamente cuando la fuente devuelve ambos valores para el mismo artículo. Hay una sección «Ofertas» disponible en ordenador y móvil. Se verifican comparativos oficiales de Creality Shopify y VEVOR (desde el propio sitio). Un dato promocional capturado en una lista oficial VEVOR se muestra solo mientras el precio actual coincide y antes de su vencimiento conservador.

**Amazon:** \`data/amazon-snapshot.json\` guarda una **consulta puntual de precios de 11 ASIN exactos**, con 10 importes confirmados el 12/11/2026 y uno sin precio (Epson ET-2800: no se observó una oferta destacada). Dos de esos listados tenían precio de referencia superior. La fuente es un proveedor externo consultado mediante Firecrawl; la integración **no se ejecuta automáticamente desde GitHub** y no reemplaza ni simula una API de Amazon. El campo muestra el día y hora de observación; después de 24 h se marca como «precio de referencia». Los descuentos puntuales de Amazon dejan de mostrarse como ofertas activas después de 48 h. Las cantidades exactas no se infieren.

**Imágenes:** \`data/verified-images.json\` mapea fotografías verificadas para 11 ASIN conocidos; las otras 3 fichas usan imágenes de la tienda oficial. Los enlaces externos pueden bloquear la carga en ciertos navegadores: se prueban URL alternativas, se evita reiterar URLs que fallaron durante la sesión y el usuario puede subir su fotografía propia. No se reemplaza un producto por una imagen genérica de otro modelo.

**Backend de precios:** \`/api/product-preview\` en [Render](https://gc-graphics-prices-api.onrender.com/api/health) consulta precios públicos oficiales compatibles cuando abre la web y cada 5 minutos mientras está visible; la caché dura 3 minutos. La información puede ir retrasada por disponibilidad y límites del proveedor: *no existe un flujo streaming en tiempo real garantizado*. Amazon requiere credenciales/API autorizada o proveedor de datos contractualizado para actualizaciones continuas.

**Sincronización:** NO está activada: el proyecto Supabase cotizado a US$0 necesita aún autorización adicional del propietario, y no se creó. Los cambios del inventario siguen siendo locales a cada navegador; siempre exportar copia JSON si se van a borrar datos del navegador o cambiar de dispositivo. Los ficheros de esquema SQL y cliente de autenticación son preparatorios, no prueba de puesta en producción.

### Validación de V1.2

- GitHub Actions: \`node --check app.js\`, \`node --check scripts/refresh-prices.mjs\` y \`node --test tests/*.test.mjs\`, incluyendo pruebas de descuentos con fuente, caducidad, ASIN exacto y navegación móvil.
- Render: sitio web y servicio de precios desplegados, respuesta HTTP 200.
- Comprobación con navegador móvil: render de los 14 artículos, navegación inferior presente y 5 promociones visibles con precio actual/anterior y ahorro. No declarar QA físico Safari/Android PASS mientras no se haya ejecutado.
