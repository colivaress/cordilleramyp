create or replace function private.hizo_revision(
  p_ticket_id uuid,
  p_numero_revision int default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ticket_revisiones r
    where r.ticket_id = p_ticket_id
      and r.supervisor_id = private.personal_id()
      and (p_numero_revision is null or r.numero_revision = p_numero_revision)
  );
$$;
revoke execute on function private.hizo_revision(uuid, int) from public, anon;
grant execute on function private.hizo_revision(uuid, int) to authenticated;

drop policy if exists tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated using (
  private.es_admin()
  or supervisor_id = private.personal_id()
  or (
    private.personal_id() is not null
    and estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
  )
  or private.hizo_revision(id)
);

drop policy if exists ticket_revisiones_select on ticket_revisiones;
create policy ticket_revisiones_select on ticket_revisiones for select to authenticated using (
  private.es_admin()
  or exists (
    select 1 from tickets t
    where t.id = ticket_revisiones.ticket_id
      and (
        t.supervisor_id = private.personal_id()
        or t.estado in ('finalizada_con_observaciones', 'en_reparacion_de_observaciones')
      )
  )
  or private.hizo_revision(ticket_revisiones.ticket_id, ticket_revisiones.numero_revision)
);
