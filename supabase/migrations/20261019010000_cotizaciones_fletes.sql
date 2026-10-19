-- Solicitudes de cotización de fletes enviadas desde la portada pública.
--
-- QUÉ ES: un formulario abierto en https://cordilleramyp.cl/cotizacion que
-- cualquier interesado (sin cuenta en el sistema) completa para pedir una
-- cotización. Cada envío guarda una fila acá y dispara dos correos: uno a
-- Jaime con los datos y enlaces de un toque (tel:, mailto:, wa.me), y un
-- acuse de recibo al solicitante. Jaime arma la cotización y contacta
-- directo — el sistema NO calcula precios ni distancias.
--
-- POR QUÉ NO HAY POLÍTICA DE INSERT: esta es la decisión de diseño de esta
-- migración y conviene dejarla escrita, porque a primera vista parece
-- contradecir §2.6 ("no uses el service role para un flujo normal de un
-- usuario autenticado"). El caso es el opuesto:
--
--   * Quien envía el formulario NO está autenticado. La única identidad
--     disponible sería `anon`, y la anon key es pública por diseño — viaja
--     en el bundle del navegador. Una política `for insert to anon` no
--     autoriza "a quien usó nuestro formulario": autoriza a cualquiera que
--     copie esa key y haga POST contra /rest/v1/cotizaciones_fletes.
--   * Eso dejaría el honeypot y el límite por IP (que viven en la Server
--     Action) como adorno: un bot los saltaría yendo directo a PostgREST.
--   * El requisito del cliente fue explícito: nada de captcha visible. El
--     único filtro real que queda, entonces, tiene que estar del lado del
--     servidor y ser el ÚNICO camino de escritura.
--
-- Por eso la tabla queda con RLS activo y SIN política de insert para
-- ningún rol: el único que puede escribir es el service role (que bypassa
-- RLS), desde `src/app/cotizacion/actions.ts`, que es código server-only y
-- aplica honeypot + límite por IP antes de insertar. El service role acá no
-- está evitando una política mal escrita — está siendo el guardián de un
-- endpoint anónimo, que es justamente para lo que §9 lo reserva.
--
-- LECTURA: solo administrador / administrador_contrato. Hoy no hay pantalla
-- que las liste (Jaime trabaja desde el correo), así que en la práctica se
-- consultan por SQL; la política queda igual para que el día que se agregue
-- la pantalla no haya que abrir nada.
--
-- DATOS PERSONALES: la tabla guarda nombre, RUT, correo y teléfono de
-- personas que no son usuarios del sistema. `ip_solicitante` existe SOLO
-- para el límite por IP y no se usa para nada más — si se quiere una
-- política de retención (borrar solicitudes viejas), este es el campo a
-- mirar primero.

begin;

create type public.cotizacion_solicitante as enum ('particular', 'empresa');

create table public.cotizaciones_fletes (
  id uuid primary key default gen_random_uuid(),
  -- Correlativo legible para referirse a una solicitud por teléfono o
  -- correo, mismo criterio que tickets.numero_inspeccion (§2.6): nunca se
  -- le muestra el UUID a una persona.
  numero_solicitud bigint generated always as identity unique not null,

  tipo_solicitante public.cotizacion_solicitante not null,

  -- Contacto — siempre, sea particular o empresa.
  nombre text not null,
  apellido text not null,
  -- RUT normalizado (solo dígitos + DV, sin puntos ni guion, K en
  -- mayúscula) — se guarda normalizado para que "12.345.678-9", "12345678-9"
  -- y "123456789" sean el mismo RUT. El formato bonito se arma al mostrarlo.
  rut text not null,
  correo text not null,
  telefono text not null,
  tiene_whatsapp boolean not null default false,

  -- Solo cuando tipo_solicitante = 'empresa' (ver el check de más abajo).
  razon_social text,
  rut_empresa text,
  giro text,
  direccion_comercial text,

  -- Servicio solicitado.
  origen text not null,
  destino text not null,
  tipo_carga text not null,
  -- Texto libre a propósito: el interesado escribe "20 toneladas", "2 pallets"
  -- o "un contenedor de 40 pies". Forzar un número acá rechazaría solicitudes
  -- válidas de gente que no sabe el tonelaje exacto; Jaime lo interpreta.
  peso text not null,
  fecha_estimada date not null,
  requiere_encarpe boolean not null,
  -- El ÚNICO campo opcional del formulario.
  comentarios text,

  -- Operación.
  ip_solicitante text,
  -- Si el correo a Jaime falla, la solicitud NO se pierde: la fila ya está
  -- guardada y esta bandera queda en false para poder encontrarla.
  correo_interno_enviado boolean not null default false,
  acuse_enviado boolean not null default false,
  created_at timestamptz not null default now(),

  constraint datos_empresa_completos check (
    tipo_solicitante <> 'empresa'
    or (
      razon_social is not null
      and rut_empresa is not null
      and giro is not null
      and direccion_comercial is not null
    )
  )
);

-- Lo que consulta el límite por IP en cada envío: las solicitudes de esa IP
-- dentro de la última hora.
create index cotizaciones_fletes_ip_fecha
  on public.cotizaciones_fletes (ip_solicitante, created_at desc);

-- Para listarlas de la más reciente a la más antigua.
create index cotizaciones_fletes_fecha
  on public.cotizaciones_fletes (created_at desc);

alter table public.cotizaciones_fletes enable row level security;

-- Lectura: solo administración. NO se agrega política de insert/update/delete
-- para ningún rol — ver el comentario de arriba.
create policy cotizaciones_fletes_select on public.cotizaciones_fletes
  for select
  to authenticated
  using (private.es_admin() or private.es_admin_contrato());

commit;
