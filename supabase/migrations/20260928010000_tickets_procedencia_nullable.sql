-- Cambios al formulario de inspecciones pedidos por el cliente: el tipo
-- "control_salida" saca "Procedencia" del formulario (junto con "Nombre
-- Guardia", que ya era nullable). `tickets.procedencia` era `text not null`
-- desde el esquema inicial — el insert de una inspección nueva de
-- control_salida ya no trae valor para esa columna, así que tiene que
-- aceptar NULL. Sin cadena vacía ni valor centinela: NULL es el valor real
-- de "no aplica a este tipo".
--
-- No hace falta backfillear nada: las filas ya creadas con procedencia
-- (cualquier tipo) mantienen su valor tal cual, y los datos que hoy existen
-- en la tabla son de prueba, no producción real (no hay nada que preservar
-- ni migrar más allá de esto).

alter table public.tickets
  alter column procedencia drop not null;
