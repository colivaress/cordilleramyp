-- Cierra una puerta de escalada: hasta ahora, handle_new_user() (el trigger
-- AFTER INSERT sobre auth.users que vincula una cuenta nueva con su fila
-- pendiente en personal) buscaba solo por "email + user_id is null",
-- ignorando por completo `activo`. Una fila con user_id is null y
-- activo = false (una invitación que un administrador desactivó antes de
-- que la persona se registrara) seguía siendo reclamable por cualquiera
-- que conociera esa dirección de correo — en staging se encontraron dos
-- filas así, ambas con los 4 tipos de inspección ya preaprovisionados en
-- personal_tipos_inspeccion (no eran invitaciones vacías: alguien que las
-- reclamara quedaba con un supervisor con acceso a todo). Lo único que
-- frenaba el uso real de esa cuenta era el chequeo de `activo` en
-- getSesion() (src/lib/auth.ts) — el trigger nunca lo miraba.
--
-- Único cambio real: el `where` de la búsqueda ahora exige `activo` además
-- de `user_id is null`. Con esto, "activo = false" en una fila sin
-- user_id pasa a significar lo que un administrador espera que signifique
-- al presionar "Desactivar" sobre una invitación pendiente: revocada, no
-- reclamable por nadie. Todo lo demás —el orden de los checks, el mensaje
-- del raise exception, el coalesce del update, SECURITY DEFINER,
-- SET search_path— queda idéntico a la definición vigente (verificada
-- contra la base antes de escribir esto, no contra el historial de
-- migraciones): un alta nueva (agregarUsuario siempre inserta con
-- activo = true antes de invitar, en ese orden) sigue vinculando igual
-- que hoy.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.personal
  where lower(email) = lower(new.email) and user_id is null and activo
  limit 1;

  if v_id is null then
    raise exception 'Tu cuenta no está autorizada. Contacta a un administrador de Cordillera M&P.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.personal
  set user_id = new.id,
      nombre = coalesce(
        nullif(nombre, ''),
        nullif(new.raw_user_meta_data->>'nombre', ''),
        new.email
      ),
      apellido = coalesce(apellido, nullif(new.raw_user_meta_data->>'apellido', '')),
      telefono = coalesce(telefono, nullif(new.raw_user_meta_data->>'telefono', '')),
      fecha_nacimiento = coalesce(
        fecha_nacimiento,
        nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date
      )
  where id = v_id;

  return new;
end;
$$;
