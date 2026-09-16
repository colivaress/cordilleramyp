-- Corrige un único ticket de STAGING: ee413994-486a-45b9-90cd-430af352b076
-- (inspección #50 en ese entorno — el número no significa nada fuera de él,
-- por eso el WHERE usa el UUID, no numero_inspeccion; una migración corre en
-- todos los entornos y numero_inspeccion es una secuencia POR ENTORNO —
-- usarlo acá habría sobrescrito el estado de tickets #48/#49 de PRODUCCIÓN,
-- que son inspecciones distintas y probablemente reales).
--
-- Qué pasó: el bug de "Tomar" (tomarInspeccionConObservaciones seguido de
-- iniciarReinspeccion, que pisaba el estado sin condición — arreglado en
-- este mismo PR, ver tickets/actions.ts) le creó a este ticket una revisión
-- 2 vacía — cero respuestas del checklist, sin firmas. No es trabajo
-- perdido: nunca hubo trabajo, es el accidente que el fix de este PR ya no
-- puede producir.
--
-- Cirugía sobre esta fila puntual, no una regla genérica que barra
-- cualquier ticket que calce un patrón — los otros siete tickets de
-- staging que también quedaron en en_revision (44, 45, 46, 47, 48, 49, 52)
-- NO se tocan acá: a diferencia de este caso, su revisión 1 tiene los 18
-- ítems respondidos y estado_resultante = 'en_revision' — es decir, nunca
-- concluyeron. Moverlos a otro estado afirmaría algo falso (que concluyeron
-- con observaciones) y los haría aparecer como falso positivo en el
-- buscador de patentes. Esos siete quedan como pendiente de producto (no
-- hay forma de abandonar ni terminar una inspección incompleta), no como
-- bug de datos — no se migran.
--
-- IMPORTANTE — esta migración corre en TODOS los entornos (local, staging,
-- producción), pero el ticket solo existe en staging. En cualquier otro
-- entorno el UUID simplemente no matchea ninguna fila — eso tiene que ser
-- un no-op silencioso, no un error. Solo se falla fuerte si el ticket SÍ
-- existe acá pero su estado no es el que se verificó antes de escribir
-- esto (alguien lo tocó a mano, o el bug dejó un rastro distinto al
-- esperado) — ahí es mejor parar y revisar a mano que adivinar.
do $$
declare
  v_ticket_id uuid := 'ee413994-486a-45b9-90cd-430af352b076';
  v_estado_anterior public.ticket_estado;
  v_respondidas int;
  v_firma_conductor text;
  v_firma_fiscalizador text;
begin
  if not exists (select 1 from public.tickets where id = v_ticket_id) then
    -- No-op esperado fuera de staging.
    return;
  end if;

  -- El estado del ticket vuelve al estado_resultante de la revisión que
  -- SOBREVIVE (la 1) — derivado, no un valor fijo. Si mañana aparece otro
  -- caso con una revisión anterior distinta, esta misma lógica sigue
  -- siendo correcta sin tener que pensarlo de nuevo.
  select estado_resultante into v_estado_anterior
  from public.ticket_revisiones
  where ticket_id = v_ticket_id and numero_revision = 1;

  if v_estado_anterior is null then
    raise exception 'El ticket % existe en este entorno pero no tiene revisión 1 — no se puede derivar el estado anterior, revisar a mano', v_ticket_id;
  end if;

  -- Verificación de seguridad: si para cuando corra esta migración la
  -- revisión 2 ya tiene trabajo real (alguien la completó legítimamente
  -- entre que se detectó el bug y que se aplicó este fix), la migración
  -- falla fuerte en vez de borrar trabajo real en silencio.
  select count(*) filter (where estado is not null)
    into v_respondidas
  from public.ticket_checklist_respuestas
  where ticket_id = v_ticket_id and revision_numero = 2;

  select firma_conductor_url, firma_fiscalizador_url
    into v_firma_conductor, v_firma_fiscalizador
  from public.ticket_revisiones
  where ticket_id = v_ticket_id and numero_revision = 2;

  if v_respondidas > 0 or v_firma_conductor is not null or v_firma_fiscalizador is not null then
    raise exception 'La revisión 2 de % ya tiene trabajo real (% respuestas, firmas: %/%) — no se borra, revisar a mano',
      v_ticket_id, v_respondidas, v_firma_conductor, v_firma_fiscalizador;
  end if;

  delete from public.ticket_checklist_respuestas
  where ticket_id = v_ticket_id and revision_numero = 2;

  delete from public.ticket_revisiones
  where ticket_id = v_ticket_id and numero_revision = 2;

  update public.tickets
  set estado = v_estado_anterior, revision_actual = 1
  where id = v_ticket_id;
end $$;
