-- CAMPAIGN-001 addendum - Campaign recipients by pseudonymous audience reference.
-- This supports demand-induction campaigns where the phone/contact context is
-- resolved just-in-time from the HUN orchestrator and is not stored in Supabase.

alter table public.campana_destinatarios
  add column if not exists audiencia_ref text;

alter table public.campana_destinatarios
  alter column whatsapp_numero drop not null;

alter table public.campana_destinatarios
  alter column documento_hash drop not null;

create unique index if not exists ux_destinatarios_campaign_audiencia_ref
  on public.campana_destinatarios(campaign_id, audiencia_ref)
  where audiencia_ref is not null;

create index if not exists idx_destinatarios_audiencia_ref
  on public.campana_destinatarios(audiencia_ref)
  where audiencia_ref is not null;

comment on column public.campana_destinatarios.audiencia_ref is
  'Pseudonymous campaign audience reference, e.g. id_anonimo. It is used to resolve contact/context transiently through the HUN orchestrator. Do not store the resolved phone, name, email, EPS, doctor, appointment date/time, service, or full resolver payload.';

comment on column public.campana_destinatarios.whatsapp_numero is
  'Legacy/compatibility field. New demand-induction campaigns should resolve the phone transiently from audiencia_ref and should not persist it here.';

comment on column public.campana_destinatarios.documento_hash is
  'Legacy/compatibility field for flows that derive a non-reversible document reference. New demand-induction campaigns should prefer audiencia_ref.';
