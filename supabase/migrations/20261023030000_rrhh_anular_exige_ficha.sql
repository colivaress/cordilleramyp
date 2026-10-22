-- Anular una asignación de jornada desde una cuenta SIN fila en personal
-- (un script con service role, o una cuenta sin ficha): el trigger ponía
-- anulada_por = private.personal_id() = NULL y la anulación reventaba con
-- 'violates check constraint "rrhh_jornada_trabajador_anulacion_completa"',
-- que no le dice nada a nadie. Ahora el trigger lo dice en español antes.
-- El check se queda como está: es la red, no el mensaje.
--
-- Ojo con service role: no tiene execute sobre private.personal_id(), así
-- que llamarla desde un script fallaba con "permission denied for function
-- personal_id" — tampoco legible. Sin auth.uid() (sesión de servicio) no
-- hay persona: se resuelve a NULL sin llamarla, y cae en el mismo mensaje.
-- Lo mismo para updated_by de una corrección hecha desde un script.
--
-- Solo se reemplaza la función; la migración de turnos (20261023020000:
-- exclusión, rastro, políticas) no cambia.

create or replace function private.rrhh_jornada_trabajador_corregir()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_persona uuid;
begin
  -- En una sentencia aparte, no en un CASE: Postgres revisa el permiso de
  -- toda función que aparece en una expresión al prepararla, aunque esa
  -- rama nunca se ejecute.
  if (select auth.uid()) is not null then
    v_persona := private.personal_id();
  end if;
  if old.anulada_en is not null then
    raise exception 'Esta asignación está anulada y ya no se puede modificar.' using errcode = 'check_violation';
  end if;
  if new.personal_id is distinct from old.personal_id
     or new.jornada_id is distinct from old.jornada_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Solo se puede corregir el rango de una asignación. Para otra jornada, anúlala y asigna la nueva.'
      using errcode = 'check_violation';
  end if;
  if nullif(btrim(new.motivo_cambio), '') is null then
    raise exception 'Escribe el motivo del cambio.' using errcode = 'check_violation';
  end if;
  if new.anulada_en is not null then
    if v_persona is null then
      raise exception 'No se puede anular: la cuenta que lo intenta no tiene ficha de personal asociada, y la anulación tiene que quedar a nombre de una persona.'
        using errcode = 'insufficient_privilege';
    end if;
    new.anulada_en := now();
    new.anulada_por := v_persona;
  end if;
  new.motivo_cambio := btrim(new.motivo_cambio);
  new.updated_at := now();
  new.updated_by := v_persona;
  return new;
end;
$$;
