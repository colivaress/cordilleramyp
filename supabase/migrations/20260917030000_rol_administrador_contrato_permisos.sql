-- Rol "Administrador de contrato" (administrador_contrato) — permisos.
-- Sigue a 20260917020000 (que solo agregó el valor al enum).
--
-- 🔴 REGLA DE ESTA MIGRACIÓN: private.es_admin() NO SE TOCA. Cada permiso de
-- este rol es una condición NUEVA (private.es_admin_contrato()) agregada con
-- OR al lado de private.es_admin() en cada política puntual — nunca una
-- ampliación de es_admin() mismo. Ensanchar es_admin() le daría a este rol
-- todo lo que tiene un administrador, incluido crear administradores, que es
-- exactamente lo que no puede hacer.
--
-- Alcance (ver el inventario acordado con el usuario, Fase 1 del rollout):
--   DENTRO (select, salvo que se diga lo contrario):
--     tickets, ticket_revisiones, ticket_checklist_respuestas,
--     ticket_checklist_fotos, storage.objects (firmas/fallas, vía
--     private.puede_ver_ticket) — solo lectura, sin restricción de tipo,
--     igual que un administrador.
--     personal: insert, update — CON restricción (ver más abajo).
--     personal_tipos_inspeccion, destinatarios_correo,
--     destinatarios_correo_tipos: select/insert/update/delete completo.
--     notificaciones: select, insert.
--   AFUERA (sin cambios, se queda solo en es_admin()):
--     insert/update/delete de tickets y sus tres tablas hijas.
--     personal: delete.
--     checklist_items, tipos_inspeccion: todo.
--     storage.objects: insert/update/delete (private.puede_editar_ticket).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Helper — espejo exacto de private.es_admin(), otro valor de rol.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function private.es_admin_contrato()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.personal
    where user_id = (select auth.uid()) and rol = 'administrador_contrato'
  );
$$;

comment on function private.es_admin_contrato() is
  'Análoga a private.es_admin() para el rol administrador_contrato. NUNCA agregar este rol dentro de es_admin() — cada permiso del rol es una condición propia, agregada con OR en la política puntual que corresponda, para que "no puede crear administradores ni editar checklist_items/tipos_inspeccion" siga siendo cierto sin excepciones.';

revoke all on function private.es_admin_contrato() from public, anon;
grant execute on function private.es_admin_contrato() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. tickets / ticket_revisiones / ticket_checklist_respuestas /
--    ticket_checklist_fotos — SOLO select, sin restricción de tipo (igual
--    que es_admin(), nunca detrás de private.tiene_permiso_tipo()).
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or (
      private.tiene_permiso_tipo(tipo_inspeccion)
      and (
        supervisor_id = private.personal_id()
        or (
          private.personal_id() is not null
          and estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[])
        )
        or private.hizo_revision(id)
      )
    )
  );

drop policy if exists ticket_revisiones_select on public.ticket_revisiones;
create policy ticket_revisiones_select on public.ticket_revisiones
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or supervisor_id = private.personal_id()
    or private.hizo_revision(ticket_id, numero_revision)
    or (
      private.hizo_revision(ticket_id)
      and private.tiene_permiso_tipo((select t.tipo_inspeccion from public.tickets t where t.id = ticket_revisiones.ticket_id))
    )
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_revisiones.ticket_id
        and (
          t.supervisor_id = private.personal_id()
          or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[])
        )
    )
  );

drop policy if exists tcr_select on public.ticket_checklist_respuestas;
create policy tcr_select on public.ticket_checklist_respuestas
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or private.hizo_revision(ticket_id, revision_numero)
    or (
      private.hizo_revision(ticket_id)
      and private.tiene_permiso_tipo((select t.tipo_inspeccion from public.tickets t where t.id = ticket_checklist_respuestas.ticket_id))
    )
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_checklist_respuestas.ticket_id
        and (
          t.supervisor_id = private.personal_id()
          or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[])
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
          or private.es_admin_contrato()
          or private.hizo_revision(r.ticket_id, r.revision_numero)
          or (
            private.hizo_revision(r.ticket_id)
            and private.tiene_permiso_tipo((select t.tipo_inspeccion from public.tickets t where t.id = r.ticket_id))
          )
          or exists (
            select 1 from public.tickets t
            where t.id = r.ticket_id
              and (
                t.supervisor_id = private.personal_id()
                or t.estado = any (array['finalizada_con_observaciones', 'en_reparacion_de_observaciones']::public.ticket_estado[])
              )
          )
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. storage.objects (firmas/fallas) — el select ya usaba
--    private.puede_ver_ticket(); extenderla ahí alcanza para la política,
--    sin tocarla. private.puede_editar_ticket() NO se toca (AFUERA: este rol
--    no sube ni borra fotos/firmas).
-- ─────────────────────────────────────────────────────────────────────────
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
        or private.es_admin_contrato()
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

-- ─────────────────────────────────────────────────────────────────────────
-- 4. personal — insert y update CON restricción: nunca crear ni dejar una
--    fila en rol = 'administrador'. La misma expresión en USING (fila
--    VIEJA, bloquea tocar una fila que ya es admin) y WITH CHECK (fila
--    NUEVA, bloquea dejarla en admin) — entre insert (solo WITH CHECK) y
--    los dos lados de update, quedan los tres chequeos que hacían falta
--    (crear como admin / editar una fila admin / dejar una fila como
--    admin), los tres en la RLS, ninguno en el código de la aplicación.
--    delete se queda solo en es_admin() — este rol nunca borra una fila.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists personal_insert on public.personal;
create policy personal_insert on public.personal
  for insert to authenticated
  with check (
    private.es_admin()
    or (private.es_admin_contrato() and rol <> 'administrador'::public.rol_usuario)
  );

drop policy if exists personal_update on public.personal;
create policy personal_update on public.personal
  for update to authenticated
  using (
    private.es_admin()
    or (private.es_admin_contrato() and rol <> 'administrador'::public.rol_usuario)
  )
  with check (
    private.es_admin()
    or (private.es_admin_contrato() and rol <> 'administrador'::public.rol_usuario)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. personal_tipos_inspeccion — completo (select/insert/update/delete):
--    "asignar y quitar tipos de inspección a los usuarios que administra"
--    exige poder ver lo asignado hoy, no solo escribirlo.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists pti_select on public.personal_tipos_inspeccion;
create policy pti_select on public.personal_tipos_inspeccion
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or personal_id = private.personal_id()
  );

drop policy if exists pti_insert on public.personal_tipos_inspeccion;
create policy pti_insert on public.personal_tipos_inspeccion
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

drop policy if exists pti_update on public.personal_tipos_inspeccion;
create policy pti_update on public.personal_tipos_inspeccion
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

drop policy if exists pti_delete on public.personal_tipos_inspeccion;
create policy pti_delete on public.personal_tipos_inspeccion
  for delete to authenticated
  using (private.es_admin() or private.es_admin_contrato());

-- ─────────────────────────────────────────────────────────────────────────
-- 6. destinatarios_correo / destinatarios_correo_tipos — completo
--    (insert/update/delete; select ya era `true`, abierto a cualquier
--    authenticated, sin cambio).
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists destinatarios_correo_insert on public.destinatarios_correo;
create policy destinatarios_correo_insert on public.destinatarios_correo
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

drop policy if exists destinatarios_correo_update on public.destinatarios_correo;
create policy destinatarios_correo_update on public.destinatarios_correo
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

drop policy if exists destinatarios_correo_delete on public.destinatarios_correo;
create policy destinatarios_correo_delete on public.destinatarios_correo
  for delete to authenticated
  using (private.es_admin() or private.es_admin_contrato());

drop policy if exists destinatarios_correo_tipos_insert on public.destinatarios_correo_tipos;
create policy destinatarios_correo_tipos_insert on public.destinatarios_correo_tipos
  for insert to authenticated
  with check (private.es_admin() or private.es_admin_contrato());

drop policy if exists destinatarios_correo_tipos_update on public.destinatarios_correo_tipos;
create policy destinatarios_correo_tipos_update on public.destinatarios_correo_tipos
  for update to authenticated
  using (private.es_admin() or private.es_admin_contrato())
  with check (private.es_admin() or private.es_admin_contrato());

drop policy if exists destinatarios_correo_tipos_delete on public.destinatarios_correo_tipos;
create policy destinatarios_correo_tipos_delete on public.destinatarios_correo_tipos
  for delete to authenticated
  using (private.es_admin() or private.es_admin_contrato());

-- ─────────────────────────────────────────────────────────────────────────
-- 7. notificaciones — select/insert: necesario para que enviar el informe
--    de un ticket ajeno (§api/informe/[id]/enviar) funcione para este rol,
--    igual que ya funciona para administrador.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists notificaciones_select on public.notificaciones;
create policy notificaciones_select on public.notificaciones
  for select to authenticated
  using (
    private.es_admin()
    or private.es_admin_contrato()
    or exists (
      select 1 from public.tickets t
      where t.id = notificaciones.ticket_id and t.supervisor_id = private.personal_id()
    )
  );

drop policy if exists notificaciones_insert on public.notificaciones;
create policy notificaciones_insert on public.notificaciones
  for insert to authenticated
  with check (
    private.es_admin()
    or private.es_admin_contrato()
    or exists (
      select 1 from public.tickets t
      where t.id = notificaciones.ticket_id and t.supervisor_id = private.personal_id()
    )
  );
