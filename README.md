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
| Amazon / a.co | API pendiente de habilitar | Por respeto a sus restricciones, **no se scrapean sus precios**. Es necesario proveedor/API autorizada y credenciales propias si se quiere actualizar en producción. |
| Nuevos productos añadidos solo en el navegador | Sin actualización automática | Deben conectarse a un backend/sincronización para integrarse en el monitor de proveedores. Se pueden usar precio e imagen manuales mientras tanto. |

La captura se escribe en \`data/price-cache.json\`; cada entrada incluye el enlace exacto, fecha, estado del dato y procedencia. El botón «↻» descarga la última captura publicada, **no ejecuta una consulta directa a las tiendas**. La frecuencia programada es cada 3 h, pero GitHub puede retrasar o suspender las ejecuciones automáticas.

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

**Estado:** implementación inicial en rama principal del repositorio reutilizado. No afirmar «tiempo real», sincronización Notion o funcionamiento en producción sin evidencias de las integraciones y despliegue.
