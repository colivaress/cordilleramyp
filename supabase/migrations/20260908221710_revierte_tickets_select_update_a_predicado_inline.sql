-- Revierte una regresión introducida por la migración anterior
-- (20260908210559_rls_catalogos_storage_pertenencia_limites_buckets.sql).
--
-- Esa migración refactorizó tickets_select/tickets_update para que usen
-- private.puede_ver_ticket(id::text) / private.puede_editar_ticket(id::text)
-- — los mismos helpers nuevos de Storage — "para que las dos familias de
-- políticas no se desincronicen con el tiempo". Se rompió la creación de
-- inspecciones: "iniciarInspeccion" hace un INSERT ... RETURNING
-- (`.upsert(...).select("numero_inspeccion").single()`), y Postgres aplica
-- la política de SELECT sobre la fila recién insertada como si fuera un
-- WITH CHECK. puede_ver_ticket es STABLE y vuelve a hacer
-- `select ... from public.tickets where id::text = p_ticket_id` — dentro de
-- la MISMA sentencia, esa sub-consulta no ve la fila que el INSERT todavía
-- no confirmó, así que siempre devuelve false y el INSERT falla con
-- "new row violates row-level security policy for table tickets".
--
-- IMPORTANTE — por qué tickets_select/tickets_update NO pueden usar
-- private.puede_ver_ticket/puede_editar_ticket, aunque el predicado sea
-- idéntico: esos helpers reciben un id y vuelven a consultar la tabla
-- tickets para leer sus columnas (supervisor_id, estado). Sobre la propia
-- tabla tickets eso reintroduce este problema en cualquier política que se
-- evalúe sobre una fila todavía no visible dentro de la misma sentencia
-- (INSERT ... RETURNING, y en general cualquier UPDATE ... RETURNING que
-- dependa de columnas post-cambio). En storage.objects SÍ es seguro: el
-- ticket referenciado por la carpeta de la ruta es SIEMPRE una fila de una
-- tabla distinta (public.tickets) que ya existe de antes — nunca la fila
-- que se está insertando/actualizando en esa misma sentencia. No repetir
-- este refactor sobre tickets_select/tickets_update.
--
-- Se restauran los predicados inline exactamente como quedaron en
-- 20260903022204_rls_cerrar_reinspeccion_ticket_ajeno.sql (evalúan las
-- columnas de la fila en cuestión directamente, sin re-consultar la tabla).

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    private.es_admin()
    or supervisor_id = private.personal_id()
    or (
      private.personal_id() is not null
      and estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
    )
    or private.hizo_revision(id)
  );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using (
    private.es_admin()
    or supervisor_id = private.personal_id()
    or estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
    or private.hizo_revision(id)
  )
  with check (
    private.es_admin()
    or supervisor_id = private.personal_id()
    or estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
    or private.hizo_revision(id)
  );
