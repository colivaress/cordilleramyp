-- Módulo RRHH — Fase 0 (bloqueante): aislar los datos de remuneración y
-- cerrar la lectura abierta de `personal`.
--
-- 1. personal: hasta hoy `auth_read_personal` (20260903021855) dejaba leer
--    TODAS las filas a cualquier `authenticated`, con email, teléfono y
--    fecha_nacimiento incluidos. Se reemplaza por `personal_select`, que deja
--    leer una fila solo a:
--      - administrador y administrador de contrato (todas: panel Usuarios);
--      - la propia persona (src/lib/auth.ts lee su propia fila);
--      - quien pueda ver un ticket donde esa persona es supervisor_id. Las
--        pantallas de tickets (detalle, informe, listado, búsqueda) muestran
--        el nombre del supervisor que creó el ticket, y un supervisor puede
--        ver tickets ajenos "con observaciones" o que reinspeccionó. El
--        `exists` sobre tickets se evalúa con la RLS de tickets, así que es
--        exactamente "un ticket que yo puedo ver", sin duplicar esa regla.
--    LIMITACIÓN CONOCIDA: en esa última rama la fila completa es legible
--    (incluidos email, teléfono y fecha_nacimiento de ese compañero). Cerrar
--    columnas exige permisos por columna y mover las lecturas de
--    administración a funciones; queda como trabajo aparte.
--
-- 2. Remuneraciones: viven en tablas propias `rrhh_*`, NUNCA como columnas de
--    `personal` (que, por la rama 3 de arriba, otros supervisores pueden
--    leer). Toda tabla rrhh_* con datos de un trabajador usa
--    private.puede_ver_rrhh(personal_id) en su política de select, y solo
--    private.es_admin() en las de escritura de montos: el administrador de
--    contrato LEE montos pero no los edita (spec RRHH §2).
--
-- Sobre helpers STABLE (lección de 20260908221710): una función que vuelve a
-- consultar la MISMA tabla de la política rompe INSERT ... RETURNING. Acá:
--   - puede_ver_rrhh() consulta `personal`, no las tablas rrhh_* donde se usa.
--   - En `personal_select`, es_admin()/es_admin_contrato() consultan la fila
--     de QUIEN LLAMA (que ya existe), nunca la fila que se está insertando;
--     la rama propia es inline (user_id = auth.uid()).

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. personal — select restringido
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists auth_read_personal on public.personal;
drop policy if exists personal_select on public.personal;

create policy personal_select on public.personal
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or user_id = (select auth.uid())
    or exists (
      select 1 from public.tickets t
      where t.supervisor_id = personal.id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Helper de lectura para tablas rrhh_*
-- ─────────────────────────────────────────────────────────────────────────
create or replace function private.puede_ver_rrhh(p_personal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.es_admin()
    or private.es_admin_contrato()
    or p_personal_id = private.personal_id();
$$;

comment on function private.puede_ver_rrhh(uuid) is
  'Lectura de datos RRHH de un trabajador: administrador, administrador de contrato, o el propio trabajador. Solo lectura: las políticas de escritura de montos usan private.es_admin(). Consulta personal, nunca una tabla rrhh_*: seguro en INSERT ... RETURNING sobre rrhh_*.';

revoke all on function private.puede_ver_rrhh(uuid) from public, anon;
grant execute on function private.puede_ver_rrhh(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. rrhh_remuneracion_base — primera tabla de remuneración
--    El sueldo se pacta en LÍQUIDO (spec RRHH §4-bis): la ficha guarda el
--    líquido pactado; el bruto es un resultado de cada período y se guarda
--    en la liquidación, no acá. Una fila por cambio, con su vigencia: el
--    historial de sueldo (§16.3) y el resto de columnas llegan en la fase 3.
-- ─────────────────────────────────────────────────────────────────────────
create table public.rrhh_remuneracion_base (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal(id) on delete restrict,
  liquido_pactado bigint not null check (liquido_pactado > 0),
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.personal(id),
  unique (personal_id, vigente_desde)
);

create index rrhh_remuneracion_base_personal_idx
  on public.rrhh_remuneracion_base (personal_id);

alter table public.rrhh_remuneracion_base enable row level security;
revoke all on public.rrhh_remuneracion_base from anon;

create policy rrhh_remuneracion_base_select on public.rrhh_remuneracion_base
  for select to authenticated
  using (private.puede_ver_rrhh(personal_id));

create policy rrhh_remuneracion_base_insert on public.rrhh_remuneracion_base
  for insert to authenticated
  with check (private.es_admin());

create policy rrhh_remuneracion_base_update on public.rrhh_remuneracion_base
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

-- Sin política de delete: una remuneración no se borra, se reemplaza con una
-- fila nueva de vigencia posterior.

commit;
