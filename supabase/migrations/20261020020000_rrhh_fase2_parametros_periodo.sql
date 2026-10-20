-- Módulo RRHH — Fase 2: parámetros previsionales versionados por período
-- (spec RRHH §3).
--
-- UF, UTM, IMM, topes, tasas, comisiones de AFP y tramos cambian mes a mes y
-- Previred no tiene API: se cargan a mano desde /rrhh/parametros, una fila por
-- (anio, mes). NINGÚN cálculo lee una constante del código: cada liquidación
-- se calcula contra la fila de SU período, y si falta, el cálculo falla con
-- un mensaje claro (src/lib/rrhh/parametros.ts) — nunca cae a un default.
--
-- Unidades, iguales a como las publica Previred/SII para transcribirlas sin
-- convertir:
--   - UF y topes en UF con decimales; UTM e IMM en pesos enteros.
--   - Todas las tasas en PORCENTAJE (10 = 10%), incluida la comisión de AFP.
--   - tramos_impuesto: [{desde_utm, hasta_utm|null, factor, rebaja_utm}], con
--     el factor como fracción (0.04) y la rebaja en UTM, como la tabla del SII.
--   - tramos_asignacion_familiar: [{renta_hasta|null, monto}] en pesos, en
--     orden A, B, C, D.
-- La forma de los jsonb la valida la app (al guardar y al leer); acá solo se
-- garantiza que sean arreglos no vacíos.
--
-- Lectura: administrador y administrador de contrato (son indicadores
-- públicos, pero no hace falta abrirlos a supervisores). Escritura: solo
-- administrador. Sin delete: un período se corrige, no se borra.
-- es_admin()/es_admin_contrato() consultan `personal`, no estas tablas:
-- seguros en INSERT ... RETURNING (lección de 20260908221710).

begin;

create type public.rrhh_afp as enum (
  'capital', 'cuprum', 'habitat', 'modelo', 'planvital', 'provida', 'uno'
);

create table public.rrhh_parametros_periodo (
  anio smallint not null check (anio between 2020 and 2100),
  mes smallint not null check (mes between 1 and 12),

  uf_mes_anterior numeric(10, 2) not null check (uf_mes_anterior > 0),
  uf_mes numeric(10, 2) not null check (uf_mes > 0),
  utm integer not null check (utm > 0),
  imm integer not null check (imm > 0),

  tope_imponible_afp_uf numeric(8, 2) not null check (tope_imponible_afp_uf > 0),
  tope_imponible_afc_uf numeric(8, 2) not null check (tope_imponible_afc_uf > 0),

  tasa_afp_obligatoria numeric(7, 4) not null check (tasa_afp_obligatoria >= 0 and tasa_afp_obligatoria < 100),
  tasa_salud_minima numeric(7, 4) not null check (tasa_salud_minima >= 0 and tasa_salud_minima < 100),
  tasa_afc_trabajador_indefinido numeric(7, 4) not null check (tasa_afc_trabajador_indefinido >= 0 and tasa_afc_trabajador_indefinido < 100),
  tasa_afc_empleador_indefinido numeric(7, 4) not null check (tasa_afc_empleador_indefinido >= 0 and tasa_afc_empleador_indefinido < 100),
  tasa_afc_empleador_plazo_fijo numeric(7, 4) not null check (tasa_afc_empleador_plazo_fijo >= 0 and tasa_afc_empleador_plazo_fijo < 100),
  tasa_sis numeric(7, 4) not null check (tasa_sis >= 0 and tasa_sis < 100),
  tasa_expectativa_vida numeric(7, 4) not null check (tasa_expectativa_vida >= 0 and tasa_expectativa_vida < 100),
  tasa_rentabilidad_protegida numeric(7, 4) not null check (tasa_rentabilidad_protegida >= 0 and tasa_rentabilidad_protegida < 100),
  tasa_mutual_base numeric(7, 4) not null check (tasa_mutual_base >= 0 and tasa_mutual_base < 100),
  tasa_mutual_adicional numeric(7, 4) not null check (tasa_mutual_adicional >= 0 and tasa_mutual_adicional < 100),

  tramos_impuesto jsonb not null check (
    jsonb_typeof(tramos_impuesto) = 'array' and jsonb_array_length(tramos_impuesto) > 0
  ),
  tramos_asignacion_familiar jsonb not null check (
    jsonb_typeof(tramos_asignacion_familiar) = 'array' and jsonb_array_length(tramos_asignacion_familiar) > 0
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.personal(id),
  primary key (anio, mes)
);

comment on table public.rrhh_parametros_periodo is
  'Indicadores previsionales de un período (spec RRHH §3). Tasas en porcentaje; tramos en jsonb validados por src/lib/rrhh/parametros.ts.';

-- Comisión de cada AFP en el período: varía por administradora (§3). Las siete
-- deben estar cargadas para que el período sirva; la app lo exige al leer.
create table public.rrhh_afp_periodo (
  anio smallint not null,
  mes smallint not null,
  afp public.rrhh_afp not null,
  comision numeric(7, 4) not null check (comision >= 0 and comision < 100),
  primary key (anio, mes, afp),
  foreign key (anio, mes) references public.rrhh_parametros_periodo (anio, mes) on delete restrict
);

comment on table public.rrhh_afp_periodo is
  'Comisión (en porcentaje, de cargo del trabajador) de cada AFP en el período. La cotización obligatoria está en rrhh_parametros_periodo.tasa_afp_obligatoria.';

alter table public.rrhh_parametros_periodo enable row level security;
alter table public.rrhh_afp_periodo enable row level security;
revoke all on public.rrhh_parametros_periodo from anon;
revoke all on public.rrhh_afp_periodo from anon;

create policy rrhh_parametros_periodo_select on public.rrhh_parametros_periodo
  for select to authenticated
  using (private.es_admin() or private.es_admin_contrato());

create policy rrhh_parametros_periodo_insert on public.rrhh_parametros_periodo
  for insert to authenticated
  with check (private.es_admin());

create policy rrhh_parametros_periodo_update on public.rrhh_parametros_periodo
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

create policy rrhh_afp_periodo_select on public.rrhh_afp_periodo
  for select to authenticated
  using (private.es_admin() or private.es_admin_contrato());

create policy rrhh_afp_periodo_insert on public.rrhh_afp_periodo
  for insert to authenticated
  with check (private.es_admin());

create policy rrhh_afp_periodo_update on public.rrhh_afp_periodo
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

commit;
