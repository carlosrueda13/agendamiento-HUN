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

const REAGENDAMIENTO_ESTADOS = Object.freeze([
  "reagendamiento_seleccionando_cita",
  "reagendamiento_eligiendo_slot",
  "reagendamiento_confirmando",
  "reagendamiento_asignando",
  "reagendamiento_cancelando_original",
  "reagendamiento_completado",
  "reagendamiento_revision_manual",
  "reagendamiento_fallido",
]);

const REAGENDAMIENTO_ESTADOS_ACTIVOS = Object.freeze([
  "reagendamiento_asignando",
  "reagendamiento_cancelando_original",
]);

const CAMPANA_SELECT_COLUMNS = [
  "id",
  "nombre",
  "especialidad_codigo",
  "estado",
  "responsable",
  "cupos_objetivo",
  "origen_datos",
  "referencia_externa",
  "created_at",
].join(",");

const DESTINATARIO_ESTADOS_ENVIADOS = Object.freeze([
  "enviado",
  "entregado",
  "leido",
  "respondido",
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
    especialidad_codigo: cleanText(campana.especialidad_codigo),
    mensaje_template_id: cleanText(campana.mensaje_template_id),
    estado,
    origen_datos: cleanText(campana.origen_datos),
    cupos_objetivo: cuposObjetivo,
    responsable: cleanText(campana.responsable),
    referencia_externa: cleanText(campana.referencia_externa),
  };
}

// `contadores` y `fallos_por_motivo` van separados porque el GET del contrato
// (INSTRUCTIVO_PANEL_CAMPANAS.md seccion 5.4) los expone como claves hermanas.
function crearContadoresCampanaVacios() {
  return {
    contadores: {
      total: 0,
      pendientes: 0,
      enviados: 0,
      fallidos: 0,
      flow_iniciados: 0,
      agendados: 0,
      no_interesados: 0,
      excluidos: 0,
    },
    fallos_por_motivo: {},
  };
}

function agregarContadoresDestinatarios(rows = []) {
  const resultado = crearContadoresCampanaVacios();
  const { contadores, fallos_por_motivo: fallosPorMotivo } = resultado;

  for (const row of rows || []) {
    const estado = cleanText(row?.estado_contacto);
    contadores.total += 1;

    if (estado === "pendiente") contadores.pendientes += 1;
    if (DESTINATARIO_ESTADOS_ENVIADOS.includes(estado)) contadores.enviados += 1;
    if (estado === "fallido") {
      contadores.fallidos += 1;
      const motivo = cleanText(row?.motivo_exclusion);
      if (motivo) {
        fallosPorMotivo[motivo] = (fallosPorMotivo[motivo] || 0) + 1;
      }
    }
    if (estado === "flow_iniciado") contadores.flow_iniciados += 1;
    if (estado === "agendado") contadores.agendados += 1;
    if (estado === "no_interesado") contadores.no_interesados += 1;
    if (estado === "excluido") contadores.excluidos += 1;
  }

  return resultado;
}

function campanaAdmiteDestinatarios(estado) {
  const estadoLimpio = cleanText(estado);
  return Boolean(estadoLimpio) && !["cerrada", "cancelada"].includes(estadoLimpio);
}

function campanaAdmiteLanzamiento(estado) {
  return ["borrador", "programada", "activa"].includes(cleanText(estado));
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

async function guardarOperacionCancelacion(operacion) {
  if (!supabase) return;

  const record = {
    flow_token: requireText(operacion.cancel_operation_id, "cancel_operation_id"),
    estado: assertAllowed(
      operacion.estado || "cancelacion_procesando",
      [
        "cancelacion_solicitada",
        "cancelacion_procesando",
        "cancelada",
        "cancelacion_fallida",
      ],
      "estado"
    ),
    especialidad_codigo: null,
    slot_token: null,
    contacto_email_enc: null,
    contacto_email_hmac: null,
    contacto_email_expires_at: null,
    expires_at: operacion.expires_at || minutesFromNow(SESSION_TTL_MINUTES),
  };

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .upsert(record, { onConflict: "flow_token" });

  if (error) {
    console.error("Supabase guardarOperacionCancelacion:", error.message);
  }
}

async function finalizarOperacionCancelacion(cancelOperationId, estado, extra = {}) {
  if (!supabase) return;

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .update({
      estado: assertAllowed(
        estado,
        ["cancelada", "cancelacion_fallida"],
        "estado"
      ),
      last_error_code: extra.last_error_code || null,
      last_error_category: extra.last_error_category || null,
    })
    .eq("flow_token", cancelOperationId);

  if (error) {
    console.error("Supabase finalizarOperacionCancelacion:", error.message);
  }
}

async function getOperacionCancelacionActivaPorSesion(sessionIdHash) {
  if (!supabase || !sessionIdHash) return null;

  const { data: event, error: eventError } = await supabase
    .from("eventos_operativos")
    .select("resultado_operativo")
    .eq("session_id_hash", sessionIdHash)
    .eq("event_type", "cancelacion_solicitada")
    .eq("status", "cancelacion_procesando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    console.error("Supabase getOperacionCancelacionActivaPorSesion:", eventError.message);
    return null;
  }

  const match = String(event?.resultado_operativo || "").match(
    /^cancel_operation_id:([a-f0-9]{64})$/
  );
  if (!match) return null;

  const { data: operation, error: operationError } = await supabase
    .from("flow_sesiones_temporales")
    .select("flow_token, estado, expires_at")
    .eq("flow_token", match[1])
    .eq("estado", "cancelacion_procesando")
    .maybeSingle();

  if (operationError) {
    console.error("Supabase getOperacionCancelacionActivaPorSesion:", operationError.message);
    return null;
  }

  return operation
    ? {
        cancel_operation_id: operation.flow_token,
        estado: operation.estado,
        expires_at: operation.expires_at,
      }
    : null;
}

async function guardarOperacionReagendamiento(operacion) {
  if (!supabase) return;

  const record = {
    flow_token: requireText(
      operacion.reschedule_operation_id,
      "reschedule_operation_id"
    ),
    estado: assertAllowed(
      operacion.estado || "reagendamiento_asignando",
      REAGENDAMIENTO_ESTADOS,
      "estado"
    ),
    especialidad_codigo: cleanText(operacion.especialidad_codigo),
    slot_token: null,
    contacto_email_enc: null,
    contacto_email_hmac: null,
    contacto_email_expires_at: null,
    expires_at: operacion.expires_at || minutesFromNow(SESSION_TTL_MINUTES),
  };

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .upsert(record, { onConflict: "flow_token" });

  if (error) {
    console.error("Supabase guardarOperacionReagendamiento:", error.message);
  }
}

async function finalizarOperacionReagendamiento(
  rescheduleOperationId,
  estado,
  extra = {}
) {
  if (!supabase) return;

  const { error } = await supabase
    .from("flow_sesiones_temporales")
    .update({
      estado: assertAllowed(
        estado,
        [
          "reagendamiento_completado",
          "reagendamiento_revision_manual",
          "reagendamiento_fallido",
        ],
        "estado"
      ),
      slot_token: null,
      last_error_code: extra.last_error_code || null,
      last_error_category: extra.last_error_category || null,
    })
    .eq("flow_token", rescheduleOperationId);

  if (error) {
    console.error("Supabase finalizarOperacionReagendamiento:", error.message);
  }
}

async function getOperacionReagendamientoActivaPorSesion(sessionIdHash) {
  if (!supabase || !sessionIdHash) return null;

  const { data: event, error: eventError } = await supabase
    .from("eventos_operativos")
    .select("resultado_operativo")
    .eq("session_id_hash", sessionIdHash)
    .eq("event_type", "reagendamiento_solicitado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    console.error(
      "Supabase getOperacionReagendamientoActivaPorSesion:",
      eventError.message
    );
    return null;
  }

  const match = String(event?.resultado_operativo || "").match(
    /^reschedule_operation_id:([a-f0-9]{64})$/
  );
  if (!match) return null;

  const { data: operation, error: operationError } = await supabase
    .from("flow_sesiones_temporales")
    .select("flow_token, estado, expires_at")
    .eq("flow_token", match[1])
    .in("estado", REAGENDAMIENTO_ESTADOS_ACTIVOS)
    .maybeSingle();

  if (operationError) {
    console.error(
      "Supabase getOperacionReagendamientoActivaPorSesion:",
      operationError.message
    );
    return null;
  }

  return operation
    ? {
        reschedule_operation_id: operation.flow_token,
        estado: operation.estado,
        expires_at: operation.expires_at,
      }
    : null;
}

async function crearCampana(campana, dbClient = supabase) {
  if (!dbClient) return null;

  const { data, error } = await dbClient
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

async function obtenerCampana(campaignId, dbClient = supabase) {
  if (!dbClient) return null;

  const id = cleanText(campaignId);
  if (!id) return null;

  const { data, error } = await dbClient
    .from("campanas")
    .select(CAMPANA_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Supabase obtenerCampana:", error.message);
    return null;
  }

  return data || null;
}

async function obtenerCampanaPorReferenciaExterna(
  referenciaExterna,
  dbClient = supabase
) {
  const referencia = cleanText(referenciaExterna);
  if (!referencia || !dbClient) return null;

  const { data, error } = await dbClient
    .from("campanas")
    .select(CAMPANA_SELECT_COLUMNS)
    .eq("referencia_externa", referencia)
    .maybeSingle();

  if (error) {
    console.error("Supabase obtenerCampanaPorReferenciaExterna:", error.message);
    return null;
  }

  return data || null;
}

async function contarDestinatariosCampana(campaignId, dbClient = supabase) {
  if (!dbClient) return crearContadoresCampanaVacios();

  const id = cleanText(campaignId);
  if (!id) return crearContadoresCampanaVacios();

  const { data, error } = await dbClient
    .from("campana_destinatarios")
    .select("estado_contacto,motivo_exclusion")
    .eq("campaign_id", id);

  if (error) {
    console.error("Supabase contarDestinatariosCampana:", error.message);
    return null;
  }

  return agregarContadoresDestinatarios(data || []);
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

async function guardarDestinatarioCampana(destinatario, dbClient = supabase) {
  if (!dbClient) return null;

  const record = buildDestinatarioRecord(destinatario);
  let query;

  if (record.audiencia_ref) {
    const { data: existing, error: selectError } = await dbClient
      .from("campana_destinatarios")
      .select("id")
      .eq("campaign_id", record.campaign_id)
      .eq("audiencia_ref", record.audiencia_ref)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase guardarDestinatarioCampana:", selectError.message);
      return null;
    }

    // Una recarga del mismo lote es idempotente y no debe devolver el
    // destinatario a pendiente si ya avanzo en el ciclo de la campana.
    if (existing) return { id: existing.id, duplicate: true };

    query = dbClient
      .from("campana_destinatarios")
      .insert(record)
      .select("id")
      .single();
  } else {
    query = dbClient
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

  return data ? { ...data, duplicate: false } : null;
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
    dedupe_key_hash: cleanText(notificacion.dedupe_key_hash),
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

async function reservarRecordatorio({
  canal,
  dedupe_key_hash,
  proveedor,
  mensaje_template_id,
} = {}) {
  if (!supabase) return null;

  const record = {
    canal: assertAllowed(canal, ["whatsapp", "email"], "canal"),
    tipo: "recordatorio",
    estado: "pendiente",
    proveedor: cleanText(proveedor),
    mensaje_template_id: cleanText(mensaje_template_id),
    dedupe_key_hash: cleanText(dedupe_key_hash),
    retry_count: 0,
  };

  if (!record.dedupe_key_hash) {
    throw new Error("dedupe_key_hash es obligatorio para recordatorios.");
  }

  const { data, error } = await supabase
    .from("notificaciones")
    .insert(record)
    .select("id,estado,retry_count,updated_at")
    .single();

  if (!error) return { ...data, created: true };

  if (error.code !== "23505") {
    console.error("Supabase reservarRecordatorio:", error.message);
    return null;
  }

  const { data: existing, error: selectError } = await supabase
    .from("notificaciones")
    .select("id,estado,retry_count,updated_at")
    .eq("canal", record.canal)
    .eq("tipo", "recordatorio")
    .eq("dedupe_key_hash", record.dedupe_key_hash)
    .maybeSingle();

  if (selectError) {
    console.error("Supabase obtenerRecordatorio:", selectError.message);
    return null;
  }

  return existing ? { ...existing, created: false } : null;
}

async function actualizarNotificacion(id, changes = {}) {
  if (!supabase) return null;
  if (!id) throw new Error("id es obligatorio para actualizar notificacion.");

  const update = {};
  if (changes.estado !== undefined) {
    update.estado = assertAllowed(
      changes.estado,
      ["pendiente", "enviando", "enviado", "entregado", "fallido", "omitido"],
      "estado"
    );
  }
  if (changes.external_message_id_hash !== undefined) {
    update.external_message_id_hash = cleanText(changes.external_message_id_hash);
  }
  if (changes.error_code !== undefined) {
    update.error_code = cleanText(changes.error_code);
  }
  if (changes.error_category !== undefined) {
    update.error_category = cleanText(changes.error_category);
  }
  if (changes.retry_count !== undefined) {
    update.retry_count = Math.max(0, Number(changes.retry_count || 0));
  }

  const { data, error } = await supabase
    .from("notificaciones")
    .update(update)
    .eq("id", id)
    .select("id,estado,retry_count,updated_at")
    .maybeSingle();

  if (error) {
    console.error("Supabase actualizarNotificacion:", error.message);
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
  obtenerCampana,
  obtenerCampanaPorReferenciaExterna,
  contarDestinatariosCampana,
  campanaAdmiteDestinatarios,
  campanaAdmiteLanzamiento,
  actualizarEstadoCampana,
  guardarDestinatarioCampana,
  listarDestinatariosPendientesCampana,
  actualizarEstadoDestinatario,
  registrarNotificacion,
  reservarRecordatorio,
  actualizarNotificacion,
  crearDocumentoHash,
  guardarSesionTemporal,
  getSesionTemporal,
  getContactoEmailSesion,
  limpiarContactoSesion,
  finalizarSesionTemporal,
  guardarOperacionCancelacion,
  finalizarOperacionCancelacion,
  getOperacionCancelacionActivaPorSesion,
  guardarOperacionReagendamiento,
  finalizarOperacionReagendamiento,
  getOperacionReagendamientoActivaPorSesion,
  guardarEventoOperativo,
  registrarEventoOperativo,
  _private: {
    buildCampanaRecord,
    buildDestinatarioRecord,
    agregarContadoresDestinatarios,
    campanaAdmiteDestinatarios,
    campanaAdmiteLanzamiento,
    crearContadoresCampanaVacios,
    decryptContactEmail,
    encryptContactEmail,
    hashDocumento,
    normalizeEmail,
  },
};
