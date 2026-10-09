-- Siembra los 18 ítems originales del checklist de Encarpe.
--
-- POR QUÉ EXISTE
--
-- Estos 18 ítems se insertaron a mano durante la construcción inicial (son los
-- de §7 del blueprint) y nunca entraron al repositorio. La consecuencia salió a
-- la luz el 8-oct-2026: `supabase db reset` falla en
-- 20261002020000_bajas_catalogo_desencarpe_encarpe.sql con
-- "encarpe quedó con 0 ítems, se esperaban 17", porque esa migración borra el
-- ítem 'carga' y luego verifica que queden 17 — y en una base nueva no hay
-- ninguno. En la práctica: la base NO se podía reconstruir desde el repo.
--
-- UBICACIÓN: después de 20260903021840 (crea la tabla con 4 columnas y
-- `exigencia not null`) y antes de 20260910192759 (agrega `tipo` y `modo` con
-- default 'encarpe'/'estado', backfillea estos 18 en el mismo ALTER, y luego
-- quita el default de `tipo`).
--
-- EL GUARD NO ES DECORATIVO. Esta migración tiene un timestamp anterior al de
-- migraciones ya aplicadas en producción y staging, así que esos entornos la
-- van a ver como pendiente y la pueden aplicar fuera de orden. Para entonces
-- `tipo` ya existe, es NOT NULL y SIN default — un insert de 4 columnas dejaría
-- `tipo` en null y fallaría con violación de NOT NULL *antes* de evaluar el
-- `on conflict`. Verificado contra Postgres 16, no supuesto.
--
-- Por eso la siembra corre únicamente cuando la columna `tipo` todavía NO
-- existe, que es exactamente el caso de una base reconstruida desde cero. En
-- producción y staging no hace nada: ni inserta, ni toca los textos vigentes.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'checklist_items'
      and column_name  = 'tipo'
  ) then
    insert into public.checklist_items (key, nombre, exigencia, orden) values
      ('plataforma',        'Plataforma',                      'No debe presentar fisuras ni ovalaciones', 1),
      ('teleras_y_ganchos', 'Teleras y Ganchos',               'Las teleras deben estar en buen estado, los ganchos deben estar separados aprox. cada 60 cm', 2),
      ('carpas',            'Carpas',                          'Deben cubrir el ancho y alto de la carga, no debe presentar agujeros, no debe estar quemada', 3),
      ('nylon',             'Nylon',                           'Debe cubrir el largo carga, no presentar agujeros', 4),
      ('ponchos',           'Ponchos',                         'No deben presentar agujeros, no debe estar quemado', 5),
      ('cordeles',          'Cordeles',                        'No deben presentar nudos, estar picados o quemados', 6),
      ('cortinas',          'Cortinas',                        'No deben presentar fisuras, agujeros o encontrarse quemadas', 7),
      ('goma_drenaje',      'Gomas Drenaje',                   'No deben estar dañadas, quemadas o cortadas', 8),
      ('sider_broches',     'Slider (Broches sujeta cortina)', 'Deben estar en buen estado', 9),
      ('esquineros',        'Esquineros',                      'Mantener un mínimo de 30 esquineros de madera o plástico', 10),
      ('eslingas',          'Eslingas',                        'Sin piquetes, rajaduras, quemaduras ni nudos', 11),
      ('trinquetes',        'Trinquetes',                      'Deben estar en buen estado con sus seguros y mecanismos funcionando', 12),
      ('carga',             'Carga',                           'Debe venir bien estibada y/o prensada', 13),
      ('maletero',          'Maletero (Herramientas)',         'Deben estar en buen estado', 14),
      ('fugas',             'Fugas',                           'No deben tener fugas de agua o combustible', 15),
      ('luces',             'Luces',                           'Deben estar en buen estado', 16),
      ('neumaticos',        'Neumáticos',                      'Deben estar en buen estado', 17),
      ('cunas',             'Cuñas',                           'Debe contar con 2 cuñas de plástico o goma maciza', 18)
    on conflict (key) do nothing;
    raise log 'seed_checklist_encarpe: sembrados los 18 items de Encarpe';
  else
    raise log 'seed_checklist_encarpe: la columna tipo ya existe, no se siembra nada';
  end if;
end $$;
