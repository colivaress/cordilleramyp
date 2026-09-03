-- 1. Vincular personal con auth.users
alter table personal add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- 2. Trigger: al crear un usuario en auth, crear su fila en personal desde la metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.personal (nombre, rol, email, user_id)
  values (
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), new.email),
    coalesce((new.raw_user_meta_data->>'rol')::public.rol_usuario, 'supervisor'),
    new.email,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. RLS: habilitar en todas las tablas de negocio.
--    MVP: cualquier usuario autenticado puede operar; anónimo no accede a nada.
alter table personal enable row level security;
alter table destinatarios_correo enable row level security;
alter table checklist_items enable row level security;
alter table tickets enable row level security;
alter table ticket_revisiones enable row level security;
alter table ticket_checklist_respuestas enable row level security;
alter table notificaciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'personal','destinatarios_correo','checklist_items','tickets',
    'ticket_revisiones','ticket_checklist_respuestas','notificaciones'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'auth_read_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'auth_write_' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      'auth_read_' || t, t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'auth_write_' || t, t
    );
  end loop;
end $$;

-- 4. Storage: buckets privados para firmas y fotos de fallas (§6)
insert into storage.buckets (id, name, public)
values ('firmas', 'firmas', false), ('fallas', 'fallas', false)
on conflict (id) do nothing;

drop policy if exists "cmyp auth select objetos" on storage.objects;
drop policy if exists "cmyp auth insert objetos" on storage.objects;
drop policy if exists "cmyp auth update objetos" on storage.objects;
drop policy if exists "cmyp auth delete objetos" on storage.objects;

create policy "cmyp auth select objetos" on storage.objects
  for select to authenticated using (bucket_id in ('firmas', 'fallas'));
create policy "cmyp auth insert objetos" on storage.objects
  for insert to authenticated with check (bucket_id in ('firmas', 'fallas'));
create policy "cmyp auth update objetos" on storage.objects
  for update to authenticated using (bucket_id in ('firmas', 'fallas'));
create policy "cmyp auth delete objetos" on storage.objects
  for delete to authenticated using (bucket_id in ('firmas', 'fallas'));
