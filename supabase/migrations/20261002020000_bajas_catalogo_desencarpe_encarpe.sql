-- Bajas de catálogo pedidas por el cliente (La Papelera) el 2026-10-02,
-- durante la entrega. Borrado duro aprobado por Carlos: a esta fecha no se
-- ha emitido ningún informe real al cliente, así que no hay documento
-- entregado que esta baja pueda contradecir.
--
-- DESENCARPE — se eliminan 5 ítems:
--   orden 3  des_plataforma     Plataforma
--   orden 6  des_nylon          Nylon
--   orden 12 des_esquineros_30  30 Esquineros
--   orden 13 des_eslingas_15    15 Eslingas
--   orden 14 des_cubrepiso      Cubrepiso
--
-- ENCARPE — se elimina 1 ítem:
--   orden 13 carga              Carga
--
-- Además se completa la exigencia (texto del botón "i") del ítem
-- des_estado_recepcion_carga, que se creó con exigencia null en
-- 20260928020000.
--
-- ORDEN DE BORRADO Y FK: ticket_checklist_respuestas.item_key referencia
-- checklist_items(key) SIN on delete cascade, así que las respuestas van
-- primero o la FK rechaza el delete. ticket_checklist_fotos sí cascadea
-- desde respuestas (respuesta_id ... on delete cascade), por eso no se
-- borra explícitamente. Son las dos únicas dependencias: checklist_items
-- no tiene otras tablas apuntándole.
--
-- BORRAR RESPUESTAS CAMBIA HISTORIAL: las inspecciones ya finalizadas que
-- tenían estas filas van a mostrar menos ítems que antes. Es consistente y
-- deliberado — las pantallas de lectura (detalle, informe en pantalla,
-- informe PDF) usan ticket_checklist_respuestas como tabla base y hacen
-- JOIN a checklist_items solo para nombre/orden, así que una inspección
-- vieja muestra exactamente las respuestas que le quedan, nunca filas en
-- blanco. Las filas afectadas son de inspecciones de prueba.
--
-- RENUMERADO EN DOS FASES: checklist_items tiene UNIQUE (tipo, orden). Un
-- renumerado en una sola sentencia puede chocar contra el índice único
-- mientras se aplica fila por fila, así que primero se desplazan todos los
-- orden a +1000 (rango libre) y después se asignan los definitivos 1..n,
-- que no se solapan con los desplazados.

begin;

-- 1. Texto del botón "i" de "Estado recepción de carga".
--    "Pilar" es deliberado: son los parantes, pero en la operación de La
--    Papelera les dicen pilar. No corregir a "parante".
update public.checklist_items
set exigencia = 'Pilar en buen estado y libre de cargas. Cada fardo debe estar amarrado con eslinga en buen estado.'
where key = 'des_estado_recepcion_carga';

-- 2. Respuestas que apuntan a los ítems que se van (y sus fotos, por cascada).
delete from public.ticket_checklist_respuestas
where item_key in (
  'des_plataforma',
  'des_nylon',
  'des_esquineros_30',
  'des_eslingas_15',
  'des_cubrepiso',
  'carga'
);

-- 3. Los ítems del catálogo.
delete from public.checklist_items
where key in (
  'des_plataforma',
  'des_nylon',
  'des_esquineros_30',
  'des_eslingas_15',
  'des_cubrepiso',
  'carga'
);

-- 4. Renumerado sin huecos, fase 1: correr a un rango libre.
update public.checklist_items
set orden = orden + 1000
where tipo in ('desencarpe', 'encarpe');

-- 5. Renumerado fase 2: 1..n por tipo, respetando el orden relativo previo.
with nuevo as (
  select key, row_number() over (partition by tipo order by orden) as orden_nuevo
  from public.checklist_items
  where tipo in ('desencarpe', 'encarpe')
)
update public.checklist_items ci
set orden = nuevo.orden_nuevo
from nuevo
where ci.key = nuevo.key;

-- 6. Red de seguridad: si algo quedó mal, la migración falla acá y no a
--    medias. Desencarpe queda con 11 ítems y Encarpe con 17.
do $$
declare
  n_des int;
  n_enc int;
  huecos int;
begin
  select count(*) into n_des from public.checklist_items where tipo = 'desencarpe';
  select count(*) into n_enc from public.checklist_items where tipo = 'encarpe';

  if n_des <> 11 then
    raise exception 'desencarpe quedó con % ítems, se esperaban 11', n_des;
  end if;
  if n_enc <> 17 then
    raise exception 'encarpe quedó con % ítems, se esperaban 17', n_enc;
  end if;

  select count(*) into huecos
  from (
    select tipo, orden, row_number() over (partition by tipo order by orden) as esperado
    from public.checklist_items
    where tipo in ('desencarpe', 'encarpe')
  ) t
  where t.orden <> t.esperado;

  if huecos > 0 then
    raise exception 'quedaron % ítems con orden fuera de secuencia', huecos;
  end if;

  if exists (
    select 1 from public.checklist_items
    where key = 'des_estado_recepcion_carga' and exigencia is null
  ) then
    raise exception 'des_estado_recepcion_carga quedó sin exigencia';
  end if;
end $$;

commit;
