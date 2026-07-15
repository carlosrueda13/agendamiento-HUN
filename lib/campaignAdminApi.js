const crypto = require("crypto");
const express = require("express");

const db = require("./db");
const campaignSender = require("./campaignSender");
const demanda = require("./demandaInducida");

// Lock suficiente mientras Render opere con una unica instancia del backend.
// Si el servicio escala horizontalmente debe reemplazarse por un lock distribuido.
const lanzamientosEnCurso = new Map();

function cleanText(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

// Express 4 no captura promesas rechazadas en handlers async; este wrapper las
// encamina al middleware de error del router. Toda ruta real de PANEL-004..008
// debe registrarse envuelta en asyncHandler.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function apiKeysMatch(expected, received) {
  if (typeof received !== "string") return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function validateCreateCampaignBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "body debe ser un objeto JSON" };
  }

  const nombre = typeof body.nombre === "string" ? cleanText(body.nombre) : null;
  if (!nombre) {
    return { error: "nombre es obligatorio y debe ser un string no vacio" };
  }

  const optionalTextFields = [
    "referencia_externa",
    "especialidad_codigo",
    "responsable",
    "origen_datos",
  ];
  const normalized = { nombre };

  for (const field of optionalTextFields) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      return { error: `${field} debe ser un string o null` };
    }
    normalized[field] = cleanText(value);
  }

  const cuposObjetivo = body.cupos_objetivo;
  if (
    cuposObjetivo !== undefined &&
    cuposObjetivo !== null &&
    (!Number.isInteger(cuposObjetivo) || cuposObjetivo < 0)
  ) {
    return { error: "cupos_objetivo debe ser un entero mayor o igual a 0" };
  }

  normalized.cupos_objetivo = cuposObjetivo ?? null;
  normalized.estado = "borrador";
  return { value: normalized };
}

function buildCampaignCreateResponse(campaign, fallbackReference = null) {
  return {
    campaign_id: campaign.id,
    referencia_externa:
      cleanText(campaign.referencia_externa) || cleanText(fallbackReference),
    estado: cleanText(campaign.estado) || "borrador",
  };
}

function validateRecipientsBody(body) {
  if (!body || !Array.isArray(body.destinatarios)) {
    return { error: "destinatarios es obligatorio y debe ser un arreglo" };
  }
  if (body.destinatarios.length === 0) {
    return { error: "destinatarios no puede estar vacio" };
  }
  if (body.destinatarios.length > 500) {
    return { error: "destinatarios no puede tener mas de 500 elementos" };
  }
  return { value: body.destinatarios };
}

function readRecipientAlias(record, fields) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
  for (const field of fields) {
    if (cleanText(record[field])) return record[field];
  }
  return undefined;
}

function sanitizeRecipient(record) {
  return {
    id_anonimo: readRecipientAlias(record, [
      "id_anonimo",
      "audiencia_ref",
      "idAnonimo",
    ]),
    cod_especialidad_requerida: readRecipientAlias(record, [
      "cod_especialidad_requerida",
      "codEspecialidadRequerida",
      "especialidad_codigo",
    ]),
  };
}

// El contrato (seccion 5.2) documenta cada rechazo como { index, motivo, campos }
// (mas error_code en errores de persistencia); el flag interno `ok` no se expone.
function buildRejectionDetail(detail) {
  const sanitized = {
    index: detail.index,
    motivo: detail.motivo,
  };
  if (detail.campos !== undefined) sanitized.campos = detail.campos;
  if (detail.error_code !== undefined) sanitized.error_code = detail.error_code;
  return sanitized;
}

function buildRecipientsResponse(campaignId, summary) {
  return {
    campaign_id: campaignId,
    total: summary.total,
    aceptados: summary.aceptados,
    guardados: summary.guardados,
    duplicados: summary.duplicados,
    rechazados: summary.rechazados,
    errores: summary.errores,
    detalles_rechazados: (summary.detalles_rechazados || []).map(buildRejectionDetail),
  };
}

function validateLaunchBody(body) {
  if (body !== undefined && body !== null) {
    if (typeof body !== "object" || Array.isArray(body)) {
      return { error: "body debe ser un objeto JSON" };
    }
  }

  const limit = body?.limite ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return { error: "limite debe ser un entero entre 1 y 500" };
  }
  return { value: limit };
}

function validateLaunchConfiguration(env, sender) {
  const required = [
    "CAMPAIGN_FLOW_ID",
    "CAMPAIGN_TEMPLATE_NAME",
    "HUN_ORQUESTADOR_API_BASE",
    "HUN_ORQUESTADOR_API_KEY",
    "HUN_ORQUESTADOR_API_ENDPOINT",
    "WHATSAPP_TOKEN",
    "PHONE_NUMBER_ID",
  ];
  const missing = required.filter((name) => !cleanText(env[name]));
  const hasTokenSecret = [
    "CAMPAIGN_FLOW_TOKEN_SECRET_B64",
    "FLOW_SLOT_TOKEN_SECRET_B64",
    "FLOW_SESSION_PII_KEY_B64",
  ].some((name) => cleanText(env[name]));
  if (!hasTokenSecret) missing.push("CAMPAIGN_FLOW_TOKEN_SECRET_B64_o_fallback");
  if (typeof sender?.enviarOfertasCampania !== "function") {
    missing.push("campaign_sender");
  }

  return missing;
}

function launchTotals(result) {
  const toCount = (value) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  };
  return {
    enviados: toCount(result?.enviados),
    fallidos: toCount(result?.fallidos),
  };
}

function safeLaunchErrorCode(error) {
  const code = cleanText(error?.code);
  return code && /^[A-Za-z0-9_.-]{1,80}$/.test(code)
    ? code
    : "campaign_launch_failed";
}

function operationalCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function sanitizeFailureCounts(failures) {
  if (!failures || typeof failures !== "object" || Array.isArray(failures)) {
    return {};
  }

  const sanitized = {};
  for (const [reason, count] of Object.entries(failures)) {
    const cleanReason = cleanText(reason);
    if (cleanReason) sanitized[cleanReason] = operationalCount(count);
  }
  return sanitized;
}

function buildCampaignStatusResponse(campaign, summary, now = new Date()) {
  const counters = summary?.contadores || {};
  return {
    campaign_id: campaign.id,
    referencia_externa: cleanText(campaign.referencia_externa),
    nombre: cleanText(campaign.nombre),
    estado: cleanText(campaign.estado),
    contadores: {
      total: operationalCount(counters.total),
      pendientes: operationalCount(counters.pendientes),
      enviados: operationalCount(counters.enviados),
      fallidos: operationalCount(counters.fallidos),
      flow_iniciados: operationalCount(counters.flow_iniciados),
      agendados: operationalCount(counters.agendados),
      no_interesados: operationalCount(counters.no_interesados),
      excluidos: operationalCount(counters.excluidos),
    },
    fallos_por_motivo: sanitizeFailureCounts(summary?.fallos_por_motivo),
    actualizado_en: now.toISOString(),
  };
}

async function recordCampaignCancellation(context, campaignId) {
  try {
    await context.dbClient.guardarEventoOperativo?.({
      campaign_id: campaignId,
      event_type: "campaign_cancel",
      status: "exitosa",
      source: "campaign_api",
      endpoint_logico: "campaign_cancel",
      resultado_operativo: "campana_cancelada",
    });
  } catch (error) {
    // El estado cancelado es la fuente operativa; una falla de auditoria no
    // debe convertir una cancelacion confirmada en un error para el panel.
    console.error("campaignAdminApi: no se pudo registrar campaign_cancel", {
      campaign_id: campaignId,
    });
  }
}

async function processCampaignLaunch({ campaignId, limit, context }) {
  let status = "exitosa";
  let totals = { enviados: 0, fallidos: 0 };
  let errorCode = null;

  try {
    const result = await context.sender.enviarOfertasCampania({
      campaignId,
      limit,
      env: context.env,
    });
    totals = launchTotals(result);
  } catch (error) {
    status = "fallida";
    errorCode = safeLaunchErrorCode(error);
    console.error("campaignAdminApi: fallo lanzamiento de campana", {
      campaign_id: campaignId,
      error_code: errorCode,
    });
  } finally {
    try {
      await context.dbClient.guardarEventoOperativo?.({
        campaign_id: campaignId,
        event_type: "campaign_launch",
        status,
        source: "campaign_api",
        endpoint_logico: "campaign_launch",
        error_code: errorCode,
        error_category: errorCode ? "campaign_send" : null,
        resultado_operativo: JSON.stringify(totals),
      });
    } catch (error) {
      console.error("campaignAdminApi: no se pudo registrar campaign_launch");
    }

    try {
      const updated = await context.dbClient.actualizarEstadoCampana(
        campaignId,
        "activa"
      );
      if (!updated?.id) {
        console.error("campaignAdminApi: no se pudo restaurar campana a activa", {
          campaign_id: campaignId,
        });
      }
    } catch (error) {
      console.error("campaignAdminApi: no se pudo restaurar campana a activa", {
        campaign_id: campaignId,
      });
    } finally {
      lanzamientosEnCurso.delete(campaignId);
    }
  }
}

function createCampaignAdminRouter(deps = {}) {
  const router = express.Router();
  const context = {
    dbClient: deps.dbClient || db,
    sender: deps.sender || campaignSender,
    demanda: deps.demanda || demanda,
    env: deps.env || process.env,
  };

  router.use((req, res, next) => {
    const configuredKey = cleanText(context.env.PANEL_CAMPAIGN_API_KEY);
    if (!configuredKey) {
      return res.status(503).json({
        error: "panel_api_no_configurada",
        detalle: "PANEL_CAMPAIGN_API_KEY no esta configurada",
      });
    }

    if (!apiKeysMatch(configuredKey, req.get("x-api-key"))) {
      return res.status(401).json({
        error: "no_autorizado",
        detalle: "x-api-key invalida o ausente",
      });
    }

    return next();
  });

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const validation = validateCreateCampaignBody(req.body);
      if (validation.error) {
        return res.status(422).json({
          error: "validacion",
          detalle: validation.error,
        });
      }

      const campaignInput = validation.value;
      if (campaignInput.referencia_externa) {
        const existing = await context.dbClient.obtenerCampanaPorReferenciaExterna(
          campaignInput.referencia_externa
        );
        if (existing) {
          return res
            .status(200)
            .json(buildCampaignCreateResponse(existing, campaignInput.referencia_externa));
        }
      }

      const created = await context.dbClient.crearCampana(campaignInput);
      if (!created?.id) {
        // Si dos requests insertan la misma referencia a la vez, el indice unico
        // rechaza uno. Reconsultar permite devolver la campana ganadora como 200.
        const raced = campaignInput.referencia_externa
          ? await context.dbClient.obtenerCampanaPorReferenciaExterna(
              campaignInput.referencia_externa
            )
          : null;
        if (raced) {
          return res
            .status(200)
            .json(buildCampaignCreateResponse(raced, campaignInput.referencia_externa));
        }

        return res.status(503).json({
          error: "persistencia_no_disponible",
          detalle: "no fue posible crear la campana",
        });
      }

      return res
        .status(201)
        .json(buildCampaignCreateResponse(created, campaignInput.referencia_externa));
    })
  );
  router.post(
    "/:campaignId/destinatarios",
    asyncHandler(async (req, res) => {
      const campaignId = req.params.campaignId;
      const campaign = await context.dbClient.obtenerCampana(campaignId);
      if (!campaign) {
        return res.status(404).json({
          error: "campana_no_encontrada",
          detalle: "campaign_id no existe",
        });
      }

      const campaignState = cleanText(campaign.estado);
      if (["cerrada", "cancelada"].includes(campaignState)) {
        return res.status(409).json({
          error: "estado_no_admite_destinatarios",
          detalle: `estado actual: ${campaignState}`,
        });
      }

      const validation = validateRecipientsBody(req.body);
      if (validation.error) {
        return res.status(422).json({
          error: "validacion",
          detalle: validation.error,
        });
      }

      const records = validation.value.map(sanitizeRecipient);
      const summary = await context.demanda.sincronizarAudienciaCampana({
        campaignId,
        records,
        dbClient: context.dbClient,
      });

      // 503 solo cuando TODO lo que se intento guardar fallo por infraestructura;
      // si hubo duplicados el lote si fue procesado y el resumen es la respuesta.
      if (summary.errores > 0 && summary.guardados === 0 && summary.duplicados === 0) {
        return res.status(503).json({
          error: "persistencia_no_disponible",
          detalle: "no fue posible guardar ningun destinatario del lote",
        });
      }

      return res.status(200).json(buildRecipientsResponse(campaignId, summary));
    })
  );
  router.post(
    "/:campaignId/lanzar",
    asyncHandler(async (req, res) => {
      const campaignId = req.params.campaignId;
      const campaign = await context.dbClient.obtenerCampana(campaignId);
      if (!campaign) {
        return res.status(404).json({
          error: "campana_no_encontrada",
          detalle: "campaign_id no existe",
        });
      }

      if (lanzamientosEnCurso.has(campaignId)) {
        return res.status(409).json({
          error: "lanzamiento_en_curso",
          detalle: "ya existe un lanzamiento en curso para la campana",
        });
      }

      const campaignState = cleanText(campaign.estado);
      if (!["borrador", "programada", "activa"].includes(campaignState)) {
        return res.status(409).json({
          error: "estado_no_admite_lanzamiento",
          detalle: `estado actual: ${campaignState}`,
        });
      }

      const validation = validateLaunchBody(req.body);
      if (validation.error) {
        return res.status(422).json({
          error: "validacion",
          detalle: validation.error,
        });
      }
      const limit = validation.value;

      const recipients = await context.dbClient.listarDestinatariosPendientesCampana(
        campaignId,
        limit
      );
      if (!recipients.length) {
        return res.status(200).json({
          campaign_id: campaignId,
          estado: campaignState,
          destinatarios_a_procesar: 0,
        });
      }

      const missingConfiguration = validateLaunchConfiguration(
        context.env,
        context.sender
      );
      if (missingConfiguration.length) {
        return res.status(503).json({
          error: "envio_no_configurado",
          detalle: `configuracion faltante: ${missingConfiguration.join(", ")}`,
        });
      }

      // Revalidar despues de la consulta async para cerrar la carrera entre dos
      // solicitudes que hayan contado pendientes al mismo tiempo.
      if (lanzamientosEnCurso.has(campaignId)) {
        return res.status(409).json({
          error: "lanzamiento_en_curso",
          detalle: "ya existe un lanzamiento en curso para la campana",
        });
      }
      lanzamientosEnCurso.set(campaignId, true);

      let updated;
      try {
        updated = await context.dbClient.actualizarEstadoCampana(
          campaignId,
          "enviando"
        );
      } catch (error) {
        lanzamientosEnCurso.delete(campaignId);
        return res.status(503).json({
          error: "persistencia_no_disponible",
          detalle: "no fue posible marcar la campana como enviando",
        });
      }
      if (!updated?.id) {
        lanzamientosEnCurso.delete(campaignId);
        return res.status(503).json({
          error: "persistencia_no_disponible",
          detalle: "no fue posible marcar la campana como enviando",
        });
      }

      setImmediate(() => {
        void processCampaignLaunch({ campaignId, limit, context });
      });

      return res.status(202).json({
        campaign_id: campaignId,
        estado: "enviando",
        destinatarios_a_procesar: recipients.length,
      });
    })
  );
  router.get(
    "/:campaignId",
    asyncHandler(async (req, res) => {
      const campaignId = req.params.campaignId;
      const campaign = await context.dbClient.obtenerCampana(campaignId);
      if (!campaign) {
        return res.status(404).json({
          error: "campana_no_encontrada",
          detalle: "campaign_id no existe",
        });
      }

      const summary = await context.dbClient.contarDestinatariosCampana(campaignId);
      if (!summary) {
        return res.status(503).json({
          error: "persistencia_no_disponible",
          detalle: "no fue posible consultar los contadores de la campana",
        });
      }

      return res.status(200).json(buildCampaignStatusResponse(campaign, summary));
    })
  );
  router.post(
    "/:campaignId/cancelar",
    asyncHandler(async (req, res) => {
      const campaignId = req.params.campaignId;
      const campaign = await context.dbClient.obtenerCampana(campaignId);
      if (!campaign) {
        return res.status(404).json({
          error: "campana_no_encontrada",
          detalle: "campaign_id no existe",
        });
      }

      const campaignState = cleanText(campaign.estado);
      if (campaignState === "cancelada") {
        return res.status(200).json({
          campaign_id: campaignId,
          estado: "cancelada",
        });
      }
      if (campaignState === "cerrada") {
        return res.status(409).json({
          error: "estado_no_admite_cancelacion",
          detalle: "una campana cerrada no admite cancelacion",
        });
      }
      if (lanzamientosEnCurso.has(campaignId)) {
        return res.status(409).json({
          error: "lanzamiento_en_curso",
          detalle: "esperar a que el envio termine antes de cancelar",
        });
      }

      // Reservar el lock tambien durante la escritura de cancelacion evita que
      // un lanzamiento se interponga entre la comprobacion y el cambio de estado.
      lanzamientosEnCurso.set(campaignId, true);
      try {
        let updated;
        try {
          updated = await context.dbClient.actualizarEstadoCampana(
            campaignId,
            "cancelada"
          );
        } catch (error) {
          return res.status(503).json({
            error: "persistencia_no_disponible",
            detalle: "no fue posible cancelar la campana",
          });
        }
        if (!updated?.id) {
          return res.status(503).json({
            error: "persistencia_no_disponible",
            detalle: "no fue posible cancelar la campana",
          });
        }

        await recordCampaignCancellation(context, campaignId);
        return res.status(200).json({
          campaign_id: campaignId,
          estado: "cancelada",
        });
      } finally {
        lanzamientosEnCurso.delete(campaignId);
      }
    })
  );

  router.use(errorHandler);

  return router;
}

function errorHandler(error, req, res, next) {
  console.error("campaignAdminApi:", error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({
    error: "error_interno",
    detalle: "error inesperado",
  });
}

module.exports = {
  createCampaignAdminRouter,
  _private: {
    apiKeysMatch,
    asyncHandler,
    buildCampaignCreateResponse,
    buildCampaignStatusResponse,
    buildRecipientsResponse,
    errorHandler,
    lanzamientosEnCurso,
    launchTotals,
    processCampaignLaunch,
    recordCampaignCancellation,
    sanitizeFailureCounts,
    safeLaunchErrorCode,
    sanitizeRecipient,
    validateCreateCampaignBody,
    validateLaunchBody,
    validateLaunchConfiguration,
    validateRecipientsBody,
  },
};
