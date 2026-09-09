alter table tickets
  add column if not exists alerta_naranja_enviada boolean not null default false;
