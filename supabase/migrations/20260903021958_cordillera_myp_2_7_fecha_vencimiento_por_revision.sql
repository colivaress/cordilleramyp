alter table public.ticket_revisiones
  add column if not exists fecha_vencimiento timestamptz;

alter table public.ticket_checklist_respuestas
  drop constraint if exists foto_y_vencimiento_obligatorios_si_no_conforme;

alter table public.ticket_checklist_respuestas
  drop column if exists fecha_vencimiento_item;

alter table public.ticket_checklist_respuestas
  add constraint foto_obligatoria_si_no_conforme check (
    estado <> 'no_conforme' or foto_url is not null
  );

update public.ticket_revisiones tr
set fecha_vencimiento = t.fecha_vencimiento
from public.tickets t
where tr.ticket_id = t.id and tr.fecha_vencimiento is null;
