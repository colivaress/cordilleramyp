@AGENTS.md

---

# Cordillera M&P — Revisión de Equipos y Camiones
## Blueprint de ingeniería para ejecución en Claude Code

Este documento es la especificación completa del proyecto y **reemplaza y absorbe** la spec anterior y más acotada que existía en este `CLAUDE.md` (enfocada solo en el listado con alerta de vencimiento y WhatsApp). Esa spec previa no se descarta: sus detalles concretos de implementación (modelo de estado derivado, construcción del enlace `wa.me`) quedan integrados en la sección 3 de este documento, que ahora es la fuente de verdad única para todo el proyecto.

Ejecuta el desarrollo de principio a fin siguiendo este orden: (1) scaffold del proyecto, (2) esquema de base de datos en Supabase, (3) componentes y lógica de negocio, (4) notificaciones y reportes. No te detengas a pedir confirmación entre secciones salvo que falte una credencial o decisión de negocio explícitamente marcada como pendiente más abajo.

**Stack instalado en este repo** (ver `package.json`): Next.js `16.3.3` (App Router), React `19.2.8`, Tailwind CSS `^4`, TypeScript `^5`, ESLint `9`. Supabase (PostgreSQL + Storage) como backend.

> ⚠️ Next.js 16 tiene breaking changes respecto a versiones anteriores más conocidas. Antes de escribir código de rutas, layouts o data fetching, revisa las guías en `node_modules/next/dist/docs/` (indicado también en `AGENTS.md`, importado arriba).

**Restricción de formato de salida:** el "Informe de Inspección de Flota" que genera la app (sección 4) no debe incluir códigos documentales ni números de versión de ningún tipo (nada de "Doc-ID", "Rev. 00", "Versión 1.2", etc.). Es el único lugar del proyecto donde aplica esta restricción; no afecta al versionado normal del código (git, package.json, etc.).

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

---

## 2. Roles, ciclo de vida del ticket y checklist de 18 elementos

### 2.1 Roles

- **Supervisor**: crea tickets, ejecuta inspecciones, completa el checklist, captura las dos firmas digitales (conductor y fiscalizador), sube fotos de fallas.
- **Administrador**: ve el dashboard con todos los tickets, recibe alertas de vencimiento, gestiona el envío de informes por correo.
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
- Cuando el taller marca que está trabajando en las fallas, el estado pasa a `EN_REPARACION_DE_OBSERVACIONES`.
- Cuando el supervisor vuelve a inspeccionar (así sea para revisar una sola falla subsanada), el ticket vuelve a `EN_REVISION` y su contador `revision_actual` sube en +1 ("Revisión #2", "Revisión #3", ...). Esto se repite hasta que **todas** las fallas queden limpias y el ticket alcance `FINALIZADA_SIN_OBSERVACIONES`.
- Cada paso por `EN_REVISION` crea una fila nueva en `ticket_revisiones` (ver esquema) — así queda historial completo de qué se evaluó en cada vuelta, quién firmó y qué fallas seguían abiertas.

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
- `fecha_vencimiento` a nivel de ítem (ver §3)

### 2.5 Firmas digitales

En la pantalla de cierre de cada revisión (cada vez que el ticket pasa por `EN_REVISION`) se muestran **dos áreas de firma independientes**, una etiquetada "Firma Conductor" y otra "Firma Fiscalizador/Supervisor". Implementación:

- Componente `SignaturePad` reutilizable basado en un `<canvas>` (librería `signature_pad` o `react-signature-canvas`), con botón "Limpiar" y captura por mouse/touch.
- Al guardar la revisión, cada firma se exporta a PNG (`toDataURL`), se sube a Supabase Storage (bucket `firmas`, ruta `ticket_id/revision_numero/conductor.png` y `.../fiscalizador.png`) y se guarda la URL pública/firmada en `ticket_revisiones.firma_conductor_url` y `firma_fiscalizador_url`.
- Ambas firmas son obligatorias para poder cerrar la revisión (deshabilita el botón "Finalizar revisión" hasta que las dos tengan trazo).
- El informe (§4) debe renderizar ambas imágenes de firma junto al nombre de cada firmante y la fecha/hora de la revisión correspondiente.

---

## 3. Fecha de vencimiento y alertas automáticas

- Si al cerrar el checklist queda al menos un ítem `no_conforme`, el formulario exige `fecha_vencimiento` (timestamp) **por cada ítem no conforme**, además de la foto de la falla (§2.4). El ticket expone también una `fecha_vencimiento` "efectiva" = la más próxima entre todos sus ítems abiertos (calculada, no se pide de nuevo a nivel ticket).
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
- **Botón "Notificar Vencimiento por WhatsApp":** solo se renderiza/habilita cuando el ticket está en estado "por vencer" o "vencido". Abre un **deep link nativo de WhatsApp** (`target="_blank"`, `rel="noopener noreferrer"`) construido así:

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

  `supervisor.telefono` sale de la tabla `personal`, en formato internacional solo con dígitos (sin `+` ni espacios). La plantilla de `construirMensajeVencimiento` debe detallar como mínimo: ID del ticket, Patente Camión, Patente Rampla, fallas detectadas y tiempo restante.
- **Botón de alerta por correo:** dispara el envío de un correo (mismo contenido que el mensaje de WhatsApp, en formato HTML) a los destinatarios configurados para alertas (puede ser el mismo selector multi-destinatario de §4, o una lista fija de "responsables de flota" — decisión de negocio: usa el mismo selector para no duplicar UI).
- Registra cada envío (WhatsApp abierto / correo enviado) en la tabla `notificaciones` para trazabilidad, aunque el envío de WhatsApp en sí ocurra en el cliente del usuario (no hay API de WhatsApp Business en el MVP).

---

## 4. Informe digital

Genera una vista imprimible/exportable "Informe de Inspección de Flota - Cordillera M&P" en `/tickets/[id]/report`, con:

- Cabecera completa (§1) + ID del ticket + número de revisión actual + estado.
- Los 18 elementos del checklist con su resultado (Conforme/No conforme/No aplica), observación y foto cuando aplique.
- Las dos firmas digitales (imagen + nombre + timestamp) de la revisión correspondiente.
- Sin códigos documentales ni números de versión (ver restricción global al inicio del documento).
- Botón "Enviar por correo" que abre un selector **multi-destinatario** poblado desde la tabla `destinatarios_correo` (checkboxes, no un solo `<select>`), permite tildar varios antes de confirmar el envío, y adjunta el informe (PDF o HTML) a todos los seleccionados en un solo envío.

---

## 5. Estructura del proyecto

```
/app
  /dashboard/page.tsx              → listado de tickets + resaltado por vencimiento (admin)
  /tickets/new/page.tsx            → cabecera + checklist + firmas (supervisor)
  /tickets/[id]/page.tsx           → detalle, historial de revisiones
  /tickets/[id]/report/page.tsx    → informe imprimible + envío por correo
/components
  ChecklistItemRow.tsx             → fila del checklist (selector + botón info)
  InfoPopover.tsx                  → popup con el texto de exigencia
  SignaturePad.tsx                 → captura de firma en canvas (reutilizado x2)
  TicketStatusBadge.tsx
  CountdownBadge.tsx               → resaltado por horas restantes
  WhatsAppNotifyButton.tsx
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
  nombre text not null,
  rol rol_usuario not null,
  telefono text,
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
  fecha_vencimiento timestamptz, -- vencimiento efectivo (mínimo entre ítems abiertos)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HISTORIAL DE REVISIONES (una fila por cada paso por EN_REVISION)
create table ticket_revisiones (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  numero_revision int not null,
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
  fecha_vencimiento_item timestamptz,
  created_at timestamptz not null default now(),
  foreign key (ticket_id, revision_numero) references ticket_revisiones(ticket_id, numero_revision) on delete cascade,
  constraint foto_y_vencimiento_obligatorios_si_no_conforme check (
    estado <> 'no_conforme' or (foto_url is not null and fecha_vencimiento_item is not null)
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

- Proveedor de envío de correo (Resend, SendGrid, SMTP propio, etc.) y sus credenciales.
- Si el envío de WhatsApp queda solo como enlace `wa.me` (manual, como pide el prompt original) o si en el futuro se integra WhatsApp Business API.
- Autenticación de usuarios (Supabase Auth con roles, o login simple por PIN) — no estaba especificado en el requerimiento original.
- **Logo de Cordillera M&P:** se generará más adelante con el MCP de Replicate (ya conectado en este entorno) y se integrará en el header de la app y en el informe (§4). No es parte de esta primera construcción — no bloquear el desarrollo por esto ni generar un logo placeholder improvisado; usa por ahora solo el nombre de la empresa en texto donde corresponda un logo.

## 9. Seguridad y manejo de credenciales

Regla general, válida durante todo el desarrollo: **ningún token, API key, contraseña o credencial se escribe en código fuente ni en ningún archivo que vaya a versionarse en git.** Todo secreto vive en variables de entorno.

**Variables de entorno de la app** (`.env.local` en desarrollo; variables de entorno del proveedor de hosting en producción — nunca commiteadas):

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: diseñadas por Supabase para exponerse en el cliente (llevan el prefijo `NEXT_PUBLIC_` a propósito), pero aun así deben venir de `.env.local`, nunca hardcodeadas en un componente.
- `SUPABASE_SERVICE_ROLE_KEY` (solo si el proyecto la necesita, p. ej. para operaciones administrativas desde el servidor): **nunca** debe usarse en un Client Component ni en cualquier código que se ejecute en el navegador, y **nunca** debe llevar el prefijo `NEXT_PUBLIC_`. Solo en Server Components, Route Handlers o Server Actions.
- Credenciales del proveedor de correo (§8) y cualquier otro secreto futuro: mismo tratamiento.
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
