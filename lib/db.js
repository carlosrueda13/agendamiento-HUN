const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SESSION_TTL_MINUTES = Number(process.env.FLOW_SESSION_TTL_MINUTES || 30);
const EMAIL_TTL_MINUTES = Number(process.env.FLOW_CONTACT_EMAIL_TTL_MINUTES || 30);

let supabase = null;
if (url && key) {
  supabase = createClient(url, key, { auth: { persistSession: false } });
} else {
  console.warn(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas: la persistencia esta deshabilitada."
  );
}

let piiKeyCache = null;

function ahora() {
  return new Date().toISOString();
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getPiiKey() {
  if (piiKeyCache) return piiKeyCache;

  const raw = process.env.FLOW_SESSION_PII_KEY_B64;
  if (!raw) return null;

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) {
    throw new Error("FLOW_SESSION_PII_KEY_B64 debe decodificar a 32 bytes.");
  }

  piiKeyCache = decoded;
  return piiKeyCache;
}

function encryptContactEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const piiKey = getPiiKey();
  if (!piiKey) {
    throw new Error(
      "FLOW_SESSION_PII_KEY_B64 es obligatoria para guardar correo transitorio."
    );
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", piiKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const emailHmac = crypto
    .createHmac("sha256", piiKey)
    .update(normalized)
    .digest("hex");

  return {
    contacto_email_enc: [
      "v1",
      iv.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":"),
    contacto_email_hmac: emailHmac,
    contacto_email_expires_at: minutesFromNow(EMAIL_TTL_MINUTES),
  };
}

function decryptContactEmail(encryptedValue) {
  if (!encryptedValue) return null;

  const piiKey = getPiiKey();
  if (!piiKey) {
    throw new Error("FLOW_SESSION_PII_KEY_B64 es obligatoria para leer correo.");
  }

  const [version, ivB64, tagB64, encryptedB64] = String(encryptedValue).split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Formato de correo cifrado no soportado.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    piiKey,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function guardarSesionTemporal(session) {
  if (!supabase) return;

  const record = {
    flow_token: session.flow_token,
    estado: session.estado,
    especialidad_codigo: session.especialidad_codigo || null,
    slot_token: session.slot_token || null,
    expires_at: session.expires_at || minutesFromNow(SESSION_TTL_MINUTES),
  };

  if (session.contacto_email) {
    Object.assign(record, encryptContactEmail(session.contacto_email));
    if (
      record.contacto_email_expires_at &&
      new Date(record.contacto_email_expires_at).getTime() >
        new Date(record.expires_at).getTime()
    ) {
      record.contacto_email_expires_at = record.expires_at;
    }
  }

  if (session.clear_contacto_email) {
    record.contacto_email_enc = null;
    record.contacto_email_hmac = null;
    record.contacto_email_expires_at = null;
  }

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .upsert(record, { onConflict: "flow_token" });

  if (error) {
    console.error("Supabase guardarSesionTemporal:", error.message);
  }
}

async function getSesionTemporal(flowToken) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("flow_sesiones_temporales")
    .select(
      "session_id, flow_token, estado, especialidad_codigo, slot_token, contacto_email_enc, contacto_email_expires_at, expires_at"
    )
    .eq("flow_token", flowToken)
    .maybeSingle();

  if (error) {
    console.error("Supabase getSesionTemporal:", error.message);
    return null;
  }

  return data;
}

async function getContactoEmailSesion(flowToken) {
  const session = await getSesionTemporal(flowToken);
  if (!session?.contacto_email_enc) return null;

  if (
    session.contacto_email_expires_at &&
    new Date(session.contacto_email_expires_at).getTime() < Date.now()
  ) {
    await limpiarContactoSesion(flowToken);
    return null;
  }

  return decryptContactEmail(session.contacto_email_enc);
}

async function limpiarContactoSesion(flowToken) {
  if (!supabase) return;

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .update({
      contacto_email_enc: null,
      contacto_email_hmac: null,
      contacto_email_expires_at: null,
    })
    .eq("flow_token", flowToken);

  if (error) {
    console.error("Supabase limpiarContactoSesion:", error.message);
  }
}

async function finalizarSesionTemporal(flowToken, estado, extra = {}) {
  if (!supabase) return;

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .update({
      estado,
      especialidad_codigo: extra.especialidad_codigo || null,
      slot_token: null,
      contacto_email_enc: null,
      contacto_email_hmac: null,
      contacto_email_expires_at: null,
      last_error_code: extra.last_error_code || null,
      last_error_category: extra.last_error_category || null,
    })
    .eq("flow_token", flowToken);

  if (error) {
    console.error("Supabase finalizarSesionTemporal:", error.message);
  }
}

async function registrarEventoOperativo(evento) {
  if (!supabase) return;

  try {
    const { error } = await supabase.from("eventos_operativos").insert({
      campaign_id: evento.campaign_id || null,
      recipient_id: evento.recipient_id || null,
      session_id_hash: evento.session_id_hash || null,
      event_type: evento.event_type,
      status: evento.status,
      source: evento.source || "backend",
      http_status: evento.http_status || null,
      error_code: evento.error_code || null,
      error_category: evento.error_category || null,
      duration_ms: evento.duration_ms || null,
      retry_count: evento.retry_count || 0,
      environment: process.env.NODE_ENV || "development",
      backend_version: process.env.npm_package_version || null,
      endpoint_logico: evento.endpoint_logico || null,
      especialidad_codigo: evento.especialidad_codigo || null,
      estado_contacto: evento.estado_contacto || null,
      ultimo_evento: evento.ultimo_evento || evento.event_type || null,
      resultado_operativo: evento.resultado_operativo || null,
      motivo_fallo_simple: evento.motivo_fallo_simple || null,
      created_at: ahora(),
    });

    if (error) {
      console.error("Supabase registrarEventoOperativo:", error.message);
    }
  } catch (error) {
    console.error("Supabase registrarEventoOperativo:", error.message);
  }
}

async function guardarEventoOperativo(evento) {
  return registrarEventoOperativo(evento);
}

module.exports = {
  supabase,
  guardarSesionTemporal,
  getSesionTemporal,
  getContactoEmailSesion,
  limpiarContactoSesion,
  finalizarSesionTemporal,
  guardarEventoOperativo,
  registrarEventoOperativo,
  _private: {
    decryptContactEmail,
    encryptContactEmail,
    normalizeEmail,
  },
};
