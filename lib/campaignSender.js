const crypto = require("crypto");
const db = require("./db");
const demanda = require("./demandaInducida");
const whatsapp = require("./whatsapp");
const { createCampaignFlowToken } = require("./flowHandler");

function cleanText(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

function envConfig(env = process.env) {
  return {
    flowId: cleanText(env.CAMPAIGN_FLOW_ID),
    flowScreenId: cleanText(env.CAMPAIGN_FLOW_SCREEN_ID) || "IDENTIFICACION",
    templateName: cleanText(env.CAMPAIGN_TEMPLATE_NAME) || "hun_oferta_cita_flow",
    templateLanguage: cleanText(env.CAMPAIGN_TEMPLATE_LANGUAGE) || "es_CO",
  };
}

function hashExternalId(value) {
  const raw = cleanText(value);
  const secret =
    cleanText(process.env.FLOW_SESSION_PII_KEY_B64) ||
    cleanText(process.env.FLOW_SLOT_TOKEN_SECRET_B64) ||
    cleanText(process.env.CAMPAIGN_FLOW_TOKEN_SECRET_B64);
  if (!raw || !secret) return null;

  return crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(raw)
    .digest("hex");
}

function sanitizeError(error, source = "backend") {
  const status = error?.response?.status || null;
  const code =
    error?.code ||
    error?.response?.data?.error?.code ||
    (status ? `http_${status}` : "error");

  let category = source;
  if (code === "ECONNABORTED" || String(error?.message || "").includes("timeout")) {
    category = `${source}_timeout`;
  } else if (status === 403 || status === 401) {
    category = `${source}_auth`;
  } else if (status === 404) {
    category = `${source}_not_found`;
  } else if (status === 429) {
    category = `${source}_rate_limit`;
  }

  return {
    http_status: status,
    error_code: String(code).slice(0, 80),
    error_category: category,
  };
}

function createCampaignSender(deps = {}) {
  const dbClient = deps.dbClient || db;
  const resolver = deps.resolver || demanda.resolverPacienteCampania;
  const whatsappClient = deps.whatsappClient || whatsapp;
  const createToken = deps.createCampaignFlowToken || createCampaignFlowToken;
  const now = deps.now || (() => Date.now());

  async function registrarIntento(recipient, estado, extra = {}) {
    await dbClient.registrarNotificacion?.({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      canal: "whatsapp",
      tipo: "oferta",
      estado,
      proveedor: "whatsapp_cloud_api",
      mensaje_template_id: extra.templateName,
      external_message_id_hash: extra.externalMessageId
        ? hashExternalId(extra.externalMessageId)
        : null,
      error_code: extra.error_code,
      error_category: extra.error_category,
    });
  }

  async function registrarEvento(recipient, status, extra = {}) {
    await dbClient.guardarEventoOperativo?.({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      event_type: "campaign_offer_send",
      status,
      source: extra.source || "campaign_api",
      http_status: extra.http_status || null,
      error_code: extra.error_code || null,
      error_category: extra.error_category || null,
      duration_ms: extra.duration_ms || null,
      endpoint_logico: extra.endpoint_logico || null,
      especialidad_codigo: recipient.especialidad_codigo || null,
      estado_contacto: extra.estado_contacto || null,
      resultado_operativo: extra.resultado_operativo || null,
      motivo_fallo_simple: extra.motivo_fallo_simple || null,
    });
  }

  async function marcarFallo(recipient, reason, errorInfo = {}) {
    await registrarIntento(recipient, "fallido", {
      ...errorInfo,
      templateName: envConfig().templateName,
    });
    await dbClient.actualizarEstadoDestinatario?.(recipient.id, "fallido", {
      motivo_exclusion: reason,
    });
    await registrarEvento(recipient, "failed", {
      ...errorInfo,
      estado_contacto: "fallido",
      resultado_operativo: "fallido",
      motivo_fallo_simple: reason,
    });
    return { ok: false, recipient_id: recipient.id, motivo: reason };
  }

  async function enviarOfertaDestinatario(recipient, options = {}) {
    const started = now();
    const config = envConfig(options.env || process.env);
    if (!config.flowId) {
      return marcarFallo(recipient, "campaign_flow_no_configurado", {
        error_code: "CAMPAIGN_FLOW_ID_missing",
        error_category: "config",
      });
    }
    if (!recipient?.audiencia_ref) {
      return marcarFallo(recipient, "audiencia_ref_faltante", {
        error_code: "audiencia_ref_missing",
        error_category: "validacion",
      });
    }

    let resolved;
    try {
      resolved = await resolver({
        idAnonimo: recipient.audiencia_ref,
        env: options.env || process.env,
        httpClient: options.httpClient,
      });
    } catch (error) {
      return marcarFallo(recipient, "orquestador_no_disponible", {
        ...sanitizeError(error, "orquestador"),
        endpoint_logico: "orquestador_get_appointment",
      });
    }

    if (!resolved?.ok || !resolved.telefono) {
      return marcarFallo(recipient, resolved?.error_code || "telefono_invalido", {
        error_code: resolved?.error_code || "telefono_invalido",
        error_category: resolved?.error_category || "orquestador_validacion",
        endpoint_logico: "orquestador_get_appointment",
      });
    }

    const especialidadCodigo =
      cleanText(resolved.especialidad_codigo) || cleanText(recipient.especialidad_codigo);
    if (!especialidadCodigo) {
      return marcarFallo(recipient, "especialidad_faltante", {
        error_code: "especialidad_missing",
        error_category: "validacion",
      });
    }

    const flowToken = createToken({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      audiencia_ref: recipient.audiencia_ref,
      especialidad_codigo: especialidadCodigo,
      contacto_email: resolved.correo || null,
    });

    await registrarIntento(recipient, "enviando", {
      templateName: config.templateName,
    });

    try {
      const response = await whatsappClient.sendCampaignFlowTemplate({
        to: resolved.telefono,
        templateName: config.templateName,
        languageCode: config.templateLanguage,
        flowToken,
        flowScreenId: config.flowScreenId,
        flowId: config.flowId,
        httpClient: options.httpClient,
      });

      const messageId = response?.messages?.[0]?.id || null;
      await registrarIntento(recipient, "enviado", {
        templateName: config.templateName,
        externalMessageId: messageId,
      });
      await dbClient.actualizarEstadoDestinatario?.(recipient.id, "enviado");
      await registrarEvento(recipient, "success", {
        duration_ms: now() - started,
        estado_contacto: "enviado",
        resultado_operativo: "oferta_enviada",
      });

      return { ok: true, recipient_id: recipient.id };
    } catch (error) {
      return marcarFallo(recipient, "whatsapp_envio_fallido", {
        ...sanitizeError(error, "whatsapp"),
        endpoint_logico: "whatsapp_messages",
      });
    }
  }

  async function enviarOfertasCampania({ campaignId, limit = 100, env = process.env } = {}) {
    if (!campaignId) throw new Error("campaignId es obligatorio.");
    const recipients = await dbClient.listarDestinatariosPendientesCampana(campaignId, limit);
    const results = [];

    for (const recipient of recipients) {
      results.push(await enviarOfertaDestinatario(recipient, { env }));
    }

    return {
      campaign_id: campaignId,
      total: recipients.length,
      enviados: results.filter((result) => result.ok).length,
      fallidos: results.filter((result) => !result.ok).length,
      results,
    };
  }

  return {
    enviarOfertaDestinatario,
    enviarOfertasCampania,
  };
}

const defaultSender = createCampaignSender();

module.exports = {
  ...defaultSender,
  createCampaignSender,
  envConfig,
  sanitizeError,
};
