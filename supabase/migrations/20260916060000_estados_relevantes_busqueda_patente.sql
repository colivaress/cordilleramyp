-- Corrige contar_tickets_con_patente_exacta (migración 20260916040000): el
-- buscador de patentes (tickets/actions.ts) dejó de mostrar `en_revision`
-- en su listado — un ticket en revisión normal no es "una observación
-- pendiente de corregir", es trabajo en curso — pero esta función seguía
-- contando ese estado en su lista propia. Si el listado ya no lo muestra y
-- esta función lo sigue contando, el conteo SIN RLS (esta función) queda
-- comparando un conjunto más grande que el conteo CON RLS de
-- hayCoincidenciaOcultaPara (que ya usa la lista corregida, ESTADOS_
-- RELEVANTES_BUSQUEDA en TS) — el aviso de "coincidencia oculta" se
-- dispararía por inspecciones `en_revision` de otro supervisor que ya no
-- son relevantes para esta pantalla: falso positivo en la misma pantalla
-- que existe para evitar falsos negativos.
--
-- Redefine con la MISMA lista de estados que ESTADOS_RELEVANTES_BUSQUEDA en
-- src/app/(app)/tickets/actions.ts: solo 'finalizada_con_observaciones' y
-- 'en_reparacion_de_observaciones'. 'en_reparacion_de_observaciones' se
-- queda a propósito — es una observación que alguien ya está reparando,
-- exactamente lo que esta pantalla existe para señalar.
--
-- 🔴 Esta lista y la de TS NO pueden importarse una a la otra (SQL vs. TS,
-- de lados distintos del proceso de build) — quien cambie una tiene que
-- acordarse de cambiar la otra a mano. No hay (todavía) una verificación
-- automática que lo impida; ver el comentario en ESTADOS_RELEVANTES_BUSQUEDA
-- (tickets/actions.ts) para el mismo aviso desde el lado TS.
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
  'Cuenta tickets con esa patente EXACTA (camión o rampla) sin RLS (security definer) — nunca sabe qué tipos puede ver quien llama, eso lo decide buscarPorPatente (tickets/actions.ts) comparando este conteo contra el mismo predicado CON RLS. Coincidencia exacta, no substring — evita que se use como sonda de enumeración. La lista de estados de este WHERE tiene que coincidir EXACTAMENTE con ESTADOS_RELEVANTES_BUSQUEDA en tickets/actions.ts (hoy: finalizada_con_observaciones, en_reparacion_de_observaciones) — si difieren, el conteo sin RLS y el conteo con RLS dejan de compartir predicado y la resta que calcula "hay algo oculto" puede mentir. NUNCA referenciar desde una política RLS de tickets (ni de ninguna tabla que una política de tickets pueda evaluar en el mismo statement): hoy se llama solo vía .rpc() desde un Server Action ya autenticado, así que el problema de las migraciones 21/22 (INSERT/UPDATE ... RETURNING sobre tickets no ve su propia fila todavía si la política se autoconsulta) no aplica — pero SOLO mientras siga así.';
