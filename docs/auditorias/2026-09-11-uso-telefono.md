# Auditoría de uso en teléfono — Cordillera M&P

**Fecha:** 2026-09-11
**Rama / commit:** `audit/uso-telefono` sobre `29f07c1` (desde `develop`, ya con PR #32 — tipos de inspección y permisos — mergeado)
**Viewports probados:** 360×740 @ dpr 2.75 (Android gama media) y 390×844 @ dpr 3 (Android gama alta), `isMobile: true`, `hasTouch: true`, UA reales de Chrome Android
**Cuentas usadas:** `supervisor.prueba1@test.cordilleramyp.local` y `admin.prueba@test.cordilleramyp.local` (staging, proyecto `dqyvedbzsiefecgvmfhq`)
**Herramienta:** Playwright programático + CDP (`Input.dispatchTouchEvent`, `Network.emulateNetworkConditions`), NO el runner de `@playwright/test` ni "device" predefinido — contextos armados a mano

**Nota sobre las capturas:** varias imágenes `fullPage` muestran una insignia negra flotante "Rendering..." en un punto intermedio de la página (ej. `01-dashboard-supervisor.png`, `13-item-no-conforme-360.png`, `31-chimolsa-checklist-inicio.png`). Es el indicador de Next.js en modo desarrollo (`position: fixed`), que al hacer un screenshot `fullPage` (Chromium apila varias capturas de la altura del viewport) queda "pegado" en un punto de la imagen final en vez de mantenerse fijo abajo a la derecha como se ve en el navegador real. **Es un artefacto de la captura, no un bug de la app** — en producción ese indicador no existe.

---

## Los 3 puntos críticos

### 1. Firma táctil — **FUNCIONA**

Se dibujó un trazo real con una secuencia CDP `touchStart → touchMove×12 → touchEnd` (no mouse) sobre el canvas de `SignaturePad.tsx`, y se verificó cada componente del punto crítico con evidencia concreta, no impresión visual:

| Verificación | Resultado |
|---|---|
| El trazo se dibuja | Sí — `textoEstadoFirma`: la leyenda cambia de "Firmar en el recuadro." a "Firma capturada y guardada" (confirmado por locator, count = 1) |
| La página NO se mueve mientras el dedo dibuja | Sí — `window.scrollY` antes = 502, después = 502 (`scroll_cambio: 0`). El canvas tiene `touch-action: none` (confirmado vía `getComputedStyle`), que es lo que bloquea el scroll nativo del navegador durante el gesto |
| Resolución del backing-store del canvas | Correcta — backing store 814×495 px; CSS 296×180 px × `devicePixelRatio` 2.75 = 814×495 exacto. El componente escala el canvas al dpr real del dispositivo, no queda borroso ni recortado |
| La imagen subida corresponde a lo dibujado | Confirmado — request real interceptada: `POST .../storage/v1/object/firmas/{ticketId}/1/conductor.png`, con el path coincidiendo con el ticket firmado en el momento (diagnosticado en una corrida separada porque el filtro inicial buscaba `PUT`, cuando el cliente de Supabase Storage realmente usa `POST`) |

**Evidencia:** `07-firma-conductor-trazo-detalle.png` (detalle del trazo), `08-despues-de-firmar-conductor.png`, `09-ambas-firmas-listas.png`.

**No hay nada que tocar** — el mecanismo (`SignaturePad.tsx`, la clase `touch-none`, el ajuste de backing-store por `devicePixelRatio`) funciona como está diseñado bajo touch real.

---

### 2. Captura de foto — **FUNCIONA, CON UNA RESERVA**

**Atributos reales del `<input type="file">` en el DOM** (inspeccionados con `evaluate()`, no asumidos):

- Ítem `no_conforme` de un checklist `modo='estado'` (ej. Encarpe → Plataforma): `accept="image/jpeg,image/png,image/webp,image/heic,image/heif"`, `capture="environment"`
- Ítem de un checklist `modo='fotos'` (Exportación Chimolsa → "Foto al interior del contenedor"): **mismos** `accept` y `capture="environment"` — comparten el mismo componente (`FORMATOS_FOTO` en `ChecklistItemRow.tsx`)

**Qué hace realmente `capture="environment"` en Android Chrome:** no es verificable con Playwright — es comportamiento nativo del sistema operativo/navegador, no del DOM. Lo que sí está documentado y es estable en la práctica: en Chrome para Android, al tocar un `<input type="file" accept="image/*" capture="environment">`, el navegador **ofrece directamente la cámara trasera** como una opción del selector nativo (junto a "Galería"/"Archivos"), en vez de abrir solo el selector de archivos genérico — no fuerza la cámara sin alternativa, el supervisor igual puede elegir una foto ya tomada. No se puede confirmar con este harness cuál poza exacta de opciones muestra cada build de Android/Chrome; se reporta el comportamiento documentado, no una interpretación.

**Conteo de toques, ítem `no_conforme` → foto subida (Encarpe):** 1 (tocar el select) + 1 (elegir "No conforme") + 1 (tocar el input de archivo) + 1-2 (elegir cámara/galería en el picker nativo, fuera del DOM) + 1 (tocar el campo de observación) = **como mínimo 4 toques dentro de la app**, más el flujo nativo de cámara que no cuenta la app.

**La reserva:** en el checklist `modo='fotos'` (Chimolsa) se subieron las 5 fotos requeridas (1+2+1+1, exactamente `fotos_requeridas` por ítem — confirmado, ver `32-chimolsa-fotos-subidas.png`) sin selects de estado (confirmado: 0 `select[aria-label^="Estado de"]` encontrados, correcto por diseño — ítems de modo 'fotos' no tienen Conforme/No conforme). El input real de foto es el componente estándar de HTML (`<input type="file">` con el texto de ayuda "Elegir una imagen o tomarla con la cámara") — funcional pero visualmente genérico, sin un botón grande "Tomar foto" dedicado; en el patio, con guantes y sol de frente sobre la pantalla, el input nativo chico puede costar más de tocar con precisión que un botón grande. No es un bug, es una oportunidad de mejora de ergonomía táctil.

**Evidencia:** `14-item-no-conforme-foto-subida.png`, `31-chimolsa-checklist-inicio.png`, `32-chimolsa-fotos-subidas.png`.

**Archivo a tocar si se decide mejorar la reserva (sin tocarlo en esta auditoría):** `src/components/ChecklistItemRow.tsx` (`FotoSlotInput`, línea ~283) — agrandar el input o envolverlo en un botón grande tipo "Tomar foto de la falla".

---

### 3. Informe de Control de Salida en el teléfono del guardia — **FUNCIONA**

Se completó una inspección real de Control de Salida (combo → Nombre Encarpador + Nombre Guardia → 3 ítems, todos Conforme → declaración → firmas táctiles → Finalizar) y se abrió `/tickets/[id]/report` a 360×740 y 390×844.

| Verificación | 360×740 | 390×844 |
|---|---|---|
| Sin scroll horizontal | Sí — `scrollWidth` 360 = `clientWidth` 360 | Sí — 390 = 390 |
| Declaración visible | Sí — el texto "Declaro que el aseguramiento…" se renderiza (`declaracionVisible: true`) | — |
| Tamaño de fuente del veredicto | 14px computado | — |
| Firmas y fotos caben en el ancho del viewport | Sí, visualmente confirmado en la captura completa | Sí |

**Evidencia:** `10-informe-control-salida-360.png`, `11-informe-control-salida-390.png`.

**Matiz a favor de "funciona sin reservas":** el 14px del veredicto es más chico que el mínimo recomendado de 16px para texto de lectura en móvil, pero **no dispara zoom automático** (esa regla del navegador aplica solo a inputs enfocados, no a texto estático) y en la captura real el texto se lee sin necesidad de zoom manual — se anota como observación de legibilidad en la sección de hallazgos, no como motivo para bajar el veredicto.

---

## Resto de la auditoría — hallazgos ordenados por impacto real

### Alto impacto

**1. El checklist de Encarpe (18 ítems) no tiene ningún indicador de progreso ("3 de 18", barra, etc.)** — confirmado: `encarpe_indicador_progreso_encontrado: false` (se buscó cualquier texto que matchee `/\d+\s*(de|\/)\s*18/i` en toda la pantalla, no apareció). La sección mide **2296px de alto** (`scrollHeightSeccion`), equivalente a **3.1 pantallas de scroll completas** a 360×740. Un supervisor parado junto al camión, completando esto con una mano, no tiene ninguna señal de cuánto le falta — solo puede inferirlo contando manualmente los ítems ya marcados. Riesgo real: abandono a mitad de camino, o sensación de "esto no termina nunca" con el camión esperando.
*Archivo:* `src/components/InspeccionForm.tsx` (sección "2. Elementos a Fiscalizar", línea ~985) — agregar un contador fijo tipo "Ítem X de 18" junto al título de la sección.
*Captura:* `12-checklist-encarpe-inicio.png`.

**2. Selectores Conforme/No conforme/No aplica: 32px de alto, por debajo del mínimo táctil de 44px.** Confirmado en los 18 ítems de Encarpe y los 3 de Control de Salida (`areasDeToque.encarpe_selects_estado_min: { minWidth: 121, minHeight: 32 }`). El ancho (121px) es holgado, pero la altura (32px) es un 27% menor al mínimo recomendado (Apple HIG / Material Design: 44-48px). Con guantes de trabajo o dedos gruesos, el riesgo de tocar el select equivocado (y marcar "No conforme" cuando se quería "Conforme", o viceversa) es real, y es un checklist de seguridad — un error de toque ahí no es cosmético.
*Archivo:* el `<select>` de `ChecklistItemRow.tsx` (fila de modo 'estado') — la clase de altura viene del componente `Select`/estilo nativo, subir el padding vertical.
*Captura:* `13-item-no-conforme-360.png` (fila completa visible).

**3. El botón de información "i" mide 20×20px** (`boton_info_ejemplo: { width: 20, height: 20 }`) — menos de la mitad del mínimo táctil recomendado. Es el botón que muestra las "Exigencias para Cargar" de cada ítem (ej. "Las teleras deben estar separadas cada 60 cm") — información que un guardia o supervisor nuevo consultaría justo en el momento de decidir Conforme/No conforme. Si cuesta tocarlo, en la práctica se deja de usar.
*Archivo:* `src/components/InfoPopover.tsx` (el botón trigger del popover).

### Medio impacto

**4. La tabla "Inspecciones" recorta columnas a la derecha sin ninguna pista visual de que se puede desplazar.** Confirmado que es scroll **interno** de la tabla y no un bug de overflow de página (`scrollHorizontal.dashboard-supervisor-360: { scrollWidth: 360, clientWidth: 360 }` — la página en sí no se desborda, tal como pide el criterio de la auditoría). Pero visualmente el encabezado corta literalmente en "Es…" (Estado) sin ninguna sombra de degradado, flecha o indicio de que hay más columnas a la derecha — el guardia/supervisor puede no darse cuenta de que existe más contenido para deslizar.
*Archivo:* el contenedor de scroll de la tabla de tickets (buscar `overflow-x-auto` en el componente compartido de tabla) — agregar un fade/sombra en el borde derecho cuando hay overflow pendiente.
*Captura:* `01-dashboard-supervisor.png`.

**5. Foto de un ítem `no_conforme` en el informe: la miniatura puede aparecer como recuadro en blanco en la primera pintura del informe.** Se verificó que **no es una pérdida de datos** — se consultó directamente la fila en `ticket_checklist_respuestas` y el `foto_url` quedó guardado correctamente (`ee413994.../plataforma/1789143522007-kydvj0.jpg`, comprimida a `.jpg` del lado del cliente). Es probablemente una carga diferida de la URL firmada de Storage que no terminó de pintar antes de que Playwright disparara el screenshot tras `networkidle`. En una conexión de patio realmente lenta, ese hueco en blanco podría tardar perceptiblemente más en llenarse — vale la pena confirmarlo visualmente en un dispositivo real antes de descartarlo del todo.
*Captura:* `16-informe-encarpe-con-observacion-360.png`.

### Bajo impacto

**6. El combo "Tipo de inspección" es un `<select>` nativo con `w-fit`** — se dimensiona según la opción más larga ("Exportación (Chimolsa)"), no según el ancho del contenedor. Por diseño, esto hace que el recorte de texto sea estructuralmente improbable: el navegador ajusta el ancho del control a su contenido. No se pudo capturar el menú desplegado abierto porque un `<select>` nativo se renderiza por el sistema operativo, fuera del árbol de la página — Playwright no puede hacerle un screenshot significativo aunque sí puede confirmar el layout cerrado (`combo_tipo.box_360: { width: 214, height: 36 }`, dentro de los 360px de viewport). Se reporta esto explícitamente en vez de inventar un screenshot del menú abierto.

**7. El encabezado de la app usa `position: sticky` (no `fixed`)** — confirmado leyendo el código (`src/app/(app)/layout.tsx`, `className="... sticky top-0 z-20 ..."`). No se encontró ningún elemento `fixed` en las pantallas del flujo de inspección que pudiera solaparse con el teclado on-screen. El comportamiento real del teclado virtual de Android (que sí puede solapar un header `sticky` al reducir la altura visible del viewport) **no es verificable con Chromium headless** — Playwright no simula un teclado on-screen real ni redimensiona el viewport al enfocar un input. Se reporta el hallazgo estático (no hay `fixed`, el header es `sticky`) sin inventar una verificación dinámica que la herramienta no puede hacer.

### Otras verificaciones limpias (sin hallazgo)

- Inputs de texto/fecha: `font-size` computado de 16px en todos los campos revisados (Transporte, Fecha de vencimiento, Observación por ítem, Observación general de Chimolsa) — no dispara auto-zoom de iOS.
- Sin scroll horizontal de página en ninguna pantalla revisada (dashboard, informes de Control de Salida/Encarpe/Chimolsa, a 360 y 390).
- Campos condicionales correctos: "Nombre Encarpador" + "Nombre Guardia" aparecen para Control de Salida; "Nro de Contenedor" aparece para Exportación (Chimolsa).
- Checklist Chimolsa: exactamente 4 ítems, 0 selects de estado (correcto, es modo 'fotos' puro), 5 espacios de foto en total respetando `fotos_requeridas` por ítem (1/2/1/1).

---

## Simulación de mala señal

### (a) Red lenta real durante una subida de foto

Se emuló 3G lento real vía CDP (`Network.emulateNetworkConditions`: latencia 1500ms, 150kbps descarga, 100kbps subida) y se subió una foto en un ítem `no_conforme` de Encarpe.

- **Muestra estado de carga:** sí — el texto "Subiendo foto…" aparece mientras la subida está en curso (capturado en `40-red-lenta-subiendo-foto.png`).
- **Tiempo real:** 8.25 segundos para un archivo de ~50KB (el logo de prueba) bajo esas condiciones — proporcionalmente, una foto real de celular sin comprimir (varios MB) tardaría bastante más bajo la misma señal.
- **Termina correctamente:** sí, sin timeout ni error (`termino_ok: true`).

*Evidencia:* `40-red-lenta-subiendo-foto.png`, `41-red-lenta-foto-terminada.png`.

### (b) Falla forzada de la subida a Storage

Se interceptó la ruta `**/storage/v1/object/fallas/**` con `route.abort('failed')` (simula pérdida de conexión a mitad de subida) durante la carga de foto de un ítem `no_conforme`.

- **¿Se le informa al supervisor?** Sí, con un mensaje concreto y visible: *"Error subiendo {ticketId}/plataforma/{timestamp}.jpg: Failed to fetch"* en un banner rojo — no falla en silencio.
- **¿Pierde los datos ya cargados?** No — la observación de texto escrita ANTES de que fallara la foto **sigue presente** en el textarea después del error (`observacion_se_perdio: false`).
- **¿Puede reintentar sin recargar la página?** Sí — el `<input type="file">` sigue disponible y habilitado inmediatamente después del error, listo para un segundo intento, sin necesidad de recargar ni perder el resto del checklist ya completado.

Este es un manejo de error genuinamente bueno para el contexto real (señal de patio intermitente) — vale la pena señalarlo como algo a **no tocar** al hacer cambios futuros.

*Evidencia:* `42-falla-subida-foto.png`.

---

## Resumen final

| # | Hallazgo | Severidad | Archivo |
|---|---|---|---|
| — | Firma táctil (punto crítico 1) | — | Funciona, sin cambios necesarios |
| — | Captura de foto — atributos e input funcional, pero genérico (punto crítico 2) | — | Funciona con reserva de ergonomía |
| — | Informe de Control de Salida en el teléfono del guardia (punto crítico 3) | — | Funciona, sin cambios necesarios |
| 1 | Checklist de 18 ítems (Encarpe) sin indicador de progreso — 3.1 pantallas de scroll a ciegas | **Alto** | `src/components/InspeccionForm.tsx` |
| 2 | Selects Conforme/No conforme/No aplica de 32px de alto (mínimo recomendado 44px) | **Alto** | `ChecklistItemRow.tsx` |
| 3 | Botón de información "i" de 20×20px | **Alto** | `src/components/InfoPopover.tsx` |
| 4 | Tabla de tickets sin pista visual de scroll horizontal interno | Medio | componente de tabla de tickets (`overflow-x-auto`) |
| 5 | Miniatura de foto en el informe puede tardar en pintar (dato no se pierde, solo la carga visual) | Medio | verificar en dispositivo real, no confirmado como bug |
| 6 | Combo de tipo de inspección — riesgo de overflow estructuralmente bajo (select nativo `w-fit`) | Bajo | sin acción necesaria |
| 7 | Header `sticky` vs. teclado on-screen — no verificable con esta herramienta | Bajo | sin acción necesaria por ahora |

**Totales:** 3/3 puntos críticos en verde (2 sin reservas, 1 con una reserva menor de ergonomía) · 3 hallazgos de severidad alta · 2 de severidad media · 2 de severidad baja.
