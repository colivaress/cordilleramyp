-- Fase "tipos de inspección con checklist propio" — Parte 2 de 4 (corrección
-- sobre el PR ya abierto, antes de mergear).
--
-- La cantidad de fotos obligatorias de un ítem de modo 'fotos' NO es una
-- constante (2 para todos) — varía por ítem:
--   exp_interior_contenedor -> 1
--   exp_paredes_exterior    -> 2
--   exp_carga_mitad         -> 1
--   exp_eir_sello           -> 1
-- Pasa a ser un dato del ítem, no del código.

alter table public.checklist_items
  add column fotos_requeridas int;

-- Se cargan los valores ANTES del CHECK de abajo — si el CHECK se agregara
-- primero, la validación de las filas ya existentes (los 4 ítems modo
-- 'fotos' de exportacion_chimolsa, con fotos_requeridas todavía en null)
-- fallaría en el mismo ALTER.
update public.checklist_items set fotos_requeridas = 1 where key = 'exp_interior_contenedor';
update public.checklist_items set fotos_requeridas = 2 where key = 'exp_paredes_exterior';
update public.checklist_items set fotos_requeridas = 1 where key = 'exp_carga_mitad';
update public.checklist_items set fotos_requeridas = 1 where key = 'exp_eir_sello';

-- Autoexplicativo: definida exactamente cuando modo = 'fotos' (y positiva),
-- nula cuando modo = 'estado' (esos ítems no piden fotos por sí mismos —
-- las fotos de un ítem modo 'estado' solo existen si queda no_conforme, y
-- siempre es una, vía el flujo viejo de foto_url/onFotoItem).
alter table public.checklist_items
  add constraint checklist_items_fotos_requeridas_segun_modo check (
    (modo = 'fotos' and fotos_requeridas is not null and fotos_requeridas > 0)
    or (modo = 'estado' and fotos_requeridas is null)
  );

comment on column public.checklist_items.fotos_requeridas is
  'Cantidad de fotos obligatorias del ítem, solo para modo = ''fotos'' (null si modo = ''estado''). El componente de checklist muestra exactamente esta cantidad de espacios de carga, y ticket_checklist_fotos.orden va de 1 a este valor.';
