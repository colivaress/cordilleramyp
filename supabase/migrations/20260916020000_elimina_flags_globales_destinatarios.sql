-- Cierra el huérfano que dejó 20260916010000: recibe_informes y
-- recibe_vencimientos en destinatarios_correo quedaron comentadas como
-- huérfanas, no borradas, con el mismo criterio que las observaciones
-- duplicadas de Chimolsa. Verificado (grep sobre src/) que ningún código
-- de la app las lee ni las escribe hoy — toda ruta de envío (informe,
-- cron de vencimientos) y el selector de destinatarios ya leen solo
-- destinatarios_correo_tipos, la tabla por tipo. Tampoco hay política RLS
-- ni otra migración que las referencie.
--
-- A diferencia de Chimolsa (dato inerte, sin riesgo si nadie lo lee), acá
-- recibe_informes queda con default true — una columna de autorización
-- con default permisivo que nadie lee hoy es el mismo patrón que produjo
-- el hoyo de autorización del PR #32 si alguna vez alguien vuelve a
-- leerla por error (o un cliente antiguo con un tipo generado antes de
-- este cambio). Se elimina en vez de dejarla comentada.
alter table public.destinatarios_correo
  drop column recibe_informes,
  drop column recibe_vencimientos;
