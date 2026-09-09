alter table personal
  add column if not exists fecha_nacimiento date;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.personal (nombre, apellido, rol, email, telefono, fecha_nacimiento, user_id)
  values (
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), new.email),
    nullif(new.raw_user_meta_data->>'apellido', ''),
    coalesce((new.raw_user_meta_data->>'rol')::public.rol_usuario, 'supervisor'),
    new.email,
    nullif(new.raw_user_meta_data->>'telefono', ''),
    nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date,
    new.id
  );
  return new;
end;
$function$;
