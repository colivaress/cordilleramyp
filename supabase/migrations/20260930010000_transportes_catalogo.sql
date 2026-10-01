-- Catálogo de transportes gestionable por administrador/administrador_contrato
-- (§ "Catálogo de transportes gestionable"). tickets.transporte NO es (ni
-- pasa a ser) llave foránea a esta tabla — sigue siendo texto libre, copiado
-- al momento de crear el ticket, para que una inspección histórica conserve
-- su transportista aunque la fila del catálogo se desactive o se renombre
-- después. Soft delete (activo boolean), mismo patrón que tipos_inspeccion y
-- destinatarios_correo: "quitar" un transporte nunca borra la fila, solo lo
-- saca del selector — evita que re-agregarlo más adelante produzca una
-- variante de ortografía distinta de la que ya quedó copiada en tickets
-- viejos.
create table public.transportes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Insensible a mayúsculas, y no distingue activo/inactivo a propósito: si
-- "Ruiz" ya existe desactivado, un segundo "Ruiz" (o "ruiz") no debe poder
-- crearse aparte — hay que reactivar/renombrar el que ya existe.
create unique index transportes_nombre_unico on public.transportes (lower(nombre));

alter table public.transportes enable row level security;

-- Lectura abierta a cualquier autenticado (incluye supervisor, que necesita
-- el catálogo completo para el selector del formulario — la UI filtra a
-- `activo = true` con su propia consulta, esto no lo hace la política).
create policy auth_read_transportes on public.transportes
  for select
  to authenticated
  using (true);

-- Escritura (agregar, renombrar, activar/desactivar) solo administrador o
-- administrador_contrato — mismo patrón que destinatarios_correo.
create policy transportes_insert on public.transportes
  for insert
  to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

create policy transportes_update on public.transportes
  for update
  to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

insert into public.transportes (nombre) values
  ('Génova'),
  ('Ruiz'),
  ('Vicmar'),
  ('TCHC'),
  ('Transhart'),
  ('Logística'),
  ('San Manuel'),
  ('Jorquera');
