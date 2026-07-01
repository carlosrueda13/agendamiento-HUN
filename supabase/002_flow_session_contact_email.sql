-- SETUP-002 addendum - transient encrypted email contact for Flow confirmation.
-- Run this only after supabase/001_minimal_operational_schema.sql exists.
-- This does not allow plain email, permanent patient profiles, or appointment data.

alter table public.flow_sesiones_temporales
  add column if not exists contacto_email_enc text,
  add column if not exists contacto_email_hmac text,
  add column if not exists contacto_email_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'flow_sesiones_contacto_email_ttl_chk'
  ) then
    alter table public.flow_sesiones_temporales
      add constraint flow_sesiones_contacto_email_ttl_chk
      check (
        contacto_email_expires_at is null
        or contacto_email_expires_at <= expires_at
      );
  end if;
end $$;

create index if not exists idx_flow_sesiones_contacto_email_expires_at
  on public.flow_sesiones_temporales(contacto_email_expires_at);

comment on column public.flow_sesiones_temporales.contacto_email_enc is
  'Email de contacto cifrado por backend, solo para confirmacion transitoria del Flow. No almacenar correo plano.';

comment on column public.flow_sesiones_temporales.contacto_email_hmac is
  'HMAC no reversible del email normalizado para idempotencia tecnica. No usar hash simple.';

comment on column public.flow_sesiones_temporales.contacto_email_expires_at is
  'Expiracion del email transitorio. Debe ser igual o menor a expires_at de la sesion.';
