-- La columna "Estado" de /usuarios decidía "Invitación pendiente" vs.
-- "Activo" mirando solo personal.user_id — pero inviteUserByEmail() crea la
-- cuenta de auth.users y el trigger handle_new_user la vincula ahí mismo, así
-- que user_id queda poblado desde el primer segundo. Con ese criterio,
-- cualquier persona invitada aparece "Activo" aunque nunca haya iniciado
-- sesión. El dato de verdad es auth.users.last_sign_in_at.
--
-- Mismo patrón que private.es_admin()/private.personal_id() (STABLE
-- SECURITY DEFINER, SET search_path TO ''), extendido a auth.users por
-- primera vez en este esquema — no había ninguna función así todavía
-- (verificado contra pg_proc antes de escribir esto, no asumido).
--
-- Devuelve un conjunto (personal_id, alguna_vez_inicio_sesion) para TODO el
-- personal, en una sola llamada — no una función parametrizada por
-- personal_id que habría que invocar una vez por fila. Nunca expone
-- ninguna otra columna de auth.users (ni email, ni raw_user_meta_data,
-- nada) — el único dato derivado que sale de acá es el booleano.
--
-- LEFT JOIN, no INNER JOIN — corregido en revisión. Un INNER JOIN
-- descartaba toda fila de personal con user_id nulo: exactamente las
-- filas del mecanismo de alta por fila precargada (el administrador crea
-- la fila, la persona se registra sola en /registro con ese correo — el
-- mismo mecanismo de las dos filas que se borraron en staging por quedar
-- reclamables). Esa persona es la que MÁS necesita salir como "nunca
-- inició sesión" — es sin excepción el caso "todavía no entró". Con
-- INNER JOIN el RPC directamente omitía su fila del resultado. Hoy el
-- código que llama (accesoPorPersonal[u.id] ?? false, en
-- UsuariosTabla.tsx) compensa esa ausencia con un valor por defecto
-- correcto — pero el contrato de la función no debería depender de que
-- quien la llama adivine bien qué hacer con una fila que falta.
--
-- La guarda de autorización vive DENTRO de la función, no en el código que
-- la llama: el `where` exige private.es_admin() o private.es_admin_contrato()
-- evaluados con auth.uid() (nunca un parámetro que el llamador controle). Si
-- quien llama no cumple ninguno de los dos, la función devuelve un conjunto
-- vacío — no un error, no filas de otra persona.
create or replace function private.estado_acceso_personal()
returns table(personal_id uuid, alguna_vez_inicio_sesion boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(au.last_sign_in_at is not null, false)
  from public.personal p
  left join auth.users au on au.id = p.user_id
  where private.es_admin() or private.es_admin_contrato();
$$;

revoke all on function private.estado_acceso_personal() from public, anon;
grant execute on function private.estado_acceso_personal() to authenticated;

-- supabase/config.toml expone solo schemas = ["public", "graphql_public"] a
-- PostgREST — verificado antes de escribir esto, no asumido. `private` no es
-- invocable vía supabase.rpc(): es por eso que ninguna función de `private`
-- se llama así hoy en el proyecto, todas se referencian solo dentro de
-- políticas RLS (evaluadas por Postgres directamente al correr una query,
-- nunca por PostgREST). Como esta pantalla necesita el dato desde una
-- Server Action normal, hace falta un punto de entrada en `public` — este
-- wrapper no duplica NINGUNA lógica de autorización, solo reenvía: toda la
-- guarda real (es_admin() OR es_admin_contrato(), vía auth.uid()) sigue
-- viviendo exclusivamente en private.estado_acceso_personal(), de arriba.
-- Sin SECURITY DEFINER acá — no hace falta, y con SECURITY DEFINER en la
-- función interna alcanza (esa es la que de verdad toca auth.users).
create or replace function public.estado_acceso_personal()
returns table(personal_id uuid, alguna_vez_inicio_sesion boolean)
language sql
stable
set search_path = ''
as $$
  select * from private.estado_acceso_personal();
$$;

revoke all on function public.estado_acceso_personal() from public, anon;
grant execute on function public.estado_acceso_personal() to authenticated;
