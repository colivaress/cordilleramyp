-- Corrige contar_tickets_con_patente_exacta (migración 20260916040000): el
-- buscador de patentes (tickets/actions.ts, ESTADOS_RELEVANTES_BUSQUEDA) deja
-- de mostrar `en_revision` en su listado — se probó en vivo que "Ver" sobre
-- un ticket en_revision no lleva a ninguna forma de continuarlo (la
-- recuperación real, PR #41, vive en localStorage del navegador que abrió la
-- inspección, no es alcanzable desde acá) — mostrarlo era un callejón sin
-- salida disfrazado de resultado útil. El buscador ahora muestra SOLO lo que
-- el supervisor puede accionar: finalizada_con_observaciones y
-- en_reparacion_de_observaciones.
--
-- Si esta función se queda contando en_revision mientras el listado ya no lo
-- muestra, el conteo SIN RLS (esta función) queda comparando un conjunto más
-- grande que el conteo CON RLS de hayCoincidenciaOcultaPara (que ya usa la
-- lista corregida) — el aviso de "coincidencia oculta" se dispararía en falso
-- por inspecciones en_revision que ya no son relevantes para esta pantalla.
--
-- 🔴 en_revision puede volver a esta lista (y a la de TS) el día que exista
-- una reanudación real del lado del servidor para una inspección a medio
-- hacer — hasta entonces, las dos listas quedan en dos estados.
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
  and t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones');
$$;

comment on function public.contar_tickets_con_patente_exacta(text) is
  'Cuenta tickets con esa patente EXACTA (camión o rampla) sin RLS (security definer) — nunca sabe qué tipos puede ver quien llama, eso lo decide buscarPorPatente (tickets/actions.ts) comparando este conteo contra el mismo predicado CON RLS. Coincidencia exacta, no substring — evita que se use como sonda de enumeración. La lista de estados de este WHERE tiene que coincidir EXACTAMENTE con ESTADOS_RELEVANTES_BUSQUEDA en tickets/actions.ts (hoy: finalizada_con_observaciones, en_reparacion_de_observaciones — en_revision se sacó de las dos listas a la vez, ver la migración 20260917010000) — si difieren, el conteo sin RLS y el conteo con RLS dejan de compartir predicado y la resta que calcula "hay algo oculto" puede mentir. NUNCA referenciar desde una política RLS de tickets (ni de ninguna tabla que una política de tickets pueda evaluar en el mismo statement): hoy se llama solo vía .rpc() desde un Server Action ya autenticado, así que el problema de las migraciones 21/22 (INSERT/UPDATE ... RETURNING sobre tickets no ve su propia fila todavía si la política se autoconsulta) no aplica — pero SOLO mientras siga así.';
