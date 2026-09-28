-- Agrega un ítem nuevo al catálogo de checklist de "desencarpe" — pedido
-- del cliente. Mismo modo/comportamiento que los otros 15 ítems de este
-- tipo (Conforme/No conforme/No aplica, con una foto condicional a "No
-- conforme" vía ticket_checklist_respuestas.foto_url — NO usa
-- fotos_requeridas, esa columna es solo para ítems modo 'fotos').
--
-- Posición: último, después de des_cunas_2 (orden 15) -> orden 16.
--
-- ASIMETRÍA CATÁLOGO/HISTORIAL — deliberadamente no se toca ningún dato
-- existente: hay inspecciones de desencarpe ya finalizadas (producción y
-- staging) con exactamente 15 filas en ticket_checklist_respuestas, sin
-- fila para esta clave nueva. Eso es correcto y no se migra ni se
-- backfillea con una fila "conforme" inventada — sembrar una respuesta
-- para un ítem que el supervisor nunca vio ni marcó falsificaría el
-- historial (afirmaría una revisión que no ocurrió). Las pantallas de
-- lectura (detalle del ticket, informe en pantalla, informe PDF) ya
-- consultan `ticket_checklist_respuestas` como tabla base (no
-- `checklist_items` filtrado por tipo) y hacen JOIN hacia checklist_items
-- solo para metadata de display (nombre/orden) — por construcción, una
-- inspección vieja con 15 respuestas sigue mostrando exactamente 15 filas,
-- nunca 16 con la última en blanco. Esto es distinto del incidente ya
-- conocido en este proyecto (22 ítems agregados al catálogo, 40 mostrados
-- juntos): aquella vez la causa era leer checklist_items SIN filtrar por
-- tipo; ese filtro ya existe en todos los puntos de lectura y sigue sin
-- tocarse acá.
--
-- Las inspecciones NUEVAS de desencarpe sí ven el ítem 16 desde que se
-- aplique esta migración: prepararRevision (tickets/actions.ts) siembra
-- las respuestas de una revisión nueva leyendo el catálogo completo del
-- tipo, así que cualquier revisión que se cree después de este punto
-- incluye la fila sembrada para esta clave.

insert into public.checklist_items (key, nombre, exigencia, orden, tipo, modo)
values (
  'des_estado_recepcion_carga',
  'Estado recepción de carga',
  null,
  16,
  'desencarpe',
  'estado'
);
