-- Una sola ficha por persona: la cuenta (rol, tipos de inspección, correo)
-- pasa a administrarse desde la ficha de RRHH y /usuarios deja de existir.
-- Antes de fundir las pantallas, cuatro correcciones de modelo y permisos:
--
--   1. El RUT identifica a la PERSONA, no a su contrato: pasa de
--      rrhh_fichas a personal, con módulo 11 en la base.
--   2. cargo y area dejan de ser texto libre: catálogos con baja lógica.
--   3. rol y tipos de inspección: SOLO administrador. Una pantalla no es un
--      permiso: el administrador de contrato edita el resto de la ficha,
--      pero nunca el rol de nadie (incluido ascender a administrador).
--   4. activo / fecha_desvinculacion: la regla de cuál manda, en la base.
--
-- Ningún helper consulta la tabla de su propia política (lección de
-- 20260908221710).

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RUT en personal
-- ─────────────────────────────────────────────────────────────────────────

-- Espejo de digitoVerificador()/rutValido() de src/lib/rut.ts, sobre la
-- forma canónica (dígitos + verificador, sin puntos ni guion, K mayúscula).
create or replace function private.rut_valido(p_rut text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cuerpo text;
  v_suma integer := 0;
  v_mult integer := 2;
  v_resto integer;
begin
  if p_rut is null or p_rut !~ '^[0-9]{7,8}[0-9K]$' then
    return false;
  end if;
  v_cuerpo := left(p_rut, length(p_rut) - 1);
  for i in reverse length(v_cuerpo)..1 loop
    v_suma := v_suma + substr(v_cuerpo, i, 1)::integer * v_mult;
    v_mult := case when v_mult = 7 then 2 else v_mult + 1 end;
  end loop;
  v_resto := 11 - (v_suma % 11);
  return right(p_rut, 1) = case v_resto when 11 then '0' when 10 then 'K' else v_resto::text end;
end;
$$;

alter table public.personal
  add column rut text unique
    constraint personal_rut_valido check (rut is null or private.rut_valido(rut));

comment on column public.personal.rut is
  'RUT en forma canónica (src/lib/rut.ts). Identifica a la persona, no a su contrato. NO es legible con un select directo (ver los grants de columna más abajo): se lee con public.rrhh_ruts().';

update public.personal p
set rut = f.rut
from public.rrhh_fichas f
where f.personal_id = p.id;

alter table public.rrhh_fichas drop column rut;

-- personal_select deja leer la fila completa de un compañero a quien puede
-- ver un ticket suyo (limitación conocida, 20261020010000). El RUT no puede
-- quedar en esa rama: se quita el select de la columna y se lee solo por
-- una función con la misma regla de las tablas rrhh_* (puede_ver_rrhh).
-- Columnas legibles = todas menos rut. Una columna nueva de personal NO
-- queda legible hasta agregarla acá a propósito.
revoke select on public.personal from anon, authenticated;
grant select (
  id, nombre, rol, telefono, email, activo, created_at, user_id, apellido, fecha_nacimiento
) on public.personal to authenticated;

create or replace function public.rrhh_ruts()
returns table (personal_id uuid, rut text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.rut
  from public.personal p
  where p.rut is not null
    and private.puede_ver_rrhh(p.id);
$$;

comment on function public.rrhh_ruts() is
  'RUT de las personas que quien llama puede ver en RRHH: administrador y adm. de contrato todas, cualquier otro rol solo el propio. Misma regla que private.puede_ver_rrhh().';

revoke all on function public.rrhh_ruts() from public, anon;
grant execute on function public.rrhh_ruts() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Catálogos de cargo y área (mismo patrón que rrhh_tipos_documento):
--    baja lógica, nunca delete — una ficha histórica nunca apunta a nada.
--    Único sin distinguir mayúsculas: "Encarpador" y "ENCARPADOR" son uno.
-- ─────────────────────────────────────────────────────────────────────────
create table public.rrhh_cargos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0 and nombre = btrim(nombre)),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index rrhh_cargos_nombre_idx on public.rrhh_cargos (lower(nombre));

create table public.rrhh_areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0 and nombre = btrim(nombre)),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index rrhh_areas_nombre_idx on public.rrhh_areas (lower(nombre));

-- Valores ya escritos a mano (staging: cero fichas, pero la migración no lo
-- supone). Las variantes de mayúsculas se juntan en la primera.
insert into public.rrhh_cargos (nombre)
select distinct on (lower(btrim(cargo))) btrim(cargo)
from public.rrhh_fichas
order by lower(btrim(cargo)), btrim(cargo);

insert into public.rrhh_areas (nombre)
select distinct on (lower(btrim(area))) btrim(area)
from public.rrhh_fichas
where nullif(btrim(area), '') is not null
order by lower(btrim(area)), btrim(area);

alter table public.rrhh_fichas
  add column cargo_id uuid references public.rrhh_cargos(id) on delete restrict,
  add column area_id uuid references public.rrhh_areas(id) on delete restrict;

update public.rrhh_fichas f
set cargo_id = c.id
from public.rrhh_cargos c
where lower(c.nombre) = lower(btrim(f.cargo));

update public.rrhh_fichas f
set area_id = a.id
from public.rrhh_areas a
where lower(a.nombre) = lower(btrim(f.area));

alter table public.rrhh_fichas
  alter column cargo_id set not null,
  drop column cargo,
  drop column area;

create index rrhh_fichas_cargo_idx on public.rrhh_fichas (cargo_id);
create index rrhh_fichas_area_idx on public.rrhh_fichas (area_id);

alter table public.rrhh_cargos enable row level security;
alter table public.rrhh_areas enable row level security;
revoke all on public.rrhh_cargos from anon;
revoke all on public.rrhh_areas from anon;

-- Nombres de cargo y área: cualquiera con sesión (el trabajador los ve en
-- su propia ficha; un nombre de cargo no es sensible).
create policy rrhh_cargos_select on public.rrhh_cargos
  for select to authenticated using (true);
create policy rrhh_cargos_insert on public.rrhh_cargos
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());
create policy rrhh_cargos_update on public.rrhh_cargos
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

create policy rrhh_areas_select on public.rrhh_areas
  for select to authenticated using (true);
create policy rrhh_areas_insert on public.rrhh_areas
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());
create policy rrhh_areas_update on public.rrhh_areas
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Rol y tipos de inspección: solo administrador
-- ─────────────────────────────────────────────────────────────────────────

-- Crear: el administrador con cualquier rol; el adm. de contrato SOLO como
-- `trabajador` (el rol sin permisos operativos). Antes podía crear
-- supervisores y adm. de contrato: crear a alguien con un rol es asignarle
-- ese rol, y el rol ahora es solo del administrador.
drop policy if exists personal_insert on public.personal;
create policy personal_insert on public.personal
  for insert to authenticated
  with check (
    private.es_admin()
    or (private.es_admin_contrato() and rol = 'trabajador'::public.rol_usuario)
  );

-- personal_update no cambia: el adm. de contrato sigue sin poder tocar una
-- fila administrador ni dejar una fila como administrador. Lo que una
-- política NO puede expresar es "la columna rol no cambió" (no ve la fila
-- vieja en WITH CHECK): eso lo hace este trigger, para CUALQUIER cambio de
-- rol, no solo hacia administrador. Solo aplica a sesiones de la app
-- (current_user = authenticated); migraciones y scripts con service_role
-- no pasan por acá.
create or replace function private.personal_rol_solo_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol
     and current_user = 'authenticated'
     and not private.es_admin() then
    raise exception 'Solo un administrador puede cambiar el rol de una persona.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger personal_rol_solo_admin
  before update of rol on public.personal
  for each row execute function private.personal_rol_solo_admin();

-- Tipos de inspección: solo administrador (antes también adm. de contrato).
-- La lectura no cambia.
drop policy if exists pti_insert on public.personal_tipos_inspeccion;
create policy pti_insert on public.personal_tipos_inspeccion
  for insert to authenticated
  with check (private.es_admin());

drop policy if exists pti_update on public.personal_tipos_inspeccion;
create policy pti_update on public.personal_tipos_inspeccion
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

drop policy if exists pti_delete on public.personal_tipos_inspeccion;
create policy pti_delete on public.personal_tipos_inspeccion
  for delete to authenticated
  using (private.es_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 3-bis. Rol `trabajador`: revisión de políticas.
--    Un rol nuevo no hereda restricciones, hereda lo que las políticas no
--    previeron. Barrido de todas las tablas de public como trabajador
--    (scripts/prueba-rls-rrhh.mjs): ninguna escritura posible; la única
--    lectura de más eran los destinatarios de correo (nombres y correos de
--    contactos de la empresa), abiertos a cualquier sesión con `true`. Se
--    cierran a los roles operativos; los catálogos sin datos de personas
--    (checklist_items, tipos_inspeccion, transportes) quedan como están.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function private.es_operativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.personal
    where user_id = (select auth.uid())
      and rol in ('administrador', 'administrador_contrato', 'supervisor')
  );
$$;

comment on function private.es_operativo() is
  'Administrador, adm. de contrato o supervisor: los roles que operan inspecciones. Excluye a `trabajador` (y a cualquier rol futuro, que tiene que agregarse a propósito).';

revoke all on function private.es_operativo() from public, anon;
grant execute on function private.es_operativo() to authenticated;

drop policy if exists auth_read_destinatarios_correo on public.destinatarios_correo;
create policy destinatarios_correo_select on public.destinatarios_correo
  for select to authenticated
  using (private.es_operativo());

drop policy if exists destinatarios_correo_tipos_select on public.destinatarios_correo_tipos;
create policy destinatarios_correo_tipos_select on public.destinatarios_correo_tipos
  for select to authenticated
  using (private.es_operativo());

-- ─────────────────────────────────────────────────────────────────────────
-- 4. activo vs. fecha_desvinculacion — REGLA (no tocarlas por separado):
--
--    - rrhh_fichas.fecha_desvinculacion es el HECHO: cuándo dejó la empresa.
--    - personal.activo es la BANDERA DE ACCESO a la app.
--    - Desvincular y reincorporar se hacen SOLO con rrhh_desvincular() /
--      rrhh_reincorporar(), que escriben las dos en la misma transacción.
--    - Invariante, verificada al confirmar la transacción: una persona
--      desvinculada NUNCA tiene activo = true. Escribir una sin la otra
--      falla, en vez de dejar las pestañas y el acceso en desacuerdo.
--    - Lo contrario sí es válido: activo = false sin desvinculación es
--      "suspender el acceso" de alguien que sigue en la empresa (o que no
--      tiene ficha). Es el único otro camino que escribe activo.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function private.verificar_desvinculado_sin_acceso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(to_jsonb(new)->>'personal_id', to_jsonb(new)->>'id')::uuid;
begin
  if exists (
    select 1
    from public.rrhh_fichas f
    join public.personal p on p.id = f.personal_id
    where f.personal_id = v_id
      and f.fecha_desvinculacion is not null
      and p.activo
  ) then
    raise exception 'Una persona desvinculada no puede tener acceso a la app. Para devolvérselo, reincorpórala desde su ficha.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger personal_desvinculado_sin_acceso
  after insert or update of activo on public.personal
  deferrable initially deferred
  for each row execute function private.verificar_desvinculado_sin_acceso();

create constraint trigger rrhh_fichas_desvinculado_sin_acceso
  after insert or update of fecha_desvinculacion on public.rrhh_fichas
  deferrable initially deferred
  for each row execute function private.verificar_desvinculado_sin_acceso();

-- security invoker: cada update pasa por la RLS de quien llama. Si una de
-- las dos no alcanza a escribirse (sin ficha, o sin permiso sobre esa
-- persona), falla todo: nunca queda una sin la otra.
create or replace function public.rrhh_desvincular(p_personal_id uuid, p_fecha date, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Escribe el motivo de la desvinculación.' using errcode = 'check_violation';
  end if;

  update public.rrhh_fichas
  set fecha_desvinculacion = p_fecha,
      motivo_desvinculacion = btrim(p_motivo),
      updated_at = now(),
      updated_by = private.personal_id()
  where personal_id = p_personal_id;
  if not found then
    raise exception 'Primero hay que guardar el contrato de esta persona.' using errcode = 'no_data_found';
  end if;

  update public.personal set activo = false where id = p_personal_id;
  if not found then
    raise exception 'No tienes permiso para desvincular a esta persona.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.rrhh_reincorporar(p_personal_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.rrhh_fichas
  set fecha_desvinculacion = null,
      motivo_desvinculacion = null,
      updated_at = now(),
      updated_by = private.personal_id()
  where personal_id = p_personal_id;
  if not found then
    raise exception 'Esta persona no tiene contrato registrado.' using errcode = 'no_data_found';
  end if;

  update public.personal set activo = true where id = p_personal_id;
  if not found then
    raise exception 'No tienes permiso para reincorporar a esta persona.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.rrhh_desvincular(uuid, date, text) from public, anon;
revoke all on function public.rrhh_reincorporar(uuid) from public, anon;
grant execute on function public.rrhh_desvincular(uuid, date, text) to authenticated;
grant execute on function public.rrhh_reincorporar(uuid) to authenticated;

commit;
