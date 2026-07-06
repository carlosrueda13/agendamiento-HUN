-- CAMPAIGN-001 - Optional operational owner for campaigns.
-- This field identifies the HUN team/person responsible for a campaign.
-- It must not contain patient names, document numbers, clinical data, or
-- appointment details.

alter table public.campanas
  add column if not exists responsable text;

comment on column public.campanas.responsable is
  'Responsable operativo de la campana. No almacenar datos sensibles de pacientes.';

create index if not exists idx_campanas_responsable
  on public.campanas(responsable);
