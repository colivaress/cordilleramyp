-- §5 del buscador de patentes (PR #47): función de solo-conteo para avisar
-- "existe una coincidencia en un tipo que no podés ver", sin exponer cuál.
--
-- TERCER diseño, tras dos rondas de revisión:
--
-- v1 (descartada) recibía `p_tipos_permitidos` como parámetro — defecto de
-- forma: una función security definer no puede recibir su propio alcance
-- de autorización como input, porque quien la ejecuta decide qué le pasa.
--
-- v2 (descartada) sacó ese parámetro pero, al no poder exponerla por
-- PostgREST (`private` no está en `schemas` de supabase/config.toml), se
-- resolvió llamándola desde `createAdminClient()` (service role) en vez de
-- como función. Eso cambiaba el problema, no lo resolvía: le entregaba la
-- base entera a la ruta de código de `buscarPorPatente` (el cuerpo de una
-- security definer es fijo — solo hace lo que dice el SQL; el cliente admin
-- no tiene ese límite, así que el radio de un error futuro en esa función
-- pasa de "una consulta de conteo" a "cualquier cosa"), y el término seguía
-- entrando concatenado en un `.or()` en vez de como parámetro ligado
-- (dependía de que la validación por regex en TS estuviera bien HOY y
-- siguiera estándolo después de la próxima edición).
--
-- v3 (esta): función en `public` (SÍ expuesta por PostgREST, se llama por
-- `.rpc()` con el término como parámetro ligado — la inyección queda
-- eliminada por construcción, no por una validación aparte que hay que
-- mantener). Sin `p_tipos_permitidos`: no sabe nada de permisos, cuenta
-- TODOS los tickets sin RLS que matchean la patente EXACTA. El Server
-- Action compara ese número contra el conteo del mismo predicado CON RLS —
-- la diferencia es el conjunto oculto. Exponerla a `authenticated` no
-- filtra nada que la pantalla no muestre ya: sin el parámetro de alcance,
-- la función responde una sola pregunta acotada ("¿existe algo para esta
-- patente EXACTA?"), la misma señal que ya se decidió mostrar.
--
-- COINCIDENCIA EXACTA, no substring — corrección sobre el diseño anterior,
-- que reusaba el mismo ILIKE '%término%' del listado visible. Con un
-- término de dos letras, un substring dispara la señal en casi cualquier
-- búsqueda (no informa nada) y sirve de sonda para enumerar coincidencias
-- letra por letra. La pregunta que hace la pantalla es "¿ESTE camión tiene
-- algo pendiente en un tipo que no veo?", y eso es una patente exacta. El
-- listado visible sigue siendo substring (ahí la RLS ya es el límite real,
-- la conveniencia de buscar parcial no lo compromete) — es SOLO la señal de
-- "hay algo oculto" la que se calcula por igualdad. Por eso compara contra
-- SU PROPIO par de conteos por igualdad (ver hayCoincidenciaOcultaPara en
-- tickets/actions.ts), nunca contra el largo del listado por substring —
-- si un lado comparara por substring y el otro por igualdad, ya no serían
-- el mismo predicado y la resta mentiría.
--
-- No normaliza el valor adentro: compara `=` directo contra
-- patente_camion/patente_rampla, que el CHECK constraint de la migración
-- 20260916030000 ya garantiza que están siempre en su forma normalizada —
-- el parámetro que llega acá también tiene que estarlo (normalizarPatente
-- se aplica en tickets/actions.ts antes de llamar esta función).
create or replace function public.contar_tickets_con_patente_exacta(
  p_patente_normalizada text
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.tickets t
  where (
    t.patente_camion = p_patente_normalizada
    or t.patente_rampla = p_patente_normalizada
  )
  and t.estado in ('en_revision', 'finalizada_con_observaciones', 'en_reparacion_de_observaciones');
$$;

comment on function public.contar_tickets_con_patente_exacta(text) is
  'Cuenta tickets con esa patente EXACTA (camión o rampla) sin RLS (security definer) — nunca sabe qué tipos puede ver quien llama, eso lo decide buscarPorPatente (tickets/actions.ts) comparando este conteo contra el mismo predicado CON RLS. Coincidencia exacta, no substring — evita que se use como sonda de enumeración. NUNCA referenciar desde una política RLS de tickets (ni de ninguna tabla que una política de tickets pueda evaluar en el mismo statement): hoy se llama solo vía .rpc() desde un Server Action ya autenticado, así que el problema de las migraciones 21/22 (INSERT/UPDATE ... RETURNING sobre tickets no ve su propia fila todavía si la política se autoconsulta) no aplica — pero SOLO mientras siga así.';

-- Permisos explícitos, no heredados del default: por defecto Postgres
-- otorga EXECUTE a PUBLIC en una función nueva. anon no tiene por qué poder
-- sondear patentes — solo un usuario autenticado (supervisor o
-- administrador) llega a esta función, siempre a través del Server Action.
revoke execute on function public.contar_tickets_con_patente_exacta(text) from public;
revoke execute on function public.contar_tickets_con_patente_exacta(text) from anon;
grant execute on function public.contar_tickets_con_patente_exacta(text) to authenticated;
