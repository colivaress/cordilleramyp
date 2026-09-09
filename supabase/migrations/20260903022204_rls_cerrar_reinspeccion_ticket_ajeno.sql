-- tickets: SELECT
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

-- tickets: UPDATE (misma condición que select/insert + el que hizo la revisión)
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

-- ticket_revisiones: SELECT (agrega "cualquier revisión que yo hice en el ticket")
drop policy if exists ticket_revisiones_select on public.ticket_revisiones;
create policy ticket_revisiones_select on public.ticket_revisiones
  for select to authenticated
  using (
    private.es_admin()
    or ticket_revisiones.supervisor_id = private.personal_id()
    or private.hizo_revision(ticket_revisiones.ticket_id, ticket_revisiones.numero_revision)
    or private.hizo_revision(ticket_revisiones.ticket_id)
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_revisiones.ticket_id
        and (
          t.supervisor_id = private.personal_id()
          or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        )
    )
  );

-- ticket_checklist_respuestas: SELECT (misma idea)
drop policy if exists tcr_select on public.ticket_checklist_respuestas;
create policy tcr_select on public.ticket_checklist_respuestas
  for select to authenticated
  using (
    private.es_admin()
    or private.hizo_revision(ticket_checklist_respuestas.ticket_id, ticket_checklist_respuestas.revision_numero)
    or private.hizo_revision(ticket_checklist_respuestas.ticket_id)
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_checklist_respuestas.ticket_id
        and (
          t.supervisor_id = private.personal_id()
          or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        )
    )
  );
