-- Los destinatarios externos (fuera de Cordillera M&P) ahora pueden recibir
-- dos tipos de correo distintos y no relacionados entre sí:
--   - el informe de inspección que envía un supervisor/administrador a mano
--     (§4.1, ya existente — recibe_informes conserva el comportamiento de
--     siempre para las filas existentes, por eso default true);
--   - el aviso automático de vencimiento (48h/24h/vencido) que dispara el
--     cron — funcionalidad nueva, por eso default false: nadie empieza a
--     recibir avisos automáticos sin que un administrador lo habilite a
--     propósito para esa fila.
alter table public.destinatarios_correo
  add column recibe_informes boolean not null default true,
  add column recibe_vencimientos boolean not null default false;
