alter table public.tickets
  add column if not exists numero_inspeccion bigint generated always as identity unique not null;

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated
  using ( private.es_admin() or supervisor_id = private.personal_id() );
