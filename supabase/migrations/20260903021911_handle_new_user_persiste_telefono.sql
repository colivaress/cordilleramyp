create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.personal (nombre, rol, email, telefono, user_id)
  values (
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), new.email),
    coalesce((new.raw_user_meta_data->>'rol')::public.rol_usuario, 'supervisor'),
    new.email,
    nullif(new.raw_user_meta_data->>'telefono', ''),
    new.id
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
