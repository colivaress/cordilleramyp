-- Baja lógica de ítems del catálogo del checklist.
--
-- PROBLEMA: un ítem con respuestas no se puede borrar (la FK
-- ticket_checklist_respuestas.item_key -> checklist_items(key) no cascadea),
-- así que la única forma de sacarlo era borrar antes sus respuestas — que es
-- lo que hizo 20261002020000. Eso le quita filas a informes ya firmados:
-- una inspección pasa a mostrar un ítem menos que los que el supervisor
-- revisó, y el resto se renumera.
--
-- CAMBIO: checklist_items.activo. Un ítem inactivo deja de aparecer en
-- inspecciones NUEVAS (formulario, re-inspección, siembra de respuestas en
-- prepararRevision y validación de cierre en cerrarRevision), pero sigue
-- existiendo para las respuestas que ya lo usan. Junto con
-- 20261009010000 (nombre/orden/modo congelados en cada respuesta), un
-- informe firmado no cambia por nada que se haga en el catálogo.
--
-- DE AQUÍ EN ADELANTE, para sacar un ítem del checklist:
--     update public.checklist_items set activo = false where key = '...';
-- NUNCA `delete` de checklist_items ni de ticket_checklist_respuestas.
--
-- ORDEN ÚNICO SOLO ENTRE ACTIVOS: el UNIQUE (tipo, orden) pasa a ser un
-- índice único parcial `where activo`. Un ítem dado de baja conserva su
-- orden sin bloquear ese número: los activos se pueden renumerar 1..n y un
-- ítem nuevo puede tomar el lugar del que salió.

begin;

alter table public.checklist_items
  add column activo boolean not null default true;

alter table public.checklist_items
  drop constraint checklist_items_tipo_orden_unico;

create unique index checklist_items_tipo_orden_unico
  on public.checklist_items (tipo, orden)
  where activo;

commit;
