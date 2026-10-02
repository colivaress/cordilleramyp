-- Ítem nuevo "Foto evidencia" en Control de Salida, pedido del cliente:
-- mínimo 2 fotos (obligatorias), hasta 4 (las dos extra opcionales), SIEMPRE
-- (no solo cuando algo queda no conforme), sin Conforme/No conforme/No
-- aplica — es evidencia, no juicio. Bloquea el cierre de la revisión: Control
-- de Salida es el único tipo que autoriza (informe con declaración firmada,
-- lo usa el guardia de portería para dejar pasar el camión), y un documento
-- que autoriza sin evidencia de cómo salió no cumple su función.
--
-- `checklist_items.fotos_requeridas` hoy es UN número usado como "exactamente
-- esta cantidad" (los 4 ítems de Exportación Chimolsa). Ese modelo no alcanza
-- acá: hace falta un mínimo y un máximo distintos. Se agrega `fotos_maximas`
-- en vez de redefinir `fotos_requeridas` — para Chimolsa, `fotos_maximas =
-- fotos_requeridas` (mismo comportamiento de "cantidad exacta" que ya tiene,
-- sin tocar sus datos ni su validación real). El CHECK existente
-- (`checklist_items_fotos_requeridas_segun_modo`) se reemplaza por uno que
-- además exige `fotos_maximas >= fotos_requeridas` cuando `modo = 'fotos'`, y
-- `fotos_maximas` null cuando `modo = 'estado'` (mismo criterio que ya
-- aplicaba a `fotos_requeridas`).

alter table public.checklist_items
  add column fotos_maximas int;

-- Backfill ANTES del CHECK nuevo — mismo orden que ya usó
-- 20260910230000_checklist_items_fotos_requeridas.sql para no romper la
-- validación de las filas existentes en el mismo ALTER.
update public.checklist_items
  set fotos_maximas = fotos_requeridas
  where modo = 'fotos';

alter table public.checklist_items
  drop constraint checklist_items_fotos_requeridas_segun_modo;

alter table public.checklist_items
  add constraint checklist_items_fotos_min_max_segun_modo check (
    (
      modo = 'fotos'
      and fotos_requeridas is not null and fotos_requeridas > 0
      and fotos_maximas is not null and fotos_maximas >= fotos_requeridas
    )
    or (
      modo = 'estado'
      and fotos_requeridas is null
      and fotos_maximas is null
    )
  );

comment on column public.checklist_items.fotos_maximas is
  'Cantidad MÁXIMA de fotos que admite el ítem (>= fotos_requeridas), solo para modo = ''fotos'' (null si modo = ''estado''). Para los ítems de Exportación Chimolsa (cantidad exacta) coincide con fotos_requeridas. El componente de checklist muestra esta cantidad de espacios de carga; solo los primeros fotos_requeridas son obligatorios para cerrar la revisión.';

-- Ítem nuevo, al final del checklist de control_salida (orden 4, después de
-- sal_amarre_eslingas). Sin exigencia (igual que los demás ítems modo
-- 'fotos': no hay botón de información, piden solo la foto). `activo` no se
-- declara explícitamente — su default (true) es correcto para un ítem nuevo.
insert into public.checklist_items
  (key, nombre, exigencia, orden, tipo, modo, fotos_requeridas, fotos_maximas)
values (
  'sal_foto_evidencia',
  'Foto evidencia',
  null,
  4,
  'control_salida',
  'fotos',
  2,
  4
);

-- ─────────────────────────────────────────────────────────────────────────
-- Anotación de un hecho VERIFICADO contra la función real en la base — no
-- se toca ni se borra la recomendación de DEFERRABLE que ya existe en
-- 20260910210000_tipos_inspeccion_form_not_null.sql (sección 2): esa nota
-- puede seguir siendo válida por una razón que hoy no se ve, y una nota de
-- deuda borrada por inferencia es peor que una imprecisa. Esto solo agrega,
-- de forma durable y consultable en el propio objeto, el hecho puntual que
-- sí se confirmó al evaluar este ítem nuevo.
-- ─────────────────────────────────────────────────────────────────────────

comment on function public.chk_foto_obligatoria_si_no_conforme() is
  'Verificado en vivo (2026-10, al agregar checklist_items.sal_foto_evidencia): el guard `v_modo = ''estado''` ya hace que este trigger nunca levante excepción para un ítem checklist_items.modo = ''fotos'' — el IF completo da falso sin importar foto_url/estado. Esto NO resuelve ni descarta la recomendación de pasar a AFTER ... DEFERRABLE INITIAL DEFERRED anotada en 20260910210000_tipos_inspeccion_form_not_null.sql — esa recomendación sigue en pie, por una razón distinta a "evitar que rompa con ítems modo fotos" (eso ya no hacía falta, verificado).';
