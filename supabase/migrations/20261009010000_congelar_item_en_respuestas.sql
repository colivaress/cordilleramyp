-- Congela en cada respuesta del checklist el nombre, orden y modo que tenía
-- el ítem del catálogo al momento de crearse la respuesta.
--
-- PROBLEMA: las tres pantallas de lectura (detalle del ticket, informe en
-- pantalla, informe PDF) traían nombre/orden/modo en vivo por JOIN a
-- checklist_items. Editar el catálogo reescribía informes ya firmados — y un
-- renumerado (como el de 20261002020000) además los REORDENABA, porque el
-- PDF y el informe ordenan por orden. Un informe que cambia después de
-- firmado deja de probar lo que dice probar.
--
-- QUÉ SE CONGELA Y POR QUÉ:
--   item_nombre — es el texto del documento.
--   item_orden  — define el orden de las filas (y su numeración 1..n).
--   item_modo   — define la FORMA en que se renderiza el ítem (fila
--                 Conforme/No conforme vs. bloque de fotos). Si cambiara en
--                 el catálogo, un informe viejo con estado=null y fotos se
--                 mostraría como "Sin responder" y perdería sus fotos. La
--                 respuesta guardada solo tiene sentido con el modo con que
--                 se capturó.
--   NO se congela exigencia (ninguna lectura del informe la renderiza; solo
--   el botón "i" al capturar) ni fotos_requeridas (regla de validación al
--   capturar/cerrar; ninguna lectura la usa para renderizar).
--
-- CÓMO SE LLENA: trigger BEFORE INSERT, no en los sitios de llamada. Hoy ya
-- hay cuatro caminos que insertan filas (prepararRevision, guardarRespuestaItem
-- —que además borra y reinserta—, marcarItemsConforme y
-- scripts/seed-demo-data.ts); un quinto que se olvide de copiar los campos
-- dejaría un informe sin congelar en silencio. Con el trigger ningún camino,
-- presente o futuro, puede olvidarse. En un UPDATE (incluido el DO UPDATE de
-- un upsert) las columnas no se tocan salvo que el payload las incluya, y
-- ningún camino de la app las incluye.
--
-- BACKFILL: a esta fecha no hay informes reales (marcha blanca), así que se
-- copia el catálogo actual y las columnas quedan NOT NULL desde ya.

begin;

alter table public.ticket_checklist_respuestas
  add column item_nombre text,
  add column item_orden int,
  add column item_modo public.item_modo;

update public.ticket_checklist_respuestas r
set item_nombre = c.nombre,
    item_orden  = c.orden,
    item_modo   = c.modo
from public.checklist_items c
where c.key = r.item_key;

alter table public.ticket_checklist_respuestas
  alter column item_nombre set not null,
  alter column item_orden  set not null,
  alter column item_modo   set not null;

-- security definer: la copia no debe depender de que la RLS de
-- checklist_items deje leer el ítem a quien inserta.
create or replace function public.congelar_item_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.checklist_items%rowtype;
begin
  if new.item_nombre is not null
     and new.item_orden is not null
     and new.item_modo is not null then
    return new;
  end if;

  select * into v_item
  from public.checklist_items
  where key = new.item_key;

  if not found then
    raise exception 'El ítem % no existe en checklist_items', new.item_key;
  end if;

  new.item_nombre := coalesce(new.item_nombre, v_item.nombre);
  new.item_orden  := coalesce(new.item_orden,  v_item.orden);
  new.item_modo   := coalesce(new.item_modo,   v_item.modo);
  return new;
end;
$$;

revoke execute on function public.congelar_item_checklist() from public, anon, authenticated;

-- El nombre importa: los triggers BEFORE de una tabla corren en orden
-- alfabético, y este tiene que correr antes que
-- trg_foto_obligatoria_si_no_conforme, que ahora lee new.item_modo.
create trigger trg_congelar_item_checklist
  before insert on public.ticket_checklist_respuestas
  for each row execute function public.congelar_item_checklist();

-- La validación "foto obligatoria si no conforme" usa el modo congelado de
-- la respuesta, no el vivo del catálogo — misma fuente que el informe.
create or replace function public.chk_foto_obligatoria_si_no_conforme()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.item_modo = 'estado' and new.estado = 'no_conforme' and new.foto_url is null then
    raise exception 'foto_url es obligatorio cuando estado = no_conforme (ítem de modo ''estado'')';
  end if;

  return new;
end;
$$;

commit;
