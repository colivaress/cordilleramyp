-- Normaliza patente_camion/patente_rampla existentes en tickets y agrega
-- índices para el buscador de patentes (PR siguiente, pantalla del
-- inspector). Ver src/lib/patentes.ts (normalizarPatente) para la ÚNICA
-- fuente de la regla — el SQL de abajo tiene que seguir coincidiendo
-- exactamente con esa función (mayúsculas, sin guiones/puntos, espacios
-- internos colapsados a uno, bordes recortados). Si la regla de
-- normalizarPatente cambia alguna vez, esta expresión SQL queda desfasada —
-- no hay forma de compartir la función entre TS y SQL en este proyecto, así
-- que cualquier cambio futuro a normalizarPatente debe revisar si hace falta
-- otra migración de backfill.
--
-- Impacto verificado en staging con un SELECT de solo lectura, ANTES de
-- escribir este UPDATE (no se aplicó nada a mano — esta migración llega
-- por el pipeline):
--   - 58 tickets en total; 35 con patente_camion que cambia, 35 con
--     patente_rampla que cambia.
--   - CERO colisiones en ambas columnas: ningún par de valores hoy
--     DISTINTOS termina normalizando al mismo valor (se verificó agrupando
--     por el valor normalizado y buscando grupos con más de un valor crudo
--     distinto adentro — ninguno). Es decir, esta migración no fusiona dos
--     camiones/ramplas que hoy se consideran diferentes.
--   - Todos los cambios observados en los datos reales son de
--     capitalización (minúsculas -> MAYÚSCULAS, ej. "gggg77" -> "GGGG77",
--     "Bbv" -> "BBV") — no había guiones, puntos ni espacios internos en
--     ningún valor real de staging a esta fecha.

update public.tickets
set
  patente_camion = trim(regexp_replace(regexp_replace(upper(patente_camion), '[-.]', '', 'g'), '\s+', ' ', 'g')),
  patente_rampla = trim(regexp_replace(regexp_replace(upper(patente_rampla), '[-.]', '', 'g'), '\s+', ' ', 'g'))
where
  patente_camion <> trim(regexp_replace(regexp_replace(upper(patente_camion), '[-.]', '', 'g'), '\s+', ' ', 'g'))
  or patente_rampla <> trim(regexp_replace(regexp_replace(upper(patente_rampla), '[-.]', '', 'g'), '\s+', ' ', 'g'));

-- Índices para el buscador de patentes. Propuesta: GIN + pg_trgm
-- (trigramas), no btree — el buscador es de COINCIDENCIA PARCIAL (el
-- inspector puede recordar solo una parte de la patente), es decir
-- `ILIKE '%ABC%'` con el término en cualquier posición, no solo al
-- principio. Un btree normal (incluso con text_pattern_ops) solo acelera
-- `LIKE 'ABC%'` (prefijo) — no ayuda en nada a un patrón con `%` adelante.
-- pg_trgm sí acelera "contiene" en cualquier posición, a costa de un índice
-- más pesado de mantener en cada escritura que un btree simple. Ese costo
-- es aceptable acá: patente_camion/patente_rampla se escriben una sola vez
-- por ticket (§2.6 del blueprint — no se vuelven a tocar en reinspecciones,
-- el conductor es el único dato de cabecera que cambia por revisión), nunca
-- en un flujo de escritura de alto volumen.
create extension if not exists pg_trgm;

create index tickets_patente_camion_trgm_idx
  on public.tickets using gin (patente_camion gin_trgm_ops);

create index tickets_patente_rampla_trgm_idx
  on public.tickets using gin (patente_rampla gin_trgm_ops);
