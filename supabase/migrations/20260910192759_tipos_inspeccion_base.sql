-- Fase "tipos de inspección con checklist propio" — Parte 1 de 4, SOLO base
-- de datos. No hay código de aplicación que lea nada de esto todavía; la UI
-- sigue enviando/leyendo exactamente lo mismo que antes de esta migración.
--
-- Lección aplicada de 20260908221710_revierte_tickets_select_update_a_predicado_inline.sql:
-- private.puede_ver_ticket/puede_editar_ticket son seguros para políticas de
-- OTRAS tablas que referencian tickets (ya existía, storage.objects) pero NO
-- para políticas de la propia tabla tickets — un INSERT ... RETURNING (o un
-- UPDATE ... RETURNING) sobre tickets no ve su propia fila todavía dentro de
-- la misma sentencia si la política vuelve a consultar tickets. Por eso:
--   - Esta migración no toca ninguna política de `tickets` (ni falta que
--     hace: agregar columnas no requiere tocar RLS).
--   - Las políticas nuevas de `ticket_checklist_fotos` siguen el mismo patrón
--     que ya usan `tcr_select/insert/update/delete` sobre
--     `ticket_checklist_respuestas`: consultan `tickets` desde una tabla
--     DISTINTA vía JOIN/EXISTS, nunca se auto-referencian.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de tipos de inspección. El título se guarda tal cual (no se
--    compone en código) porque ya cambió de redacción una vez en este mismo
--    proyecto (ver CLAUDE.md §4, "el título del informe ya no debe llevar
--    'Cordillera M&P' adelante") y va a volver a cambiar.
-- ─────────────────────────────────────────────────────────────────────────

create table public.tipos_inspeccion (
  clave text primary key,
  titulo text not null
);

insert into public.tipos_inspeccion (clave, titulo) values
  ('control_salida', 'Informe de Inspección Control de Salida'),
  ('encarpe', 'Informe de Inspección Encarpe'),
  ('exportacion_chimolsa', 'Informe de Inspección Exportación Chimolsa'),
  ('desencarpe', 'Informe de Inspección Desencarpe');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. checklist_items: tipo (a qué catálogo pertenece el ítem) y modo (si se
--    responde con Conforme/No conforme/No aplica, o solo con fotos — caso
--    Exportación Chimolsa, que no tiene selector de estado ni botón de
--    información). El orden deja de ser global y pasa a ser único por tipo:
--    nunca existió un unique() sobre orden (ni global ni por tipo) antes de
--    esta migración, así que esto es una restricción nueva, no un cambio de
--    alcance de una que ya existiera.
-- ─────────────────────────────────────────────────────────────────────────

create type public.item_modo as enum ('estado', 'fotos');

-- exigencia pasa a nullable: los ítems de modo 'fotos' no tienen texto de
-- exigencia — no hay botón "i" para ellos (piden solo una foto, no una
-- evaluación Conforme/No conforme contra un criterio escrito).
alter table public.checklist_items
  alter column exigencia drop not null;

alter table public.checklist_items
  add column tipo text not null default 'encarpe' references public.tipos_inspeccion(clave),
  add column modo public.item_modo not null default 'estado';

-- El default de `tipo` solo existió para poder backfillear los 18 ítems de
-- Encarpe ya existentes en el mismo ALTER — se saca para que cualquier ítem
-- nuevo tenga que declarar su tipo explícitamente, nunca heredar 'encarpe'
-- por accidente.
alter table public.checklist_items
  alter column tipo drop default;

alter table public.checklist_items
  add constraint checklist_items_tipo_orden_unico unique (tipo, orden);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Ítems nuevos. Las keys de los 18 ítems de Encarpe (tipo/modo ya
--    quedaron en 'encarpe'/'estado' por el default de arriba) NO se tocan —
--    ticket_checklist_respuestas.item_key las referencia por llave foránea
--    y ya hay respuestas reales guardadas contra ellas.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.checklist_items (key, nombre, exigencia, orden, tipo, modo) values
  ('des_luces', 'Luces', 'Que prendan todas las luces reglamentarias por ley: focos, luz de freno, estacionamiento, etc.', 1, 'desencarpe', 'estado'),
  ('des_neumaticos', 'Neumáticos', 'Deben estar en buen estado, inflados correctamente, sin rajaduras ni protuberancias', 2, 'desencarpe', 'estado'),
  ('des_plataforma', 'Plataforma', 'Pueden ser lisa metálica, madera o diamantada. No debe presentar fisuras u ovalaciones, soldaduras u objetos sobresalientes', 3, 'desencarpe', 'estado'),
  ('des_teleras_ganchos', 'Teleras (Vigas) y Ganchos', 'Revisar la falta de ganchos, teleras o vigas dañadas', 4, 'desencarpe', 'estado'),
  ('des_carpas', 'Carpas Lona o Engomada', 'Debe contar con este implemento, debe cubrir largo y ancho de la carga, no debe presentar fisuras o agujeros, no debe estar quemada. Si es camión con cortina, seleccionar No aplica', 5, 'desencarpe', 'estado'),
  ('des_nylon', 'Nylon', 'Debe contar con este implemento. Si es camión con cortina, seleccionar No aplica', 6, 'desencarpe', 'estado'),
  ('des_ponchos', 'Ponchos', 'Debe contar con este implemento, debe cubrir largo y ancho de la carga, no debe presentar fisuras o agujeros, no debe estar quemado. Si es camión con cortina, seleccionar No aplica', 7, 'desencarpe', 'estado'),
  ('des_cordeles', 'Cordeles', 'No deben estar quemados, anudados ni piqueteados. Debe contar con este implemento. Si es camión con cortina, seleccionar No aplica', 8, 'desencarpe', 'estado'),
  ('des_cortinas', 'Cortinas (Camión Cortina)', 'Deben estar en buen estado. No deben presentar fisuras, agujeros ni estar quemadas. Si es camión plano, seleccionar No aplica', 9, 'desencarpe', 'estado'),
  ('des_gomas_drenaje', 'Gomas Drenaje (Camión Cortina)', 'Deberán estar en buen estado, no pueden estar dañadas y/o quemadas, no deben estar cortadas. Si es camión plano, seleccionar No aplica', 10, 'desencarpe', 'estado'),
  ('des_sider_broches', 'Sider (Broches sujeta cortina)', 'Deben estar todos en buen estado, no pueden faltar broches. Si es camión plano, seleccionar No aplica', 11, 'desencarpe', 'estado'),
  ('des_esquineros_30', '30 Esquineros', 'Deben contar con 30 esquineros como mínimo', 12, 'desencarpe', 'estado'),
  ('des_eslingas_15', '15 Eslingas', 'Deben contar con 15 eslingas como mínimo', 13, 'desencarpe', 'estado'),
  ('des_cubrepiso', 'Cubrepiso', 'Debe contar con una de estas opciones: alfombra, malla o papel', 14, 'desencarpe', 'estado'),
  ('des_cunas_2', '2 Cuñas', 'Deben contar con 2 cuñas como mínimo', 15, 'desencarpe', 'estado'),

  ('sal_tarimas', 'Tarimas', 'Que se encuentren en buen estado', 1, 'control_salida', 'estado'),
  ('sal_encarpado', 'Encarpado', 'Que cubra toda la carga y que no tenga orificios', 2, 'control_salida', 'estado'),
  ('sal_amarre_eslingas', 'Amarre (Eslingas)', 'Que se encuentren todas en posición correcta y firmes', 3, 'control_salida', 'estado'),

  ('exp_interior_contenedor', 'Foto al interior del contenedor', null, 1, 'exportacion_chimolsa', 'fotos'),
  ('exp_paredes_exterior', 'Foto a las paredes exteriores del contenedor', null, 2, 'exportacion_chimolsa', 'fotos'),
  ('exp_carga_mitad', 'Foto del contenedor con carga a la mitad', null, 3, 'exportacion_chimolsa', 'fotos'),
  ('exp_eir_sello', 'Foto al EIR y sello', null, 4, 'exportacion_chimolsa', 'fotos');

-- ─────────────────────────────────────────────────────────────────────────
-- 4. tickets: tipo de inspección (nullable a propósito, ver nota) + los tres
--    campos nuevos de cabecera que solo aplican a algunos tipos.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.tickets
  add column tipo_inspeccion text references public.tipos_inspeccion(clave),
  add column nombre_encarpador text,
  add column nombre_guardia text,
  add column nro_contenedor text;

update public.tickets set tipo_inspeccion = 'encarpe' where tipo_inspeccion is null;

-- NO se deja `not null` todavía: el formulario de "Nueva inspección" (parte
-- 2/4 de esta fase) todavía no manda `tipo_inspeccion` en el INSERT. Si se
-- pusiera not null acá, crear una inspección se rompería apenas se mergee
-- este PR a producción, antes de que el formulario exista. Pasa a not null
-- en la migración de la parte 2/4, una vez que el código ya lo envíe siempre.
comment on column public.tickets.tipo_inspeccion is
  'Nullable a propósito hasta la parte 2/4 de "tipos de inspección" (el formulario todavía no lo manda). Pasa a NOT NULL ahí, no antes.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. ticket_checklist_respuestas: estado nullable (los ítems de modo
--    'fotos' no tienen un Conforme/No conforme/No aplica que registrar) y el
--    CHECK de "foto obligatoria si no conforme" pasa a aplicar solo a ítems
--    de modo 'estado'.
--
--    Un CHECK constraint de Postgres no puede hacer subconsultas a otra
--    tabla (limitación del motor, no una elección de diseño) — no hay forma
--    de escribir `check (... or (select modo from checklist_items ...) = ...)`.
--    Por eso el constraint existente se reemplaza por un trigger que hace la
--    misma validación, consultando el modo del ítem en checklist_items.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.ticket_checklist_respuestas
  alter column estado drop not null;

alter table public.ticket_checklist_respuestas
  drop constraint if exists foto_obligatoria_si_no_conforme;

create or replace function public.chk_foto_obligatoria_si_no_conforme()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_modo public.item_modo;
begin
  select modo into v_modo
  from public.checklist_items
  where key = new.item_key;

  if v_modo = 'estado' and new.estado = 'no_conforme' and new.foto_url is null then
    raise exception 'foto_url es obligatorio cuando estado = no_conforme (ítem de modo ''estado'')';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_foto_obligatoria_si_no_conforme on public.ticket_checklist_respuestas;
create trigger trg_foto_obligatoria_si_no_conforme
  before insert or update on public.ticket_checklist_respuestas
  for each row execute function public.chk_foto_obligatoria_si_no_conforme();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. ticket_checklist_fotos: varias fotos por respuesta (hoy
--    ticket_checklist_respuestas.foto_url solo admite una). Se migran los
--    foto_url existentes; foto_url NO se borra todavía — la limpieza es de
--    un PR posterior, cuando el código ya lea de la tabla nueva.
-- ─────────────────────────────────────────────────────────────────────────

create table public.ticket_checklist_fotos (
  id uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ticket_checklist_respuestas(id) on delete cascade,
  url text not null,
  orden int not null default 1,
  created_at timestamptz not null default now(),
  unique (respuesta_id, orden)
);

insert into public.ticket_checklist_fotos (respuesta_id, url, orden)
select id, foto_url, 1
from public.ticket_checklist_respuestas
where foto_url is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. personal: tipos de inspección permitidos por supervisor.
--
--    Diseño elegido: tabla de unión `personal_tipos_inspeccion`
--    (personal_id, tipo_inspeccion), no un `text[]` en `personal`. Motivos:
--      - Integridad real: una FK contra tipos_inspeccion(clave) rechaza un
--        tipo mal escrito en el INSERT — un array de texto lo aceptaría
--        igual y el supervisor quedaría silenciosamente sin acceso a un
--        tipo por un typo, sin ningún error visible en ese momento.
--      - Consistencia con el resto del esquema: cada relación
--        "quién puede qué" de este proyecto (RLS de tickets vía
--        supervisor_id, hizo_revision(), etc.) ya se resuelve con filas y
--        EXISTS/JOIN, nunca con arrays — misma forma para una política
--        futura tipo "este supervisor puede crear una inspección de este
--        tipo" (un EXISTS contra esta tabla), sin un caso especial.
--      - on delete cascade desde personal_id: si se borra una fila de
--        personal, sus permisos de tipo no quedan huérfanos.
--    Compromiso aceptado: una fila por (supervisor, tipo) en vez de un solo
--    campo — con 4 tipos como máximo hoy, el volumen es mínimo.
-- ─────────────────────────────────────────────────────────────────────────

create table public.personal_tipos_inspeccion (
  personal_id uuid not null references public.personal(id) on delete cascade,
  tipo_inspeccion text not null references public.tipos_inspeccion(clave) on delete cascade,
  primary key (personal_id, tipo_inspeccion)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RLS de las tablas nuevas. NO se toca ninguna política de `tickets`.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.tipos_inspeccion enable row level security;
alter table public.ticket_checklist_fotos enable row level security;
alter table public.personal_tipos_inspeccion enable row level security;

-- tipos_inspeccion: mismo patrón que checklist_items/destinatarios_correo
-- (20260908210559) — lectura abierta a cualquier authenticated, escritura
-- solo administrador, con políticas separadas por comando (no un ALL).
create policy tipos_inspeccion_select on public.tipos_inspeccion
  for select to authenticated
  using (true);

create policy tipos_inspeccion_insert on public.tipos_inspeccion
  for insert to authenticated
  with check (private.es_admin());

create policy tipos_inspeccion_update on public.tipos_inspeccion
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

create policy tipos_inspeccion_delete on public.tipos_inspeccion
  for delete to authenticated
  using (private.es_admin());

-- ticket_checklist_fotos: mismo predicado que tcr_select/insert/update/delete
-- sobre ticket_checklist_respuestas (20260903022056 / 20260903022204), un
-- nivel más adentro vía respuesta_id -> ticket_checklist_respuestas. Nunca
-- se auto-referencia ni toca tickets directamente (ver nota al inicio).
create policy tcf_select on public.ticket_checklist_fotos
  for select to authenticated
  using (
    exists (
      select 1
      from public.ticket_checklist_respuestas r
      where r.id = ticket_checklist_fotos.respuesta_id
        and (
          private.es_admin()
          or private.hizo_revision(r.ticket_id, r.revision_numero)
          or private.hizo_revision(r.ticket_id)
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

create policy tcf_insert on public.ticket_checklist_fotos
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.ticket_checklist_respuestas r
      where r.id = ticket_checklist_fotos.respuesta_id
        and (
          private.es_admin()
          or exists (
            select 1 from public.tickets t
            where t.id = r.ticket_id
              and (
                t.supervisor_id = private.personal_id()
                or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
              )
          )
          or private.hizo_revision(r.ticket_id, r.revision_numero)
        )
    )
  );

create policy tcf_update on public.ticket_checklist_fotos
  for update to authenticated
  using (
    exists (
      select 1
      from public.ticket_checklist_respuestas r
      where r.id = ticket_checklist_fotos.respuesta_id
        and (
          private.es_admin()
          or exists (
            select 1 from public.tickets t
            where t.id = r.ticket_id
              and (
                t.supervisor_id = private.personal_id()
                or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
              )
          )
          or private.hizo_revision(r.ticket_id, r.revision_numero)
        )
    )
  );

create policy tcf_delete on public.ticket_checklist_fotos
  for delete to authenticated
  using (
    exists (
      select 1
      from public.ticket_checklist_respuestas r
      where r.id = ticket_checklist_fotos.respuesta_id
        and (
          private.es_admin()
          or exists (
            select 1 from public.tickets t
            where t.id = r.ticket_id
              and (
                t.supervisor_id = private.personal_id()
                or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
              )
          )
          or private.hizo_revision(r.ticket_id, r.revision_numero)
        )
    )
  );

-- personal_tipos_inspeccion: un supervisor ve sus propios permisos;
-- administrador ve y administra todos. Solo administrador escribe — es
-- quien decide qué tipos puede hacer cada supervisor, no el supervisor.
create policy pti_select on public.personal_tipos_inspeccion
  for select to authenticated
  using (
    private.es_admin()
    or personal_id = private.personal_id()
  );

create policy pti_insert on public.personal_tipos_inspeccion
  for insert to authenticated
  with check (private.es_admin());

create policy pti_update on public.personal_tipos_inspeccion
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

create policy pti_delete on public.personal_tipos_inspeccion
  for delete to authenticated
  using (private.es_admin());
