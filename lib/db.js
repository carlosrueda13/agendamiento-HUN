const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SESSION_TTL_MINUTES = Number(process.env.FLOW_SESSION_TTL_MINUTES || 30);
const EMAIL_TTL_MINUTES = Number(process.env.FLOW_CONTACT_EMAIL_TTL_MINUTES || 30);

const CAMPANA_ESTADOS = Object.freeze([
  "borrador",
  "programada",
  "enviando",
  "activa",
  "cerrada",
  "cancelada",
]);

const DESTINATARIO_ESTADOS = Object.freeze([
  "pendiente",
  "enviado",
  "entregado",
  "leido",
  "respondido",
  "flow_iniciado",
  "agendado",
  "no_interesado",
  "fallido",
  "excluido",
]);

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

function cleanText(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

function requireText(value, fieldName) {
  const cleaned = cleanText(value);
  if (!cleaned) throw new Error(`${fieldName} es obligatorio.`);
  return cleaned;
}

function assertAllowed(value, allowed, fieldName) {
  const cleaned = requireText(value, fieldName);
  if (!allowed.includes(cleaned)) {
    throw new Error(`${fieldName} no permitido: ${cleaned}`);
  }
  return cleaned;
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

function normalizeDocumento(tipoDocumento, numeroDocumento) {
  const tipo = requireText(tipoDocumento, "tipo_documento").toUpperCase();
  const numero = requireText(numeroDocumento, "numero_documento").replace(/\s+/g, "");
  return `${tipo}:${numero}`;
}

function hashDocumento(tipoDocumento, numeroDocumento) {
  const piiKey = getPiiKey();
  if (!piiKey) {
    throw new Error(
      "FLOW_SESSION_PII_KEY_B64 es obligatoria para generar documento_hash."
    );
  }

  return crypto
    .createHmac("sha256", piiKey)
    .update(normalizeDocumento(tipoDocumento, numeroDocumento))
    .digest("hex");
}

function crearDocumentoHash(tipoDocumento, numeroDocumento) {
  return hashDocumento(tipoDocumento, numeroDocumento);
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

function buildCampanaRecord(campana) {
  const estado = campana.estado
    ? assertAllowed(campana.estado, CAMPANA_ESTADOS, "estado")
    : "borrador";

  const cuposObjetivo =
    campana.cupos_objetivo === undefined || campana.cupos_objetivo === null
      ? null
      : Number(campana.cupos_objetivo);

  if (cuposObjetivo !== null && (!Number.isInteger(cuposObjetivo) || cuposObjetivo < 0)) {
    throw new Error("cupos_objetivo debe ser un entero positivo o null.");
  }

  return {
    nombre: requireText(campana.nombre, "nombre"),
    especialidad_codigo: requireText(
      campana.especialidad_codigo,
      "especialidad_codigo"
    ),
    mensaje_template_id: cleanText(campana.mensaje_template_id),
    estado,
    origen_datos: cleanText(campana.origen_datos),
    cupos_objetivo: cuposObjetivo,
    responsable: cleanText(campana.responsable),
  };
}

function buildDestinatarioRecord(destinatario) {
  const optOut = Boolean(destinatario.opt_out);
  const estadoSolicitado = destinatario.estado_contacto || "pendiente";
  const estado = optOut
    ? "excluido"
    : assertAllowed(estadoSolicitado, DESTINATARIO_ESTADOS, "estado_contacto");
  const audienciaRef = cleanText(
    destinatario.audiencia_ref || destinatario.id_anonimo
  );
  const documentoHash =
    cleanText(destinatario.documento_hash) ||
    (audienciaRef
      ? null
      : hashDocumento(destinatario.tipo_documento, destinatario.numero_documento));

  return {
    campaign_id: requireText(destinatario.campaign_id, "campaign_id"),
    audiencia_ref: audienciaRef,
    whatsapp_numero: cleanText(destinatario.whatsapp_numero),
    tipo_documento: cleanText(destinatario.tipo_documento),
    documento_hash: documentoHash,
    especialidad_codigo: requireText(
      destinatario.especialidad_codigo,
      "especialidad_codigo"
    ),
    estado_contacto: estado,
    opt_out: optOut,
    motivo_exclusion: optOut
      ? cleanText(destinatario.motivo_exclusion) || "opt_out"
      : cleanText(destinatario.motivo_exclusion),
  };
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

async function crearCampana(campana) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("campanas")
    .insert(buildCampanaRecord(campana))
    .select("id")
    .single();

  if (error) {
    console.error("Supabase crearCampana:", error.message);
    return null;
  }

  return data;
}

async function actualizarEstadoCampana(campaignId, estado) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("campanas")
    .update({ estado: assertAllowed(estado, CAMPANA_ESTADOS, "estado") })
    .eq("id", campaignId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Supabase actualizarEstadoCampana:", error.message);
    return null;
  }

  return data;
}

async function guardarDestinatarioCampana(destinatario) {
  if (!supabase) return null;

  const record = buildDestinatarioRecord(destinatario);
  let query;

  if (record.audiencia_ref) {
    const { data: existing, error: selectError } = await supabase
      .from("campana_destinatarios")
      .select("id")
      .eq("campaign_id", record.campaign_id)
      .eq("audiencia_ref", record.audiencia_ref)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase guardarDestinatarioCampana:", selectError.message);
      return null;
    }

    query = existing
      ? supabase
          .from("campana_destinatarios")
          .update(record)
          .eq("id", existing.id)
          .select("id")
          .single()
      : supabase
          .from("campana_destinatarios")
          .insert(record)
          .select("id")
          .single();
  } else {
    query = supabase
      .from("campana_destinatarios")
      .upsert(record, {
        onConflict: "campaign_id,documento_hash,especialidad_codigo",
      })
      .select("id")
      .single();
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase guardarDestinatarioCampana:", error.message);
    return null;
  }

  return data;
}

async function listarDestinatariosPendientesCampana(campaignId, limit = 100) {
  if (!supabase) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { data, error } = await supabase
    .from("campana_destinatarios")
    .select("id,campaign_id,audiencia_ref,especialidad_codigo,estado_contacto,opt_out")
    .eq("campaign_id", requireText(campaignId, "campaign_id"))
    .eq("estado_contacto", "pendiente")
    .eq("opt_out", false)
    .not("audiencia_ref", "is", null)
    .limit(safeLimit);

  if (error) {
    console.error("Supabase listarDestinatariosPendientesCampana:", error.message);
    return [];
  }

  return data || [];
}

async function actualizarEstadoDestinatario(recipientId, estado, extra = {}) {
  if (!supabase) return null;

  const estadoContacto = assertAllowed(
    estado,
    DESTINATARIO_ESTADOS,
    "estado_contacto"
  );
  const update = {
    estado_contacto: estadoContacto,
    motivo_exclusion: cleanText(extra.motivo_exclusion),
  };

  if (extra.opt_out !== undefined) {
    update.opt_out = Boolean(extra.opt_out);
  }

  if (estadoContacto === "excluido" && !update.motivo_exclusion) {
    update.motivo_exclusion = "exclusion_operativa";
  }

  const { data, error } = await supabase
    .from("campana_destinatarios")
    .update(update)
    .eq("id", recipientId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Supabase actualizarEstadoDestinatario:", error.message);
    return null;
  }

  return data;
}

async function registrarNotificacion(notificacion) {
  if (!supabase) return null;

  const record = {
    campaign_id: notificacion.campaign_id || null,
    recipient_id: notificacion.recipient_id || null,
    session_id_hash: notificacion.session_id_hash || null,
    canal: assertAllowed(notificacion.canal || "whatsapp", ["whatsapp", "email"], "canal"),
    tipo: assertAllowed(
      notificacion.tipo || "oferta",
      ["oferta", "confirmacion", "recordatorio", "error", "cancelacion"],
      "tipo"
    ),
    estado: assertAllowed(
      notificacion.estado || "pendiente",
      ["pendiente", "enviando", "enviado", "entregado", "fallido", "omitido"],
      "estado"
    ),
    proveedor: cleanText(notificacion.proveedor),
    mensaje_template_id: cleanText(notificacion.mensaje_template_id),
    external_message_id_hash: cleanText(notificacion.external_message_id_hash),
    error_code: cleanText(notificacion.error_code),
    error_category: cleanText(notificacion.error_category),
    retry_count: Number(notificacion.retry_count || 0),
  };

  const { data, error } = await supabase
    .from("notificaciones")
    .insert(record)
    .select("id")
    .single();

  if (error) {
    console.error("Supabase registrarNotificacion:", error.message);
    return null;
  }

  return data;
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
  CAMPANA_ESTADOS,
  DESTINATARIO_ESTADOS,
  crearCampana,
  actualizarEstadoCampana,
  guardarDestinatarioCampana,
  listarDestinatariosPendientesCampana,
  actualizarEstadoDestinatario,
  registrarNotificacion,
  crearDocumentoHash,
  guardarSesionTemporal,
  getSesionTemporal,
  getContactoEmailSesion,
  limpiarContactoSesion,
  finalizarSesionTemporal,
  guardarEventoOperativo,
  registrarEventoOperativo,
  _private: {
    buildCampanaRecord,
    buildDestinatarioRecord,
    decryptContactEmail,
    encryptContactEmail,
    hashDocumento,
    normalizeEmail,
  },
};
