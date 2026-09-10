-- Fase "tipos de inspección con checklist propio" — Parte 2 de 4.
--
-- El formulario de nueva inspección (InspeccionForm.tsx) ya manda siempre
-- `tipo_inspeccion` al crear un ticket (combo obligatorio, primera posición
-- de "1. Datos de Inspección"). Con el código desplegado, esta columna pasa
-- de nullable-a-propósito (ver el comentario que dejó la migración
-- 20260910192759_tipos_inspeccion_base.sql) a NOT NULL de verdad.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Verificación previa: no debe quedar ninguna fila en null antes de
--    aplicar la restricción — la parte 1/4 backfilleó todo a 'encarpe', pero
--    se confirma en vez de asumirlo (por ejemplo, si algún ticket se creó
--    entre el merge de la parte 1 y el de esta parte 2, por una ruta que
--    todavía no mandaba el campo).
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  v_nulos int;
begin
  select count(*) into v_nulos
  from public.tickets
  where tipo_inspeccion is null;

  if v_nulos > 0 then
    raise exception
      'No se puede aplicar NOT NULL: quedan % ticket(s) con tipo_inspeccion en null.',
      v_nulos;
  end if;
end $$;

alter table public.tickets
  alter column tipo_inspeccion set not null;

comment on column public.tickets.tipo_inspeccion is
  'Tipo de inspección del ticket (tipos_inspeccion.clave), fijo desde que se crea — nunca cambia entre revisiones. NOT NULL desde la parte 2/4 de "tipos de inspección" (antes era nullable a propósito, ver el historial de esta columna en la migración 20260910192759_tipos_inspeccion_base.sql).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Deuda técnica anotada, NO resuelta en este PR (instrucción explícita:
--    no tocar el trigger acá) — ver punto 11 de la especificación de esta
--    parte 2/4.
--
--    public.chk_foto_obligatoria_si_no_conforme() sigue validando contra
--    ticket_checklist_respuestas.foto_url (la columna vieja, de una sola
--    foto). El código de esta parte 2/4 escribe DOS COSAS a propósito para
--    no romper ese trigger: foto_url con la primera foto del ítem (orden 1),
--    y además las filas reales en ticket_checklist_fotos (orden 1 y 2) — ver
--    guardarFotoChecklistItem() en src/app/(app)/tickets/actions.ts.
--
--    Cuando foto_url se elimine (una parte futura de esta misma fase), el
--    trigger trg_foto_obligatoria_si_no_conforme debería pasar de
--    BEFORE INSERT OR UPDATE a AFTER INSERT OR UPDATE ... DEFERRABLE INITIAL
--    DEFERRED: una validación que depende de filas hijas (cuántas fotos tiene
--    la respuesta en ticket_checklist_fotos) no puede vivir en un BEFORE
--    INSERT sobre el padre (ticket_checklist_respuestas), porque esas filas
--    hijas todavía no existen en ese momento — el INSERT de la respuesta
--    siempre ocurre antes que el INSERT de sus fotos. Es la misma forma del
--    problema ya documentado en 20260908221710_revierte_tickets_select_update_a_predicado_inline.sql
--    (un INSERT ... RETURNING no ve, dentro de la misma sentencia, lo que
--    todavía no se comprometió) — ahí era una política RLS re-consultando su
--    propia tabla; acá es un trigger BEFORE consultando una tabla hija que
--    todavía no tiene sus filas. AFTER ... DEFERRABLE INITIAL DEFERRED
--    resuelve el mismo tipo de problema en ambos casos: corre al final de la
--    transacción, cuando las filas hijas ya existen.
