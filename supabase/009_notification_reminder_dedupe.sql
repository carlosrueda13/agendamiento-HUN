begin;

alter table public.notificaciones
  add column if not exists dedupe_key_hash text;

create unique index if not exists uq_notificaciones_recordatorio_dedupe
on public.notificaciones(canal, tipo, dedupe_key_hash)
where tipo = 'recordatorio' and dedupe_key_hash is not null;

comment on column public.notificaciones.dedupe_key_hash is
  'HMAC no reversible para idempotencia operativa; nunca contiene identificadores de cita o paciente en texto plano.';

commit;
