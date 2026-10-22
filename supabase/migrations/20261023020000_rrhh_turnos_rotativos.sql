-- Turnos rotativos (spec RRHH §8): la asignación de jornada pasa de "rige
-- desde una fecha, para siempre" a un RANGO [vigente_desde, vigente_hasta].
-- Sin fecha de término, asignar "mañana" el 21 y "tarde" el 28 dejaba las
-- dos vigentes a la vez. Las tablas están vacías en todos los ambientes.
--
-- Reglas:
--   - Dos asignaciones de una persona NUNCA cubren el mismo día (exclusión
--     en la base). Con dos jornadas el mismo día el cálculo de horas no
--     falla: elige una. Es un error silencioso que termina en plata.
--   - Una asignación no se borra: se corrige su rango (con motivo) o se
--     ANULA (con motivo) y se asigna otra. Cada alta, corrección y
--     anulación queda en rrhh_jornada_trabajador_cambios, con quién y
--     cuándo — es la evidencia para revisar un cálculo de horas después.
--   - Un día sin jornada es un error con mensaje (src/lib/rrhh/turnos.ts),
--     nunca un valor por defecto.

begin;

create extension if not exists btree_gist with schema extensions;

alter table public.rrhh_jornada_trabajador
  -- Nulo = hasta nuevo aviso (el trabajador sin rotación).
  add column vigente_hasta date,
  add column updated_at timestamptz,
  add column updated_by uuid references public.personal(id),
  -- Obligatorio en cada corrección (trigger): por qué se cambió el rango.
  add column motivo_cambio text,
  add column anulada_en timestamptz,
  add column anulada_por uuid references public.personal(id),
  add constraint rrhh_jornada_trabajador_rango_valido
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  add constraint rrhh_jornada_trabajador_anulacion_completa
    check ((anulada_en is null) = (anulada_por is null));

-- Una anulada no bloquea: se anula justamente para asignar otra en su
-- lugar. Todo lo demás, imposible por construcción.
alter table public.rrhh_jornada_trabajador
  add constraint rrhh_jornada_trabajador_sin_solape
  exclude using gist (
    personal_id with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  ) where (anulada_en is null);

-- ─────────────────────────────────────────────────────────────────────────
-- Corrección: solo el rango, con motivo. La persona, la jornada y el
-- origen no cambian (otra jornada = anular y asignar). Una anulada ya no
-- se toca.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function private.rrhh_jornada_trabajador_corregir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.anulada_en is not null then
    raise exception 'Esta asignación está anulada y ya no se puede modificar.' using errcode = 'check_violation';
  end if;
  if new.personal_id is distinct from old.personal_id
     or new.jornada_id is distinct from old.jornada_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Solo se puede corregir el rango de una asignación. Para otra jornada, anúlala y asigna la nueva.'
      using errcode = 'check_violation';
  end if;
  if nullif(btrim(new.motivo_cambio), '') is null then
    raise exception 'Escribe el motivo del cambio.' using errcode = 'check_violation';
  end if;
  if new.anulada_en is not null then
    new.anulada_en := now();
    new.anulada_por := private.personal_id();
  end if;
  new.motivo_cambio := btrim(new.motivo_cambio);
  new.updated_at := now();
  new.updated_by := private.personal_id();
  return new;
end;
$$;

create trigger rrhh_jornada_trabajador_corregir
  before update on public.rrhh_jornada_trabajador
  for each row execute function private.rrhh_jornada_trabajador_corregir();

-- ─────────────────────────────────────────────────────────────────────────
-- Rastro: una fila por alta, corrección y anulación. La escribe solo el
-- trigger (security definer); nadie tiene política de escritura.
-- ─────────────────────────────────────────────────────────────────────────
create table public.rrhh_jornada_trabajador_cambios (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.rrhh_jornada_trabajador(id) on delete restrict,
  personal_id uuid not null references public.personal(id) on delete restrict,
  accion text not null check (accion in ('asignada', 'corregida', 'anulada')),
  jornada_id uuid not null references public.rrhh_jornadas(id) on delete restrict,
  vigente_desde date not null,
  vigente_hasta date,
  motivo text,
  hecho_por uuid references public.personal(id),
  hecho_en timestamptz not null default now()
);

create index rrhh_jornada_trabajador_cambios_asignacion_idx
  on public.rrhh_jornada_trabajador_cambios (asignacion_id, hecho_en);

create or replace function private.rrhh_jornada_trabajador_registrar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rrhh_jornada_trabajador_cambios
    (asignacion_id, personal_id, accion, jornada_id, vigente_desde, vigente_hasta, motivo, hecho_por)
  values (
    new.id,
    new.personal_id,
    case
      when tg_op = 'INSERT' then 'asignada'
      when new.anulada_en is not null then 'anulada'
      else 'corregida'
    end,
    new.jornada_id,
    new.vigente_desde,
    new.vigente_hasta,
    case when tg_op = 'INSERT' then null else new.motivo_cambio end,
    coalesce(private.personal_id(), new.created_by)
  );
  return null;
end;
$$;

create trigger rrhh_jornada_trabajador_registrar_cambio
  after insert or update on public.rrhh_jornada_trabajador
  for each row execute function private.rrhh_jornada_trabajador_registrar_cambio();

alter table public.rrhh_jornada_trabajador_cambios enable row level security;
revoke all on public.rrhh_jornada_trabajador_cambios from anon;

create policy rrhh_jornada_trabajador_cambios_select on public.rrhh_jornada_trabajador_cambios
  for select to authenticated
  using (private.puede_ver_rrhh(personal_id));

-- Corregir / anular: los mismos que asignan. Sin delete para nadie.
create policy rrhh_jornada_trabajador_update on public.rrhh_jornada_trabajador
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

commit;
