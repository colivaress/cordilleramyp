alter table tickets
  add column if not exists alerta_admin_48h_enviada boolean not null default false,
  add column if not exists alerta_admin_24h_enviada boolean not null default false,
  add column if not exists alerta_admin_vencido_enviada boolean not null default false;
