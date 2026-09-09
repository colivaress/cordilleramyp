create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id
  from public.personal
  where lower(email) = lower(new.email) and user_id is null
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
$function$;
