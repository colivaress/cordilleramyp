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
-- CORRECCIÓN sobre el diseño original de este mismo PR (antes de mergear):
-- la nota anterior decía que ticket_revisiones/ticket_checklist_respuestas/
-- ticket_checklist_fotos/storage.objects heredaban el gate de tipo sin
-- tocarlas. Es cierto para la rama EXISTS (select ... from tickets t where
-- t.id = ...) de cada una — esa sí queda sujeta a tickets_select. Pero CINCO
-- lugares tienen ADEMÁS una rama propia que nunca pasa por esa EXISTS:
-- `private.hizo_revision(ticket_id)` **sin** `numero_revision` (o su
-- equivalente `private.hizo_revision(t.id)` dentro de
-- `puede_ver_ticket`/`puede_editar_ticket`). Esa función,
-- sin el segundo argumento, no pregunta "¿esta fila es mía?" — pregunta
-- "¿hice ALGUNA revisión de este ticket?", y si la respuesta es sí, la
-- condición da true para TODAS las filas del ticket, incluidas las que hizo
-- OTRO supervisor. Confirmado EMPÍRICAMENTE (no por lectura del SQL) contra
-- el stack local: un supervisor A que hizo la revisión 1 de un ticket, al
-- que luego se le revoca el tipo, seguía pudiendo:
--   - leer las respuestas del checklist y las fotos de la revisión 2 (hecha
--     por el supervisor C, no por A) vía ticket_checklist_respuestas/fotos;
--   - leer, LISTAR y SOBRESCRIBIR el archivo de firma de esa revisión 2 en
--     el bucket `firmas`, vía storage.objects (puede_ver_ticket/
--     puede_editar_ticket).
-- tickets_select/tickets_update (arriba en este mismo archivo) NO tienen este
-- problema: ya envolvían esa misma rama dentro de
-- `tiene_permiso_tipo(tipo_inspeccion) and (...)` desde el diseño original.
--
-- Fix: la misma envoltura en los 5 lugares que faltaban. Sigue siendo
-- seguro por la lección de las migraciones 21/22 — estos 5 lugares viven en
-- tablas DISTINTAS de `tickets` (o son funciones llamadas desde políticas de
-- otras tablas), así que consultar `tickets` desde ahí no es autorreferencial.
-- Las ramas "propia fila" (`supervisor_id = ...` directo,
-- `hizo_revision(ticket_id, numero_revision)` con ambos argumentos) NO se
-- tocan — están acotadas a filas del propio supervisor, comportamiento
-- aceptado (ver la revisión de este PR).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists ticket_revisiones_select on public.ticket_revisiones;
create policy ticket_revisiones_select on public.ticket_revisiones
  for select to authenticated
  using (
    private.es_admin()
    or supervisor_id = private.personal_id()
    or private.hizo_revision(ticket_id, numero_revision)
    or (
      private.hizo_revision(ticket_id)
      and private.tiene_permiso_tipo(
        (select t.tipo_inspeccion from public.tickets t where t.id = ticket_revisiones.ticket_id)
      )
    )
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_revisiones.ticket_id
        and (
          t.supervisor_id = private.personal_id()
          or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        )
    )
  );

drop policy if exists tcr_select on public.ticket_checklist_respuestas;
create policy tcr_select on public.ticket_checklist_respuestas
  for select to authenticated
  using (
    private.es_admin()
    or private.hizo_revision(ticket_id, revision_numero)
    or (
      private.hizo_revision(ticket_id)
      and private.tiene_permiso_tipo(
        (select t.tipo_inspeccion from public.tickets t where t.id = ticket_checklist_respuestas.ticket_id)
      )
    )
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_checklist_respuestas.ticket_id
        and (
          t.supervisor_id = private.personal_id()
          or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
        )
    )
  );

drop policy if exists tcf_select on public.ticket_checklist_fotos;
create policy tcf_select on public.ticket_checklist_fotos
  for select to authenticated
  using (
    exists (
      select 1 from public.ticket_checklist_respuestas r
      where r.id = ticket_checklist_fotos.respuesta_id
        and (
          private.es_admin()
          or private.hizo_revision(r.ticket_id, r.revision_numero)
          or (
            private.hizo_revision(r.ticket_id)
            and private.tiene_permiso_tipo(
              (select t.tipo_inspeccion from public.tickets t where t.id = r.ticket_id)
            )
          )
          or exists (
            select 1 from public.tickets t
            where t.id = r.ticket_id
              and (
                t.supervisor_id = private.personal_id()
                or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::ticket_estado[])
              )
          )
        )
    )
  );

-- puede_ver_ticket/puede_editar_ticket: usadas por storage.objects (buckets
-- fallas/firmas). Detectado en la MISMA ronda de pruebas empíricas: gatear
-- solo la rama hizo_revision (arriba) no alcanzaba — quedaba sin gate la
-- rama "soy el dueño del ticket" (t.supervisor_id = personal_id()), que en
-- tickets_select/tickets_update (más arriba en este archivo) SÍ está
-- envuelta en tiene_permiso_tipo desde el diseño original. Sin esto, un
-- supervisor al que se le revoca un tipo seguía pudiendo leer, listar y
-- SOBRESCRIBIR las firmas/fotos de un ticket propio de ese tipo en Storage,
-- aunque tickets_select ya bloqueara la fila del ticket en sí — confirmado
-- empíricamente contra el stack local antes de este ajuste. Ahora estas dos
-- funciones quedan con la MISMA estructura que tickets_select/tickets_update:
-- todo lo que no sea private.es_admin() pasa primero por tiene_permiso_tipo.
create or replace function private.puede_ver_ticket(p_ticket_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id::text = p_ticket_id
      and (
        private.es_admin()
        or (
          private.tiene_permiso_tipo(t.tipo_inspeccion)
          and (
            t.supervisor_id = private.personal_id()
            or (
              private.personal_id() is not null
              and t.estado = any (
                array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[]
              )
            )
            or private.hizo_revision(t.id)
          )
        )
      )
  );
$$;

create or replace function private.puede_editar_ticket(p_ticket_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id::text = p_ticket_id
      and (
        private.es_admin()
        or (
          private.tiene_permiso_tipo(t.tipo_inspeccion)
          and (
            t.supervisor_id = private.personal_id()
            or t.estado = any (
              array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[]
            )
            or private.hizo_revision(t.id)
          )
        )
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Lo que SIGUE sin tocarse, a propósito: las ramas "propia fila" en
-- ticket_revisiones_update, tcr_update/delete, tcf_update/delete
-- (`supervisor_id = ...` directo y `hizo_revision(ticket_id, numero_revision)`
-- con ambos argumentos) — confirmado que NINGUNA de esas políticas de
-- escritura tiene la rama ancha sin `numero_revision`; solo las de SELECT
-- (más puede_ver_ticket/puede_editar_ticket) la tenían. Así que no hace
-- falta ningún cambio en las políticas de insert/update/delete de
-- ticket_revisiones/ticket_checklist_respuestas/ticket_checklist_fotos.
