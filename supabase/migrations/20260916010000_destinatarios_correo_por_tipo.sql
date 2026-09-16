-- Destinatarios por tipo de inspección — modelo. Sin pantalla en este PR;
-- cambia el modelo y quién recibe qué, preservando exactamente el
-- comportamiento actual hasta que un administrador ajuste algo desde la
-- pantalla que viene después.
--
-- Antes de escribir cualquier política acá: releída la lección de las
-- migraciones 21/22 (documentada en src/lib/resultado-accion.ts y en la
-- memoria del proyecto) — el problema de esas migraciones fue una política
-- de SELECT que volvía a consultar la MISMA tabla que un INSERT ...
-- RETURNING acababa de tocar, sin ver todavía la fila recién insertada. Las
-- políticas de acá (`using (true)` para SELECT, `private.es_admin()` para
-- escritura) no vuelven a consultar `destinatarios_correo_tipos` — y
-- `private.es_admin()` solo consulta `public.personal`, una tabla distinta
-- — así que no aplica esa forma del problema.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. El modelo: una fila por destinatario y por tipo, cada una con sus dos
--    flags — misma forma que `personal_tipos_inspeccion` (20260910192759):
--    tabla de unión con integridad referencial contra el catálogo de tipos,
--    no un array de texto ni cuatro columnas booleanas nuevas. Es la
--    tercera vez que este proyecto resuelve un "quién puede qué" así
--    (personal_tipos_inspeccion, y antes que esa, ninguna — este es el
--    patrón a seguir de acá en más).
-- ─────────────────────────────────────────────────────────────────────────

create table public.destinatarios_correo_tipos (
  destinatario_id uuid not null references public.destinatarios_correo(id) on delete cascade,
  tipo_inspeccion text not null references public.tipos_inspeccion(clave) on delete cascade,
  recibe_informes boolean not null default false,
  recibe_vencimientos boolean not null default false,
  primary key (destinatario_id, tipo_inspeccion)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill que preserva el comportamiento actual: una fila por tipo para
--    cada destinatario ya existente, copiando sus flags globales de hoy.
--    Quien recibía todos los informes (recibe_informes = true a nivel
--    global) sigue recibiendo los cuatro tipos después de este backfill —
--    ajustar la configuración fina queda para la pantalla del admin, no
--    para esta migración.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.destinatarios_correo_tipos
  (destinatario_id, tipo_inspeccion, recibe_informes, recibe_vencimientos)
select d.id, t.clave, d.recibe_informes, d.recibe_vencimientos
from public.destinatarios_correo d
cross join public.tipos_inspeccion t;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Las columnas viejas (`destinatarios_correo.recibe_informes` /
--    `recibe_vencimientos`) NO se borran en esta migración — quedan
--    huérfanas: ningún código de la aplicación las lee ni las escribe desde
--    este PR en adelante (la validación de envío de informes y el cron de
--    vencimiento pasan a consultar `destinatarios_correo_tipos`). Mismo
--    criterio que `nro_revision_global` (20260903021931) y las
--    observaciones duplicadas de Chimolsa (20260911153000): no hace falta
--    una migración destructiva para dejar de usar una columna, y borrarla
--    ahora arriesgaría romper algo que todavía no se auditó por completo.
--    Si en el futuro se confirma que nada las usa (ni reportes, ni
--    exports), se pueden dropear en una migración aparte.
-- ─────────────────────────────────────────────────────────────────────────

comment on column public.destinatarios_correo.recibe_informes is
  'Huérfana desde destinatarios_correo_tipos (20260916010000) — la app ya no la lee ni la escribe. No se borra todavía, ver el comentario de esa migración.';
comment on column public.destinatarios_correo.recibe_vencimientos is
  'Huérfana desde destinatarios_correo_tipos (20260916010000) — la app ya no la lee ni la escribe. No se borra todavía, ver el comentario de esa migración.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Índice único en destinatarios_correo.email — estaba pendiente desde
--    antes; con una pantalla que va a permitir agregar correos a mano, los
--    duplicados dejan de ser hipotéticos. Comparación insensible a
--    mayúsculas (la app siempre compara en minúsculas al validar
--    destinatarios) — sin esto, "Juan@x.cl" y "juan@x.cl" conviven como dos
--    filas distintas y el índice no los detecta como el mismo destinatario.
-- ─────────────────────────────────────────────────────────────────────────

create unique index destinatarios_correo_email_unico
  on public.destinatarios_correo (lower(email));

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS de la tabla nueva — mismo patrón que tipos_inspeccion/
--    checklist_items/destinatarios_correo (20260908210559): lectura
--    abierta a cualquier authenticated, escritura solo administrador, con
--    políticas separadas por comando (nunca un ALL con using(true)/
--    check(true) — esa fue exactamente la falla que corrigió esa
--    migración).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.destinatarios_correo_tipos enable row level security;

create policy destinatarios_correo_tipos_select on public.destinatarios_correo_tipos
  for select to authenticated
  using (true);

create policy destinatarios_correo_tipos_insert on public.destinatarios_correo_tipos
  for insert to authenticated
  with check (private.es_admin());

create policy destinatarios_correo_tipos_update on public.destinatarios_correo_tipos
  for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

create policy destinatarios_correo_tipos_delete on public.destinatarios_correo_tipos
  for delete to authenticated
  using (private.es_admin());
