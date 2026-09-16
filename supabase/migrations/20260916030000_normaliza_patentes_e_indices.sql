-- Normaliza patente_camion/patente_rampla existentes en tickets, agrega un
-- CHECK que exige que sigan normalizadas, y agrega índices para el buscador
-- de patentes (PR siguiente, pantalla del inspector). Ver
-- src/lib/patentes.ts (normalizarPatente) para la ÚNICA fuente de la regla
-- en la aplicación — el SQL de abajo tiene que seguir coincidiendo
-- exactamente con esa función (mayúsculas, sin guiones/puntos/espacios —
-- TODOS los espacios se QUITAN, no se colapsan: "AB CD 12" y "ABCD12" son
-- la misma patente). Si normalizarPatente cambia alguna vez, esta
-- expresión SQL queda desfasada y el CHECK de más abajo empieza a
-- rechazar lo que el servidor sí guardaría — revisar los dos juntos.
--
-- Impacto verificado en staging con un SELECT de solo lectura, ANTES de
-- escribir este UPDATE (no se aplicó nada a mano — esta migración llega
-- por el pipeline):
--   - 58 tickets en total; 35 con patente_camion que cambia, 35 con
--     patente_rampla que cambia.
--   - CERO colisiones en ambas columnas: ningún par de valores hoy
--     DISTINTOS termina normalizando al mismo valor (se verificó agrupando
--     por el valor normalizado y buscando grupos con más de un valor crudo
--     distinto adentro — ninguno, con la regla de "quitar espacios"
--     también). Es decir, esta migración no fusiona dos camiones/ramplas
--     que hoy se consideran diferentes.
--   - Todos los cambios observados en los datos reales son de
--     capitalización (minúsculas -> MAYÚSCULAS, ej. "gggg77" -> "GGGG77",
--     "Bbv" -> "BBV") — no había guiones, puntos ni espacios internos en
--     ningún valor real de staging a esta fecha. Por eso hace falta el
--     CHECK de abajo Y un caso de prueba explícito con espacio en medio
--     (patentes.test.ts) — el bug de "colapsar en vez de quitar" es
--     invisible mirando solo este impacto real.

update public.tickets
set
  patente_camion = upper(regexp_replace(patente_camion, '[-.\s]+', '', 'g')),
  patente_rampla = upper(regexp_replace(patente_rampla, '[-.\s]+', '', 'g'))
where
  patente_camion <> upper(regexp_replace(patente_camion, '[-.\s]+', '', 'g'))
  or patente_rampla <> upper(regexp_replace(patente_rampla, '[-.\s]+', '', 'g'));

-- CHECK, no trigger — a propósito. El invariante no puede vivir solo en
-- normalizarPatente(): hoy tiene un único llamador (iniciarInspeccion),
-- pero el índice trigram de más abajo se arma sobre la columna CRUDA — un
-- solo valor que se cuele sin normalizar (un camino de escritura nuevo que
-- alguien agregue sin pasar por normalizarPatente, o un error futuro en esa
-- función) es un camión que el buscador nunca va a encontrar cuando alguien
-- busque su forma normalizada, y nadie se entera. Un trigger que "corrigiera"
-- el valor en silencio ocultaría ese código mal escrito en vez de hacerlo
-- fallar fuerte y notorio — un CHECK rechaza el INSERT/UPDATE con un error
-- que se nota de inmediato, en el lugar donde se escribió el bug.
--
-- Va DESPUÉS del backfill a propósito: si fuera antes, el backfill (que
-- todavía tiene filas sin normalizar en ese momento) violaría su propio
-- CHECK recién creado.
alter table public.tickets
  add constraint tickets_patente_camion_normalizada check (
    patente_camion = upper(regexp_replace(patente_camion, '[-.\s]+', '', 'g'))
  );

alter table public.tickets
  add constraint tickets_patente_rampla_normalizada check (
    patente_rampla = upper(regexp_replace(patente_rampla, '[-.\s]+', '', 'g'))
  );

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
--
-- Esquema explícito, a propósito: en este proyecto (confirmado consultando
-- pg_extension en staging) toda extensión ya instalada vive en el esquema
-- `extensions`, no en `public` — es la convención de Supabase-hosted,
-- distinta del default de un Postgres genérico (que instalaría en el primer
-- esquema del search_path, típicamente `public`). Local (Docker) y staging
-- pueden diferir justo en esto si no se especifica el esquema a mano, así
-- que se fija `with schema extensions` y se califica `gin_trgm_ops` con su
-- esquema en los dos índices — no se depende de que el `search_path` de
-- turno ya incluya `extensions` (hoy la incluye, pero no hay que confiar en
-- eso para que esta migración sea correcta).
create extension if not exists pg_trgm with schema extensions;

create index tickets_patente_camion_trgm_idx
  on public.tickets using gin (patente_camion extensions.gin_trgm_ops);

create index tickets_patente_rampla_trgm_idx
  on public.tickets using gin (patente_rampla extensions.gin_trgm_ops);
