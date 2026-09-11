-- Generaliza la "observación general" (hoy solo existía, de facto, para
-- Exportación Chimolsa) a los 4 tipos de inspección.
--
-- Mecanismo anterior (solo Chimolsa, checklist 100% modo 'fotos'): no existía
-- una columna dedicada — `guardarObservacionGeneral` escribía el MISMO texto
-- en `ticket_checklist_respuestas.observacion` de los 4 ítems de la revisión
-- (reutilizando la columna que en el resto de los tipos guarda la
-- observación POR ÍTEM de un no_conforme), y los lectores (cierre de
-- revisión, PDF, informe en pantalla, correo) volvían a derivarla buscando
-- "la primera fila modo 'fotos' con observación no vacía". Ese mecanismo no
-- es reutilizable para Encarpe/Desencarpe/Control de Salida: sus ítems son
-- modo 'estado' con Conforme/No conforme real, no hay 4 filas gemelas donde
-- esconder un texto compartido.
--
-- Columna nueva: UNA por revisión (no por ítem), en `ticket_revisiones`. Cada
-- revisión nueva ya crea una fila nueva ahí (`prepararRevision`), así que el
-- campo nace vacío en cada re-inspección automáticamente — mismo criterio
-- que ya siguen las observaciones por ítem (tampoco se arrastran entre
-- revisiones, porque `ticket_checklist_respuestas` también se resiembra por
-- `revision_numero`).
alter table ticket_revisiones
  add column if not exists observacion_general text;

-- Backfill: copia una sola vez el texto que hoy vive duplicado en las 4 filas
-- de cada revisión de Chimolsa hacia la columna nueva, para no perder el
-- historial ya escrito antes de este cambio.
--
-- CRÍTICO: filtrar por checklist_items.modo = 'fotos'. Sin este filtro, la
-- consulta también agarraría observaciones REALES por ítem no_conforme de
-- Encarpe/Desencarpe/Control de Salida (modo 'estado') y las copiaría como si
-- fueran la observación general de esa revisión — dato falso, no un
-- descuido menor. El mecanismo viejo solo existió para checklists 100%
-- modo 'fotos' (hoy, únicamente Chimolsa); el backfill debe respetar
-- exactamente ese alcance.
update ticket_revisiones tr
set observacion_general = sub.observacion
from (
  select distinct on (tcr.ticket_id, tcr.revision_numero)
    tcr.ticket_id, tcr.revision_numero, tcr.observacion
  from ticket_checklist_respuestas tcr
  join checklist_items ci on ci.key = tcr.item_key
  where ci.modo = 'fotos'
    and tcr.observacion is not null
    and trim(tcr.observacion) <> ''
  order by tcr.ticket_id, tcr.revision_numero, tcr.observacion
) sub
where tr.ticket_id = sub.ticket_id
  and tr.numero_revision = sub.revision_numero
  and tr.observacion_general is null;
