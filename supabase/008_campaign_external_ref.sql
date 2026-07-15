-- PANEL-001 - External campaign reference for administrative panel idempotency.
-- This optional business reference prevents duplicate campaigns when the panel
-- retries a request. It does not add personal, clinical, or appointment data.

alter table public.campanas
  add column if not exists referencia_externa text;

create unique index if not exists idx_campanas_referencia_externa
  on public.campanas(referencia_externa)
  where referencia_externa is not null;
