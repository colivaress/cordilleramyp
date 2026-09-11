-- Fase "tipos de inspección con checklist propio" — Parte 4 de 4.
--
-- Permisos por tipo: qué tipos puede REALIZAR y VER cada supervisor, según
-- personal_tipos_inspeccion (creada en la parte 1/4, sin usar hasta ahora).
-- El administrador ve y realiza los 4 tipos siempre, sin configuración —
-- eso ya lo cubre `private.es_admin()` en cada política de abajo.
--
-- REGLA (decisión de negocio, no ambigua): un supervisor SIN ninguna fila en
-- personal_tipos_inspeccion no puede realizar NI ver ninguna inspección. La
-- ausencia de permiso es ausencia de acceso, no acceso total — un
-- administrador que se olvida de marcar tipos no puede terminar abriéndole a
-- alguien las inspecciones de todos los clientes. Cero tipos asignados es
-- además un estado válido a propósito: sirve para suspender a un supervisor
-- sin desactivarle la cuenta (§2.10 de CLAUDE.md ya tiene "activo=false" para
-- lo otro).
--
-- Consecuencia de esta regla que HAY que resolver en la misma migración: hoy
-- personal_tipos_inspeccion está vacía para TODOS los supervisores (recién
-- esta parte agrega la pantalla para poblarla) — si se aplicara la regla de
-- arriba sin más, este mismo deploy dejaría a cualquier supervisor existente
-- sin poder crear ni ver ninguna inspección. Es la misma forma del problema
-- que ya mordió dos veces en esta fase (tipo_inspeccion NOT NULL adelantado
-- al código en la parte 2/4, checklist_items leído sin filtro por tipo en la
-- parte 2/4): una regla nueva y correcta, aplicada de golpe sobre datos que
-- todavía no la satisfacen. Se resuelve con un BACKFILL más abajo: se les
-- asignan los 4 tipos a todos los supervisores que ya existen, preservando
-- el comportamiento de hoy (todos pueden todo) para quien ya estaba — la
-- regla nueva (cero filas = cero acceso) rige de ahí en adelante para
-- cualquier supervisor que se cree después sin asignación explícita.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LECCIÓN DE LAS MIGRACIONES 21/22 (20260908210559 / 20260908221710), releída
-- antes de escribir esto: una política RLS sobre `tickets` nunca puede volver
-- a consultar `tickets` (ni directo ni a través de un helper) para decidir si
-- una fila es visible/editable — se rompe con cualquier INSERT/UPDATE ...
-- RETURNING sobre esa misma tabla, porque la sub-consulta no ve la fila
-- todavía no confirmada dentro de la misma sentencia. Por eso
-- `private.tiene_permiso_tipo` de abajo recibe un `text` (la clave del tipo)
-- y solo consulta `personal_tipos_inspeccion` — JAMÁS `tickets` — así es
-- seguro llamarla desde las políticas de `tickets` pasándole la columna de la
-- propia fila (`tiene_permiso_tipo(tickets.tipo_inspeccion)`), tanto en
-- políticas de SELECT como en el WITH CHECK de un INSERT ... RETURNING: el
-- valor de esa columna ya es parte de la fila que se está evaluando, no hace
-- falta re-consultar `tickets` para obtenerlo.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function private.tiene_permiso_tipo(p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Chequeo de existencia simple, sin ninguna rama "si no tiene filas,
  -- dejarlo pasar" — esa rama es exactamente el patrón que invierte la
  -- regla (cero filas terminaría dando acceso total en vez de ninguno).
  select exists (
    select 1 from public.personal_tipos_inspeccion pti
    where pti.personal_id = private.personal_id()
      and pti.tipo_inspeccion = p_tipo
  );
$$;

comment on function private.tiene_permiso_tipo(text) is
  'true solo si el supervisor tiene una fila en personal_tipos_inspeccion para ese tipo puntual. Sin ninguna fila -> false para cualquier tipo (sin acceso, no acceso total). Nunca consulta tickets — seguro de llamar desde las políticas de tickets con tickets.tipo_inspeccion como argumento, incluso en INSERT ... RETURNING (ver migraciones 21/22).';

-- ─────────────────────────────────────────────────────────────────────────
-- tickets_select: el gate de tipo se aplica a TODAS las ramas de supervisor
-- (propios, "con observaciones" de terceros, y los que revisó) — un
-- supervisor sin permiso para un tipo no debe ver ni sus propios tickets de
-- ese tipo si se lo revocan. Admin sin cambios (fuera del `and`).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    private.es_admin()
    or (
      private.tiene_permiso_tipo(tipo_inspeccion)
      and (
        supervisor_id = private.personal_id()
        or (
          private.personal_id() is not null
          and estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        )
        or private.hizo_revision(id)
      )
    )
  );

-- tickets_insert: WITH CHECK sobre la fila nueva — tipo_inspeccion ya es
-- parte de esa fila, no se re-consulta tickets (ver nota de arriba). Esta es
-- la ruta que hay que probar con una inspección real (iniciarInspeccion hace
-- INSERT ... RETURNING numero_inspeccion): la única manera de reproducir el
-- fallo de las migraciones 21/22 es ejecutando la sentencia de verdad.
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    private.es_admin()
    or (supervisor_id = private.personal_id() and private.tiene_permiso_tipo(tipo_inspeccion))
  );

-- tickets_update: mismo gate en USING y WITH CHECK, mismas ramas de siempre.
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using (
    private.es_admin()
    or (
      private.tiene_permiso_tipo(tipo_inspeccion)
      and (
        supervisor_id = private.personal_id()
        or estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        or private.hizo_revision(id)
      )
    )
  )
  with check (
    private.es_admin()
    or (
      private.tiene_permiso_tipo(tipo_inspeccion)
      and (
        supervisor_id = private.personal_id()
        or estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        or private.hizo_revision(id)
      )
    )
  );

-- tickets_delete: mismo criterio, por consistencia (nadie debería poder
-- borrar un ticket de un tipo que ya no tiene permitido).
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete to authenticated
  using (
    private.es_admin()
    or (supervisor_id = private.personal_id() and private.tiene_permiso_tipo(tipo_inspeccion))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- BACKFILL: preserva el comportamiento de hoy para todo supervisor que ya
-- existe — se le asignan los 4 tipos explícitamente. Idempotente
-- (on conflict do nothing): si se corre dos veces, o si algún supervisor ya
-- tenía filas cargadas a mano, no falla ni duplica.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.personal_tipos_inspeccion (personal_id, tipo_inspeccion)
select p.id, ti.clave
from public.personal p
cross join public.tipos_inspeccion ti
where p.rol = 'supervisor'
on conflict (personal_id, tipo_inspeccion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- DELIBERADAMENTE NO SE TOCAN las políticas de ticket_revisiones,
-- ticket_checklist_respuestas, ticket_checklist_fotos ni storage.objects
-- (fallas/firmas). Todas ellas heredan el filtro de tipo automáticamente:
-- cada una de sus políticas hace EXISTS (select ... from tickets t where
-- t.id = ...) o pasa por private.puede_ver_ticket/puede_editar_ticket (que sí
-- consultan tickets, y ESO es seguro ahí — ver la propia migración 22, que
-- documenta por qué ese patrón es correcto para políticas de OTRAS tablas,
-- nunca para políticas de la tabla tickets misma). Como Postgres aplica RLS
-- a toda referencia a una tabla, sin importar desde qué política se dispare,
-- ese EXISTS ya queda sujeto a la tickets_select recién actualizada.
--
-- Y en el código de la app, toda pantalla que muestra estas tablas hijas
-- (detalle del ticket, informe, re-inspección) primero hace
-- `select from tickets ... ; if (!ticket) notFound()` y recién después
-- consulta las tablas hijas — si tickets_select bloquea la fila, la página
-- corta ahí y nunca llega a pedirlas.
--
-- Deuda técnica anotada (no se resuelve acá): `ticket_revisiones_select` y
-- `ticket_checklist_respuestas`/`ticket_checklist_fotos` tienen además ramas
-- propias que NO pasan por ese EXISTS (`ticket_revisiones.supervisor_id =
-- private.personal_id()` directo, y las llamadas a `private.hizo_revision`)
-- — si algún día se agrega una consulta que lea esas tablas SIN pasar antes
-- por `tickets` (ninguna pantalla actual lo hace), esas ramas no llevarían el
-- gate de tipo. No se cierra ese hueco latente en este PR para no ampliar el
-- radio de cambio sobre RLS ya probado en producción — está anotado para
-- revisarlo si alguna vez aparece una consulta de ese tipo.
