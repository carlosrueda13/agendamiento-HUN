const crypto = require("crypto");
const db = require("./db");

const NOTIFICATION_TYPES = Object.freeze([
  "oferta",
  "confirmacion",
  "recordatorio",
  "error",
  "cancelacion",
]);

const NOTIFICATION_CHANNELS = Object.freeze(["whatsapp", "email"]);

function cleanText(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

function sessionHashFromToken(flowToken) {
  if (!flowToken) return null;
  return crypto
    .createHash("sha256")
    .update(String(flowToken))
    .digest("hex")
    .slice(0, 12);
}

function sanitizeError(error, fallbackCategory = "backend_error") {
  return {
    error_code: cleanText(error?.code || error?.response?.status || error?.message)?.slice(0, 80),
    error_category: cleanText(error?.category || fallbackCategory),
  };
}

async function registrarNotificacionOperativa({
  flowToken,
  campaignId = null,
  recipientId = null,
  canal = "whatsapp",
  tipo,
  estado,
  proveedor = null,
  mensajeTemplateId = null,
  externalMessageIdHash = null,
  error = null,
  retryCount = 0,
  dbClient = db,
} = {}) {
  const errorInfo = error ? sanitizeError(error) : {};

  return dbClient.registrarNotificacion?.({
    campaign_id: campaignId,
    recipient_id: recipientId,
    session_id_hash: sessionHashFromToken(flowToken),
    canal,
    tipo,
    estado,
    proveedor,
    mensaje_template_id: mensajeTemplateId,
    external_message_id_hash: externalMessageIdHash,
    error_code: errorInfo.error_code,
    error_category: errorInfo.error_category,
    retry_count: retryCount,
  });
}

async function registrarConfirmacionWhatsApp(flowToken, estado, options = {}) {
  return registrarNotificacionOperativa({
    flowToken,
    canal: "whatsapp",
    tipo: "confirmacion",
    estado,
    proveedor: "whatsapp_cloud_api",
    campaignId: options.campaignId,
    recipientId: options.recipientId,
    error: options.error,
    dbClient: options.dbClient,
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  registrarNotificacionOperativa,
  registrarConfirmacionWhatsApp,
  sessionHashFromToken,
  sanitizeError,
};
