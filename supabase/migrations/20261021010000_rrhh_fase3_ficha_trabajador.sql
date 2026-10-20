-- Módulo RRHH — Fase 3: ficha del trabajador (spec RRHH §8, §16).
--
-- Reglas de acceso, las mismas de las fases 0–2:
--   - Datos de UN trabajador (ficha, remuneración, jornada asignada,
--     documentos): leen private.puede_ver_rrhh(personal_id) = administrador,
--     administrador de contrato y el propio trabajador.
--   - Configurarlos (ficha, jornada, documentos): administrador y
--     administrador de contrato ("Crear y configurar trabajadores", §2).
--   - MONTOS de remuneración: solo private.es_admin().
-- Ningún helper consulta la misma tabla de su política (lección de
-- 20260908221710): todos consultan `personal` u otra tabla.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. Jornada ordinaria legal como parámetro del período (§8: 42 h hoy por
--    la Ley 21.561, en transición a 40; va a volver a cambiar). Nullable
--    para no romper si ya hay períodos cargados; la app exige el valor al
--    leer el período (desdeBase lo marca incompleto), así que falta = error,
--    nunca un default.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.rrhh_parametros_periodo
  add column jornada_ordinaria_horas numeric(4, 1)
    check (jornada_ordinaria_horas > 0 and jornada_ordinaria_horas <= 60);

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Ficha: datos contractuales y previsionales (no montos de sueldo).
-- ─────────────────────────────────────────────────────────────────────────
create type public.rrhh_tipo_contrato as enum ('indefinido', 'plazo_fijo', 'obra_faena');
create type public.rrhh_sistema_salud as enum ('fonasa', 'isapre');

create table public.rrhh_fichas (
  personal_id uuid primary key references public.personal(id) on delete restrict,
  -- Forma canónica de src/lib/rut.ts: dígitos + verificador, sin puntos ni guion.
  rut text not null unique check (rut ~ '^[0-9]{7,8}[0-9K]$'),
  cargo text not null check (length(trim(cargo)) > 0),
  area text,
  fecha_ingreso date not null,
  tipo_contrato public.rrhh_tipo_contrato not null,
  fecha_termino_contrato date,
  afp public.rrhh_afp not null,
  sistema_salud public.rrhh_sistema_salud not null,
  isapre text,
  -- Plan pactado con la Isapre, en UF (el descuento real es el mayor entre
  -- esto y el 7% legal, §4). Solo con Isapre.
  plan_isapre_uf numeric(8, 4) check (plan_isapre_uf > 0),
  afecto_afc boolean not null default true,
  cargas_familiares smallint not null default 0 check (cargas_familiares between 0 and 30),
  -- Desvinculación = baja lógica (§16.8): la ficha y su historia no se borran.
  fecha_desvinculacion date,
  motivo_desvinculacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.personal(id),

  check (tipo_contrato <> 'plazo_fijo' or fecha_termino_contrato is not null),
  check (tipo_contrato <> 'indefinido' or fecha_termino_contrato is null),
  check (fecha_termino_contrato is null or fecha_termino_contrato >= fecha_ingreso),
  check ((sistema_salud = 'isapre') = (isapre is not null and plan_isapre_uf is not null)),
  check ((fecha_desvinculacion is null) = (motivo_desvinculacion is null)),
  check (fecha_desvinculacion is null or fecha_desvinculacion >= fecha_ingreso)
);

alter table public.rrhh_fichas enable row level security;
revoke all on public.rrhh_fichas from anon;

create policy rrhh_fichas_select on public.rrhh_fichas
  for select to authenticated
  using (private.puede_ver_rrhh(personal_id));

create policy rrhh_fichas_insert on public.rrhh_fichas
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

create policy rrhh_fichas_update on public.rrhh_fichas
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Remuneración base: SOLO SE AGREGA (§16.3). Cada cambio es una fila
--    nueva con su vigencia, autor y comentario; ninguna se edita. Así esta
--    tabla ES el historial de sueldo y no hace falta una segunda tabla que
--    repita los mismos datos (y se desincronice). Una corrección del mismo
--    mes es otra fila con la misma vigente_desde: vale la registrada último.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.rrhh_remuneracion_base
  add column colacion bigint not null default 0 check (colacion >= 0),
  add column movilizacion bigint not null default 0 check (movilizacion >= 0),
  add column comentario text;

alter table public.rrhh_remuneracion_base
  drop constraint rrhh_remuneracion_base_personal_id_vigente_desde_key;

drop policy rrhh_remuneracion_base_update on public.rrhh_remuneracion_base;

create index rrhh_remuneracion_base_vigencia_idx
  on public.rrhh_remuneracion_base (personal_id, vigente_desde desc, created_at desc);

-- Historial (§16.3) como vista, no como tabla: valor anterior = la fila
-- registrada justo antes para el mismo trabajador. security_invoker: aplica
-- la RLS de rrhh_remuneracion_base de quien consulta.
create view public.rrhh_historial_sueldo
with (security_invoker = true) as
select
  r.id,
  r.personal_id,
  r.vigente_desde,
  r.created_at,
  r.created_by,
  r.comentario,
  r.liquido_pactado,
  r.colacion,
  r.movilizacion,
  lag(r.liquido_pactado) over w as liquido_pactado_anterior,
  lag(r.colacion) over w as colacion_anterior,
  lag(r.movilizacion) over w as movilizacion_anterior
from public.rrhh_remuneracion_base r
window w as (partition by r.personal_id order by r.created_at, r.id);

revoke all on public.rrhh_historial_sueldo from anon;
grant select on public.rrhh_historial_sueldo to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Jornadas (§8): patrones + asignación por trabajador con historial.
--    El horario de un patrón NO se puede cambiar (trigger): cambiarlo
--    reescribiría los meses ya liquidados de todos sus trabajadores. Para
--    otro horario se crea otro patrón y se asigna desde una fecha.
-- ─────────────────────────────────────────────────────────────────────────
create table public.rrhh_jornadas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  -- [{dia: 1..7 (lunes..domingo), entrada: "HH:MM", salida: "HH:MM",
  --   colacion_minutos: int}], validado por src/lib/rrhh/jornadas.ts.
  dias jsonb not null check (jsonb_typeof(dias) = 'array' and jsonb_array_length(dias) > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.personal(id)
);

create or replace function private.rrhh_jornada_dias_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dias is distinct from old.dias then
    raise exception 'El horario de una jornada no se puede modificar: crea una jornada nueva y asígnala desde una fecha.';
  end if;
  return new;
end;
$$;

create trigger rrhh_jornadas_dias_inmutables
  before update on public.rrhh_jornadas
  for each row execute function private.rrhh_jornada_dias_inmutables();

create table public.rrhh_jornada_trabajador (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal(id) on delete restrict,
  jornada_id uuid not null references public.rrhh_jornadas(id) on delete restrict,
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.personal(id)
);

create index rrhh_jornada_trabajador_vigencia_idx
  on public.rrhh_jornada_trabajador (personal_id, vigente_desde desc, created_at desc);

alter table public.rrhh_jornadas enable row level security;
alter table public.rrhh_jornada_trabajador enable row level security;
revoke all on public.rrhh_jornadas from anon;
revoke all on public.rrhh_jornada_trabajador from anon;

-- El trabajador ve los patrones que tiene o tuvo asignados (para "Mis
-- datos"). El exists consulta OTRA tabla (con su propia RLS): seguro.
create policy rrhh_jornadas_select on public.rrhh_jornadas
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or exists (
      select 1 from public.rrhh_jornada_trabajador jt
      where jt.jornada_id = rrhh_jornadas.id
        and jt.personal_id = private.personal_id()
    )
  );

create policy rrhh_jornadas_insert on public.rrhh_jornadas
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

create policy rrhh_jornadas_update on public.rrhh_jornadas
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

create policy rrhh_jornada_trabajador_select on public.rrhh_jornada_trabajador
  for select to authenticated
  using (private.puede_ver_rrhh(personal_id));

-- Solo se agrega (mismo criterio que la remuneración): sin update ni delete.
create policy rrhh_jornada_trabajador_insert on public.rrhh_jornada_trabajador
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Documentos (§16.1, §16.2)
-- ─────────────────────────────────────────────────────────────────────────
create table public.rrhh_tipos_documento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index rrhh_tipos_documento_nombre_idx
  on public.rrhh_tipos_documento (lower(nombre));

-- Catálogo inicial del sistema de referencia (§16.1), SIN "Certificado de
-- antecedentes": son antecedentes penales y la operación no los necesita
-- (§16.2). Si el cliente los pide, se decide aparte quién los ve.
insert into public.rrhh_tipos_documento (nombre, orden) values
  ('Contrato de trabajo', 1),
  ('Anexo de contrato', 2),
  ('Cédula de identidad', 3),
  ('Certificado de estudios', 4),
  ('Currículum', 5),
  ('Liquidación de sueldo', 6),
  ('Amonestación', 7),
  ('Otros', 8);

create table public.rrhh_documentos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal(id) on delete restrict,
  tipo_id uuid not null references public.rrhh_tipos_documento(id) on delete restrict,
  nombre_archivo text not null,
  -- Ruta en el bucket documentos-rrhh; la primera carpeta es el personal_id.
  ruta text not null unique check (ruta like personal_id::text || '/%'),
  tamano_bytes bigint not null check (tamano_bytes > 0 and tamano_bytes <= 15728640),
  mime text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.personal(id)
);

create index rrhh_documentos_personal_idx on public.rrhh_documentos (personal_id);
create index rrhh_documentos_tipo_idx on public.rrhh_documentos (tipo_id);

alter table public.rrhh_tipos_documento enable row level security;
alter table public.rrhh_documentos enable row level security;
revoke all on public.rrhh_tipos_documento from anon;
revoke all on public.rrhh_documentos from anon;

-- Nombres de tipos: cualquiera con sesión (el trabajador los necesita para
-- ver sus propios documentos; no hay nada sensible en un nombre de tipo).
create policy rrhh_tipos_documento_select on public.rrhh_tipos_documento
  for select to authenticated
  using (true);

create policy rrhh_tipos_documento_insert on public.rrhh_tipos_documento
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

-- Baja lógica (activo = false), nunca delete.
create policy rrhh_tipos_documento_update on public.rrhh_tipos_documento
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

create policy rrhh_documentos_select on public.rrhh_documentos
  for select to authenticated
  using (private.puede_ver_rrhh(personal_id));

create policy rrhh_documentos_insert on public.rrhh_documentos
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

-- Bucket privado propio (§16.2). Nunca público: cédulas, contratos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-rrhh',
  'documentos-rrhh',
  false,
  15728640, -- 15 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do nothing;

-- Carpeta como TEXTO (igual que puede_ver_ticket): una ruta que no es uuid
-- simplemente no calza, en vez de reventar la política con un cast.
create or replace function private.puede_ver_rrhh_carpeta(p_carpeta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.es_admin()
    or private.es_admin_contrato()
    or p_carpeta = private.personal_id()::text;
$$;

revoke all on function private.puede_ver_rrhh_carpeta(text) from public, anon;
grant execute on function private.puede_ver_rrhh_carpeta(text) to authenticated;

create policy "rrhh documentos select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos-rrhh'
    and private.puede_ver_rrhh_carpeta((storage.foldername(name))[1])
  );

-- Subir: administrador y adm. de contrato. Sin update ni delete: un
-- documento cargado no se reemplaza ni se borra desde la app.
create policy "rrhh documentos insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-rrhh'
    and (private.es_admin() or private.es_admin_contrato())
  );

commit;
