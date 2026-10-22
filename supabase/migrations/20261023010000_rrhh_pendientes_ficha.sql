-- Pendientes de la ficha única (PR #129), antes de los turnos:
--
--   1. Correo único en personal. handle_new_user() vincula la cuenta por
--      correo con `limit 1`: con dos filas del mismo correo elegiría una
--      cualquiera, y con ella el ROL con que entra la persona.
--   2. Catálogo de cargos sembrado con los cuatro de hoy.
--   3. "Área" pasa a llamarse "Faena": el lugar (cliente/planta) donde la
--      persona está destinada a trabajar, no un área funcional.
--   4. Contacto de emergencia: dato personal de un TERCERO (Ley 21.719).
--      No legible con un select directo, igual que el RUT.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Correo único, sin distinguir mayúsculas (handle_new_user compara con
--    lower(email)). Revisado el 2026-10-22: cero correos repetidos en
--    staging y en producción. Si apareciera alguno antes de que esto
--    llegue a un ambiente, la migración se DETIENE con la lista en vez de
--    elegir sola cuál fila conserva el correo: esa elección decide con qué
--    rol entra alguien, y no la puede tomar una migración a ciegas.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_repetidos text;
begin
  select string_agg(format('%s (%s filas)', correo, n), ', ')
  into v_repetidos
  from (
    select lower(email) as correo, count(*) as n
    from public.personal
    where email is not null
    group by lower(email)
    having count(*) > 1
  ) d;
  if v_repetidos is not null then
    raise exception 'Hay correos repetidos en personal: %. Resuélvelos (dejando una sola fila por correo) antes de aplicar esta migración.', v_repetidos;
  end if;
end;
$$;

create unique index personal_email_unico on public.personal (lower(email));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Cargos iniciales. Idempotente y sin tocar lo que ya exista (staging ya
--    tiene tres de los cuatro, cargados a mano). El catálogo sigue
--    creciendo desde /rrhh/cargos.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.rrhh_cargos (nombre, orden)
values
  ('Administrador', 1),
  ('Administrador de contrato', 2),
  ('Supervisor', 3),
  ('Encarpador', 4)
on conflict ((lower(nombre))) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Área → Faena. Un rename conserva filas, ids y referencias (staging ya
--    tiene faenas cargadas con el nombre viejo). Sigue siendo opcional y
--    con baja lógica.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.rrhh_areas rename to rrhh_faenas;
alter index public.rrhh_areas_nombre_idx rename to rrhh_faenas_nombre_idx;
alter table public.rrhh_faenas rename constraint rrhh_areas_pkey to rrhh_faenas_pkey;
alter table public.rrhh_faenas rename constraint rrhh_areas_nombre_check to rrhh_faenas_nombre_check;
alter policy rrhh_areas_select on public.rrhh_faenas rename to rrhh_faenas_select;
alter policy rrhh_areas_insert on public.rrhh_faenas rename to rrhh_faenas_insert;
alter policy rrhh_areas_update on public.rrhh_faenas rename to rrhh_faenas_update;

alter table public.rrhh_fichas rename column area_id to faena_id;
alter table public.rrhh_fichas rename constraint rrhh_fichas_area_id_fkey to rrhh_fichas_faena_id_fkey;
alter index public.rrhh_fichas_area_idx rename to rrhh_fichas_faena_idx;

comment on table public.rrhh_faenas is
  'Faena: el lugar (cliente o planta) donde la persona está destinada a trabajar. Un mismo cliente puede tener varias. Baja lógica, nunca delete.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Contacto de emergencia, en personal: es de la persona, no de su
--    contrato (alguien sin contrato igual puede accidentarse).
--
--    Es dato de un tercero que no es usuario ni aceptó nada: se guarda lo
--    mínimo y NO se agrega al grant de columnas de authenticated (ver
--    20261022020000: las columnas legibles de personal están enumeradas,
--    una nueva no es legible por defecto). Se lee solo con
--    rrhh_contactos_emergencia(), con la regla de puede_ver_rrhh():
--    administrador y adm. de contrato todos, cualquier otro rol el suyo.
--    Escribir sigue la política personal_update (el trabajador no puede).
--
--    PENDIENTE de Carlos: si el supervisor en terreno debe verlo en un
--    accidente. Por ahora, la versión restringida.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.personal
  add column contacto_emergencia_nombre text,
  add column contacto_emergencia_telefono text,
  add column contacto_emergencia_relacion text,
  -- Un número suelto no sirve: quien llama tiene que saber a quién llama.
  -- Un nombre en blanco tampoco cuenta como nombre.
  add constraint personal_contacto_emergencia_con_nombre
    check (contacto_emergencia_telefono is null or nullif(btrim(contacto_emergencia_nombre), '') is not null);

create or replace function public.rrhh_contactos_emergencia()
returns table (personal_id uuid, nombre text, telefono text, relacion text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.contacto_emergencia_nombre, p.contacto_emergencia_telefono, p.contacto_emergencia_relacion
  from public.personal p
  where (p.contacto_emergencia_nombre is not null or p.contacto_emergencia_telefono is not null)
    and private.puede_ver_rrhh(p.id);
$$;

comment on function public.rrhh_contactos_emergencia() is
  'Contacto de emergencia de las personas que quien llama puede ver en RRHH: administrador y adm. de contrato todas, cualquier otro rol solo la propia. Misma regla que private.puede_ver_rrhh() y public.rrhh_ruts().';

revoke all on function public.rrhh_contactos_emergencia() from public, anon;
grant execute on function public.rrhh_contactos_emergencia() to authenticated;

commit;
