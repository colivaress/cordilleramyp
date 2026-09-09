drop policy if exists tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated using (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or (
    private.personal_id() is not null
    and estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
  )
  or (estado = 'en_revision' and private.hizo_revision(id))
);

drop policy if exists ticket_revisiones_select on ticket_revisiones;
create policy ticket_revisiones_select on ticket_revisiones for select to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_revisiones.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
        or (t.estado = 'en_revision' and private.hizo_revision(t.id))
      )
  )
);

drop policy if exists tcr_select on ticket_checklist_respuestas;
create policy tcr_select on ticket_checklist_respuestas for select to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_checklist_respuestas.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
        or (t.estado = 'en_revision' and private.hizo_revision(t.id))
      )
  )
);
