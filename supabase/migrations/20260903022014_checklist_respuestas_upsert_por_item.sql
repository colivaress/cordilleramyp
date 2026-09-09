alter table ticket_checklist_respuestas
  drop constraint if exists ticket_checklist_respuestas_unica_por_item;

alter table ticket_checklist_respuestas
  add constraint ticket_checklist_respuestas_unica_por_item
  unique (ticket_id, revision_numero, item_key);

drop policy if exists tcr_delete on ticket_checklist_respuestas;
create policy tcr_delete on ticket_checklist_respuestas
  for delete
  using (
    private.es_admin()
    or exists (
      select 1 from tickets t
      where t.id = ticket_checklist_respuestas.ticket_id
        and t.supervisor_id = private.personal_id()
    )
  );
