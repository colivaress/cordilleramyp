alter table public.ticket_revisiones add column conductor text;

update public.ticket_revisiones tr
set conductor = t.conductor
from public.tickets t
where tr.ticket_id = t.id and tr.conductor is null;
