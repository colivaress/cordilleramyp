-- Rol `trabajador` (spec RRHH §16.7, "Mis datos"): entra solo a lo suyo —
-- sus datos, sus documentos y, más adelante, sus vacaciones y marcas. Nada
-- operativo.
--
-- Va en su propia migración, igual que administrador_contrato
-- (20260917020000): un valor nuevo de enum no se puede usar en la misma
-- transacción que lo agrega, y la migración siguiente lo usa en políticas.
alter type public.rol_usuario add value if not exists 'trabajador';
