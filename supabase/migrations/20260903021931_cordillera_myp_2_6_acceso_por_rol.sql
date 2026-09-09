-- §2.6 — Acceso y visibilidad por rol + correlativo global de revisiones.

-- 1. Correlativo único a nivel de todo el sistema (nunca reinicia, sin race conditions).
alter table public.ticket_revisiones
  add column nro_revision_global bigint generated always as identity unique not null;

-- 2. Helpers en schema privado (no expuesto por PostgREST => sin warning de advisor).
create schema if not exists private;

create or replace function private.personal_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.personal where user_id = (select auth.uid())
$$;

create or replace function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.personal
    where user_id = (select auth.uid()) and rol = 'administrador'
  )
$$;

revoke all on function private.personal_id() from public;
revoke all on function private.es_admin() from public;
grant execute on function private.personal_id() to authenticated;
grant execute on function private.es_admin() to authenticated;

-- 3. RLS: reemplazar las políticas amplias (authenticated => todo) por políticas por rol.

-- 3a. TICKETS: supervisor ve/edita solo los suyos; admin todo.
drop policy if exists auth_read_tickets on public.tickets;
drop policy if exists auth_write_tickets on public.tickets;

create policy tickets_select on public.tickets for select to authenticated
  using ( private.es_admin() or supervisor_id = private.personal_id() );
create policy tickets_insert on public.tickets for insert to authenticated
  with check ( private.es_admin() or supervisor_id = private.personal_id() );
create policy tickets_update on public.tickets for update to authenticated
  using ( private.es_admin() or supervisor_id = private.personal_id() )
  with check ( private.es_admin() or supervisor_id = private.personal_id() );
create policy tickets_delete on public.tickets for delete to authenticated
  using ( private.es_admin() );

-- 3b. TICKET_REVISIONES: acceso derivado del ticket padre.
drop policy if exists auth_read_ticket_revisiones on public.ticket_revisiones;
drop policy if exists auth_write_ticket_revisiones on public.ticket_revisiones;

create policy ticket_revisiones_select on public.ticket_revisiones for select to authenticated
  using ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_revisiones.ticket_id and t.supervisor_id = private.personal_id()
  ));
create policy ticket_revisiones_insert on public.ticket_revisiones for insert to authenticated
  with check ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_revisiones.ticket_id and t.supervisor_id = private.personal_id()
  ));
create policy ticket_revisiones_update on public.ticket_revisiones for update to authenticated
  using ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_revisiones.ticket_id and t.supervisor_id = private.personal_id()
  ));

-- 3c. TICKET_CHECKLIST_RESPUESTAS: acceso derivado del ticket padre.
drop policy if exists auth_read_ticket_checklist_respuestas on public.ticket_checklist_respuestas;
drop policy if exists auth_write_ticket_checklist_respuestas on public.ticket_checklist_respuestas;

create policy tcr_select on public.ticket_checklist_respuestas for select to authenticated
  using ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_checklist_respuestas.ticket_id and t.supervisor_id = private.personal_id()
  ));
create policy tcr_insert on public.ticket_checklist_respuestas for insert to authenticated
  with check ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_checklist_respuestas.ticket_id and t.supervisor_id = private.personal_id()
  ));
create policy tcr_update on public.ticket_checklist_respuestas for update to authenticated
  using ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_checklist_respuestas.ticket_id and t.supervisor_id = private.personal_id()
  ));

-- 3d. NOTIFICACIONES: ver/crear solo las de tickets propios (envío de correo/WhatsApp); admin todas.
drop policy if exists auth_read_notificaciones on public.notificaciones;
drop policy if exists auth_write_notificaciones on public.notificaciones;

create policy notificaciones_select on public.notificaciones for select to authenticated
  using ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = notificaciones.ticket_id and t.supervisor_id = private.personal_id()
  ));
create policy notificaciones_insert on public.notificaciones for insert to authenticated
  with check ( private.es_admin() or exists (
    select 1 from public.tickets t
    where t.id = notificaciones.ticket_id and t.supervisor_id = private.personal_id()
  ));

-- 3e. PERSONAL: lectura sigue abierta a authenticated (joins de nombre de supervisor),
--     pero las escrituras solo admin — si no, un supervisor podría auto-promoverse a admin
--     y romper todo el control de acceso de §2.6. El alta normal la hace el trigger (definer).
drop policy if exists auth_write_personal on public.personal;
create policy personal_insert on public.personal for insert to authenticated
  with check ( private.es_admin() );
create policy personal_update on public.personal for update to authenticated
  using ( private.es_admin() ) with check ( private.es_admin() );
create policy personal_delete on public.personal for delete to authenticated
  using ( private.es_admin() );
