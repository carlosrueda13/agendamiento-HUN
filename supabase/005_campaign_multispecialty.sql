-- CAMPAIGN model addendum - multi-specialty campaigns.
-- A campaign can represent an operational cohort such as "PQRS Sanitas".
-- The required specialty for scheduling belongs to each recipient row.

alter table public.campanas
  alter column especialidad_codigo drop not null;

comment on column public.campanas.especialidad_codigo is
  'Optional default or legacy single-specialty target. Multi-specialty campaigns keep this null and rely on campana_destinatarios.especialidad_codigo per recipient.';

comment on column public.campana_destinatarios.especialidad_codigo is
  'Required per-recipient specialty code used to sign the campaign flow_token and filter HUN slots. This enables one campaign to contain multiple specialties.';

create index if not exists idx_destinatarios_campaign_especialidad_estado
  on public.campana_destinatarios(campaign_id, especialidad_codigo, estado_contacto);
