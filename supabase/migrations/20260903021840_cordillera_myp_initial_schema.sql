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
  fecha timestamptz not null,
  procedencia text not null,
  tipo_camion text not null,
  patente_camion text not null,
  patente_rampla text not null,
  estado ticket_estado not null default 'en_revision',
  revision_actual int not null default 1,
  supervisor_id uuid references personal(id),
  fecha_vencimiento timestamptz,
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
