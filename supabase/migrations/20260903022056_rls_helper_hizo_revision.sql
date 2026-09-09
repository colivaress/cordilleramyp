create or replace function private.hizo_revision(
  p_ticket_id uuid,
  p_numero_revision int default null
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.ticket_revisiones r
    where r.ticket_id = p_ticket_id
      and r.supervisor_id = private.personal_id()
      and (p_numero_revision is null or r.numero_revision = p_numero_revision)
  );
$$;

revoke execute on function private.hizo_revision(uuid, int) from public, anon;
grant execute on function private.hizo_revision(uuid, int) to authenticated;

drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets for update to authenticated
using (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
  or private.hizo_revision(tickets.id)
)
with check (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or private.hizo_revision(tickets.id)
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
      )
  )
  or private.hizo_revision(
    ticket_checklist_respuestas.ticket_id,
    ticket_checklist_respuestas.revision_numero
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
  or private.hizo_revision(
    ticket_checklist_respuestas.ticket_id,
    ticket_checklist_respuestas.revision_numero
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
  or private.hizo_revision(
    ticket_checklist_respuestas.ticket_id,
    ticket_checklist_respuestas.revision_numero
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
  or private.hizo_revision(
    ticket_checklist_respuestas.ticket_id,
    ticket_checklist_respuestas.revision_numero
  )
);

drop policy if exists ticket_revisiones_update on ticket_revisiones;
create policy ticket_revisiones_update on ticket_revisiones for update to authenticated using (
  private.es_admin()
  or ticket_revisiones.supervisor_id = private.personal_id()
  or private.hizo_revision(ticket_revisiones.ticket_id, ticket_revisiones.numero_revision)
  or exists (
    select 1 from tickets t
    where t.id = ticket_revisiones.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
);
