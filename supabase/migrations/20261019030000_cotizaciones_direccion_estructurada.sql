-- Origen y destino dejan de ser texto libre: pasan a calle+número, región y
-- comuna por separado.
--
-- PROBLEMA: `origen` y `destino` eran un solo campo abierto. "Puente Alto",
-- "puente alto" y "Pte. Alto" entraban como tres destinos distintos, y
-- muchas solicitudes llegaban sin comuna — que es justamente el dato que
-- define si un flete es local o interurbano, o sea lo primero que Jaime
-- necesita para cotizar. Reportado al ver el formulario andando.
--
-- CAMBIO: tres columnas por dirección. La calle sigue siendo texto libre
-- (no hay forma razonable de validarla sin un servicio de mapas), pero
-- región y comuna salen de un par de selectores encadenados alimentados por
-- `src/lib/chile.ts` — 16 regiones y 346 comunas— y el servidor verifica
-- que el par región/comuna exista de verdad antes de guardar. El selector
-- del navegador no es la validación: un POST armado a mano se lo salta.
--
-- POR QUÉ SE PUEDEN BORRAR `origen` Y `destino` SIN MÁS: esta funcionalidad
-- todavía no llega a producción (`main` no tiene la tabla) y en staging la
-- tabla está en cero filas. No hay un solo dato real que migrar. El backfill
-- de más abajo existe igual, para que la migración sea válida aunque alguien
-- la corra sobre un entorno con filas; con cero filas es un no-op.
--
-- NO se edita la migración 20261019010000 para arreglar esto, aunque sería
-- más prolijo: ya está aplicada en staging, y el CLI de Supabase compara
-- versiones, no contenido — editarla dejaría staging y un entorno nuevo con
-- esquemas distintos y nadie se enteraría.

begin;

alter table public.cotizaciones_fletes
  add column origen_calle text,
  add column origen_region text,
  add column origen_comuna text,
  add column destino_calle text,
  add column destino_region text,
  add column destino_comuna text;

-- Backfill defensivo. La calle hereda el texto libre que había; región y
-- comuna no se pueden deducir de ese texto, así que quedan marcadas como no
-- informadas en vez de inventarlas. Con cero filas, esto no hace nada.
update public.cotizaciones_fletes
set origen_calle    = coalesce(origen_calle, origen),
    destino_calle   = coalesce(destino_calle, destino),
    origen_region   = coalesce(origen_region, 'No informada'),
    origen_comuna   = coalesce(origen_comuna, 'No informada'),
    destino_region  = coalesce(destino_region, 'No informada'),
    destino_comuna  = coalesce(destino_comuna, 'No informada')
where origen_calle is null
   or destino_calle is null;

alter table public.cotizaciones_fletes
  alter column origen_calle set not null,
  alter column origen_region set not null,
  alter column origen_comuna set not null,
  alter column destino_calle set not null,
  alter column destino_region set not null,
  alter column destino_comuna set not null;

alter table public.cotizaciones_fletes
  drop column origen,
  drop column destino;

-- Para poder responder "¿cuántas solicitudes vienen de tal comuna?" sin
-- recorrer la tabla entera, que es la primera pregunta que va a aparecer
-- cuando haya volumen.
create index cotizaciones_fletes_comunas
  on public.cotizaciones_fletes (origen_comuna, destino_comuna);

commit;
