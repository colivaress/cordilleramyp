-- Gestión de las solicitudes de cotización: estado del lead y la cotización
-- que se le emite.
--
-- Complementa 20261019010000 (que creó la tabla y el formulario público).
-- Acá se agrega lo que necesita la pantalla "Cotizaciones" del perfil
-- administrador: marcar en qué va cada solicitud y registrar el valor
-- cotizado que se le envió al interesado en PDF.
--
-- POR QUÉ ESTA SÍ LLEVA POLÍTICA DE UPDATE (y la de insert sigue sin
-- existir): son dos caminos distintos y conviene no confundirlos.
--
--   * INSERT lo hace un visitante ANÓNIMO desde el formulario público. No
--     hay identidad que verificar, así que el guardián es la Server Action
--     con el service role (ver el comentario de 20261019010000).
--   * UPDATE lo hace un administrador AUTENTICADO desde la app. Acá sí hay
--     una identidad real que `private.es_admin()` puede verificar, así que
--     corresponde una política RLS y el cliente autenticado normal —
--     exactamente lo que §2.6 exige y lo que en su momento se hizo mal con
--     `tickets` (se recurrió al service role para tapar una política de
--     update que faltaba). No se repite acá.
--
-- VALOR EN PESOS SIN DECIMALES: `bigint`, no `numeric`. El peso chileno no
-- tiene fracciones en una cotización de flete, y un entero evita el clásico
-- problema de redondeo al sumar IVA. El IVA y el total NO se guardan: se
-- derivan del neto con la tasa vigente al mostrar o al emitir el PDF —
-- guardar los tres invita a que queden inconsistentes entre sí.
--
-- UNA COTIZACIÓN POR SOLICITUD: si se re-cotiza a otro precio, se pisa el
-- valor anterior y se emite un PDF nuevo. No se guarda historial de
-- precios; si más adelante hace falta negociar en varias vueltas y dejar
-- registro de cada una, eso pide una tabla aparte, no más columnas acá.

begin;

create type public.cotizacion_estado as enum (
  'nueva',      -- entró por el formulario, nadie la ha tomado
  'cotizada',   -- se emitió y envió la cotización al interesado
  'ganada',     -- el interesado aceptó
  'perdida'     -- no prosperó
);

alter table public.cotizaciones_fletes
  add column estado public.cotizacion_estado not null default 'nueva',
  -- Pesos chilenos, sin decimales. El IVA y el total se calculan, no se guardan.
  add column valor_neto bigint,
  add column validez_dias int,
  add column observaciones_cotizacion text,
  add column cotizada_por uuid references public.personal(id),
  add column cotizada_at timestamptz,
  add column cotizacion_enviada_at timestamptz;

alter table public.cotizaciones_fletes
  add constraint valor_neto_positivo check (valor_neto is null or valor_neto > 0),
  add constraint validez_dias_razonable check (
    validez_dias is null or (validez_dias > 0 and validez_dias <= 365)
  ),
  -- Una solicitud no puede figurar como "cotizada" sin valor: si eso pasara,
  -- el PDF que supuestamente se envió no se podría reconstruir.
  add constraint cotizada_tiene_valor check (
    estado <> 'cotizada' or valor_neto is not null
  );

create index cotizaciones_fletes_estado
  on public.cotizaciones_fletes (estado, created_at desc);

-- UPDATE desde la app, con el cliente autenticado del administrador —
-- nunca con el service role (ver arriba). INSERT y DELETE siguen sin
-- política: nadie los puede hacer por PostgREST, con ningún rol.
create policy cotizaciones_fletes_update on public.cotizaciones_fletes
  for update
  to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

commit;
