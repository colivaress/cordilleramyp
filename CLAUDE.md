@AGENTS.md

---

# Cordillera M&P — Revisión de Equipos y Camiones
## Blueprint de ingeniería para ejecución en Claude Code

Este documento es la especificación completa del proyecto y **reemplaza y absorbe** la spec anterior y más acotada que existía en este `CLAUDE.md` (enfocada solo en el listado con alerta de vencimiento y WhatsApp). Esa spec previa no se descarta: sus detalles concretos de implementación (modelo de estado derivado, construcción del enlace `wa.me`) quedan integrados en la sección 3 de este documento, que ahora es la fuente de verdad única para todo el proyecto.

Ejecuta el desarrollo de principio a fin siguiendo este orden: (1) scaffold del proyecto, (2) esquema de base de datos en Supabase, (3) componentes y lógica de negocio, (4) notificaciones y reportes. No te detengas a pedir confirmación entre secciones salvo que falte una credencial o decisión de negocio explícitamente marcada como pendiente más abajo.

**Stack instalado en este repo** (ver `package.json`): Next.js `16.3.3` (App Router), React `19.2.8`, Tailwind CSS `^4`, TypeScript `^5`, ESLint `9`. Supabase (PostgreSQL + Storage) como backend.

> ⚠️ Next.js 16 tiene breaking changes respecto a versiones anteriores más conocidas. Antes de escribir código de rutas, layouts o data fetching, revisa las guías en `node_modules/next/dist/docs/` (indicado también en `AGENTS.md`, importado arriba).

**Restricción de formato de salida:** el "Informe de Inspección" que genera la app (sección 4) no debe incluir códigos documentales ni números de versión de ningún tipo (nada de "Doc-ID", "Rev. 00", "Versión 1.2", etc.). Es el único lugar del proyecto donde aplica esta restricción; no afecta al versionado normal del código (git, package.json, etc.).

> 🔒 **Ningún token, API key o credencial debe llegar a GitHub ni quedar expuesto en el código.** Regla obligatoria durante todo el desarrollo, detallada en la sección 9 — revísala antes del primer commit y antes de cada push.

---

## 1. Datos de cabecera obligatorios

Todo ticket se crea con estos campos obligatorios, validados en el formulario antes de permitir avanzar al checklist:

- `transporte` (texto)
- `conductor` (texto o referencia a catálogo de personal)
- `fecha` (fecha y hora — datetime)
- `procedencia` (texto)
- `tipo_camion` (texto)
- `patente_camion` (texto)
- `patente_rampla` (texto)

**El `conductor` puede cambiar entre revisiones de un mismo ticket** (en una segunda inspección puede presentarse un chofer distinto al de la primera) — ver §2.6 para cómo se registra esto sin perder el historial del conductor de cada revisión anterior.

---

## 2. Roles, ciclo de vida del ticket y checklist de 18 elementos

### 2.1 Roles

- **Supervisor**: crea tickets, ejecuta inspecciones, completa el checklist, captura las dos firmas digitales (conductor y fiscalizador), sube fotos de fallas, y envía el informe por correo (§4) de sus propios tickets. Solo ve sus propios tickets, nunca el dashboard general (detalle de acceso en §2.6).
- **Administrador**: ve el dashboard con las tarjetas de resumen y todos los tickets de todos los supervisores, recibe alertas de vencimiento.
- **Conductor**: solo firma en pantalla al momento de la inspección; no tiene login propio en el MVP (su firma se captura desde el dispositivo del supervisor).

### 2.2 Identidad del ticket

Cada inspección genera un **ticket con `id` UUID único** (`gen_random_uuid()`). Toda la lógica de estado, revisiones, firmas y notificaciones se ata a ese `id`, nunca a la patente del camión o la rampla — un mismo vehículo puede tener múltiples tickets a lo largo del tiempo, y cada uno mantiene su propio historial independiente.

### 2.3 Máquina de estados (4 estados)

```
EN_REVISION
    ↓ (checklist sin fallas)              ↓ (checklist con 1+ fallas)
FINALIZADA_SIN_OBSERVACIONES      FINALIZADA_CON_OBSERVACIONES
                                            ↓ (taller comienza a trabajar)
                                   EN_REPARACION_DE_OBSERVACIONES
                                            ↓ (supervisor vuelve a inspeccionar)
                                   EN_REVISION  (revision_actual += 1)
                                            ↓
                        ¿quedan fallas? → FINALIZADA_CON_OBSERVACIONES (o vuelve a EN_REPARACION)
                        ¿cero fallas?   → FINALIZADA_SIN_OBSERVACIONES
```

Reglas:

- El ticket nace en `EN_REVISION`.
- Al cerrar el checklist: si hay al menos un ítem `no_conforme` → `FINALIZADA_CON_OBSERVACIONES`. Si todos están `conforme` (o `no_aplica`) → `FINALIZADA_SIN_OBSERVACIONES` (estado terminal).
- Cuando el supervisor vuelve a inspeccionar (así sea para revisar una sola falla subsanada), el ticket vuelve a `EN_REVISION` y su contador `revision_actual` sube en +1 ("Revisión #2", "Revisión #3", ...). Esto se repite hasta que **todas** las fallas queden limpias y el ticket alcance `FINALIZADA_SIN_OBSERVACIONES`.
- Cada paso por `EN_REVISION` crea una fila nueva en `ticket_revisiones` (ver esquema) — así queda historial completo de qué se evaluó en cada vuelta, quién firmó y qué fallas seguían abiertas.
- **Corrección — se elimina el paso manual "Iniciar reparación":** la primera versión de este blueprint pedía un botón para que "el taller marque que está trabajando en las fallas", pasando el ticket a `EN_REPARACION_DE_OBSERVACIONES` antes de poder reinspeccionar. Ese botón está de más y se elimina — desde `FINALIZADA_CON_OBSERVACIONES` la única acción disponible es **reinspeccionar directamente** (ver el detalle en §2.6), que lleva el ticket derecho a `EN_REVISION`, sin pasar por ese estado intermedio. El valor `en_reparacion_de_observaciones` puede quedar definido en el tipo `ticket_estado` de la base de datos (no hace falta una migración destructiva para sacarlo), pero **ningún flujo nuevo debe asignarlo** — si algún ticket antiguo ya quedó en ese estado, trátalo en la práctica igual que `FINALIZADA_CON_OBSERVACIONES` (mismo botón de reinspeccionar disponible).

### 2.4 Checklist de 18 elementos + botón de información por campo

Cada fila del checklist se renderiza como: **nombre del elemento** — **selector Conforme / No conforme / No aplica** — **ícono "i" pequeño al lado del nombre**. Al presionar el ícono se abre un popover/modal liviano (no navega de página) mostrando únicamente el texto de "Exigencias para Cargar" de ese elemento. El texto sale de la tabla `checklist_items` (ver §7.3) — no lo hardcodees en el componente, tráelo por `key` para que quede editable desde la base de datos sin tocar código.

Tabla de referencia (orden en que deben aparecer en el formulario, `key` = identificador estable en BD/código, texto = contenido exacto del popup, transcrito del documento físico de la empresa):

| # | `key` | Campo | Texto del popup (Exigencias para Cargar) |
|---|-------|-------|-------------------------------------------|
| 1 | `plataforma` | Plataforma | No debe presentar fisuras ni ovalaciones |
| 2 | `teleras_y_ganchos` | Teleras y Ganchos | Las teleras deben estar en buen estado, los ganchos deben estar separados aprox. cada 60 cm |
| 3 | `carpas` | Carpas | Deben cubrir el ancho y alto de la carga, no debe presentar agujeros, no debe estar quemada |
| 4 | `nylon` | Nylon | Debe cubrir el largo carga, no presentar agujeros |
| 5 | `ponchos` | Ponchos | No deben presentar agujeros, no debe estar quemado |
| 6 | `cordeles` | Cordeles | No deben presentar nudos, estar picados o quemados |
| 7 | `cortinas` | Cortinas | No deben presentar fisuras, agujeros o encontrarse quemadas |
| 8 | `goma_drenaje` | Gomas Drenaje | No deben estar dañadas, quemadas o cortadas |
| 9 | `sider_broches` | Slider (Broches sujeta cortina) | Deben estar en buen estado |
| 10 | `esquineros` | Esquineros | Mantener un mínimo de 30 esquineros de madera o plástico |
| 11 | `eslingas` | Eslingas | Sin piquetes, rajaduras, quemaduras ni nudos |
| 12 | `trinquetes` | Trinquetes | Deben estar en buen estado con sus seguros y mecanismos funcionando |
| 13 | `carga` | Carga | Debe venir bien estibada y/o prensada |
| 14 | `maletero` | Maletero (Herramientas) | Deben estar en buen estado |
| 15 | `fugas` | Fugas | No deben tener fugas de agua o combustible |
| 16 | `luces` | Luces | Deben estar en buen estado |
| 17 | `neumaticos` | Neumáticos | Deben estar en buen estado |
| 18 | `cunas` | Cuñas | Debe contar con 2 cuñas de plástico o goma maciza |

Cada respuesta `no_conforme` obliga en el formulario (validación de cliente + constraint en BD) a completar:

- `observacion` (texto)
- `foto_url` (subida obligatoria a Supabase Storage, bucket `fallas`, ruta `ticket_id/item_key/timestamp.ext`)

La fecha de vencimiento **ya no se pide por ítem** — es un solo campo a nivel de la revisión completa, ubicado en la sección de cabecera del formulario, no aquí. Ver §2.7.

En la vista de detalle del ticket (`/tickets/[id]`), cada foto de un ítem `no_conforme` se muestra como miniatura dentro de su fila del checklist; al hacer clic se abre en grande (lightbox/modal con la imagen a tamaño completo), no debe abrir la imagen en una pestaña nueva del navegador ni quedar solo como miniatura pequeña sin forma de verla ampliada.

### 2.5 Firmas digitales

En la pantalla de cierre de cada revisión (cada vez que el ticket pasa por `EN_REVISION`) se muestran **dos áreas de firma independientes**, una etiquetada "Firma Conductor" y otra "Firma Fiscalizador/Supervisor". Implementación:

- Componente `SignaturePad` reutilizable basado en un `<canvas>` (librería `signature_pad` o `react-signature-canvas`), con botón "Limpiar" y captura por mouse/touch.
- Al guardar la revisión, cada firma se exporta a PNG (`toDataURL`), se sube a Supabase Storage (bucket `firmas`, ruta `ticket_id/revision_numero/conductor.png` y `.../fiscalizador.png`) y se guarda la URL pública/firmada en `ticket_revisiones.firma_conductor_url` y `firma_fiscalizador_url`.
- Ambas firmas son obligatorias para poder cerrar la revisión (deshabilita el botón "Finalizar revisión" hasta que las dos tengan trazo).
- El informe (§4) debe renderizar ambas imágenes de firma junto al nombre de cada firmante y la fecha/hora de la revisión correspondiente.

### 2.6 Acceso y visibilidad por rol

**Esto es un ajuste sobre lo ya construido** (la primera versión mostraba el Dashboard completo a todos los roles) — corrige el acceso así:

- **Administrador:** ve el nav "Dashboard" con las tarjetas de resumen (Inspecciones, Por vencer, Vencidos, En reparación, Finalizadas — ver la tarjeta nueva más abajo) y la tabla completa con **todos** los tickets de todos los supervisores. Sin cambios respecto a lo ya construido, salvo las correcciones que siguen.
- **Supervisor:** **no debe ver el link "Dashboard" en el nav ni las tarjetas de resumen.** Su vista de inicio (puede ser la misma ruta `/dashboard` renderizada distinto según rol, o una ruta propia — a criterio de la implementación, pero la URL del dashboard de administrador no debe quedar accesible para un supervisor ni escribiéndola directo) muestra **solo la tabla de tickets**, con las mismas columnas que ya existen, **filtrada a únicamente los tickets donde ese supervisor es el `supervisor_id`** — nunca los de otros supervisores. Agrega las columnas "Nro de Inspección" y "Nro de Revisión" (ver más abajo) a esa tabla.
- Esto es control de acceso real, no solo ocultar el link en el nav: la política RLS de `tickets`, `ticket_revisiones` y `ticket_checklist_respuestas` debe restringir el `select` para el rol supervisor a `supervisor_id = (select id from personal where user_id = auth.uid())`, y permitir `select` sin restricción cuando `personal.rol = 'administrador'`. Revisa y ajusta las políticas RLS que ya se crearon durante la primera construcción para que cumplan esto — probablemente hoy permiten leer todo a cualquier `authenticated`.
- **El botón/link "Nueva inspección" (`/tickets/new`) no debe aparecer para el rol Administrador** — corrige esto si hoy aparece en el nav o en el Dashboard de administrador (como se ve hoy). Solo el Supervisor crea inspecciones (§2.1); el administrador únicamente visualiza y da seguimiento. Igual que con el Dashboard, esto también es control de acceso real: la ruta `/tickets/new` no debe quedar utilizable por un administrador aunque la escriba directo en la URL.
- **La tabla de tickets debe listar una fila por ticket, no una fila por revisión — en las dos vistas, dashboard de administrador y "Mis inspecciones" del supervisor.** Es la misma corrección aplicada a ambos lugares: si la tabla de tickets es un componente compartido, corrígelo ahí una sola vez y verifica que el fix se refleje en las dos pantallas; si son consultas separadas, aplica el mismo cambio en ambas — hoy sigue repetida en la vista de supervisor (una fila por cada `ticket_revisiones` del mismo ticket). La consulta debe agrupar por `tickets.id` y traer solo el estado y la revisión **más reciente** de cada ticket (la columna "Nro de Revisión" de esa fila muestra el `numero_revision` de esa última revisión — ver la corrección más abajo). Ordena la tabla por el ticket (por ejemplo por su `numero_inspeccion`, `created_at`/`fecha`, o por la fecha de su última revisión), no mezclando revisiones de tickets distintos fuera de orden. El historial completo de todas las revisiones de un ticket sigue disponible al entrar al detalle (`/tickets/[id]`, ya existente) — un ticket puede tener varias revisiones, eso no cambia, solo cambia que la tabla resumen no debe listarlas todas como filas separadas.
- **Conductor por revisión:** en una segunda inspección (o posteriores) puede presentarse un chofer distinto al de la primera. Agrega `conductor` también a `ticket_revisiones` (no solo a `tickets`), para que cada revisión guarde su propio conductor sin sobrescribir ni perder el de las revisiones anteriores:

  ```sql
  alter table ticket_revisiones
    add column conductor text;
  ```

  Al crear la revisión #1 de un ticket, copia ahí el `conductor` ingresado en la cabecera del ticket (§1). Al iniciar una revisión posterior (cuando el ticket vuelve a `EN_REVISION`, §2.3), el formulario debe permitir confirmar el mismo conductor o ingresar uno distinto — lo que se guarde queda en esa fila de `ticket_revisiones` únicamente, sin modificar el conductor registrado en revisiones previas. La tabla resumen de tickets (punto anterior) y el informe (§4) deben mostrar el conductor de la revisión más reciente; el detalle del ticket (`/tickets/[id]`) muestra el conductor de cada revisión en su propio historial.

**Número de revisión correlativo — corrección sobre `nro_revision_global`:** la primera versión de este blueprint pedía mostrar en la columna "Nro de Revisión" un correlativo **global**, sin reiniciarse nunca a nivel de todo el sistema (`nro_revision_global`), para que dos revisiones nunca compartieran número entre supervisores distintos. En la práctica esto resultó confuso: un ticket con una sola revisión podía mostrar "Nro de Revisión 3" solo porque otros tickets ya habían acumulado revisiones antes, sin ninguna relación con cuántas revisiones tiene ese ticket en particular — por ejemplo, el ticket con Nro de Inspección 2 (una sola revisión) mostraba "Nro de Revisión 3", cuando debía mostrar "1".

**Corrige así:** la columna **"Nro de Revisión"** debe mostrar `numero_revision` — el contador que ya existe en `ticket_revisiones` y **reinicia en 1 en cada ticket nuevo** (el mismo que arma el "Revisión #N" del badge de estado, §2.3) — no `nro_revision_global`. Con esto, cualquier ticket con una sola revisión siempre muestra "Nro de Revisión 1", sin importar cuántas revisiones lleven otros tickets; y un ticket en su segunda revisión muestra "2", etc. La necesidad original de un identificador único y sin ambigüedad para una persona ya queda cubierta por **el par (Nro de Inspección, Nro de Revisión)**: `numero_inspeccion` (más abajo) identifica al ticket de forma única en todo el sistema, y `numero_revision` identifica la revisión dentro de ese ticket — juntos nunca se repiten, sin necesitar un contador global.

Si la columna `nro_revision_global` ya se agregó a `ticket_revisiones` en una migración anterior, puede quedar en la base de datos sin problema (no hace falta eliminarla ni revertir esa migración) — simplemente **deja de usarla en cualquier pantalla**; ya no es el campo que se muestra como "Nro de Revisión".

**Quita el sufijo "· Rev. #N" del badge de estado en la tabla de tickets:** hoy la insignia de estado se ve como "Finalizada con observaciones · Rev. #3", repitiendo el número de revisión que ya está en su propia columna "Nro de Revisión" — es información duplicada y no hace falta. El badge debe mostrar únicamente el texto del estado (por ejemplo, "Finalizada con observaciones"), sin el "· Rev. #N" al lado. Esto aplica solo a la tabla de tickets (dashboard de administrador y "Mis inspecciones"); no afecta al informe/PDF (§4) ni al detalle del ticket (`/tickets/[id]`), donde sí tiene sentido indicar a qué revisión corresponde cada firma/checklist dentro del historial.

**Número de inspección correlativo del ticket (`numero_inspeccion`):** además de `nro_revision_global` (que es por revisión, arriba) y `numero_revision` (que reinicia por ticket, §2.3), agrega un **tercer correlativo, este a nivel de `tickets`**, que identifica al ticket mismo de forma legible para una persona — no uses el `id` UUID interno para esto, tal como ya se evita en el informe y el correo (§4). Se asigna **una sola vez**, al crear el ticket (su primera inspección), y no vuelve a cambiar aunque el ticket pase por varias revisiones.

```sql
alter table tickets
  add column if not exists numero_inspeccion bigint generated always as identity unique not null;
```

(Súmalo también al DDL base de `tickets` en §7, con el mismo patrón de `nro_revision_global` en `ticket_revisiones` — misma nota de reconciliación de §7: en una base ya desplegada usa el `alter table` de arriba, no recrees la tabla.)

- **Corrección — en el formulario de "Datos de Inspección" (paso 1, antes de crear el ticket), NO se muestra el campo "Nro de Inspección" en absoluto:** una versión anterior de este blueprint pedía mostrarlo ahí como campo de solo lectura con un placeholder tipo "Se asigna al presionar 'Realizar revisión'" — eso se revierte, ese campo (etiqueta + casillero vacío) **se saca por completo del paso 1**, no tiene sentido mostrar un campo para un dato que todavía no existe. El resto de los campos de esa sección (Conductor, Fecha de vencimiento, Transporte, etc.) no cambian de posición por esto.
- **Recién se muestra una vez que el ticket ya existe y el número fue asignado:** al presionar "Realizar revisión" (transición del paso 1 al paso 2, §2.7), se crea la fila en `tickets` de inmediato — no recién al finalizar toda la revisión — y con eso el `numero_inspeccion` ya existe. Desde ese momento en adelante (pantalla de checklist/firmas §2.13, detalle del ticket, informe, tabla de tickets) sí se muestra el número real, nunca un placeholder ni un campo vacío. Esto es además un requisito para que la persistencia inmediata de firmas y fotos de §2.8 funcione (necesitan un `ticket_id` real para subir a Storage y guardar la URL).
- **Sin duplicados entre inspectores simultáneos:** esto ya queda garantizado por `generated always as identity` (§7) — Postgres asigna el siguiente número de forma atómica aunque dos supervisores creen su ticket en el mismo instante, nunca hace falta calcularlo a mano en el código ni coordinarlo entre pestañas/usuarios.
- **En el listado de tickets:** agrega la columna "Nro de Inspección" (tanto en el dashboard de administrador como en "Mis inspecciones"/"Inspecciones" del supervisor).
- **Corrección — acorta el encabezado de esa columna:** en la tabla (las dos pantallas), el título de la columna "Nro de Inspección" pasa a ser solo **"Nro"** (para que ocupe menos espacio, junto con "Ver", el ícono de WhatsApp, etc.) — el valor de la celda sigue siendo el número tal cual. Esto es **solo el encabezado de esa columna de la tabla**; en el resto de la app (el campo "Nro de Inspección" del formulario de "Datos de Inspección", la página del informe, el cuerpo del correo/WhatsApp) deja el texto completo "Nro de Inspección" como está, ahí sí hace falta el contexto completo.
- **Corrección — se elimina la columna "Nro de Revisión" como columna aparte; el número de revisión se muestra pegado al Nro de Inspección, dentro de la misma celda:** en las dos tablas (dashboard de administrador y "Inspecciones" del supervisor), saca por completo la columna "Nro de Revisión" (la que hoy va al final, después de "Supervisor" — ver más abajo, esa corrección queda reemplazada por esta). En su lugar, dentro de la celda de la columna "Nro" (el número de inspección), agrega el número de revisión (`numero_revision`) **al lado del número, más chico y pegado, con el signo `#` antes** — por ejemplo `115 #1` o `9 #3` — el número de inspección en tamaño normal y el `#N` en una fuente más pequeña (por ejemplo `text-xs` o similar, color más apagado tipo `text-slate-400`/`text-muted-foreground`), sin salto de línea entre ambos si no hace falta. No es un link ni un botón, es solo texto informativo — igual que hoy es la celda de "Nro de Revisión", pero integrado a la celda de "Nro". Esto libera una columna completa en la tabla. El resto de la app (detalle del ticket, informe, correo, WhatsApp) sigue mostrando "Nro de Revisión" con su texto completo y en su propia línea/campo, sin cambios — esta corrección es solo para el layout de estas dos tablas.

**Envío del informe por correo:** el botón "Enviar por correo" del informe (§4) lo pueden accionar tanto el **supervisor** como el **administrador** — no es una acción exclusiva de uno solo de los dos roles (esto reemplaza la corrección anterior, que lo dejaba solo para supervisor). Un supervisor puede enviar el informe de cualquier ticket que pueda ver según la regla de visibilidad de más abajo (los suyos, más los que estén "con observaciones" y sean de cualquier supervisor); un administrador puede enviar el informe de **cualquier** ticket, ya que los ve todos (§2.6, primer punto). Si la Server Action que procesa el envío valida el rol de quien lo llama, agrega `administrador` a la lista de roles permitidos, no solo `supervisor`.

**Corrección — el botón "Enviar por correo" debe aparecer también al entrar al informe desde el dashboard de administrador:** hoy, al presionar "Informe" en la tabla del dashboard de administrador (columna "Acciones") y llegar a `/tickets/[id]/report`, la pantalla solo muestra el documento para ver/descargar, sin el selector de destinatarios para enviarlo por correo — mientras que desde el flujo del supervisor (§4.1) ese mismo botón sí aparece. Corrige esto para que la vista del informe (`/tickets/[id]/report`) muestre **siempre** el mismo botón "Enviar por correo" con el selector multi-destinatario de §4.1, igual en ambos casos — es el mismo componente de informe, no debe tener una versión reducida según el rol o la pantalla desde la que se llegó ahí.

**Acceso directo al informe apenas se finaliza una inspección (falta hoy):** al presionar "Finalizar revisión" (§2.5) y guardar exitosamente, el supervisor debe quedar de inmediato frente a un botón claro para **generar el informe y enviarlo por correo** — no debe tener que ir a buscar el ticket manualmente en "Mis inspecciones" para encontrar esa opción. Al terminar de guardar la revisión, muestra una pantalla de confirmación (o redirige directo a `/tickets/[id]/report`, §4) con un botón del tipo "Generar informe y enviar por correo" que lleve a la vista del informe con el selector de destinatarios (§4.1) ya listo para usar.

**Corrección — se revierte: la sección de "Enviar por correo" se saca del detalle del ticket, queda solo en la página del informe:** una corrección anterior había agregado la sección completa de "Enviar informe por correo" (selector de destinatarios, campo "Otros correos", botón "Enviar por correo") directamente en `/tickets/[id]` — eso se revierte. **Elimina esa sección del detalle del ticket.** El detalle del ticket sigue mostrando el botón "Ver informe" (que lleva a `/tickets/[id]/report`, §4) — es ahí, únicamente en la página del informe, donde vive la sección para enviarlo por correo (§4.1). El detalle del ticket queda más simple: solo ver los datos, el historial de revisiones y el botón para ir al informe (y, si corresponde, "Registrar re-inspección").

**Corrección — un ticket "con observaciones" debe ser visible (y reinspeccionable) por cualquier supervisor, no solo por quien lo creó:** cuando llega una segunda inspección, puede tomarla un supervisor distinto al que hizo la primera — hoy eso no es posible porque la tabla de "Mis inspecciones" y las políticas RLS solo muestran a cada supervisor sus propios tickets (`supervisor_id` = el que lo creó). Corrige así:

- Un ticket queda visible para **todos** los supervisores (no solo su `supervisor_id` original) mientras su estado sea `finalizada_con_observaciones` (o el legado `en_reparacion_de_observaciones`, ver arriba) — es decir, mientras tenga fallas pendientes de corregir. Un ticket `en_revision` o ya `finalizada_sin_observaciones` sigue visible solo para su `supervisor_id` original, como hasta ahora.
- Actualiza la política RLS de `select` en `tickets`, `ticket_revisiones` y `ticket_checklist_respuestas` para el rol supervisor: `supervisor_id = (select id from personal where user_id = auth.uid()) OR estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')`.
- La política RLS de `insert` en `ticket_revisiones` (nueva revisión / reinspección) y `ticket_checklist_respuestas` debe permitir la misma condición — cualquier supervisor puede crear la siguiente revisión de un ticket que esté en ese estado, no solo el `supervisor_id` original del ticket. El `supervisor_id` de la fila nueva en `ticket_revisiones` (ver §7) debe guardar quién hizo **esa** revisión en particular — no se sobrescribe el `supervisor_id` original del ticket, que sigue identificando a quien lo creó.
- La tabla de tickets ya muestra la columna "Supervisor" con el nombre de quien lo creó (§7) — eso deja claro, incluso cuando el ticket aparece en la lista de otro supervisor, quién lo abrió originalmente. No hace falta agregar una columna nueva para esto.

**Bug confirmado — en "Mis inspecciones" aparecen tickets de otros supervisores que NO están "con observaciones":** se probó en vivo y, además de los tickets "con observaciones" de otros supervisores (que sí corresponde que se vean, punto de arriba), también aparecen tickets de otros supervisores en `en_revision` y/o `finalizada_sin_observaciones` — eso **no** debe pasar, esos dos estados tienen que seguir viéndose solo para el `supervisor_id` original. La causa más probable: puede haber quedado una política RLS de `select` **anterior y más permisiva** todavía activa en `tickets` (por ejemplo algo como "cualquier `authenticated` puede leer todo", mencionada como sospecha ya en la primera corrección de este mismo §2.6, más arriba) — en Postgres, cuando hay **varias políticas permisivas para el mismo comando en la misma tabla, se combinan con OR entre sí**, así que si esa política vieja sigue ahí, alcanza para exponer todo aunque la política nueva y correcta también exista. Corrige así:

1. Lista **todas** las políticas RLS activas hoy sobre `select` en `tickets` (por ejemplo con `select * from pg_policies where tablename = 'tickets';` desde el SQL Editor de Supabase, o el equivalente vía el MCP de Supabase) — no asumas que ya se limpiaron, confírmalo mirando la base real.
2. Si aparece más de una política permisiva de `select` para el rol supervisor/`authenticated`, **elimina (`drop policy`) todas las que no sean la condición correcta de arriba** (`supervisor_id = ... OR estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')`) — debe quedar una sola política de `select` con esa condición para ese rol, no varias conviviendo.
3. Repite la misma verificación en `ticket_revisiones` y `ticket_checklist_respuestas`, ya que la misma condición se pidió aplicar ahí también.
4. Después de limpiar las políticas, **prueba de nuevo en vivo** iniciando sesión como un supervisor con tickets propios y ajenos de por medio: confirma que en "Mis inspecciones" solo aparecen sus propios tickets en `en_revision`/`finalizada_sin_observaciones`, y los de cualquier supervisor únicamente cuando están `finalizada_con_observaciones` (o el legado `en_reparacion_de_observaciones`) — no des el fix por hecho solo con leer el código de las políticas, verifícalo con datos reales como se reprodujo el bug.

**Bug confirmado en producción — falta la política RLS de `update` para cerrar la re-inspección de un ticket de otro supervisor (error real: "No se pudo cerrar la re-inspección de un ticket de otro supervisor: falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor"):** se probó en vivo el flujo de §2.14 (re-inspección) sobre un ticket que no era del supervisor que inició sesión. El checklist y las firmas se guardaron bien (eso confirma que la política de `insert` del punto 172 de arriba ya está funcionando), pero al presionar "Finalizar revisión" para cerrar esa revisión, falló con el error de arriba.

- **Causa real, no es un problema de variables de entorno:** el paso de cierre necesita hacer un `update` sobre `tickets` (como mínimo, `tickets.estado` con el resultado de la revisión — §2.3 — y probablemente `fecha_vencimiento`/otros campos derivados de la revisión más reciente), y probablemente también sobre la fila de `ticket_revisiones` que se está cerrando. La política RLS de `update` para el rol supervisor en esas tablas seguramente sigue restringida a `supervisor_id = (select id from personal where user_id = auth.uid())` — es decir, nunca se actualizó para permitir la misma excepción que ya se aplicó a `select` e `insert` (punto 171-172 de arriba). Por eso el `update` con el cliente autenticado normal falla por RLS, y en algún punto del código se intentó evitar el problema recurriendo a un cliente admin con `SUPABASE_SERVICE_ROLE_KEY` — que además de ser un parche (bypassea RLS por completo, no es la solución correcta para una acción rutinaria de un usuario autenticado), esa variable de entorno tampoco está configurada en este servidor, por eso el error puntual que se ve.
- **Corrige la causa real, no le agregues la variable de entorno como solución:** actualiza la política RLS de `update` en `tickets` (y en `ticket_revisiones`, si el código también actualiza esa fila al cerrar) para el rol supervisor, con la **misma condición** que ya tienen `select` e `insert`: `supervisor_id = (select id from personal where user_id = auth.uid()) OR estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')` (para `ticket_revisiones`, la condición equivalente vía el `estado` del ticket padre, igual que ya se pide en el punto 172 para su política de `insert`). Con esto, cualquier supervisor puede cerrar la revisión que él mismo está haciendo sobre un ticket ajeno "con observaciones", usando el cliente autenticado normal — sin necesitar ningún cliente admin ni el service role key para este flujo.
- **Si el código de "Finalizar revisión" quedó usando un cliente admin (`supabaseAdmin`/service role) para este paso, sácalo de ahí** una vez que la política de `update` esté corregida — no debe depender de esa key para una acción que un supervisor autenticado puede y debe poder hacer por sí mismo vía RLS. El service role key se reserva para lo que ya dice §9 (operaciones administrativas reales desde el servidor, como el flujo de invitación de usuarios o el script de seed), no para el flujo normal de cerrar una inspección.
- **Verifica en vivo:** repite la reproducción de §2.14 pero con dos supervisores reales (uno crea y finaliza el ticket original, el otro hace la re-inspección) y confirma que "Finalizar revisión" cierra sin error, sin necesidad de tener `SUPABASE_SERVICE_ROLE_KEY` configurada.

**Bug confirmado en producción — el supervisor que acaba de cerrar una re-inspección pierde el acceso a su propio informe (error real: "Solo se puede acceder a informes de tickets propios."):** se probó en vivo la corrección anterior — un supervisor tomó un ticket "con observaciones" de otro supervisor, hizo la re-inspección completa (checklist + firmas) y todos los ítems quedaron `conforme`, así que el ticket cerró en `finalizada_sin_observaciones`. Inmediatamente después, ese mismo supervisor (el que acaba de hacer todo el trabajo) entra al informe de ese ticket para enviarlo por correo/WhatsApp y la app le muestra "Solo se puede acceder a informes de tickets propios." — no lo deja.

- **Causa real:** la regla de visibilidad compartida (arriba en este mismo §2.6) da acceso a **cualquier** supervisor mientras el ticket esté `finalizada_con_observaciones` — pero en cuanto ese supervisor lo cierra y el ticket pasa a `finalizada_sin_observaciones` (estado terminal), esa condición deja de cumplirse **de inmediato**. Como el `supervisor_id` del ticket sigue siendo el del supervisor que lo creó originalmente (nunca se sobrescribe, según el punto 173 de arriba), el supervisor que acaba de cerrar la re-inspección ya no cumple ninguna de las dos condiciones (no es el `supervisor_id` original, y el ticket ya no está "con observaciones") — y tanto la política RLS como cualquier chequeo de autorización en el código de la página del informe (de ahí sale el mensaje "Solo se puede acceder a informes de tickets propios.", que no es un error de Postgres/RLS sino una validación propia de la aplicación) le niegan el acceso a algo que él mismo acaba de generar.
- **Corrige agregando una tercera condición, tanto en las políticas RLS (`select` en `tickets`, `ticket_revisiones`, `ticket_checklist_respuestas`) como en cualquier chequeo de autorización propio en el código de `/tickets/[id]` y `/tickets/[id]/report` (el que genera el mensaje "Solo se puede acceder a informes de tickets propios."):** además de "es el `supervisor_id` original del ticket" y "el ticket está `finalizada_con_observaciones`/`en_reparacion_de_observaciones`", agrega **"o existe al menos una fila en `ticket_revisiones` de este ticket donde `ticket_revisiones.supervisor_id` sea este supervisor"** — es decir, cualquier supervisor que haya participado en **alguna** revisión de ese ticket (haya sido la primera o una re-inspección posterior) conserva acceso permanente a verlo y a su informe, sin importar cuál sea el estado actual ni quién lo haya creado originalmente. Esto tiene sentido de negocio: quien hizo el trabajo de una revisión debe poder ver y enviar el resultado de lo que hizo, así el ticket ya haya quedado cerrado.
- Revisa en particular si "Solo se puede acceder a informes de tickets propios." sale de una validación **duplicada** en el código de la página del informe (aparte de la RLS) — si es así, actualiza esa validación con la misma condición de tres partes de arriba, no solo la política RLS, porque una validación de aplicación desactualizada puede seguir bloqueando aunque la RLS ya esté bien.
- **Verifica en vivo:** repite el mismo escenario (supervisor A crea un ticket con observaciones, supervisor B lo re-inspecciona y lo deja `finalizada_sin_observaciones`) y confirma que el supervisor B puede entrar a `/tickets/[id]` y a `/tickets/[id]/report` de ese ticket y enviarlo por correo/WhatsApp sin el error, incluso después de que el ticket ya quedó cerrado.

**Corrección — el botón de WhatsApp queda exclusivo del administrador, se renombra, y se saca del detalle del ticket:** hoy el botón "Notificar Vencimiento por WhatsApp" (el enlace manual `wa.me` de §3) aparece tanto en la tabla de "Mis inspecciones" del supervisor como en el detalle del ticket (`/tickets/[id]`), visible para ambos roles. Corrige así:

- **Renómbralo a "Notificar por WhatsApp"** (texto más corto) en todos los lugares donde aparezca — el nombre "Notificar Vencimiento por WhatsApp" queda descontinuado.
- **Se muestra únicamente en el dashboard de administrador** (como acción en la fila de cada ticket que esté "por vencer" o "vencido", igual que hoy), nunca en la tabla "Mis inspecciones" del supervisor.
- **Elimínalo por completo del detalle del ticket (`/tickets/[id]`)** — no debe aparecer ahí para ningún rol, ni administrador ni supervisor. Queda solo como acción de la tabla del dashboard de administrador.

**Nueva funcionalidad — botón para volver al listado desde el detalle del ticket, en el perfil de supervisor:** hoy, dentro de `/tickets/[id]`, un supervisor no tiene ninguna forma de volver a "Mis inspecciones" salvo el botón "atrás" del navegador. Agrega un botón/enlace con el texto **"Inspecciones"** (por ejemplo junto al título o en la cabecera de la página) que lo devuelva a la tabla de "Mis inspecciones".

**Corrección — reordenar y simplificar las columnas de la tabla de tickets, en las dos pantallas (dashboard de administrador y "Mis inspecciones" del supervisor):** es el mismo componente compartido de la tabla (§2.6, ya mencionado más arriba) — corrígelo una sola vez si es compartido, y verifica que el cambio se refleje en ambas pantallas. Esto ya se aplicó en una corrección anterior (Ver como primera columna, sin botón "Informe") — esta corrección ajusta ese resultado:

- **El botón "Ver" queda en la primera columna** (ya aplicado) — pero **quita el texto "Ver" del encabezado de esa columna** (el `<th>` va vacío o, por accesibilidad, con un texto oculto para lectores de pantalla tipo `sr-only`, pero visualmente sin título) — el botón individual de cada fila sí puede seguir diciendo "Ver".
- **Corrección — "Ver" debe llevar directo al informe, no al detalle del ticket:** hoy "Ver" navega a `/tickets/[id]` (detalle) — cámbialo para que navegue directo a `/tickets/[id]/report` (el informe, §4), en las dos tablas (dashboard de administrador y "Mis inspecciones" del supervisor). Como el informe pasa a ser la pantalla de entrada principal desde la tabla, ajusta esa página para que no se pierda nada de lo que solo estaba en el detalle del ticket:
  - Agrega ahí el botón **"Registrar re-inspección"** (cuando el ticket esté en `finalizada_con_observaciones`, §2.3), que hoy solo vive en `/tickets/[id]`.
  - Agrega ahí también el botón/enlace **"Inspecciones"** para volver al listado (el mismo que se agregó en el detalle del ticket para el perfil de supervisor, más arriba) — ahora es aún más necesario porque el informe es la primera pantalla a la que se llega desde la tabla.
  - Agrega un enlace secundario, por ejemplo "Ver historial completo" o "Ver detalle del ticket", que lleve a `/tickets/[id]` para quien necesite revisar el historial de **todas** las revisiones anteriores (no solo la más reciente) — esa ruta sigue existiendo, deja de ser el destino directo de "Ver", pero no la elimines.
- **El color del botón "Ver" queda muy claro y cuesta distinguirlo** — súbele un tono al azul: si hoy usa `brand-400`/`brand-500` (o el equivalente en el variant `outline`/`ghost` de shadcn con texto claro), pásalo a `brand-600` o `brand-700` para que el texto/borde se note con buen contraste sobre el fondo blanco de la tarjeta.
- ~~Segunda columna, reservada para el botón "Notificar por WhatsApp" (§3)~~ — **corrección posterior, este punto queda reemplazado por completo:** el botón/ícono de WhatsApp (el enlace manual `wa.me`) se **elimina por completo de la tabla de tickets**, en las dos pantallas (dashboard de administrador e "Inspecciones" del supervisor) — ya no debe aparecer para **ningún** ticket, sin importar su estado ni si está "por vencer"/"vencido". No lo dejes deshabilitado ni oculto condicionalmente: sácalo del todo del componente de la fila. Como esa columna existía solo para este botón, **elimina también la columna reservada** (no dejes un espacio/columna vacía) — la tabla queda con una columna menos. Esto también deja sin efecto la columna reservada del §3 (más abajo, donde se describe el botón "Notificar por WhatsApp" con el enlace `wa.me`): ese botón queda completamente descontinuado, no solo reubicado. **No afecta al aviso automático por WhatsApp de §3.1** (el envío vía Meta Cloud API cuando un ticket pasa a "naranjo") — ese es un proceso en segundo plano, no un botón en la tabla, y sigue funcionando igual. Tampoco afecta al botón "Enviar por WhatsApp" de la página del informe (§4.2, Web Share API) — es un botón distinto, en otra pantalla, que se mantiene sin cambios.
- **Elimina el botón "Informe" de la columna de acciones, en ambas tablas** (ya aplicado) — el acceso al informe sigue disponible entrando con "Ver" al detalle del ticket y usando ahí "Ver informe".
- **Corrección posterior — "Nro de Revisión" deja de ser una columna propia:** el punto anterior (mover "Nro de Revisión" a la última posición) queda reemplazado por una corrección más reciente en §2.7: esa columna se elimina y el número de revisión pasa a mostrarse pegado al "Nro" (Nro de Inspección), más chico y con `#` adelante, dentro de la misma celda — ver el detalle ahí. El resto de las columnas mantiene su orden actual (Nro, Camión/Rampla, Transporte, Estado, Vencimiento, Supervisor).

**Nueva funcionalidad — tarjeta "Finalizadas":** agrega una quinta tarjeta de resumen al dashboard de administrador, junto a las que ya existen (Inspecciones, Por vencer, Vencidos, En reparación), con el título **"Finalizadas"** y el conteo de tickets en estado `finalizada_sin_observaciones` — es decir, inspecciones que ya terminaron su proceso sin fallas pendientes, para diferenciarlas de las que siguen "En reparación" (`finalizada_con_observaciones`, corrección de abajo).

**Nueva funcionalidad — paginación y filtros en las tablas de tickets (dashboard de administrador y "Mis inspecciones" del supervisor):**

- **Paginación de 15 filas por página** en las dos tablas, con controles para pasar de página (anterior/siguiente y, si es sencillo de armar, números de página) debajo de la tabla.
- **Filtro por estado:** agrega un selector junto al título de la tabla (por ejemplo junto a "Inspecciones", al lado del selector de mes que ya existe en el dashboard de administrador) con las opciones "Todos los estados" (por defecto) + una por cada valor de `estado` que tenga sentido mostrar al usuario (En revisión, Finalizada con observaciones, Finalizada sin observaciones — usa los mismos textos de los badges de estado, §6). Aplica en las dos tablas.
- **Filtro por supervisor, solo en el dashboard de administrador:** agrega otro selector junto al de estado, con las opciones "Todos los supervisores" (por defecto) + un ítem por cada supervisor que tenga al menos un ticket (nombre completo, `nombre` + `apellido`). Al elegir uno, filtra la tabla a los tickets de ese `supervisor_id`. No aplica a "Mis inspecciones" del supervisor, porque esa tabla ya está filtrada a un solo supervisor (el que inició sesión).
- Estos filtros (mes, estado, supervisor) se combinan entre sí (AND, no OR) y con la paginación — al cambiar cualquier filtro, vuelve a la página 1 de los resultados filtrados.

**Corrección — la tarjeta "En reparación" del dashboard de administrador siempre muestra 0, hay que corregir qué cuenta:** desde que se eliminó el paso manual "Iniciar reparación" (§2.3), ningún ticket nuevo llega a tener el estado `en_reparacion_de_observaciones` — por eso la tarjeta "En reparación", si sigue contando exactamente ese valor de `estado`, se queda en 0 para siempre aunque haya tickets con fallas pendientes. Corrige la tarjeta para que cuente los tickets en estado **`finalizada_con_observaciones`** (que es, en la práctica, el estado "con fallas pendientes de corregir" desde que se simplificó el flujo) — súmale también los que por datos antiguos sigan en el legado `en_reparacion_de_observaciones`, para no perder esos del conteo. En SQL: `estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')`.

**Nueva funcionalidad — filtro por mes en el dashboard de administrador:** agrega un selector de mes arriba de la tabla de tickets, **solo en el dashboard de administrador** (no en "Mis inspecciones" del supervisor). Opciones: "Todos los meses" (por defecto, sin filtrar, igual que hoy) + un mes por cada mes calendario que tenga al menos un ticket, ordenados del más reciente al más antiguo y mostrados en español (por ejemplo "Agosto 2026"). Al elegir un mes, filtra la tabla para mostrar solo los tickets cuyo `tickets.created_at` (la fecha en que se creó el ticket — no `fecha_vencimiento` ni la `fecha` de inspección de §1) caiga dentro de ese mes calendario.

**Corrección — renombrar "Tickets" a "Inspecciones" en el dashboard de administrador:** en todos los textos de interfaz donde hoy dice "Tickets" en esa pantalla — la tarjeta de resumen (hoy "Tickets" con el conteo total → "Inspecciones") y el título de la sección de la tabla (hoy "Tickets" → "Inspecciones"; el subtítulo "Todos los tickets de inspección y alertas de vencimiento." puede ajustarse a algo como "Todas las inspecciones y alertas de vencimiento." para que quede consistente). Es solo texto visible para el usuario — no renombres las tablas ni columnas de la base de datos (`tickets`, `ticket_id`, etc. quedan igual, son nombres internos del esquema).

### 2.7 Formulario "Nueva inspección": obligatoriedad, ubicación del vencimiento y textos

**Esto es un ajuste sobre lo ya construido** (el formulario actual deja campos opcionales, ubica el vencimiento junto a la carga de fotos, y usa textos en voseo argentino que no corresponden al español de Chile) — corrige así:

- **Todos los campos de "Datos de Inspección" son obligatorios**, sin excepción: los siete de §1 (`transporte`, `conductor`, `fecha`, `procedencia`, `tipo_camion`, `patente_camion`, `patente_rampla`) más el nuevo `fecha_vencimiento` de este punto. Esto es validación de cliente real — el botón para avanzar al checklist debe quedar deshabilitado (o mostrar los errores correspondientes) mientras falte cualquiera de estos campos, no solo confiar en el `not null` de la base de datos.
- **Ubicación de `fecha_vencimiento`:** este campo (ver §2.4 y §3 — ya no se pide por ítem, es un solo campo por revisión) va **dentro de la sección de cabecera del formulario ("Datos de Inspección"), junto al resto de los campos de §1** — no al costado de la carga de fotos ni de ningún ítem del checklist, que es donde está hoy.
- **Valor por defecto:** al completarse/cambiar la `fecha` de inspección, precarga `fecha_vencimiento` automáticamente como `fecha + 10 días`. El campo queda **editable** — el valor precargado es solo un punto de partida cómodo, el supervisor puede cambiarlo a cualquier otra fecha antes de guardar. Si el supervisor ya había modificado `fecha_vencimiento` a mano y luego cambia `fecha`, no pises ese valor editado manualmente (recalcula el default solo mientras el campo de vencimiento siga en su valor precargado, o bien recalcúlalo siempre y acepta que es un detalle menor de UX — a criterio de la implementación, pero el campo debe seguir siendo editable en cualquier caso).
- **Cambios de texto (corrige cada instancia donde aparezca en la app, no solo en la pantalla principal del formulario):**

  | Texto actual | Texto nuevo |
  |---|---|
  | "Continuar" (botón para pasar de la cabecera al checklist) | "Realizar revisión" |
  | "Checklist de 18 elementos" (título de sección) | "Elementos a Fiscalizar" |
  | "Datos de cabecera" (título de sección) | "Datos de Inspección" |
  | "Completá" (y cualquier otra conjugación en voseo argentino) | "Completar" (o la forma neutra/chilena equivalente — este proyecto no usa voseo en ningún texto de interfaz) |
  | "Completá la cabecera, luego el checklist de 18 elementos y las firmas." | "Completar los datos de inspección, luego realizar el checklist de los elementos a fiscalizar y firmar." |

  Revisa todos los componentes del formulario (`/tickets/new`) y cualquier texto compartido (mensajes de ayuda, `placeholder`, `aria-label`) por si el voseo o los nombres antiguos de sección aparecen en más de un lugar.

**Migración para bases de datos ya desplegadas** (si este entorno ya tiene la tabla `ticket_revisiones`/`ticket_checklist_respuestas` de una construcción anterior — mismo caso que las migraciones de `nro_revision_global` y `conductor` en §2.6):

```sql
alter table ticket_revisiones
  add column if not exists fecha_vencimiento timestamptz;

alter table ticket_checklist_respuestas
  drop constraint if exists foto_y_vencimiento_obligatorios_si_no_conforme;

alter table ticket_checklist_respuestas
  drop column if exists fecha_vencimiento_item;

alter table ticket_checklist_respuestas
  add constraint foto_obligatoria_si_no_conforme check (
    estado <> 'no_conforme' or foto_url is not null
  );
```

Si `ticket_checklist_respuestas` no tenía la columna `fecha_vencimiento_item` (por ejemplo, en una instalación nueva que ya parte del esquema de §7), el `drop column if exists` no hace nada — es seguro correrlo igual.

### 2.8 Persistencia inmediata de firmas, fotos y respuestas del checklist (no deben perderse al navegar entre pasos ni si falla "Finalizar revisión")

**Esto es un bug a corregir, no una mejora opcional — sigue sin corregirse, verifícalo de verdad esta vez, no solo leas el código y asumas que ya está bien:** hoy, si el supervisor firma o sube la foto de un ítem `no_conforme` durante el checklist, y luego usa el botón para volver a la sección de cabecera ("Datos de Inspección"), al presionar de nuevo "Realizar revisión" para volver al checklist/firmas, esas firmas (y esas fotos) **desaparecieron** — se pierde el trabajo ya hecho y el supervisor tiene que firmar de nuevo. Corrige así:

- **Firmas (§2.5):** en cuanto el conductor o el fiscalizador terminan de firmar en el `SignaturePad`, exporta el trazo a PNG y **súbelo a Supabase Storage al instante** — no esperes al botón final "Finalizar revisión" para subirla. Guarda la URL resultante de inmediato (en el estado del formulario y/o directamente en el registro de `ticket_revisiones` si el flujo ya crea esa fila antes de completar todos los pasos), de forma que sobreviva a la navegación entre pasos del wizard. Si el supervisor vuelve a la cabecera y regresa después a la pantalla de firmas, el pad debe mostrar la firma ya guardada (o al menos no obligar a firmar de nuevo desde cero) — nunca aparecer vacío habiendo firmado antes.
- **Fotos (§2.4):** mismo criterio — la foto de un ítem `no_conforme` se sube al bucket `fallas` **apenas se selecciona o se toma**, no al guardar el checklist completo ni al finalizar la revisión. La `foto_url` de ese ítem se guarda de inmediato y debe sobrevivir a la navegación entre pasos, igual que las firmas.
- **Causa raíz probable, revísala:** el wizard "Datos de Inspección → Elementos a Fiscalizar → Firmas" parece resetear o desmontar el estado de los pasos ya completados al navegar hacia atrás, en vez de mantener un único estado de formulario compartido entre los tres pasos durante toda la sesión de creación/edición del ticket. Subir cada firma/foto a Storage apenas se captura (como se pide arriba) es la corrección robusta, porque deja de depender de que el estado sobreviva en memoria — pero además revisa que el wizard no esté desmontando por completo los componentes de los pasos ya visitados.
- **Reproducción exacta reportada (síguela paso a paso para confirmar que quedó resuelto):** 1) crear una inspección nueva, completar "Datos de Inspección" y avanzar; 2) en el checklist/firmas, firmar (conductor y/o fiscalizador); 3) presionar el botón para volver a "Datos de Inspección"; 4) presionar de nuevo "Realizar revisión" para volver al checklist. **Criterio de aceptación:** las firmas ingresadas en el paso 2 deben seguir presentes y visibles al llegar al paso 4 — si el pad de firma aparece vacío, el bug sigue presente y no está resuelto.
- **Bug relacionado, encontrado en pruebas — las respuestas del checklist también se pierden si falla "Finalizar revisión":** se reprodujo así: se completó el checklist entero (18 ítems) y ambas firmas, pero al presionar "Finalizar revisión" el navegador tenía una página desactualizada (error transitorio de Next.js, "Server Action ... was not found on the server" — típico de un reinicio del servidor de desarrollo mientras la página estaba abierta) y el envío nunca llegó al servidor. Resultado: el ticket quedó creado (con sus datos de cabecera, eso sí se había guardado antes, §2.6) pero **atascado en `EN_REVISION`, sin ninguna respuesta del checklist guardada** — todo el trabajo de marcar los 18 ítems se perdió, aunque las firmas en teoría ya deberían haberse subido de inmediato por el punto anterior. Corrige esto con el mismo criterio que firmas y fotos: **cada respuesta de un ítem del checklist (`estado`, y `observacion`/`foto_url` cuando aplique) se guarda en `ticket_checklist_respuestas` apenas el supervisor la marca**, no todas juntas recién al presionar "Finalizar revisión". Así, "Finalizar revisión" pasa a ser solo el paso que **cierra** la revisión (calcula el estado resultante según §2.3 y actualiza `tickets.estado`) sobre datos que ya están guardados — no el único momento en que se guarda todo, para que una falla ahí (de red, de sesión, o como este error de Next.js) no borre el trabajo completo de una inspección.

**Selección de fotos: solo formatos de imagen fotográfica, con opción de cámara y de rehacer:**

- El input de carga de foto solo debe aceptar formatos de imagen fotográfica: `image/jpeg`, `image/png`, `image/webp` (suma `image/heic`/`image/heif` si hay supervisores en iOS que suban ese formato) — cualquier otro tipo de archivo (PDF, video, etc.) se rechaza, tanto en el `accept` del input como validando el `type` real del archivo antes de subirlo.
- Debe permitir **dos orígenes**: elegir un archivo existente de la galería/disco, o **tomar la foto directamente con la cámara del dispositivo** en el momento — por ejemplo con `<input type="file" accept="image/*" capture="environment">` (abre la cámara trasera en móviles) o un componente de captura propio vía `getUserMedia` si se necesita más control sobre el flujo; cualquiera de los dos cumple el requisito.
- Al tomar o seleccionar la foto, se **guarda al instante** (sube a Storage de inmediato, como arriba) y se muestra una vista previa en la fila del ítem.
- Sobre esa vista previa, agrega la **opción de borrar la foto y volver a tomarla/seleccionarla** (ícono de papelera o botón "Eliminar" junto a la miniatura): al borrar, limpia también `foto_url` de ese ítem en el estado/BD y vuelve a habilitar el input/la cámara para capturar una nueva. Esto no reemplaza el lightbox de fotos ya guardadas en `/tickets/[id]` (§2.4) — es solo para el momento de captura, dentro del formulario de la revisión.

### 2.9 Bug: la inspección no se guarda ni aparece en "Mis inspecciones"

**Síntoma reportado:** al completar una nueva inspección (cabecera, checklist y firmas) y guardar, el ticket no queda guardado, o queda guardado pero no aparece en el listado "Mis inspecciones" del supervisor que la creó. Esto es un bug bloqueante — sin esto la app no cumple su función básica — investiga y corrige la causa real, no un síntoma parcial. Revisa en orden:

1. **Políticas RLS de escritura:** §2.6 ajustó las políticas RLS de `select` para que el supervisor solo vea sus propios tickets, pero no toda política de lectura implica que exista una de **`insert`** equivalente para ese mismo rol. Confirma que `tickets`, `ticket_revisiones` y `ticket_checklist_respuestas` tengan una política `insert` que permita al rol supervisor crear filas (típicamente `with check (supervisor_id = (select id from personal where user_id = auth.uid()))` en `tickets`, y una condición análoga en las tablas hijas vía `ticket_id`). Si falta, el insert falla del lado de Supabase — Postgres/PostgREST devuelve un error, confirma que ese error se esté propagando hasta la UI y no quedando silenciado en un `catch` vacío.
2. **`supervisor_id` al crear el ticket:** confirma que el insert de `tickets` esté guardando `supervisor_id = id de personal del usuario autenticado` (vía `auth.uid()` → `personal.user_id`), no `auth.uid()` directamente (son valores distintos: uno es el id de Supabase Auth, el otro el id de la fila en `personal`) ni un valor nulo. Si `supervisor_id` queda mal seteado o nulo, el ticket puede haberse guardado igual pero la consulta de "Mis inspecciones" (filtrada por `supervisor_id`, §2.6) nunca lo va a traer.
3. **Manejo de errores visible:** si el guardado falla por cualquier motivo (RLS, validación, red), el formulario debe mostrarle un error claro al supervisor — nunca comportarse como si se hubiera guardado con éxito cuando no fue así.
4. **Orden de escritura del guardado completo:** confirma el orden real: se crea primero la fila en `tickets`, luego la primera fila en `ticket_revisiones` (revisión #1, con las firmas y `fecha_vencimiento` de §2.7-2.8 ya subidas), y luego las filas de `ticket_checklist_respuestas`. Si algún paso falla a mitad de camino, no debe quedar un ticket "fantasma" a medio guardar sin que el supervisor se entere.
5. **Verificación manual:** crea una inspección de prueba como supervisor, confirma directamente en la tabla `tickets` de Supabase que la fila existe con el `supervisor_id` correcto, y confirma que aparece de inmediato en "Mis inspecciones" sin necesidad de recargar la página.

### 2.10 Panel de administración de usuarios ("Usuarios")

**Nueva funcionalidad, exclusiva del rol Administrador:** agrega un link "Usuarios" al nav, visible solo para `administrador` (mismo patrón de control de acceso real de §2.6 — ruta y RLS, no solo ocultar el link), con una pantalla para ver y agregar supervisores y administradores.

- **Corrección de seguridad relacionada, hay que resolverla junto con esto:** hoy el registro público (correo/contraseña) deja **elegir el rol libremente** en un selector — eso significa que cualquier persona que llegue a la pantalla de registro podría crearse una cuenta como "administrador" sin que nadie se lo autorice. **Elimina ese selector de rol del registro público.** De ahora en adelante, la única forma de obtener una cuenta nueva en el sistema es que un administrador la cree desde este panel — nadie se auto-asigna un rol.
- **Tabla "Usuarios":** lista todo `personal` — Nombre, Apellido, Correo, Teléfono, Fecha de nacimiento, Rol (badge Supervisor/Administrador), Estado (Activo / Inactivo / "Invitación pendiente" si aún no ha iniciado sesión nunca), y Acciones (editar, activar/desactivar, reenviar invitación si sigue pendiente). "Editar" abre el mismo formulario que "Agregar usuario" (ver abajo) precargado con los datos actuales, para poder corregir cualquier campo — incluido completar el Apellido o la Fecha de nacimiento de usuarios ya creados que todavía no los tengan.
- **Botón "Agregar usuario"** abre un formulario con estos campos, para los dos roles que puede crear un administrador (Supervisor y Administrador): **Nombre** (obligatorio), **Apellido** (obligatorio — ver §4.1, se usa en la firma del correo/informe), **Correo** (obligatorio), **Teléfono** (obligatorio cuando el Rol elegido es Supervisor — lo usa el WhatsApp automático de §3.1 y el botón manual de §3, no puede quedar vacío para un supervisor; opcional para Administrador), **Fecha de nacimiento** (obligatorio, selector de fecha) y **Rol** (Supervisor / Administrador). Al guardar:
  1. Crea la fila en `personal` con esos datos, `activo = true` y **`user_id` en `null`** (queda "pendiente" hasta que esa persona inicie sesión por primera vez).
  2. Desde una Server Action (nunca desde el cliente), usando el cliente de Supabase con `SUPABASE_SERVICE_ROLE_KEY` (server-only, mismo tratamiento de secreto que el resto — §9), llama a `supabaseAdmin.auth.admin.inviteUserByEmail(correo, { data: { nombre, rol } })`. Supabase le manda un correo de invitación a esa persona; al hacer clic define su propia contraseña y ya puede entrar. Como alternativa, esa misma persona también puede entrar directo con "Iniciar sesión con Google" usando ese mismo correo, sin depender del correo de invitación — cualquiera de las dos vías debe funcionar.
- **Ajusta el trigger `handle_new_user`** (ya existente, ver §8) para que, en vez de crear siempre una fila nueva en `personal` con un rol elegido por quien se registra: busque primero una fila en `personal` con ese mismo correo y `user_id` nulo (una invitación pendiente creada desde este panel) — si la encuentra, vincula ahí el `user_id` recién creado (adopta el rol y nombre que el administrador ya definió, no crea una fila duplicada). **Si no encuentra ninguna fila pendiente con ese correo, rechaza el acceso** — no crees una fila nueva con un rol por defecto; muestra un mensaje claro como "Tu cuenta no está autorizada. Contacta a un administrador de Cordillera M&P." Esto aplica tanto al flujo de invitación por correo como al de "Iniciar sesión con Google".
- **Desactivar un usuario** (botón en la tabla, pone `personal.activo = false`) debe bloquear su acceso real a la app, no solo dejar de mostrarlo en listados — agrega la verificación de `activo = true` en las políticas RLS relevantes (o en el middleware de sesión) para que una cuenta desactivada no pueda seguir usando el sistema aunque su sesión de Supabase Auth siga técnicamente vigente.
- **Nota sobre el correo de invitación:** el correo de invitación de Supabase Auth es un sistema aparte del envío de informes por Gmail (§4.1) — Supabase lo manda con su propio servicio de correo, que en el plan gratuito tiene un límite bajo de envíos por hora. Si al agregar varios usuarios seguidos las invitaciones no llegan, configura un SMTP propio para Supabase Auth en el panel de Supabase (Authentication → Settings → SMTP Settings) — puedes reutilizar la misma casilla y contraseña de aplicación de Gmail que ya configuramos en §4.1 para esto.

```sql
-- Si `personal.user_id` no existe aún en este entorno (ya debería existir, lo usan
-- las políticas RLS de §2.6 vía "user_id = auth.uid()"; agrégalo solo si falta):
alter table personal
  add column if not exists user_id uuid unique references auth.users(id);
```

**Nuevo campo — Fecha de nacimiento:**

```sql
alter table personal
  add column if not exists fecha_nacimiento date;
```

No la agregues `not null` a nivel de base (hay usuarios existentes sin este dato) — igual que `apellido` (§4.1), es obligatoria a nivel de formulario en "Agregar usuario"/"Editar" de este panel, no a nivel de columna.

(Súmalo, junto con `fecha_nacimiento`, también al DDL base de `personal` en §7 si no está — misma nota de reconciliación de §7.)

### 2.11 Página "Dashboard" de analítica (gráficos y estadísticas), separada del listado de inspecciones

**Nueva funcionalidad — reestructura la navegación de administrador en dos páginas distintas, no una sola:** hoy el link "Dashboard" del nav lleva a la única pantalla de administrador que existe (tarjetas de resumen + tabla de inspecciones, la que este documento ya describió en §2.6). Divide eso en dos:

- **La pantalla que ya existe** (tarjetas de resumen + tabla "Inspecciones" con sus filtros y paginación, §2.6) pasa a ser la página de inicio del administrador — puedes dejarla en la misma ruta `/dashboard` que ya tiene, sin romper nada de lo ya construido.
- **"Dashboard" en el nav pasa a apuntar a una página nueva**, dedicada a analítica y gráficos — por ejemplo `/dashboard/analitica` o `/analytics` (a criterio de la implementación). Agrega un segundo link al nav para no perder el acceso a la pantalla de arriba, por ejemplo "Inspecciones", que sigue llevando a `/dashboard`.

**Contenido de la página nueva "Dashboard" (analítica):**

- **Las mismas tarjetas de resumen que ya existen** (Inspecciones, Por vencer, Vencidos, En reparación, Finalizadas — §2.6), con los mismos totales.
- **Desglose de totales — solo inspecciones finalizadas, separadas por resultado:** una tabla o fila de tarjetas chicas con el conteo exacto de cada uno de estos dos valores de `tickets.estado` — `finalizada_con_observaciones` y `finalizada_sin_observaciones` (y `en_reparacion_de_observaciones` sumado dentro de "con observaciones" si hay tickets legado en ese estado, §2.3) — es decir, el total de inspecciones ya finalizadas, partido entre las que terminaron con observaciones y las que terminaron sin observaciones.
  - **`en_revision` NO va en este desglose** — corrección explícita: este widget es específicamente sobre inspecciones ya *finalizadas* y cómo terminaron, no sobre el estado actual de todos los tickets. Los tickets en `en_revision` (aún abiertos, no finalizados) quedan fuera de esta tarjeta/tabla — ya están representados en la tarjeta de resumen "Inspecciones" de más arriba, no hace falta repetirlos acá.
- **Gráfico de barras — cantidad de inspecciones por mes:** eje X los últimos 12 meses (o todos los meses con datos, lo que sea más corto), eje Y la cantidad de tickets creados ese mes (`tickets.created_at`, mismo criterio que el filtro de mes de §2.6).
- **Gráfico de dona — cantidad de inspecciones por supervisor:** un selector de mes propio de este gráfico (mismas opciones que el filtro de mes de §2.6: "Todos los meses" + cada mes con datos; por defecto puede ser el mes actual). Cada porción de la dona es un supervisor, su tamaño proporcional a la cantidad de inspecciones que ese supervisor creó (`supervisor_id` del ticket) durante el mes seleccionado (o en total, si el selector está en "Todos los meses").
- **Gráfico — inspecciones con observaciones por mes:** de barras o de línea (a criterio de la implementación, lo que se vea más claro), eje X los mismos meses que el primer gráfico. **Corrección/aclaración explícita, porque es fácil implementarlo mal:** el eje Y **no** es "tickets cuyo estado actual (`tickets.estado`) es `finalizada_con_observaciones` hoy" — es la cantidad de **revisiones** que en ese mes **resultaron** en `finalizada_con_observaciones`, hayan quedado resueltas después o no. Es decir, cuenta si esa inspección **tuvo alguna observación en algún momento**, no si sigue "con observaciones" en este momento. Usa la columna `ticket_revisiones.estado_resultante` (§7) — que guarda el resultado de esa revisión puntual — filtrando `estado_resultante = 'finalizada_con_observaciones'` y agrupando por el mes de `ticket_revisiones.created_at` (la fecha de esa revisión, no la del ticket). Si un ticket tuvo una revisión "con observaciones" en marzo y se resolvió en abril, ese ticket debe sumar en la barra/punto de **marzo** igual, aunque hoy (`tickets.estado`) ya esté `finalizada_sin_observaciones`. Si un mismo ticket tiene dos revisiones "con observaciones" distintas en el mismo mes, cuenta esa combinación como corresponda a nivel de fila (revisión), no colapses a "1 por ticket por mes" salvo que se vea raro visualmente — a criterio de la implementación, pero la regla de fondo (revisión histórica, no estado actual) es la que no puede fallar.
  - **Corrección — esta explicación es para quien programa, no es texto de la pantalla:** si quedó renderizado en la interfaz un texto tipo "Tickets que en ese mes tuvieron una revisión que quedó 'finalizada con observaciones', aunque hoy ya estén resueltos." (como subtítulo, descripción o tooltip fijo debajo/encima del gráfico), **elimínalo de la pantalla**. El gráfico debe llevar solo un título corto (por ejemplo "Inspecciones con observaciones por mes"), sin ese párrafo explicativo visible para el usuario final — la aclaración de arriba sobre `estado_resultante` es una instrucción de implementación (cómo calcular los datos), no un texto que deba mostrarse en el dashboard.
- **Tabla — estadísticas por supervisor:** una fila por cada supervisor con al menos un ticket, columnas: Supervisor (nombre + apellido), Total de inspecciones realizadas, e Inspecciones con observaciones (conteo de las que pasaron por `finalizada_con_observaciones` en algún momento, mismo criterio que el gráfico anterior). Ordena por total de inspecciones, de mayor a menor.
- **Librería de gráficos:** usa [Recharts](https://recharts.org) (`npm install recharts`) — es la librería de gráficos más estándar para React/Next.js, se integra bien con Tailwind y con los tokens de color de §6 (usa `brand`, `success`, `warning`, `alert` para los gráficos, manteniendo la misma paleta del resto de la app en vez de los colores por defecto de la librería).
- Esta página, como el resto del dashboard de administrador, queda con control de acceso real (ruta + RLS) exclusivo del rol `administrador` — mismo patrón de §2.6.

### 2.12 Correcciones de texto visible: nombres de los estados y título de la página del supervisor

**Corrección — nombres visibles de los estados de una inspección (no se tocan los valores del enum en la base de datos):**

- Donde hoy se muestra el texto **"Finalizada con observaciones"** (badges de estado en las tablas de tickets, en el detalle del ticket, en el informe, en el filtro "Estado" del listado, en el desglose por estado y la tabla por supervisor de la página de analítica §2.11, en cualquier tooltip o texto de ayuda) → cambia el texto visible a **"Con observaciones"**.
- Donde hoy se muestra **"Finalizada sin observaciones"** → cambia el texto visible a **"Finalizado"**.
- El estado `en_revision` sigue mostrándose igual, como **"En revisión"** — no cambia.
- Esto es **solo el texto que ve el usuario**. Los valores reales de la columna `tickets.estado` en la base de datos (`finalizada_con_observaciones`, `finalizada_sin_observaciones`) **no cambian** — toda la lógica de negocio, las políticas RLS, los filtros por `estado` en la URL/query, y el resto de este documento siguen refiriéndose a esos mismos valores de enum; solo cambia el label que se le muestra a la persona en pantalla.
- Si no existe ya, centraliza esto en un único helper/mapa (por ejemplo `estadoLabel(estado)`) en vez de tener el string de cada estado repetido y hardcodeado en cada componente — así un cambio de texto como este no vuelve a requerir tocar diez archivos distintos.
- Revisa en particular todos los lugares donde este documento quedó escrito con el texto viejo ("Finalizada con observaciones"/"Finalizada sin observaciones"): son referencias al texto que se debía mostrar en ese momento, ya desactualizadas por esta corrección — aplica el nuevo texto ahí también.

**Corrección — título de la página de inicio del supervisor:** cambia el encabezado **"Mis inspecciones"** por **"Inspecciones"** (el subtítulo "Tus inspecciones y alertas de vencimiento." se mantiene igual, no hace falta tocarlo) — mismo criterio de simplificar el texto que ya se aplicó en el dashboard de administrador (§2.6, "Tickets" → "Inspecciones").

### 2.13 Bug: el "Nro de Inspección" no aparece de inmediato al crear el ticket

**Síntoma reportado:** en el formulario de "Nueva inspección", el campo "Nro de Inspección" muestra el placeholder "Se asigna al presionar 'Realizar revisión'" — eso es correcto mientras el ticket todavía no existe. El problema es que, **después** de presionar "Realizar revisión" y quedar creado el ticket (con su `numero_inspeccion` ya asignado por la secuencia `identity` de la base de datos, §2.6), ese número no queda visible en ningún lado de inmediato — recién se puede ver más tarde, al volver al listado o entrar al detalle del ticket.

**Corrige esto:** apenas se crea el ticket, muestra su `numero_inspeccion` en la pantalla siguiente del wizard (checklist/firmas, "Elementos a Fiscalizar") — por ejemplo como parte del título o subtítulo de esa pantalla ("Inspección Nro X") — igual que ya se muestra en el detalle del ticket. No hace falta esperar a que termine toda la revisión para poder verlo.

### 2.14 Bug confirmado: "Registrar re-inspección" no lleva al checklist de la nueva revisión — queda atascada e imposible de completar

**Síntoma reportado, reproducido con datos reales:** al presionar "Registrar re-inspección" sobre un ticket en `finalizada_con_observaciones` (§2.6), el supervisor esperaría llegar a una pantalla de checklist/firmas para la nueva revisión ("Revisión #2"), igual que el flujo de una inspección nueva (§2.4, §2.5, §2.7). En cambio:

1. El flujo **salta directo** al detalle del ticket (`/tickets/[id]`), mostrando la nueva revisión ("Revisión #2") ya en estado `en_revision`, con un aviso amarillo "Inspección sin finalizar: El checklist y las firmas de esta revisión ya están guardados, pero el cierre no se completó. Se puede finalizar ahora sin rehacer nada." y un botón "Finalizar revisión pendiente" — **sin que el supervisor haya llegado nunca a ver ni completar el checklist ni las firmas de esa revisión.**
2. Al presionar "Finalizar revisión pendiente" aparece el error "Faltan las firmas del conductor y/o del fiscalizador" — cierto (nunca se capturaron), pero **la pantalla donde se deberían haber capturado nunca se mostró.** Resultado: queda una fila de `ticket_revisiones` (Revisión #2) creada, sin checklist ni firmas, y no hay ninguna forma de completarla desde la interfaz — el ticket queda atascado.

**Causa raíz probable, revísala:** el botón "Registrar re-inspección" (§2.6) parece estar creando la fila de `ticket_revisiones` de la nueva revisión (o marcando el ticket como `en_revision`) y redirigiendo directo al detalle del ticket, en vez de llevar al supervisor por el mismo wizard de captura ("Elementos a Fiscalizar" → firmas) que ya existe para la revisión #1. El aviso "Inspección sin finalizar / se puede finalizar ahora sin rehacer nada" — pensado para el caso real de §2.8, cuando el supervisor ya guardó checklist y firmas pero no llegó a presionar "Finalizar revisión" por un corte de sesión o de red — se está mostrando también, incorrectamente, para una revisión que **nunca pasó por el checklist**, dando a entender que ya hay datos guardados cuando no los hay.

**Corrige así:**

- "Registrar re-inspección" debe llevar al supervisor al mismo formulario de checklist + firmas que usa una inspección nueva (§2.4, §2.5), precargado con los datos de cabecera del ticket (transporte, patentes, etc. — no hace falta volver a pedirlos, ya existen en `tickets`) y permitiendo confirmar o cambiar el `conductor` de esta revisión (§2.6, ya contempla esto). Recién al completar los 18 ítems y ambas firmas, y presionar "Finalizar revisión", se cierra esa revisión según §2.3.
- El banner "Inspección sin finalizar / Finalizar revisión pendiente" debe seguir existiendo, pero **solo para el caso real que motivó §2.8**: una revisión que ya tiene respuestas de checklist guardadas en `ticket_checklist_respuestas` (o al menos alguna firma ya subida), pero que no llegó a cerrarse. Agrega esa condición explícita: si una revisión en `en_revision` **no tiene ningún dato guardado todavía**, el supervisor debe caer directo en el formulario de checklist/firmas vacío, nunca en ese banner.
- **Reproducción para verificar que quedó resuelto:** 1) tomar un ticket en `finalizada_con_observaciones`; 2) presionar "Registrar re-inspección"; 3) confirmar que se llega a una pantalla de checklist (18 ítems) vacía, lista para completar — no al detalle del ticket con el banner amarillo; 4) completar el checklist y ambas firmas; 5) presionar "Finalizar revisión" y confirmar que la revisión se cierra según el resultado correspondiente (§2.3), sin el error de firmas faltantes.

---

## 3. Fecha de vencimiento y alertas automáticas

- **Ajuste sobre lo ya construido:** la fecha de vencimiento dejó de pedirse por ítem — ahora es **un solo campo por revisión** (`ticket_revisiones.fecha_vencimiento`), visible en la sección de cabecera del formulario ("Datos de Inspección"), no junto a la foto de cada ítem no conforme. Ver detalle de la ubicación, el valor por defecto y la obligatoriedad en §2.7. El ticket sigue exponiendo una `fecha_vencimiento` efectiva para el dashboard: ahora es simplemente la de su revisión más reciente (ya no hace falta calcular un mínimo entre ítems).
- **Cálculo de horas restantes:** `horas_restantes = (fecha_vencimiento - now()) en horas`, recalculado en cada carga del dashboard (no se persiste, se calcula al vuelo en el cliente o vía vista SQL).
- **Estado derivado por ticket** (no persistido, se recalcula en cada render — mismo patrón que ya estaba prototipado en este repo antes de este blueprint):

  ```ts
  type EstadoVencimiento = "vigente" | "por_vencer" | "vencido";

  interface TicketConVencimiento {
    ticketId: string;
    fechaVencimiento: Date;
    estadoVencimiento: EstadoVencimiento; // derivado de fechaVencimiento vs. now()
    horasRestantes: number;
  }
  ```

  La ventana de alerta ("por vencer") se parametriza como constante/env var (no hardcodeada dispersa en el código) con dos umbrales: `<= 48h` (color `warning`) y `<= 24h` (color `alert`), sobre el mismo ticket con estado distinto de `finalizada_sin_observaciones`.
- **Resaltado visual:** en el dashboard de administrador, cualquier ticket con `horas_restantes <= 48` y estado distinto de `FINALIZADA_SIN_OBSERVACIONES` se resalta con fondo `warning-100`/texto `warning-700` si `horas_restantes` está entre 24 y 48, o fondo `alert-100`/texto `alert-700` si `horas_restantes <= 24` (tokens de color definidos en §6).
- **Corrección — formato del texto de la columna "Vencimiento" en las tablas de tickets (dashboard de administrador y "Inspecciones" del supervisor):** hoy esa columna combina días y horas en el mismo texto (por ejemplo "9 días 23 h restantes", "vencido hace 1 día 7 h") en todos los casos. Corrige a estos tres formatos, según corresponda:
  - **Si `horas_restantes > 48` (todavía no entra a la ventana de alerta, estado "vigente"):** no muestres cuenta regresiva — muestra directamente **la fecha de vencimiento** (`fecha_vencimiento`), por ejemplo "31-08-2026" o "31-08-2026, 15:39" (mismo formato de fecha que ya se usa en el resto de la app, §2.6/§7).
  - **Si `horas_restantes <= 48` y el ticket todavía no está vencido ("por vencer", zonas ámbar/naranja):** muestra la cuenta regresiva **solo en horas**, sin desglosar en días — por ejemplo "37 h restantes", nunca "1 día 13 h restantes".
  - **Si ya está vencido:** sigue mostrando "vencido hace...", pero **solo en días**, sin horas — por ejemplo "vencido hace 5 días", nunca "vencido hace 5 días 3 h". Si el vencimiento fue hace menos de un día completo, muestra "vencido hace menos de 1 día" (o "vencido hoy", a criterio de la implementación) en vez de mostrar horas.
  - Esto es solo el formato de texto de esta columna — el cálculo de `horas_restantes` y los umbrales de color (48h/24h, punto anterior) no cambian.
- ~~Botón "Notificar por WhatsApp"~~ — **descontinuado por completo, ver la corrección posterior en §2.6:** este botón (el enlace manual `wa.me`, descrito abajo) ya no se renderiza en ninguna tabla ni pantalla — se elimina, no solo se reubica. Se deja la descripción original solo como referencia histórica de cómo se construía el enlace, por si hiciera falta más adelante:

  <details><summary>(descontinuado) especificación original del botón manual</summary>

  Antes: solo se renderizaba/habilitaba cuando el ticket estaba en estado "por vencer" o "vencido", y solo en la tabla del dashboard de administrador — no en "Mis inspecciones" del supervisor ni en el detalle del ticket (§2.6). Abría un **deep link nativo de WhatsApp** (`target="_blank"`, `rel="noopener noreferrer"`) construido así:

  ```ts
  const mensaje = construirMensajeVencimiento({
    ticketId,
    patenteCamion,
    patenteRampla,
    fallas,        // lista de ítems no conformes + observación
    tiempoRestante,
  });
  const href = `https://wa.me/${supervisor.telefono}?text=${encodeURIComponent(mensaje)}`;
  ```

  `supervisor.telefono` sale de la tabla `personal`, en formato internacional solo con dígitos (sin `+` ni espacios). La plantilla de `construirMensajeVencimiento` debe detallar como mínimo: **Nro de Inspección** y **Nro de Revisión** (`numero_inspeccion` y `numero_revision` de §2.6 — nunca el UUID interno del ticket, que no es legible para una persona), Patente Camión, Patente Rampla, fallas detectadas y tiempo restante.

  </details>

- **Botón de alerta por correo:** dispara el envío de un correo (mismo contenido que el mensaje de WhatsApp, en formato HTML) a los destinatarios configurados para alertas (puede ser el mismo selector multi-destinatario de §4, o una lista fija de "responsables de flota" — decisión de negocio: usa el mismo selector para no duplicar UI).
- Registra cada envío (WhatsApp abierto / correo enviado) en la tabla `notificaciones` para trazabilidad, aunque el envío de WhatsApp en sí ocurra en el cliente del usuario (no hay API de WhatsApp Business en el MVP).

### 3.1 Aviso automático por WhatsApp cuando un ticket pasa a "naranjo" (Meta Cloud API)

**Nueva funcionalidad — decisión ya tomada con el usuario: se integra la API oficial de WhatsApp Business de Meta (Cloud API), no un proveedor externo como Twilio.** Hoy el aviso por WhatsApp depende de que un administrador haga clic en el botón (enlace `wa.me` de arriba) — eso sigue existiendo tal cual para uso manual. Esto agrega un **envío automático real** al supervisor dueño del ticket, sin que nadie tenga que abrirlo: en cuanto un ticket cruza `horas_restantes <= 24` (estado "naranjo", §3) y sigue en un estado distinto de `finalizada_sin_observaciones`, el sistema le manda el WhatsApp solo, al teléfono de `personal.telefono` del `supervisor_id` de ese ticket.

**Por qué hace falta un job programado, no un trigger de base de datos:** `horas_restantes` no se persiste, se calcula al vuelo (§3) a partir de `now()` — no existe ningún evento de escritura en la base de datos que ocurra justo cuando un ticket cruza el umbral (el tiempo, simplemente, sigue pasando). Por eso el aviso automático necesita un proceso que revise periódicamente el estado de todos los tickets abiertos.

- **Job programado (cron):** crea un Route Handler, por ejemplo `app/api/cron/alertas-whatsapp/route.ts`, protegido para que solo el cron pueda invocarlo (valida el header `Authorization: Bearer ${CRON_SECRET}` contra la variable de entorno `CRON_SECRET`; cualquier otra llamada responde 401). Prográmalo con **Vercel Cron Jobs** (entrada `crons` en `vercel.json`) cada 30–60 minutos. **Nota sobre el plan de Vercel:** el plan Hobby (gratis) limita los cron jobs a una ejecución por día — si el proyecto sigue en Hobby, el aviso automático solo puede correr una vez al día, no cada 30–60 minutos; si se necesita más frecuencia hace falta el plan Pro (ya se conversó antes con el usuario sobre esta diferencia). No asumas cuál plan está activo — coordina con el usuario si la frecuencia diaria no es suficiente.
- **Qué hace el job en cada corrida:** consulta los tickets con estado distinto de `finalizada_sin_observaciones`, calcula `horas_restantes` de cada uno igual que en el dashboard (con la `fecha_vencimiento` de su revisión más reciente), y de los que están en `horas_restantes <= 24` y **todavía no tienen el aviso enviado para su ciclo actual** (`tickets.alerta_naranja_enviada = false`, columna nueva — ver §7), les manda el WhatsApp y marca `alerta_naranja_enviada = true` para no volver a avisar en cada corrida siguiente del mismo ticket. **Reinicia `alerta_naranja_enviada` a `false` cada vez que el ticket vuelve a `en_revision`** (nueva revisión/reinspección, §2.3, con una `fecha_vencimiento` nueva) — así puede volver a pasar por "naranjo" en su nuevo ciclo y avisar de nuevo, sin quedar "gastado" para siempre por el primer aviso.
- **Aclaración — la notificación es única, no un recordatorio repetido:** se manda **una sola vez por ciclo**, en la primera corrida del cron que encuentra el ticket ya en `horas_restantes <= 24` (es decir, apenas cumple las 24 horas para vencer, con el margen de la frecuencia del cron — cada 30–60 min, o diario en plan Hobby). Una vez enviado y marcado `alerta_naranja_enviada = true`, **no se le vuelve a avisar por WhatsApp automático** aunque el ticket siga naranjo corrida tras corrida, ni tampoco cuando más adelante pase a "vencido" (`horas_restantes < 0`) — es la misma alerta, un ticket que ya avisó "vence en menos de 24h" no necesita un segundo aviso automático porque ahora está vencido. Esto es independiente del botón manual "Notificar Vencimiento por WhatsApp" de más arriba, que un administrador puede seguir usando las veces que quiera — el límite de una sola vez aplica solo al envío automático.
- **Envío vía Meta Cloud API:** desde ese mismo Route Handler (código server-only), hace un `POST` a `https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`, autenticado con el header `Authorization: Bearer ${WHATSAPP_TOKEN}`, dirigido al `personal.telefono` del supervisor (mismo formato internacional solo con dígitos que ya usa el enlace `wa.me` manual de arriba).
- **Restricción importante de WhatsApp Business — plantilla pre-aprobada, no texto libre:** un mensaje que la empresa inicia (el supervisor no le escribió antes a este número) **debe usar una "plantilla" pre-aprobada por Meta** — un `POST` con `type: "text"` sin que el usuario haya escrito primero es rechazado por la API. Antes de activar el envío automático:
  1. En Meta Business Manager → WhatsApp Manager, crea una plantilla (por ejemplo `alerta_vencimiento`) con variables para Nro de Inspección, Nro de Revisión, Patente Camión, Patente Rampla y horas restantes — el mismo contenido mínimo que ya arma `construirMensajeVencimiento` para el enlace manual.
  2. Envíala a aprobación de Meta (puede tardar hasta un par de días).
  3. Una vez aprobada, el `POST` del job debe usar `type: "template"` (`template: { name: "alerta_vencimiento", language: { code: "es" }, components: [...] }`) con las variables reales de cada ticket — nunca `type: "text"` para este envío automático.
- **Registro para trazabilidad:** cada envío exitoso (o el intento fallido, con el motivo) se guarda en la tabla `notificaciones` igual que los avisos manuales (`tipo = 'whatsapp'`) — así queda un único historial sin importar si el WhatsApp se mandó a mano o automático.
- **Manejo de errores:** si la API de Meta falla para un ticket puntual (token vencido, número inválido, plantilla no aprobada, etc.), el job debe seguir procesando el resto de los tickets pendientes de esa corrida — no debe abortar todo por el error de uno solo — y dejar el error registrado (log del servidor como mínimo; idealmente también una fila en `notificaciones` marcando el fallo) para poder revisarlo después.

**Requisitos previos con Meta, fuera del código (los gestiona el usuario, o junto con el usuario):** verificar la empresa en Meta Business Manager, configurar un número de WhatsApp Business (puede ser el mismo número que ya se usa para el enlace `wa.me` manual, siempre que quede registrado como número de WhatsApp Business), y generar un `WHATSAPP_TOKEN` de acceso **permanente** desde Meta for Developers (no el token temporal de 24 horas que Meta entrega por defecto al empezar a probar).

---

## 4. Informe digital

Genera una vista imprimible/exportable "Informe de Inspección - Cordillera M&P" en `/tickets/[id]/report`, con:

**Corrección de texto — donde diga "Informe de Inspección de Flota" (título de la página del informe, encabezado del PDF, o cualquier otro lugar de la app) pasa a decir simplemente "Informe de Inspección"** (se saca la palabra "Flota"). Revisa el título de la pestaña/página, el encabezado visible en pantalla y en el PDF, y cualquier otro texto de interfaz donde haya quedado la versión anterior.

- Cabecera completa (§1) + **Nro de Inspección** y **Nro de Revisión** (`numero_inspeccion` y `numero_revision` de §2.6 — nunca el UUID interno del ticket) + estado.
- Los 18 elementos del checklist con su resultado (Conforme/No conforme/No aplica), observación y foto cuando aplique.
- Las dos firmas digitales (imagen + nombre + timestamp) de la revisión correspondiente.
- Sin códigos documentales ni números de versión (ver restricción global al inicio del documento).

**Corrección — el logo del encabezado del informe sigue quedando chico, agrándalo más:** la corrección anterior ("un poco más grande" que el tamaño original, movido al lado derecho del encabezado) no fue suficiente — súbele más el tamaño. Déjalo en aproximadamente **90–110px de alto** (bastante más notorio que ahora, sin quedar tan grande que desborde la fila del encabezado ni tape el título/los datos de la izquierda), manteniendo la proporción original de la imagen. Aplica tanto a la vista en pantalla como al PDF generado (§4.1/§4.2) — mismo tamaño en los dos.

**Nueva funcionalidad — selector de revisión cuando el ticket tiene 2 o más revisiones:** hoy el informe siempre muestra una sola revisión (la más reciente) sin dar opción de elegir otra, aunque el ticket ya haya tenido una re-inspección (§2.14). Corrige así:

- **Si el ticket tiene una sola revisión:** el informe se comporta como hoy, sin ningún selector — no agregues el control de abajo si no hace falta.
- **Si el ticket tiene 2 o más revisiones** (`ticket_revisiones` con más de una fila para ese `ticket_id`): agrega un control (selector/dropdown, o un botón que abre las opciones — a criterio de la implementación, mientras sea claro) en la parte superior del informe, con las opciones:
  - **Cada revisión individual**, identificada como "Revisión 1", "Revisión 2", etc. (con su fecha al lado para distinguirlas, por ejemplo "Revisión 1 — 07-08-2026") — al elegir una, el informe muestra **solo** los datos de esa revisión puntual (su checklist, sus firmas, su resultado), igual que se arma hoy para la más reciente.
  - **"Todas las revisiones"** (o "Historial completo"): genera el informe con **todas** las revisiones del ticket una tras otra, en orden (Revisión 1, Revisión 2, ...), cada una con su propio checklist, firmas, fecha y resultado — como un solo documento/PDF más largo que las incluye todas, no un resumen.
- **Valor por defecto al entrar** (por ejemplo desde el botón "Ver" de la tabla, §2.6): la **revisión más reciente**, igual que el comportamiento actual — el selector es para cambiar esa vista, no reemplaza el default.
- Esto aplica tanto a la vista en pantalla como al PDF generado para "Enviar por correo" y "Enviar por WhatsApp" (§4.1, §4.2): el PDF que se adjunta/comparte corresponde a lo que esté seleccionado en ese momento (una revisión puntual, o todas) — si el supervisor eligió "Todas las revisiones" antes de enviar, el PDF adjunto debe incluir todas, no solo la última.

### 4.1 Envío por correo (corrige lo ya construido: hoy el correo sale sin adjunto)

Lo acciona el **supervisor** dueño de ese ticket (ver §2.6), no el administrador. Abre un selector **multi-destinatario** poblado desde la tabla `destinatarios_correo` (checkboxes, no un solo `<select>`), permite tildar varios antes de confirmar el envío. Al enviar:

- **Genera un PDF real del informe y adjúntalo al correo** — hoy el correo se envía sin nada adjunto, eso es un bug a corregir, no una opción. Usa una librería de generación de PDF en el servidor (por ejemplo renderizar el HTML del informe con Puppeteer/Playwright, o `@react-pdf/renderer`) — el resultado tiene que ser un PDF real adjunto (`.pdf`), no un link.
- **El PDF debe tener formato formal y profesional**: encabezado claro con el nombre de la empresa y "Informe de Inspección" (sin "de Flota", ver la corrección de texto de arriba), tipografía y espaciado cuidados, tabla del checklist ordenada y legible, sección de firmas con las imágenes a un tamaño que se vea bien impreso, y **las fotos de los ítems no conformes en tamaño legible** (no miniaturas diminutas — deben poder distinguirse los detalles de la falla). Sigue la paleta y tipografía de §6 en la medida en que tenga sentido en un documento imprimible (fondo blanco, no los fondos de color del dashboard).
- **Cuerpo del correo — corrección: pásalo a HTML con una tabla, formato formal y profesional** (reemplaza tanto el texto plano anterior como cualquier otro texto genérico que haya quedado, por ejemplo si el asunto del correo todavía dice algo como "Se realizó la inspección técnica del camión. Se adjunta checklist" — unifica todo a esta redacción). Envía el correo como HTML (`html:` en `nodemailer`, no `text:` plano) con esta estructura:

  ```html
  <div style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
    <p style="margin: 0 0 16px;">Estimados,</p>

    <p style="margin: 0 0 16px;">Junto con saludar, informo que se ha ejecutado la inspección técnica y operativa al camión de transportes cuyos datos se detallan a continuación:</p>

    <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
      <tr>
        <td style="background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee; width:140px;">Empresa</td>
        <td style="padding:8px 12px; border:1px solid #dde3ee;">{transporte}</td>
      </tr>
      <tr>
        <td style="background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee;">Matrícula</td>
        <td style="padding:8px 12px; border:1px solid #dde3ee;">{PATENTE_CAMION EN MAYÚSCULA}</td>
      </tr>
      <tr>
        <td style="background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee;">Rampla</td>
        <td style="padding:8px 12px; border:1px solid #dde3ee;">{PATENTE_RAMPLA EN MAYÚSCULA}</td>
      </tr>
      <tr>
        <td style="background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee;">Conductor</td>
        <td style="padding:8px 12px; border:1px solid #dde3ee;">{conductor}</td>
      </tr>
    </table>

    <p style="margin: 0 0 8px;">Tras la revisión, se detectó el siguiente hallazgo en las observaciones:</p>
    <ol style="margin: 0 0 20px; padding-left: 20px;">
      <li>{observación del primer ítem no_conforme}</li>
      <li>{observación del segundo ítem no_conforme}</li>
    </ol>

    <p style="margin: 0 0 20px;">Para mayor respaldo, se adjunta la lista de chequeo y el registro fotográfico que ilustra la condición actual del vehículo.</p>

    <p style="margin: 0;">Atentamente,<br>{nombre} {apellido}<br>Supervisor de Encarpe</p>
  </div>
  ```

  Detalle de cada parte de la plantilla:

  - Los datos de camión (`{transporte}`, matrícula, rampla, `{conductor}`) son los de la revisión que se está informando — el mismo conductor por revisión de §2.6, no necesariamente el de la cabecera original del ticket. **Las patentes (matrícula y rampla) van en mayúscula** — conviértelas al mostrarlas (`.toUpperCase()`), no hace falta cambiar cómo se guardan en la base de datos.
  - "Empresa" en la tabla repite el mismo valor de `transporte` que ya aparece en la frase de arriba — es intencional, va en ambos lugares.
  - La lista numerada son **las observaciones de los ítems `no_conforme` de esa revisión, en el mismo orden del checklist** — solo el texto de la observación, sin repetir el nombre del ítem ni la foto; las fotos van únicamente en el PDF adjunto. Si hay una sola observación, la lista queda con un solo ítem (no fuerces un "2." vacío). Si la revisión no tiene ítems `no_conforme` (ticket `FINALIZADA_SIN_OBSERVACIONES`), reemplaza tanto la frase introductoria como la lista por una línea equivalente, por ejemplo: "Tras la revisión, no se detectaron observaciones. El camión cumple con todas las exigencias del Check List." — no dejes la plantilla con un listado vacío ni con un "1." sin contenido.
  - **La firma cierra con "Atentamente," en su propia línea, antes del nombre** — no lo saques, es parte del texto nuevo.
  - `{nombre} {apellido}` son los del supervisor que **envía el correo en ese momento** (el usuario autenticado) — no necesariamente el `supervisor_id` original del ticket, ya que desde §2.6 cualquier supervisor puede reinspeccionar y enviar el informe de un ticket "con observaciones". `apellido` es un campo nuevo en `personal` — ver más abajo. "Supervisor de Encarpe" sigue siendo un texto fijo, igual para todos, no varía por persona.
  - Elimina cualquier línea tipo "Ver informe:" que quede vacía o rota, y no agregues datos que no estén en esta plantilla (no repitas Nro de Inspección, Nro de Revisión, estado, ni los demás campos de cabecera dentro del cuerpo — esa información ya vive en el PDF adjunto).
  - **Asunto del correo:** usa también "Check List camión de transportes {transporte}" (o algo igual de consistente con el cuerpo) — revisa si en algún lugar del código quedó un asunto o texto genérico tipo "Se realizó la inspección técnica del camión. Se adjunta checklist" y reemplázalo, para que no queden dos redacciones distintas convivendo en el mismo correo.
- Adjunta ese mismo PDF a todos los destinatarios seleccionados en un solo envío.

**Nuevo campo — Apellido del supervisor (obligatorio):** la firma del correo debe mostrar nombre **y apellido** (por ejemplo "Jaime Contreras"), no solo el nombre de pila como hasta ahora. Agrega la columna:

```sql
alter table personal
  add column if not exists apellido text;
```

(Súmalo también al DDL base de `personal` en §7.) No la agregues como `not null` a nivel de base de datos — ya hay registros existentes sin este dato y eso rompería la migración. En cambio, hazlo **obligatorio a nivel de formulario**: agrega "Apellido" como campo requerido en "Agregar usuario" del panel de §2.10 (junto a Nombre), y también como campo editable ahí para completar el apellido de los usuarios ya creados que todavía no lo tengan. En la firma del correo y en el informe/PDF (§4), usa `nombre` + `apellido`; si algún usuario legado todavía no tiene `apellido` cargado, muestra solo `nombre` en vez de dejar un espacio en blanco o un "undefined".

**Corrección — el envío hoy está en "modo prueba" y no llega a destino, hay que conectarlo a un proveedor real:** el botón "Enviar por correo" muestra un mensaje de éxito ("Informe enviado...") y una vista previa en "modo prueba", pero no está enviando el correo de verdad — corrige esto, no es opcional. **Decisión ya tomada: se envía vía Gmail / Google Workspace por SMTP**, usando una casilla de correo real de la empresa (no un proveedor transaccional como Resend/SendGrid).

- Usa `nodemailer` con un transporte SMTP apuntando a Gmail:

  ```ts
  import nodemailer from "nodemailer";

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // true para el puerto 465, false para 587 con STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  ```

- **Variables de entorno nuevas** (mismo tratamiento que el resto de secretos, §9 — solo en `.env.local`/variables del hosting, nunca en código ni versionadas, y agrégalas a `.env.example` sin valores reales):
  - `SMTP_USER`: la casilla de Gmail/Google Workspace desde la que se envían los informes (ej. `inspecciones@cordilleramyp.cl` o la que el usuario indique).
  - `SMTP_PASSWORD`: **no es la contraseña normal de esa cuenta de Google** — Google ya no permite autenticar apps externas con la contraseña de la cuenta. Es una "contraseña de aplicación" (App Password) de 16 caracteres, que se genera así: 1) activar la verificación en dos pasos en esa cuenta de Google (Cuenta de Google → Seguridad → Verificación en dos pasos); 2) ir a `myaccount.google.com/apppasswords`, crear una nueva contraseña de aplicación (nombre sugerido: "Cordillera M&P"); 3) copiar el código de 16 caracteres (sin espacios) y pegarlo como `SMTP_PASSWORD` en `.env.local`. Esta contraseña de aplicación es un secreto igual que cualquier otro — mismo tratamiento que el resto de credenciales en §9.
  - El "de" (`from`) del correo debe ser esa misma casilla (`SMTP_USER`); opcionalmente configura el nombre visible como "Cordillera M&P" (`from: '"Cordillera M&P" <${process.env.SMTP_USER}>'`).
- **Elimina el "modo prueba"** una vez conectado el SMTP real: el envío debe intentar entregar el correo de verdad, y si falla (credenciales mal puestas, SMTP rechaza el envío, etc.) debe mostrarle un error real al supervisor — nunca un mensaje de "enviado con éxito" cuando en realidad no salió. Si por algún motivo el proyecto necesita seguir teniendo un modo de prueba para desarrollo local, dependa de una variable de entorno explícita (por ejemplo `EMAIL_MODO_PRUEBA=true`) que **no** esté activada en producción — nunca que sea el comportamiento por defecto silencioso como hoy.
- Ten en cuenta los límites de envío de Gmail/Google Workspace (bajos volúmenes por día, del orden de cientos) — más que suficiente para este proyecto, pero si en el futuro el volumen de informes crece mucho, quedaría como decisión pendiente migrar a un proveedor transaccional (Resend/SendGrid).

### 4.2 Compartir el informe por WhatsApp (nuevo — decisión ya tomada con el usuario: compartir nativo del navegador, no la API de Meta)

**Nueva funcionalidad:** en la página del informe (`/tickets/[id]/report`), agrega un botón **"Enviar por WhatsApp"** (con el ícono de WhatsApp de §2.6/`WhatsAppIcon.tsx`, reutilízalo) junto al botón "Enviar por correo" (§4.1), para mandar el mismo PDF del informe por WhatsApp.

- **Se implementa con la Web Share API del navegador (`navigator.share`), no con la API de Meta Cloud (esa integración, §3.1, queda solo para el aviso automático de vencimiento, no se reutiliza aquí)** — es la opción más simple: no requiere backend nuevo, plantillas de Meta ni credenciales adicionales.
- Al presionar el botón: genera (o reutiliza, si ya se generó para el correo) el mismo PDF real del informe (§4.1), arma un objeto `File` a partir de ese PDF, y llama a `navigator.share({ files: [archivoPdf], title: 'Informe de Inspección — {transporte} {patente_camion}', text: 'Se realiza Check List a camión de transportes {transporte}.' })`. Esto abre el panel nativo de "Compartir" del dispositivo, donde el supervisor elige WhatsApp (o cualquier otra app instalada) como destino — el PDF queda adjunto automáticamente, no hace falta ingresar ningún número de teléfono desde la app.
- **Verifica soporte antes de mostrar el botón como habilitado:** no todos los navegadores/dispositivos soportan compartir archivos así (funciona bien en Chrome/Safari de celular; la mayoría de los navegadores de escritorio no lo soportan). Antes de intentar el envío, valida con `navigator.canShare && navigator.canShare({ files: [archivoPdf] })`. Si no está disponible, **no rompas la página ni falles en silencio** — oculta el botón, o muéstralo deshabilitado con un texto/tooltip como "Compartir por WhatsApp solo está disponible desde el celular", según lo que sea más simple de implementar.
- Maneja el caso en que el usuario cancela el panel de compartir (`AbortError` de `navigator.share`) sin mostrarlo como un error — es un flujo normal, no un fallo.
- Este botón lo puede usar tanto el supervisor como el administrador, igual que "Enviar por correo" (§2.6, sección "Envío del informe por correo") — no hace falta restringirlo por rol.

### 4.3 Botón "Volver a las inspecciones" junto a "Enviar por correo"

**Nueva funcionalidad/corrección de ubicación:** en la página del informe (`/tickets/[id]/report`), agrega (o reubica si ya existe con otro nombre — ver nota abajo) un botón/enlace con el texto **"Volver a las inspecciones"**, ubicado **al lado de "Enviar por correo"** (junto con "Enviar por WhatsApp" del punto anterior, los tres quedan agrupados como acciones de esa pantalla). Al presionarlo, lleva al listado de inspecciones correspondiente al rol de quien está autenticado: el administrador vuelve a `/dashboard` (tabla "Inspecciones", §2.6/§2.11) y el supervisor vuelve a su tabla "Inspecciones" (antes "Mis inspecciones", §2.12). Disponible para **ambos roles** — administrador y supervisor —, igual que "Enviar por correo" y "Enviar por WhatsApp".

**Nota — esto reemplaza/consolida el enlace "Inspecciones" ya pedido en §2.6** (el que se agregó al informe cuando "Ver" pasó a llevar directo ahí): si ese enlace ya está implementado, solo hay que renombrarlo a "Volver a las inspecciones" y confirmar que quede ubicado junto a "Enviar por correo" — no agregues un segundo botón duplicado que haga lo mismo. El enlace secundario "Ver historial completo" (que lleva al detalle del ticket, `/tickets/[id]`) es distinto y se mantiene sin cambios.

---

## 5. Estructura del proyecto

```
/app
  /dashboard/page.tsx              → listado de tickets + resaltado por vencimiento (admin, §2.6)
  /dashboard/analitica/page.tsx    → gráficos y estadísticas (admin, §2.11)
  /usuarios/page.tsx               → panel de administración de usuarios (admin, §2.10)
  /tickets/new/page.tsx            → cabecera + checklist + firmas (supervisor)
  /tickets/[id]/page.tsx           → detalle, historial de revisiones
  /tickets/[id]/report/page.tsx    → informe imprimible + envío por correo
  /api/cron/alertas-whatsapp/route.ts → job del aviso automático por WhatsApp (§3.1)
/components
  ChecklistItemRow.tsx             → fila del checklist (selector + botón info)
  InfoPopover.tsx                  → popup con el texto de exigencia
  SignaturePad.tsx                 → captura de firma en canvas (reutilizado x2)
  TicketStatusBadge.tsx
  CountdownBadge.tsx               → resaltado por horas restantes
  WhatsAppNotifyButton.tsx         → botón de solo ícono, alerta de vencimiento (§2.6/§3)
  WhatsAppShareButton.tsx          → "Enviar por WhatsApp" del informe, vía Web Share API (§4.2)
  WhatsAppIcon.tsx                 → SVG del ícono de WhatsApp, reutilizado por los dos botones de arriba
  EmailRecipientsSelect.tsx
/lib
  supabase/client.ts
  supabase/server.ts
  ticket-state-machine.ts          → transiciones de estado (§2.3) centralizadas
/supabase
  schema.sql
  seed.sql
```

---

## 6. Estilo visual y sistema de diseño

Estilo general: panel de gestión profesional y sobrio — pensado para un supervisor/administrador de flota trabajando rápido, no una app de consumo. Fondo neutro claro, tarjetas blancas, un solo color de marca para navegación y acciones primarias, y colores semánticos reservados exclusivamente para comunicar estado (nunca decorativos). Tipografía: la stack sans-serif por defecto de Tailwind (`font-sans`) — no cargues fuentes externas, mantiene el proyecto simple y rápido de cargar.

**Cómo se apoya en el sistema de colores de Tailwind:** Tailwind v4 ya trae una paleta completa de colores base con 11 tonos cada uno (`50` a `950`), definida en `oklch` para que las transiciones entre tonos sean perceptualmente uniformes. En vez de inventar valores hexadecimales propios (que es fácil hacer mal — un tono puede "saltar" de matiz de un paso a otro si se eligen a mano), este proyecto **alia nombres semánticos a colores base ya existentes de Tailwind**, con `@theme` en `src/app/globals.css`:

```css
@theme {
  --color-brand-50:  var(--color-blue-50);
  --color-brand-100: var(--color-blue-100);
  --color-brand-200: var(--color-blue-200);
  --color-brand-300: var(--color-blue-300);
  --color-brand-400: var(--color-blue-400);
  --color-brand-500: var(--color-blue-500);
  --color-brand-600: var(--color-blue-600);
  --color-brand-700: var(--color-blue-700);
  --color-brand-800: var(--color-blue-800);
  --color-brand-900: var(--color-blue-900);
  --color-brand-950: var(--color-blue-950);

  /* mismo patrón (los 11 tonos, 50 a 950) para cada alias: */
  /* --color-neutral-*  → var(--color-slate-*)   */
  /* --color-success-*  → var(--color-emerald-*) */
  /* --color-warning-*  → var(--color-amber-*)   */
  /* --color-alert-*    → var(--color-orange-*)  */
  /* --color-danger-*   → var(--color-red-*)     */
}
```

Escribe los 11 tonos completos para cada alias (`neutral`, `success`, `warning`, `alert`, `danger`) igual que se hizo arriba para `brand` — Tailwind v4 no expande el patrón `-*` automáticamente, esas líneas comentadas son solo la referencia de qué color base usa cada uno. La ventaja frente a definir hex a mano: cada token queda con su escala completa disponible (`brand-50` a `brand-950` — útil para fondos sutiles, hover, bordes, no solo 2-3 tonos sueltos) y las transiciones entre tonos ya vienen probadas visualmente por Tailwind, en vez de improvisadas.

- Fondo de página: `neutral-50`. Tarjetas/paneles: blanco con borde `neutral-200`. Texto principal: `neutral-900`, texto secundario: `neutral-600`.
- `brand` (azul): navegación, botones primarios, enlaces, encabezados de sección.
- `success` (verde): estados positivos — ticket `FINALIZADA_SIN_OBSERVACIONES`, ítems del checklist `conforme`.
- `warning` (ámbar): atención moderada — ticket `FINALIZADA_CON_OBSERVACIONES`, resaltado de vencimiento entre 24h y 48h (ver §3).
- `alert` (naranja): urgencia alta — resaltado de vencimiento ≤24h (ver §3). Es un color distinto de `warning`, no una variación de opacidad del mismo tono, para que la diferencia se note de un vistazo.
- `danger` (rojo): estado crítico — ítems del checklist `no_conforme`.
- `neutral` (gris): ticket `EN_REVISION` (trabajo en curso, sin urgencia todavía) e ítems `no_aplica`.

Badges de estado de ticket (componente `TicketStatusBadge`, un color fijo por estado — usa el par `-100`/`-700` de cada token para fondo/texto, el patrón estándar de contraste legible en modo claro):

| Estado | Fondo | Texto |
|---|---|---|
| `EN_REVISION` | `neutral-100` | `neutral-700` |
| `FINALIZADA_CON_OBSERVACIONES` | `warning-100` | `warning-700` |
| `EN_REPARACION_DE_OBSERVACIONES` | `brand-100` | `brand-700` |
| `FINALIZADA_SIN_OBSERVACIONES` | `success-100` | `success-700` |

Esta paleta es un punto de partida razonable, no una decisión cerrada: si más adelante Cordillera M&P define colores corporativos propios (logo, manual de marca), basta con cambiar a qué color base de Tailwind apunta cada alias (o definir una escala propia a mano si la marca no calza con ningún color base de Tailwind) — el resto del proyecto ya estaría referenciando estos tokens semánticos (`brand`, `success`, `warning`, `alert`, `danger`, `neutral`) en vez de colores sueltos, así que el cambio de marca no requiere tocar componentes uno por uno.

**Corrección — el nombre del usuario desaparece del header en la vista de celular:** en la esquina superior derecha del header, junto al badge de rol (Supervisor/Administrador) y el botón "Salir", debe verse también el **nombre del usuario que inició sesión** (`personal.nombre`, igual que ya se ve en escritorio) — hoy, en pantallas angostas (celular), ese nombre desaparece y solo quedan visibles el badge de rol y "Salir". Probablemente el nombre tiene una clase de Tailwind tipo `hidden sm:block` (o equivalente) que lo oculta por debajo de cierto ancho — quítala, el nombre debe ser visible en **todos** los tamaños de pantalla. Si no entra todo en una sola fila en celular (nombre + badge de rol + "Salir"), en vez de ocultar el nombre reorganiza el bloque para que quepa — por ejemplo el nombre en una línea y el badge de rol + "Salir" en la línea de abajo, o truncando el nombre con `text-ellipsis`/`truncate` si es muy largo — pero nunca ocultándolo por completo.

### 6.1 Componentes de interfaz: shadcn/ui

Usa **shadcn/ui** para los componentes de interfaz (botones, badges, popovers, diálogos, tablas) en vez de construirlos desde cero. No es una dependencia tradicional: su CLI copia el código fuente de cada componente directamente a `src/components/ui/`, queda 100% editable en el repo y no depende de que un paquete externo actualice su estilo.

Instalación (una sola vez):

```
npx shadcn@latest init
```

Elige las opciones recomendadas para Next.js App Router + Tailwind (ya configurado en este repo) con el alias de import `@/*`.

Agrega los componentes según se necesiten:

```
npx shadcn@latest add button badge popover dialog card table checkbox select
```

- `button`: todos los botones de la app (Finalizar revisión, Notificar por WhatsApp, Enviar por correo, etc.), usando las variantes propias de shadcn (`default`, `destructive`, `outline`, `ghost`) en vez de clases sueltas repetidas.
- `popover`: implementa el ícono de información junto a cada ítem del checklist (§2.4).
- `dialog`: si el flujo de firmas (§2.5) se implementa como modal en vez de sección inline.
- `badge`: base de `TicketStatusBadge` y de los estados del checklist (conforme/no conforme/no aplica).
- `card`, `table`, `checkbox`, `select`: estructura general del dashboard y formularios.

**Mapeo de la paleta a las variables de shadcn:** shadcn usa sus propios nombres de variable (`--primary`, `--destructive`, `--muted`, etc.), distintos a los tokens `brand`/`success`/`warning`/`danger`/`neutral` definidos arriba. En el bloque `:root` que genera `shadcn init` dentro de `src/app/globals.css`, mapea:

```css
:root {
  --primary: var(--color-brand-600);
  --primary-foreground: var(--color-neutral-50);
  --destructive: var(--color-danger-600);
  --muted: var(--color-neutral-100);
  --muted-foreground: var(--color-neutral-600);
  --border: var(--color-neutral-200);

  /* shadcn no trae success/warning por defecto: agrégalos siguiendo su mismo patrón */
  --success: var(--color-success-600);
  --success-foreground: var(--color-neutral-50);
  --warning: var(--color-warning-500);
  --warning-foreground: var(--color-neutral-900);
}
```

Expón `--success` y `--warning` también en el bloque `@theme inline` que genera `shadcn init`, junto a `--color-primary` y `--color-destructive`, agregando `--color-success`, `--color-success-foreground`, `--color-warning`, `--color-warning-foreground` con el mismo patrón. Así los badges de estado usan clases normales de Tailwind (`bg-success`, `bg-warning`, `bg-destructive`) en vez de los nombres `brand-*`/`danger-*` sueltos, y el componente `Button` de shadcn queda coherente con el resto del sistema de diseño.

---

## 7. Esquema de base de datos (Supabase)

Ejecuta esto vía el conector MCP de Supabase (o como migración `supabase/schema.sql` si el MCP no está disponible en el entorno de ejecución).

> **Nota de reconciliación:** el DDL de abajo es el esquema completo para una instalación **nueva** — ya incluye `nro_revision_global`, `conductor` y `fecha_vencimiento` en `ticket_revisiones`, y la versión final de la restricción de `ticket_checklist_respuestas`. Si este entorno ya tiene estas tablas desplegadas desde un ciclo de construcción anterior (el caso más probable a esta altura del proyecto), **no vuelvas a crear las tablas desde cero** — usa en su lugar los `alter table` incrementales de §2.6 (para `nro_revision_global` y `conductor`) y §2.7 (para `fecha_vencimiento` y el cambio de constraint), que son idempotentes o casi (`if not exists`/`if exists`) y seguros de correr sobre una base ya poblada con datos.

```sql
-- ENUMS
create type ticket_estado as enum (
  'en_revision',
  'finalizada_con_observaciones',
  'en_reparacion_de_observaciones',
  'finalizada_sin_observaciones'
);

create type item_estado as enum ('conforme', 'no_conforme', 'no_aplica');

create type rol_usuario as enum ('supervisor', 'administrador', 'conductor');

create type notificacion_tipo as enum ('whatsapp', 'email');

-- CATÁLOGO DE PERSONAL (supervisores / conductores / administradores)
create table personal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id), -- nulo mientras la invitación está pendiente, ver §2.10
  nombre text not null,
  apellido text, -- obligatorio a nivel de formulario (§2.10), no a nivel de columna — ver §4.1
  fecha_nacimiento date, -- obligatorio a nivel de formulario (§2.10), no a nivel de columna
  rol rol_usuario not null,
  telefono text, -- obligatorio a nivel de formulario (§2.10) cuando rol = 'supervisor'
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- CATÁLOGO DE DESTINATARIOS PARA ENVÍO DE INFORME POR CORREO
create table destinatarios_correo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  cargo text,
  activo boolean not null default true
);

-- CATÁLOGO DE ELEMENTOS DEL CHECKLIST (fuente única para los popups de info)
create table checklist_items (
  key text primary key,
  nombre text not null,
  exigencia text not null,
  orden int not null
);

-- TICKET (identidad única de la inspección)
create table tickets (
  id uuid primary key default gen_random_uuid(),
  numero_inspeccion bigint generated always as identity unique not null, -- "Nro de Inspección" legible, ver §2.6
  transporte text not null,
  conductor text not null,
  fecha timestamptz not null, -- fecha y hora de la inspección
  procedencia text not null,
  tipo_camion text not null,
  patente_camion text not null,
  patente_rampla text not null,
  estado ticket_estado not null default 'en_revision',
  revision_actual int not null default 1,
  supervisor_id uuid references personal(id),
  fecha_vencimiento timestamptz, -- vencimiento efectivo: el de la revisión más reciente de este ticket (ver §2.6 y §3)
  alerta_naranja_enviada boolean not null default false, -- evita reenviar el WhatsApp automático de §3.1 en cada corrida del cron
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HISTORIAL DE REVISIONES (una fila por cada paso por EN_REVISION)
create table ticket_revisiones (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  numero_revision int not null,
  nro_revision_global bigint generated always as identity unique not null, -- correlativo global interno; ya NO se muestra en la UI, ver corrección en §2.6 (usa numero_revision + numero_inspeccion)
  conductor text, -- conductor de esta revisión específica, ver §2.6
  fecha_vencimiento timestamptz, -- un solo vencimiento por revisión, ver §2.7 (ya no es por ítem)
  estado_resultante ticket_estado not null,
  supervisor_id uuid references personal(id),
  firma_conductor_url text,
  firma_fiscalizador_url text,
  created_at timestamptz not null default now(),
  unique (ticket_id, numero_revision)
);

-- RESPUESTAS DEL CHECKLIST POR REVISIÓN
create table ticket_checklist_respuestas (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  revision_numero int not null,
  item_key text not null references checklist_items(key),
  estado item_estado not null,
  observacion text,
  foto_url text,
  created_at timestamptz not null default now(),
  foreign key (ticket_id, revision_numero) references ticket_revisiones(ticket_id, numero_revision) on delete cascade,
  constraint foto_obligatoria_si_no_conforme check (
    estado <> 'no_conforme' or foto_url is not null
  )
);

-- NOTIFICACIONES ENVIADAS
create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  tipo notificacion_tipo not null,
  destinatario text not null,
  contenido text,
  enviado_at timestamptz not null default now()
);

-- ÍNDICES ÚTILES
create index idx_tickets_estado on tickets(estado);
create index idx_tickets_fecha_vencimiento on tickets(fecha_vencimiento);
create index idx_respuestas_ticket on ticket_checklist_respuestas(ticket_id, revision_numero);
```

Seed de `checklist_items` (usa el texto de la tabla en §2.4):

```sql
insert into checklist_items (key, nombre, exigencia, orden) values
('plataforma', 'Plataforma', 'No debe presentar fisuras ni ovalaciones', 1),
('teleras_y_ganchos', 'Teleras y Ganchos', 'Las teleras deben estar en buen estado, los ganchos deben estar separados aprox. cada 60 cm', 2),
('carpas', 'Carpas', 'Deben cubrir el ancho y alto de la carga, no debe presentar agujeros, no debe estar quemada', 3),
('nylon', 'Nylon', 'Debe cubrir el largo carga, no presentar agujeros', 4),
('ponchos', 'Ponchos', 'No deben presentar agujeros, no debe estar quemado', 5),
('cordeles', 'Cordeles', 'No deben presentar nudos, estar picados o quemados', 6),
('cortinas', 'Cortinas', 'No deben presentar fisuras, agujeros o encontrarse quemadas', 7),
('goma_drenaje', 'Gomas Drenaje', 'No deben estar dañadas, quemadas o cortadas', 8),
('sider_broches', 'Slider (Broches sujeta cortina)', 'Deben estar en buen estado', 9),
('esquineros', 'Esquineros', 'Mantener un mínimo de 30 esquineros de madera o plástico', 10),
('eslingas', 'Eslingas', 'Sin piquetes, rajaduras, quemaduras ni nudos', 11),
('trinquetes', 'Trinquetes', 'Deben estar en buen estado con sus seguros y mecanismos funcionando', 12),
('carga', 'Carga', 'Debe venir bien estibada y/o prensada', 13),
('maletero', 'Maletero (Herramientas)', 'Deben estar en buen estado', 14),
('fugas', 'Fugas', 'No deben tener fugas de agua o combustible', 15),
('luces', 'Luces', 'Deben estar en buen estado', 16),
('neumaticos', 'Neumáticos', 'Deben estar en buen estado', 17),
('cunas', 'Cuñas', 'Debe contar con 2 cuñas de plástico o goma maciza', 18);
```

Buckets de Storage a crear: `firmas` (privado, firmas digitales) y `fallas` (privado, fotos de ítems no conformes).

---

## 8. Decisiones pendientes (no asumir, preguntar al usuario si se necesita antes de continuar)

- ~~Proveedor de envío de correo~~ — **resuelto: Gmail / Google Workspace vía SMTP**, con la casilla de correo de la empresa. Ver el detalle de implementación en §4.1.
- ~~Si el envío de WhatsApp queda solo como enlace `wa.me` (manual) o se integra una API de WhatsApp Business~~ — **resuelto: se integra la API oficial de Meta (WhatsApp Cloud API)** para el aviso automático cuando un ticket pasa a "naranjo" (§3.1). **Corrección posterior: el enlace `wa.me` manual (el botón de la tabla, §3/§2.6) se eliminó por completo** — ya no convive con el automático, solo queda el aviso automático de §3.1.
- ~~Autenticación de usuarios~~ — **resuelto, con una corrección de seguridad importante en §2.10:** ya se implementó Supabase Auth (correo + contraseña). La versión original dejaba elegir el rol libremente en un selector al registrarse — eso ya no debe existir, ver §2.10 para el reemplazo (alta de cuentas solo desde el panel "Usuarios" del administrador).
- **Login con Google — constrúyelo ahora, ya no es una iteración futura:** agregar un botón "Iniciar sesión con Google" **además** del login por correo/contraseña que ya existe (por ahora conviven los dos métodos, el usuario elige cualquiera de los dos) — usando Supabase Auth con el proveedor `google` (OAuth). **Nota a futuro, todavía no la implementes:** más adelante el plan es que Google quede como la **única** forma de entrar (se elimina el login por correo/contraseña) porque es más seguro de administrar — pero eso queda para una corrección posterior, se avisará explícitamente cuando corresponda hacer ese cambio; por ahora agrega el botón de Google sin sacar el login existente. Pasos:
  1. En Google Cloud Console → [Clients](https://console.cloud.google.com/auth/clients), crear un OAuth Client ID de tipo "Web application".
  2. En "Authorized JavaScript origins" agregar la URL de producción y `http://localhost:3000` para desarrollo local.
  3. En "Authorized redirect URIs" agregar la callback URL que muestra el panel de Supabase en Authentication → Providers → Google (formato `https://<project-ref>.supabase.co/auth/v1/callback`).
  4. Copiar el Client ID y Client Secret generados por Google y pegarlos en Supabase → Authentication → Providers → Google (habilitar el proveedor ahí). **Estas credenciales de Google también son secretos** — nunca las pegues en código ni en archivos versionados; solo van en el panel de Supabase (Supabase las guarda de su lado, la app no necesita tenerlas en `.env`).
  5. En el frontend, agregar el botón que dispara `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '<url>/auth/callback' } })`, junto al formulario de login por correo existente (no reemplazarlo, ambos métodos conviven).
  6. Manejar la ruta `/auth/callback` (Route Handler) que intercambia el código de autorización por la sesión (`exchangeCodeForSession`), si no existe ya como parte del flujo de Supabase Auth SSR ya implementado.
  7. El trigger `handle_new_user` debe comportarse igual que para el flujo de invitación por correo (§2.10): busca una fila en `personal` con ese correo y `user_id` nulo y la vincula; si no existe ninguna invitación pendiente con ese correo, rechaza el acceso — un inicio de sesión con Google **no** debe crear una fila nueva en `personal` con un rol por defecto.
- ~~Logo de Cordillera M&P~~ — **resuelto: el usuario entregó el logo real de la empresa.** Ya está en el repo, en `public/logo-cordillera-mp.png` (imagen PNG, fondo blanco, 2816×1408 px — círculo naranjo con el camión y "Cordillera M&P", más "Encarpe y Amarre / Nacionales e Internacionales" debajo). Intégralo en estos lugares, reemplazando cualquier texto/placeholder que hiciera de logo hasta ahora:

  - **Header de la app (nav superior), en las dos vistas (administrador y supervisor) y también en la pantalla de login:** muestra la imagen del logo junto al nombre "Cordillera M&P" (o en vez del texto, a criterio de la implementación, mientras quede prolijo) — manteniendo la proporción original de la imagen, `next/image` con `width`/`height` fijos o `object-fit: contain`. Revisa que se vea bien tanto en escritorio como en la vista de celular (§6, corrección de responsive ya hecha para el nombre del usuario).
    - ~~Corrección — el logo del header queda muy chico, agrándalo (44–56px de alto)~~ — **corrección posterior, se agranda todavía más y se saca el texto:** quita del header el texto "Cordillera M&P" que iba junto al logo — el logo queda **solo**, sin ningún texto al lado (en las dos vistas, administrador y supervisor, y en la pantalla de login). Y **duplica el tamaño** que tenía el logo hasta ahora (el de la corrección anterior, ~44–56px de alto) a aproximadamente **88–112px de alto**, manteniendo la proporción — el logo se convierte en el único elemento de marca del header, por eso debe notarse bien grande. Ajusta el alto de la barra del nav si hace falta para que el logo entre cómodo sin recortarse, sin que se vea desproporcionado ni tape otros elementos (nombre de usuario, badge de rol, "Salir" — §6). Revisa que se vea bien tanto en escritorio como en la vista de celular.
    - **Nueva funcionalidad — el logo del header es un enlace a la pantalla de inicio del rol correspondiente:** al hacer clic en el logo (en cualquier pantalla donde aparezca en el header, para los dos roles), lleva a la página de inicio de ese rol — administrador → `/dashboard` (tabla "Inspecciones", §2.6), supervisor → su tabla "Inspecciones" (antes "Mis inspecciones", §2.12). Mismo criterio que el resto de los logos "clicables para volver al inicio" habituales en cualquier sitio — agrega un `cursor: pointer` visual y, por accesibilidad, un `aria-label` tipo "Ir al inicio".
  - **Informe en pantalla y PDF (§4):** agrega el logo en el encabezado del informe/PDF, junto al título "Informe de Inspección" — es un documento formal, el logo real de la empresa reemplaza cualquier encabezado solo-texto que hubiera.
    - **Corrección — tamaño y posición del logo en el informe:** el logo debe verse **un poco más grande** que el tamaño actual (ajusta a criterio, pero notoriamente más grande, no un cambio apenas perceptible) y **ubicado a la derecha** del bloque de encabezado — hoy está a la izquierda, junto al título; el título "Cordillera M&P — Informe de Inspección" y los datos (Nro de Inspección, Nro de Revisión, estado) quedan a la izquierda, y el logo pasa al lado derecho de esa misma fila de encabezado. Aplica tanto a la vista en pantalla como al PDF generado (§4.1/§4.2) — mismo layout en los dos.
    - En el informe, el logo es solo una imagen decorativa del encabezado — **no** hace falta que sea clicable ahí (a diferencia del header de la app, punto de arriba).
  - **Firma del correo (§4.1):** agrega el logo también en el cuerpo del correo, por ejemplo debajo de la firma ("Atentamente, {nombre} {apellido}, Supervisor de Encarpe") — como es un correo HTML enviado por SMTP (nodemailer), **no lo references por una URL pública** (la app puede no estar desplegada o el logo puede no ser accesible desde internet); en su lugar, adjúntalo como **imagen embebida (`cid`)**: agrega el archivo como `attachments: [{ filename: 'logo-cordillera-mp.png', path: 'public/logo-cordillera-mp.png', cid: 'logo-cordillera-mp' }]` en la llamada de `nodemailer`, y referencia esa imagen en el HTML del cuerpo con `<img src="cid:logo-cordillera-mp" ... />` — así se ve siempre, sin depender de que el archivo esté accesible por internet.
  - En cualquiera de estos lugares, si el fondo blanco de la imagen se nota como un recuadro sobre un fondo de color, está bien dejarlo así por ahora (la imagen no tiene transparencia) — no es necesario pedir/generar una versión con fondo transparente salvo que se vea mal en la práctica; en ese caso, avisa que hace falta una versión con fondo transparente en vez de recortarla o alterarla por tu cuenta.

### 8.1 Corrección — pantalla de login: mensajes en español y recuperación de contraseña

**Corrección — todos los mensajes de la pantalla de "Iniciar sesión" deben estar en español, incluidos los de error:** se detectó en pruebas que un error de conexión se mostró como **"Failed to fetch"** (texto en inglés, tal cual lo entrega el navegador/la librería de Supabase) — eso no debe llegar así al usuario. Envuelve cualquier error que pueda mostrar esta pantalla (credenciales inválidas, error de red, error del servidor, correo no confirmado, etc.) en un mensaje propio en español, nunca el texto crudo de la excepción original. Por ejemplo:

- Error de red/conexión (`Failed to fetch` o similar) → **"No se pudo conectar. Revisa tu conexión a internet e intenta de nuevo."**
- Credenciales inválidas (`Invalid login credentials`) → **"Correo o contraseña incorrectos."**
- Cualquier otro error no contemplado → un mensaje genérico tipo **"Ocurrió un error al iniciar sesión. Intenta de nuevo."**, nunca el mensaje técnico original en pantalla (puede quedar en `console.error` para depurar, eso sí es útil dejarlo).

Revisa también el resto de los textos de esta pantalla (labels, placeholders, botón, el enlace "¿No tiene cuenta? Registrarse" si sigue existiendo — recordar que el alta libre ya no debe estar disponible, §2.10) por si queda algún texto en inglés suelto.

**Nueva funcionalidad — recuperar contraseña por correo:** agrega un enlace **"¿Olvidaste tu contraseña?"** en la pantalla de login, junto al botón "Ingresar". Al presionarlo:

- Lleva a una pantalla simple (o un formulario que se despliega en el mismo lugar) que pide el correo y tiene un botón **"Enviar correo de recuperación"**.
- Al enviarlo, llama a `supabase.auth.resetPasswordForEmail(correo, { redirectTo: '<url>/auth/actualizar-clave' })` (o el nombre de ruta que se use, a criterio de la implementación) — Supabase se encarga de mandar el correo con el link de recuperación, no hace falta armar la plantilla de correo a mano (queda con la plantilla por defecto de Supabase Auth, salvo que más adelante se pida personalizarla).
- Muestra una confirmación en español tras enviarlo, por ejemplo **"Si el correo existe, te enviamos un enlace para restablecer tu contraseña."** — usa ese texto genérico (sin confirmar si el correo existe o no en el sistema) por seguridad, para no revelar qué correos están registrados.
- Crea la ruta de destino del link del correo (`/auth/actualizar-clave` o el nombre elegido arriba) con un formulario para ingresar la **nueva contraseña** (dos veces, con confirmación) y guardarla vía `supabase.auth.updateUser({ password })`, usando la sesión temporal que Supabase deja activa al entrar desde ese link. Al guardar con éxito, redirige al login con un mensaje de confirmación en español (**"Contraseña actualizada. Ya puedes iniciar sesión."**).
- Todos los textos de esta nueva pantalla/flujo van en español, mismo criterio del punto anterior.

## 9. Seguridad y manejo de credenciales

Regla general, válida durante todo el desarrollo: **ningún token, API key, contraseña o credencial se escribe en código fuente ni en ningún archivo que vaya a versionarse en git.** Todo secreto vive en variables de entorno.

**Variables de entorno de la app** (`.env.local` en desarrollo; variables de entorno del proveedor de hosting en producción — nunca commiteadas):

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: diseñadas por Supabase para exponerse en el cliente (llevan el prefijo `NEXT_PUBLIC_` a propósito), pero aun así deben venir de `.env.local`, nunca hardcodeadas en un componente.
- `SUPABASE_SERVICE_ROLE_KEY` (solo si el proyecto la necesita, p. ej. para operaciones administrativas desde el servidor): **nunca** debe usarse en un Client Component ni en cualquier código que se ejecute en el navegador, y **nunca** debe llevar el prefijo `NEXT_PUBLIC_`. Solo en Server Components, Route Handlers o Server Actions.
- Credenciales del proveedor de correo (§8) y cualquier otro secreto futuro: mismo tratamiento.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `CRON_SECRET` (§3.1, aviso automático por WhatsApp): mismo tratamiento — solo se leen desde el Route Handler del cron (server-only), nunca en un Client Component ni con prefijo `NEXT_PUBLIC_`.
- Crea un `.env.example` versionado en git, con los nombres de las variables sin valores reales, para documentar qué se necesita sin exponer nada.

**El token de Supabase en `.mcp.json`** es aparte: lo usa Claude Code/el MCP para administrar la base de datos, no la aplicación en sí, y no se despliega — pero igual debe estar en `.gitignore` (ver §10, ya lo está en este repo).

**Antes de cada commit:**

- Revisa `git diff --cached` buscando patrones típicos de secretos (`sbp_`, `sk-`, `eyJ` de un JWT, `Bearer `, contraseñas, URLs con credenciales embebidas). Si aparece algo así, no commitees — sácalo del archivo y muévelo a una variable de entorno primero.
- Confirma que `.gitignore` cubre al menos: `.env*`, `.mcp.json`, `.mcp-memory.json`, `*.pem`, `*.key`.

**Antes de cada `git push`:**

- No basta con que el commit actual esté limpio: si algún secreto quedó en un commit anterior, sigue en el historial aunque hoy el archivo esté bien. Antes del primer push de este proyecto, revisa el historial completo (`git log --all -p` filtrando por los mismos patrones de arriba, o con una herramienta como `gitleaks` si está disponible) para descartar que algo se haya colado antes.
- Si detectas que un secreto ya fue commiteado (en cualquier commit, viejo o nuevo) o ya se subió a GitHub, **detente y avisa al usuario explícitamente antes de continuar** — hay que rotar esa credencial desde el proveedor correspondiente (Supabase, proveedor de correo, etc.); borrarla del archivo no la invalida, sigue expuesta en el historial de git.

## 10. Estado del repositorio al iniciar este blueprint

Este repo ya tenía, antes de este documento: scaffold de `create-next-app` (Next 16.3.3 / React 19.2.8 / Tailwind v4), git inicializado, y `.mcp.json` con los servidores `supabase` (con un access token) y `memory` configurados.

- **Seguridad:** `.mcp.json` ya está en `.gitignore` con la nota "contains secrets / access tokens". Antes de seguir trabajando, corre `git log --all -- .mcp.json` para confirmar que ese archivo nunca quedó en un commit previo a que se agregara al gitignore. Si aparece en el historial, rota el token de Supabase desde el dashboard (Account → Access Tokens) — el `.gitignore` no borra el historial ya escrito.
- El `CLAUDE.md` original de este repo (previo a este blueprint) especificaba solo el listado con alerta de vencimiento y botón de WhatsApp, sin backend. Ese alcance queda absorbido y ampliado por este documento completo — no es necesario mantenerlo aparte.
- Hay un servidor MCP `memory` configurado apuntando a `./.mcp-memory.json` con notas de esa spec anterior (referenciadas como `memory/alerta-vencimiento-whatsapp.md` en el CLAUDE.md original). Revísalo antes de descartarlo por si tiene contexto útil adicional no capturado aquí.

## 11. Datos de prueba (seed) para poblar el dashboard y probar paginación/filtros/gráficos

**Nueva funcionalidad, es una tarea de una sola vez sobre la base de datos de desarrollo — no es parte de la app en producción:** hoy hay pocos tickets de prueba (todos con datos tipo `gggg77`, `empresa1`, etc.) y no alcanza para ver bien las tarjetas, la paginación de 15 filas (§2.6), los filtros de mes/estado/supervisor, ni los gráficos del dashboard analítico (§2.11). Genera datos de prueba realistas en volumen:

- **10 supervisores nuevos**, con nombre genérico consecutivo: **"Supervisor 1"** hasta **"Supervisor 10"** (`personal.nombre`), rol `supervisor`, `activo = true`. Insértalos **directo en `personal` por SQL/script**, no a través del flujo de invitación de §2.10 (no son personas reales, no hace falta mandarles un correo de invitación) — déjalos con `user_id = null` (van a quedar como "Invitación pendiente" en la tabla "Usuarios", lo cual está bien, no van a iniciar sesión nunca). Dales un `email` y `telefono` únicos y con formato reconocible como dato de prueba (por ejemplo `supervisor1@seed.cordilleramyp.local`, teléfono `56900000001`, `56900000002`, ...) para que no choquen con datos reales ni con la unicidad de `user_id`/columnas si aplica.
- **Unas 20 inspecciones (tickets) por cada mes, desde enero de 2026 hasta el mes actual** (agosto 2026 al momento de escribir esto — ajusta al mes en que efectivamente se corra el script) — unos 8 meses × 20 = ~160 tickets nuevos, sumados a los que ya existen.
- **`created_at` de cada ticket debe quedar realmente en el mes que le corresponde** (no todos con la fecha de hoy) — como la columna tiene `default now()`, el script tiene que **pisar ese default a propósito** con una fecha/hora dentro del mes objetivo (día y hora pueden ser aleatorios dentro del mes). Usa esa misma fecha (o una muy cercana) para el campo `fecha` (fecha de inspección, §1) del ticket y de su primera revisión.
- **Reparte las inspecciones en partes distintas entre los supervisores** (los 10 nuevos + los que ya existen) — no en partes iguales, algunos supervisores deben quedar con bastantes más inspecciones que otros, para que se vea una distribución realista en el gráfico de dona y en la tabla de estadísticas por supervisor de §2.11 (por ejemplo, unos pocos supervisores concentrando gran parte de las inspecciones de un mes, y el resto con pocas).
- **Puedes replicar el patrón de las inspecciones que ya existen** (mismo estilo de datos de prueba: patentes tipo `gggg77`/`hjhk22`, nombres de transporte tipo `empresa1`/`CMPC`, conductores genéricos, tipos de camión y procedencias ya usados) — consulta primero los valores distintos que ya existen en `tickets` (`transporte`, `patente_camion`, `patente_rampla`, `tipo_camion`, `procedencia`, `conductor`) y reutilízalos/varíalos, no hace falta inventar un dataset totalmente nuevo ni con apariencia de datos reales de producción.
- **Cada ticket necesita su registro completo, no solo la fila de `tickets`:** al menos una fila en `ticket_revisiones` (revisión 1, con `numero_revision = 1`, firmas y `fecha_vencimiento` — puede ser un placeholder de imagen para las firmas, no hace falta generar trazos reales) y sus 18 filas en `ticket_checklist_respuestas` (usa las mismas `key` de `checklist_items` ya sembradas, §2.4). Para los ítems `no_conforme`, la columna `foto_url` no puede quedar `null` (constraint `foto_obligatoria_si_no_conforme`, §2.7) — usa una única imagen placeholder (por ejemplo súbela una vez al bucket `fallas` de Storage, o usa una URL pública de un servicio de placeholder tipo `https://placehold.co/`) y reutiliza esa misma URL en todos los ítems `no_conforme` sembrados, no hace falta una foto real distinta por cada uno.
- **Distribución de estados, para que el dashboard se vea realista y no roto:** la mayoría de los tickets de meses ya pasados (enero a junio, por ejemplo) deberían quedar **cerrados** (`finalizada_sin_observaciones`, o `finalizada_con_observaciones` ya con su reinspección posterior que los cierra) — evita dejar decenas de tickets viejos abiertos con `finalizada_con_observaciones` sin resolver, porque eso infla artificialmente la tarjeta "Vencidos" y "En reparación" con casos de hace meses, que se ve poco creíble. Deja la mayor concentración de estados variados (`en_revision`, `finalizada_con_observaciones` sin reinspeccionar todavía, y algunos con `fecha_vencimiento` a propósito cerca de las próximas 24h/48h) en el **mes más reciente** (agosto), para poder probar de verdad las alertas de vencimiento (§3), el botón/ícono "Notificar por WhatsApp", y el aviso automático de §3.1.
- **Implementación sugerida:** un script de una sola corrida, por ejemplo `scripts/seed-demo-data.ts`, usando `@supabase/supabase-js` autenticado con `SUPABASE_SERVICE_ROLE_KEY` (mismo tratamiento de secreto que el resto — nunca hardcodeado, se lee de `.env.local`) para poder saltarse RLS al insertar. Es una herramienta de desarrollo, no algo que corra en producción ni en cada deploy — no lo agregues a ningún proceso automático de build/deploy, y dejá un comentario bien visible al inicio del archivo advirtiendo que solo debe correrse contra la base de datos de desarrollo/pruebas, nunca contra producción con datos reales de la empresa.
- Al terminar, confirma con un par de consultas rápidas (conteo de tickets por mes, conteo por supervisor) que la distribución quedó como se pidió, antes de darlo por hecho.

### 11.1 Cuentas de supervisor de prueba, con clave fija, para poder loguearse como distintos supervisores durante testing manual

**Nueva funcionalidad — distinta del punto anterior:** los 10 "Supervisor 1"–"Supervisor 10" de §11 se crean **a propósito sin login** (`user_id = null`, nunca inician sesión) porque solo existen para rellenar los gráficos y tarjetas del dashboard con volumen de datos. Pero para probar en vivo escenarios que necesitan **iniciar sesión como distintos supervisores reales** (por ejemplo, los bugs de §2.6/§2.14 sobre re-inspección entre supervisores distintos), hace falta un juego aparte de cuentas que sí puedan loguearse, con una clave conocida de antemano — no depender de que cada una reciba un correo de invitación real.

- **Crea 3 supervisores de prueba con login real y clave fija:**

  | Nombre | Apellido | Correo | Clave |
  |---|---|---|---|
  | Supervisor | Prueba 1 | `supervisor.prueba1@test.cordilleramyp.local` | `Prueba#2026` |
  | Supervisor | Prueba 2 | `supervisor.prueba2@test.cordilleramyp.local` | `Prueba#2026` |
  | Supervisor | Prueba 3 | `supervisor.prueba3@test.cordilleramyp.local` | `Prueba#2026` |

  Usa un dominio distinto al de los 10 de §11 (`@test.cordilleramyp.local`, no `@seed.cordilleramyp.local`) para que quede claro a simple vista, mirando la tabla "Usuarios", cuáles son cuentas que sí se pueden usar para loguearse y cuáles no. Teléfono y fecha de nacimiento: cualquier valor de prueba válido, mismo criterio que §11 (por ejemplo `56900001001`, `56900001002`, `56900001003`, y una fecha de nacimiento cualquiera mayor de edad).

- **Implementación — sigue el mismo patrón de cuentas del panel "Usuarios" (§2.10), no lo saltees:** primero inserta (o confirma que ya exista) la fila en `personal` para cada correo, con `rol = 'supervisor'`, `activo = true` y `user_id = null` (pendiente) — igual que deja una invitación real antes de ser aceptada. Recién después, para cada una, llama a `supabaseAdmin.auth.admin.createUser({ email, password: 'Prueba#2026', email_confirm: true })` (con `SUPABASE_SERVICE_ROLE_KEY`, mismo tratamiento de secreto que el resto de este documento) — esto crea el usuario de Supabase Auth ya confirmado, sin mandar ningún correo, y dispara el mismo trigger `handle_new_user` (§2.10/§8) que enlaza esa cuenta nueva con la fila pendiente de `personal` por el correo, dejándola lista para loguearse de inmediato con la clave fija de arriba — sin que el correo `.local` tenga que existir ni recibir nada de verdad.
- **Idempotente:** si el script se corre más de una vez, no debe duplicar ni fallar — si el correo ya existe en `personal`/`auth.users`, sáltalo (o avisa que ya existe) en vez de reventar toda la corrida.
- **Mismo tratamiento que el script de §11: es una herramienta de desarrollo, nunca para producción.** Agrégalo como un script aparte, por ejemplo `scripts/seed-test-accounts.ts` (no lo mezcles con `seed-demo-data.ts`, tienen propósitos distintos), con la misma advertencia bien visible al inicio del archivo sobre no correrlo nunca contra la base de datos de producción.
- **Al terminar, el script debe imprimir por consola las 3 credenciales** (correo + la clave fija) para copiarlas fácil, y confirmar con una consulta que las 3 quedaron con `user_id` no nulo en `personal` (es decir, realmente enlazadas y listas para loguearse), no solo creadas del lado de Auth.

**Bug reportado al probar — al intentar entrar con `supervisor.prueba1@test.cordilleramyp.local` aparece "Failed to fetch" en el login, mientras que con la cuenta normal del usuario sí funciona:** "Failed to fetch" es un error de **conexión del navegador** (el `fetch()` nunca llegó a completarse), no un error de credenciales inválidas — eso normalmente se ve cuando la llamada a la API de Supabase Auth falla a nivel de red/CORS, no cuando el correo o la clave están mal. Como con la cuenta habitual del usuario el login funciona bien (mismo navegador, mismo código de la pantalla de login), el problema no es genérico del formulario — investiga puntualmente esta cuenta:

1. **Confirma que el script de arriba realmente terminó bien para `supervisor.prueba1`:** corre una consulta directa (vía el MCP de Supabase) sobre `auth.users` filtrando por ese correo — ¿existe la fila? ¿tiene `email_confirmed_at` seteado? Y sobre `personal` — ¿existe la fila con ese correo, y quedó con `user_id` **no nulo** (es decir, realmente enlazada por el trigger `handle_new_user`)? Si el script reportó éxito pero alguno de estos dos quedó a medias, ahí está la causa — corrige el script para que sea realmente atómico (si falla el enlace, que lo reporte como error, no como éxito).
2. **Revisa los logs de Supabase Auth** (en el dashboard del proyecto, sección Logs/Auth Logs) buscando el intento de login de ese correo — ahí debería aparecer el motivo real del rechazo (a diferencia de "Failed to fetch", que es solo lo que ve el navegador cuando la respuesta nunca llega bien formada, por ejemplo un error 500 del lado de Supabase sin headers CORS, que el navegador reporta como fallo de red genérico en vez de mostrar el error real).
3. **Verifica en el navegador (pestaña Network de las herramientas de desarrollador, F12), reproduciendo el intento de login con esta cuenta:** busca la petición que falla (normalmente a `.../auth/v1/token?grant_type=password`) y revisa qué código de estado devuelve y el cuerpo de la respuesta, si el navegador llega a mostrarlo — eso da el error real detrás de "Failed to fetch".
4. Si el diagnóstico confirma que el problema es que `email_confirm: true` no alcanza para que esta cuenta quede utilizable, o que el dominio `.local` causa algún rechazo del lado de Supabase, ajusta el script (por ejemplo, confirmando el correo con un paso extra tras `createUser`, o usando un dominio distinto si `.local` resulta ser el problema) y vuelve a correrlo para las 3 cuentas.
