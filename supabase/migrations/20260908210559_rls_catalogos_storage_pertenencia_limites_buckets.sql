-- Auditoría de seguridad, puntos 2/3/4:
--   2. checklist_items / destinatarios_correo seguían con la política `auth_write_*`
--      original (using(true)/check(true)) de la migración de bootstrap — cualquier
--      `authenticated` podía insertar/editar/borrar filas, incluida
--      destinatarios_correo (esto anulaba la validación de destinatario del envío
--      de informes: da igual validar contra la tabla si cualquiera puede escribirla).
--   3. Las 4 políticas de storage.objects solo validaban `bucket_id`, no
--      pertenencia — cualquier `authenticated` podía leer/escribir un objeto de
--      cualquier ticket armando la ruta a mano.
--   4. Falta índice en tickets.supervisor_id (evaluado por fila en la condición
--      RLS del rol supervisor, la mayoría del tráfico real) y en
--      ticket_revisiones.supervisor_id (mismo predicado en ticket_revisiones_select
--      y evaluado dentro de private.hizo_revision).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Catálogos: lectura abierta a authenticated (sin cambios), escritura solo
--    administrador. Se reemplaza la política ALL amplia por INSERT/UPDATE/DELETE
--    separadas para no volver a dejar un ALL using(true)/check(true) por error.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists auth_write_checklist_items on public.checklist_items;

create policy checklist_items_insert on public.checklist_items
  for insert to authenticated
  with check ( private.es_admin() );

create policy checklist_items_update on public.checklist_items
  for update to authenticated
  using ( private.es_admin() )
  with check ( private.es_admin() );

create policy checklist_items_delete on public.checklist_items
  for delete to authenticated
  using ( private.es_admin() );

drop policy if exists auth_write_destinatarios_correo on public.destinatarios_correo;

create policy destinatarios_correo_insert on public.destinatarios_correo
  for insert to authenticated
  with check ( private.es_admin() );

create policy destinatarios_correo_update on public.destinatarios_correo
  for update to authenticated
  using ( private.es_admin() )
  with check ( private.es_admin() );

create policy destinatarios_correo_delete on public.destinatarios_correo
  for delete to authenticated
  using ( private.es_admin() );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Storage: helpers de pertenencia + reescritura de las 4 políticas.
--
--    Firman `(p_ticket_id text)`, no `uuid`: comparan SIEMPRE como texto
--    (`t.id::text = p_ticket_id`). Así:
--      - tickets_select/tickets_update (abajo) pasan `id::text` — castear un
--        uuid ya válido a texto nunca falla.
--      - las políticas de storage.objects pasan la carpeta cruda
--        ((storage.foldername(name))[1]), sin castear texto arbitrario a uuid
--        — si algún día se sube un objeto con una ruta que no es UUID, el
--        predicado simplemente no matchea en vez de reventar la política.
--
--    Mismo predicado que tickets_select / tickets_update (§2.6, migración
--    20260903022204), reutilizando private.es_admin() / private.personal_id() /
--    private.hizo_revision() ya existentes.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function private.puede_ver_ticket(p_ticket_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id::text = p_ticket_id
      and (
        private.es_admin()
        or t.supervisor_id = private.personal_id()
        or (
          private.personal_id() is not null
          and t.estado = any (
            array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[]
          )
        )
        or private.hizo_revision(t.id)
      )
  );
$$;

create or replace function private.puede_editar_ticket(p_ticket_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id::text = p_ticket_id
      and (
        private.es_admin()
        or t.supervisor_id = private.personal_id()
        or t.estado = any (
          array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[]
        )
        or private.hizo_revision(t.id)
      )
  );
$$;

revoke all on function private.puede_ver_ticket(text) from public, anon;
revoke all on function private.puede_editar_ticket(text) from public, anon;
grant execute on function private.puede_ver_ticket(text) to authenticated;
grant execute on function private.puede_editar_ticket(text) to authenticated;

-- Refactor de tickets_select/tickets_update para que usen los mismos helpers
-- que Storage — evita que las dos familias de políticas se desincronicen con
-- el tiempo. Predicado idéntico al de la migración 20260903022204.
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using ( private.puede_ver_ticket(id::text) );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using ( private.puede_editar_ticket(id::text) )
  with check ( private.puede_editar_ticket(id::text) );

-- Storage: bucket_id + pertenencia (primera carpeta de la ruta = ticket_id,
-- misma convención en firmas y fallas: "<ticket_id>/...").
drop policy if exists "cmyp auth select objetos" on storage.objects;
drop policy if exists "cmyp auth insert objetos" on storage.objects;
drop policy if exists "cmyp auth update objetos" on storage.objects;
drop policy if exists "cmyp auth delete objetos" on storage.objects;

create policy "cmyp auth select objetos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('firmas', 'fallas')
    and private.puede_ver_ticket((storage.foldername(name))[1])
  );

create policy "cmyp auth insert objetos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('firmas', 'fallas')
    and private.puede_editar_ticket((storage.foldername(name))[1])
  );

create policy "cmyp auth update objetos" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('firmas', 'fallas')
    and private.puede_editar_ticket((storage.foldername(name))[1])
  );

create policy "cmyp auth delete objetos" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('firmas', 'fallas')
    and private.puede_editar_ticket((storage.foldername(name))[1])
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Límites de los buckets.
--    firmas: siempre se sube con contentType "image/png" fijo en el cliente
--    (InspeccionForm.tsx, subirArchivo("firmas", ...)) — una firma de canvas
--    pesa unos pocos KB, 2 MB es de sobra.
--    fallas: la foto se comprime a JPEG (~1600px, calidad 0.8) antes de subir
--    (comprimirImagen()); si el navegador no puede decodificarla (createImageBitmap
--    falla), sube el archivo original sin tocar, con su Content-Type real — y el
--    input acepta jpeg/png/webp/heic/heif (ChecklistItemRow.tsx, FORMATOS_FOTO).
--    Por eso allowed_mime_types cubre los 5, no solo el jpeg de salida normal.
-- ─────────────────────────────────────────────────────────────────────────

update storage.buckets
set file_size_limit = 2097152, -- 2 MB
    allowed_mime_types = array['image/png']
where id = 'firmas';

update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'fallas';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Índices — punto 9 de la auditoría.
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists idx_tickets_supervisor_id on public.tickets(supervisor_id);
create index if not exists idx_ticket_revisiones_supervisor_id on public.ticket_revisiones(supervisor_id);
