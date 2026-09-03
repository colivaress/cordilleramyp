-- ---------- tickets ----------
drop policy if exists tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated using (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or (
    private.personal_id() is not null
    and estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
  )
);

drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets for update to authenticated
using (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
  or exists (
    select 1 from ticket_revisiones r
    where r.ticket_id = tickets.id and r.supervisor_id = private.personal_id()
  )
)
with check (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or exists (
    select 1 from ticket_revisiones r
    where r.ticket_id = tickets.id and r.supervisor_id = private.personal_id()
  )
);

-- ---------- ticket_revisiones ----------
drop policy if exists ticket_revisiones_select on ticket_revisiones;
create policy ticket_revisiones_select on ticket_revisiones for select to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_revisiones.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
);

drop policy if exists ticket_revisiones_insert on ticket_revisiones;
create policy ticket_revisiones_insert on ticket_revisiones for insert to authenticated with check (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_revisiones.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
);

drop policy if exists ticket_revisiones_update on ticket_revisiones;
create policy ticket_revisiones_update on ticket_revisiones for update to authenticated using (
  private.es_admin()
  or ticket_revisiones.supervisor_id = private.personal_id()
  or exists (
    select 1 from tickets t
    where t.id = ticket_revisiones.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
);

-- ---------- ticket_checklist_respuestas ----------
drop policy if exists tcr_select on ticket_checklist_respuestas;
create policy tcr_select on ticket_checklist_respuestas for select to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_checklist_respuestas.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
  or exists (
    select 1 from ticket_revisiones r
    where r.ticket_id = ticket_checklist_respuestas.ticket_id
      and r.numero_revision = ticket_checklist_respuestas.revision_numero
      and r.supervisor_id = private.personal_id()
  )
);

drop policy if exists tcr_insert on ticket_checklist_respuestas;
create policy tcr_insert on ticket_checklist_respuestas for insert to authenticated with check (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_checklist_respuestas.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
  or exists (
    select 1 from ticket_revisiones r
    where r.ticket_id = ticket_checklist_respuestas.ticket_id
      and r.numero_revision = ticket_checklist_respuestas.revision_numero
      and r.supervisor_id = private.personal_id()
  )
);

drop policy if exists tcr_update on ticket_checklist_respuestas;
create policy tcr_update on ticket_checklist_respuestas for update to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_checklist_respuestas.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
  or exists (
    select 1 from ticket_revisiones r
    where r.ticket_id = ticket_checklist_respuestas.ticket_id
      and r.numero_revision = ticket_checklist_respuestas.revision_numero
      and r.supervisor_id = private.personal_id()
  )
);

drop policy if exists tcr_delete on ticket_checklist_respuestas;
create policy tcr_delete on ticket_checklist_respuestas for delete to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_checklist_respuestas.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
  or exists (
    select 1 from ticket_revisiones r
    where r.ticket_id = ticket_checklist_respuestas.ticket_id
      and r.numero_revision = ticket_checklist_respuestas.revision_numero
      and r.supervisor_id = private.personal_id()
  )
);
