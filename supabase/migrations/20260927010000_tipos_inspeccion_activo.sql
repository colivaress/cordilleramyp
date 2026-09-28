-- Deshabilita el tipo de inspección "exportacion_chimolsa" sin borrarlo del
-- modelo: la inspección Nro 70 (y cualquier otra ya creada con este tipo) ya
-- existe en producción con `tickets.tipo_inspeccion = 'exportacion_chimolsa'`,
-- y ese valor sigue siendo válido — su ficha de detalle, su informe, su
-- etiqueta en listados/dashboard y `checklist_items.tipo` (que referencia
-- `tipos_inspeccion(clave)`) dependen de que la fila siga existiendo tal
-- cual. Lo único que cambia es que deja de ofrecerse como opción nueva.
--
-- `activo` vive en la tabla real que ya alimenta el combo de "Nueva
-- inspección" (tickets/new/page.tsx consulta `tipos_inspeccion` filtrada por
-- los permisos del supervisor) — filtrar por acá basta para sacarlo del
-- combo sin tocar los mapas estáticos ORDEN_TIPOS_INSPECCION/
-- ETIQUETA_TIPO_INSPECCION (src/lib/tipos.ts), que siguen usándose tal cual
-- para renderizar tickets ya existentes (detalle, informe, listados).
--
-- Las pantallas de configuración de correos por tipo
-- (configuracion/correos/alertas y .../informes) consultan esta misma tabla
-- SIN filtrar por `activo` — a propósito: un administrador tiene que poder
-- seguir viendo/editando los destinatarios_correo_tipos ya configurados para
-- este tipo, aunque ya no se puedan crear inspecciones nuevas de ese tipo.

alter table public.tipos_inspeccion
  add column if not exists activo boolean not null default true;

update public.tipos_inspeccion
  set activo = false
  where clave = 'exportacion_chimolsa';
