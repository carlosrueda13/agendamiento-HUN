-- SETUP-002 - Minimal non-sensitive Supabase schema for Agendamiento HUN.
-- Run this in the Supabase SQL editor for the target project.
-- Do not add appointment numbers, plain document numbers, EPS, doctors,
-- appointment date/time, CUPS/procedure details, HUN payloads, orders,
-- authorizations, attachments, tokens, private keys, or service role keys.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  especialidad_codigo text not null,
  mensaje_template_id text,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'programada', 'enviando', 'activa', 'cerrada', 'cancelada')),
  origen_datos text,
  responsable text,
  cupos_objetivo integer check (cupos_objetivo is null or cupos_objetivo >= 0),
  total_destinatarios integer not null default 0 check (total_destinatarios >= 0),
  total_enviados integer not null default 0 check (total_enviados >= 0),
  total_respondidos integer not null default 0 check (total_respondidos >= 0),
  total_flow_iniciados integer not null default 0 check (total_flow_iniciados >= 0),
  total_agendados integer not null default 0 check (total_agendados >= 0),
  total_fallidos integer not null default 0 check (total_fallidos >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at_campanas on public.campanas;
create trigger set_updated_at_campanas
before update on public.campanas
for each row execute function public.set_updated_at();

create table if not exists public.campana_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  whatsapp_numero text not null,
  tipo_documento text,
  documento_hash text not null,
  especialidad_codigo text not null,
  estado_contacto text not null default 'pendiente'
    check (estado_contacto in (
      'pendiente',
      'enviado',
      'entregado',
      'leido',
      'respondido',
      'flow_iniciado',
      'agendado',
      'no_interesado',
      'fallido',
      'excluido'
    )),
  opt_out boolean not null default false,
  motivo_exclusion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, documento_hash, especialidad_codigo)
);

drop trigger if exists set_updated_at_campana_destinatarios on public.campana_destinatarios;
create trigger set_updated_at_campana_destinatarios
before update on public.campana_destinatarios
for each row execute function public.set_updated_at();

create table if not exists public.flow_sesiones_temporales (
  session_id text primary key default gen_random_uuid()::text,
  flow_token text unique,
  whatsapp_numero text,
  estado text not null default 'identificando'
    check (estado in (
      'identificando',
      'eligiendo_especialidad',
      'eligiendo_slot',
      'confirmando',
      'procesando_asignacion',
      'completado',
      'fallido',
      'cancelacion_solicitada',
      'cancelacion_procesando',
      'cancelada'
    )),
  especialidad_codigo text,
  slot_token text,
  contacto_email_enc text,
  contacto_email_hmac text,
  contacto_email_expires_at timestamptz,
  last_error_code text,
  last_error_category text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_sesiones_contacto_email_ttl_chk
    check (
      contacto_email_expires_at is null
      or contacto_email_expires_at <= expires_at
    )
);

drop trigger if exists set_updated_at_flow_sesiones_temporales on public.flow_sesiones_temporales;
create trigger set_updated_at_flow_sesiones_temporales
before update on public.flow_sesiones_temporales
for each row execute function public.set_updated_at();

create table if not exists public.eventos_operativos (
  event_id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campanas(id) on delete set null,
  recipient_id uuid references public.campana_destinatarios(id) on delete set null,
  session_id_hash text,
  event_type text not null,
  status text not null,
  source text not null
    check (source in ('whatsapp', 'flow', 'hun_api', 'campaign_api', 'supabase', 'email', 'backend')),
  http_status integer check (http_status is null or (http_status >= 100 and http_status <= 599)),
  error_code text,
  error_category text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  environment text,
  backend_version text,
  endpoint_logico text,
  especialidad_codigo text,
  estado_contacto text,
  ultimo_evento text,
  resultado_operativo text,
  motivo_fallo_simple text,
  created_at timestamptz not null default now()
);

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campanas(id) on delete set null,
  recipient_id uuid references public.campana_destinatarios(id) on delete set null,
  session_id_hash text,
  canal text not null check (canal in ('whatsapp', 'email')),
  tipo text not null check (tipo in ('oferta', 'confirmacion', 'recordatorio', 'error', 'cancelacion')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviando', 'enviado', 'entregado', 'fallido', 'omitido')),
  proveedor text,
  mensaje_template_id text,
  external_message_id_hash text,
  error_code text,
  error_category text,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at_notificaciones on public.notificaciones;
create trigger set_updated_at_notificaciones
before update on public.notificaciones
for each row execute function public.set_updated_at();

create index if not exists idx_campanas_estado on public.campanas(estado);
create index if not exists idx_campanas_especialidad on public.campanas(especialidad_codigo);
create index if not exists idx_campanas_responsable on public.campanas(responsable);

create index if not exists idx_destinatarios_campaign on public.campana_destinatarios(campaign_id);
create index if not exists idx_destinatarios_estado on public.campana_destinatarios(estado_contacto);
create index if not exists idx_destinatarios_documento_hash on public.campana_destinatarios(documento_hash);
create index if not exists idx_destinatarios_especialidad on public.campana_destinatarios(especialidad_codigo);

create index if not exists idx_flow_sesiones_flow_token on public.flow_sesiones_temporales(flow_token);
create index if not exists idx_flow_sesiones_estado on public.flow_sesiones_temporales(estado);
create index if not exists idx_flow_sesiones_expires_at on public.flow_sesiones_temporales(expires_at);
create index if not exists idx_flow_sesiones_contacto_email_expires_at on public.flow_sesiones_temporales(contacto_email_expires_at);

create index if not exists idx_eventos_campaign on public.eventos_operativos(campaign_id);
create index if not exists idx_eventos_recipient on public.eventos_operativos(recipient_id);
create index if not exists idx_eventos_session_hash on public.eventos_operativos(session_id_hash);
create index if not exists idx_eventos_source_status on public.eventos_operativos(source, status);
create index if not exists idx_eventos_created_at on public.eventos_operativos(created_at);

create index if not exists idx_notificaciones_campaign on public.notificaciones(campaign_id);
create index if not exists idx_notificaciones_recipient on public.notificaciones(recipient_id);
create index if not exists idx_notificaciones_estado on public.notificaciones(estado);
create index if not exists idx_notificaciones_created_at on public.notificaciones(created_at);

create or replace view public.vista_medica_operativa as
select
  c.id as campaign_id,
  c.nombre as campana_nombre,
  c.especialidad_codigo,
  c.estado as campana_estado,
  c.total_destinatarios,
  c.total_enviados,
  c.total_respondidos,
  c.total_flow_iniciados,
  c.total_agendados,
  c.total_fallidos,
  d.id as recipient_id,
  d.estado_contacto,
  d.opt_out,
  e.ultimo_evento,
  e.resultado_operativo,
  e.motivo_fallo_simple,
  greatest(c.updated_at, d.updated_at) as updated_at
from public.campanas c
left join public.campana_destinatarios d on d.campaign_id = c.id
left join lateral (
  select
    eo.ultimo_evento,
    eo.resultado_operativo,
    eo.motivo_fallo_simple
  from public.eventos_operativos eo
  where eo.campaign_id = c.id
    and (eo.recipient_id = d.id or d.id is null)
  order by eo.created_at desc
  limit 1
) e on true;

create or replace view public.vista_it_auditoria as
select
  event_id,
  campaign_id,
  recipient_id,
  session_id_hash,
  event_type,
  status,
  source,
  http_status,
  error_code,
  error_category,
  duration_ms,
  retry_count,
  environment,
  backend_version,
  endpoint_logico,
  created_at
from public.eventos_operativos;

alter table public.campanas enable row level security;
alter table public.campana_destinatarios enable row level security;
alter table public.flow_sesiones_temporales enable row level security;
alter table public.eventos_operativos enable row level security;
alter table public.notificaciones enable row level security;

comment on table public.campanas is
  'Campaign metadata and aggregate counters only. No patient names, appointment details, or HUN payloads.';

comment on table public.campana_destinatarios is
  'Minimal campaign recipients. Store documento_hash, never plain document numbers or patient names.';

comment on table public.flow_sesiones_temporales is
  'Temporary Flow state only. Never store doctor, appointment date/time, CUPS, consultorio, agenda_detalle_id, or agenda payloads. Email contact is allowed only encrypted, transient, and bounded by session TTL.';

comment on column public.flow_sesiones_temporales.contacto_email_enc is
  'Email de contacto cifrado por backend, solo para confirmacion transitoria del Flow. No almacenar correo plano.';

comment on column public.flow_sesiones_temporales.contacto_email_hmac is
  'HMAC no reversible del email normalizado para idempotencia tecnica. No usar hash simple.';

comment on column public.flow_sesiones_temporales.contacto_email_expires_at is
  'Expiracion del email transitorio. Debe ser igual o menor a expires_at de la sesion.';

comment on table public.eventos_operativos is
  'Non-sensitive operational and technical events for medical/operational and IT/audit views.';

comment on table public.notificaciones is
  'Notification attempt metadata only. Do not store appointment details or full message bodies with sensitive content.';
