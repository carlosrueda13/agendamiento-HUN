const assert = require("assert");
const http = require("http");
const express = require("express");

const {
  createCampaignAdminRouter,
  _private: { apiKeysMatch, asyncHandler, errorHandler, lanzamientosEnCurso },
} = require("../lib/campaignAdminApi");

function createCampaignDb() {
  const campaigns = [];
  const recipients = [];
  const recipientInputs = [];
  const campaignStateUpdates = [];
  const operationalEvents = [];
  const pendingListCalls = [];
  let sequence = 1;
  let recipientSequence = 1;

  return {
    campaigns,
    recipients,
    recipientInputs,
    campaignStateUpdates,
    operationalEvents,
    pendingListCalls,
    async obtenerCampana(campaignId) {
      return campaigns.find((campaign) => campaign.id === campaignId) || null;
    },
    async obtenerCampanaPorReferenciaExterna(reference) {
      return campaigns.find((campaign) => campaign.referencia_externa === reference) || null;
    },
    async crearCampana(input) {
      const id = `00000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`;
      sequence += 1;
      campaigns.push({ id, ...input });
      return { id };
    },
    async guardarDestinatarioCampana(input) {
      recipientInputs.push({ ...input });
      const existing = recipients.find(
        (recipient) =>
          recipient.campaign_id === input.campaign_id &&
          recipient.audiencia_ref === input.audiencia_ref
      );
      if (existing) return { id: existing.id, duplicate: true };

      const recipient = {
        id: `recipient-${recipientSequence}`,
        ...input,
        estado_contacto: "pendiente",
        opt_out: false,
      };
      recipientSequence += 1;
      recipients.push(recipient);
      return { id: recipient.id, duplicate: false };
    },
    async listarDestinatariosPendientesCampana(campaignId, limit) {
      pendingListCalls.push({ campaignId, limit });
      return recipients
        .filter(
          (recipient) =>
            recipient.campaign_id === campaignId &&
            recipient.estado_contacto === "pendiente" &&
            recipient.opt_out === false &&
            recipient.audiencia_ref
        )
        .slice(0, limit);
    },
    async actualizarEstadoCampana(campaignId, estado) {
      campaignStateUpdates.push({ campaignId, estado });
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) return null;
      campaign.estado = estado;
      return { id: campaignId };
    },
    async guardarEventoOperativo(event) {
      assert.strictEqual(event.telefono, undefined);
      assert.strictEqual(event.nombre, undefined);
      assert.strictEqual(event.documento, undefined);
      assert.strictEqual(event.payload, undefined);
      assert.strictEqual(event.results, undefined);
      assert.strictEqual(event.recipient_id, undefined);
      operationalEvents.push(event);
    },
    async contarDestinatariosCampana(campaignId) {
      const campaignRecipients = recipients.filter(
        (recipient) => recipient.campaign_id === campaignId
      );
      const contadores = {
        total: campaignRecipients.length,
        pendientes: 0,
        enviados: 0,
        fallidos: 0,
        flow_iniciados: 0,
        agendados: 0,
        no_interesados: 0,
        excluidos: 0,
      };
      const fallosPorMotivo = {};
      for (const recipient of campaignRecipients) {
        const estado = recipient.estado_contacto;
        if (estado === "pendiente") contadores.pendientes += 1;
        if (["enviado", "entregado", "leido", "respondido"].includes(estado)) {
          contadores.enviados += 1;
        }
        if (estado === "fallido") {
          contadores.fallidos += 1;
          if (recipient.motivo_exclusion) {
            fallosPorMotivo[recipient.motivo_exclusion] =
              (fallosPorMotivo[recipient.motivo_exclusion] || 0) + 1;
          }
        }
        if (estado === "flow_iniciado") contadores.flow_iniciados += 1;
        if (estado === "agendado") contadores.agendados += 1;
        if (estado === "no_interesado") contadores.no_interesados += 1;
        if (estado === "excluido") contadores.excluidos += 1;
      }
      return {
        contadores: { ...contadores, contador_interno: 999 },
        fallos_por_motivo: fallosPorMotivo,
        resultado_interno: "NO DEBE SALIR",
      };
    },
  };
}

function createDeferredSender() {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    enviarOfertasCampania(params) {
      calls.push(params);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
}

function startTestServer(env, deps = {}) {
  const app = express();
  app.use(express.json());
  app.get("/", (req, res) => res.status(200).send("ok"));
  app.post("/webhook", (req, res) => res.status(200).json({ status: "ok" }));
  app.post("/flow-endpoint", (req, res) => res.status(200).send("flow-ok"));
  app.use("/api/campanas", createCampaignAdminRouter({ ...deps, env }));

  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, method, path, headers = {}, body) {
  const { port } = server.address();
  const payload = body === undefined ? null : JSON.stringify(body);
  const requestHeaders = { ...headers };
  if (payload !== null) {
    requestHeaders["content-type"] = "application/json";
    requestHeaders["content-length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: requestHeaders,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          const contentType = String(res.headers["content-type"] || "");
          resolve({
            status: res.statusCode,
            body: contentType.includes("application/json") ? JSON.parse(body) : body,
          });
        });
      }
    );
    req.on("error", reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitFor(predicate, message, timeoutMs = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function runCampaignApiChecks() {
  assert.strictEqual(apiKeysMatch("clave-segura", "clave-segura"), true);
  assert.strictEqual(apiKeysMatch("clave-segura", "clave-distinta"), false);
  assert.strictEqual(apiKeysMatch("clave-segura", undefined), false);

  const unconfiguredServer = await startTestServer({});
  try {
    const response = await request(
      unconfiguredServer,
      "POST",
      "/api/campanas",
      { "x-api-key": "cualquier-valor" }
    );
    assert.strictEqual(response.status, 503);
    assert.strictEqual(response.body.error, "panel_api_no_configurada");
  } finally {
    await closeServer(unconfiguredServer);
  }

  const apiKey = "panel-test-key-2026";
  const campaignDb = createCampaignDb();
  const deferredSender = createDeferredSender();
  const launchEnv = {
    PANEL_CAMPAIGN_API_KEY: apiKey,
    CAMPAIGN_FLOW_ID: "2195324014654953",
    CAMPAIGN_TEMPLATE_NAME: "hun_oferta_cita_flow",
    HUN_ORQUESTADOR_API_BASE: "https://orquestador.test",
    HUN_ORQUESTADOR_API_KEY: "orquestador-test-key",
    HUN_ORQUESTADOR_API_ENDPOINT: "/api/v1/get-appointment/{id_anonimo}",
    WHATSAPP_TOKEN: "whatsapp-test-token",
    PHONE_NUMBER_ID: "phone-number-test",
    FLOW_SLOT_TOKEN_SECRET_B64: Buffer.alloc(32, 7).toString("base64"),
  };
  const configuredServer = await startTestServer(
    launchEnv,
    { dbClient: campaignDb, sender: deferredSender }
  );
  try {
    const missingKey = await request(configuredServer, "POST", "/api/campanas");
    assert.strictEqual(missingKey.status, 401);
    assert.deepStrictEqual(missingKey.body, {
      error: "no_autorizado",
      detalle: "x-api-key invalida o ausente",
    });

    const wrongKey = await request(
      configuredServer,
      "GET",
      "/api/campanas/campaign-1",
      { "x-api-key": "incorrecta" }
    );
    assert.strictEqual(wrongKey.status, 401);

    const validCampaign = {
      referencia_externa: " PANEL-2026-000123 ",
      nombre: " Oferta psiquiatria julio 2026 ",
      especialidad_codigo: " 590 ",
      responsable: " Coordinacion Consulta Externa ",
      cupos_objetivo: 100,
      origen_datos: " panel_hun ",
      telefono: "NO DEBE PASAR",
    };
    const created = await request(
      configuredServer,
      "POST",
      "/api/campanas",
      { "x-api-key": apiKey },
      validCampaign
    );
    assert.strictEqual(created.status, 201);
    assert.deepStrictEqual(created.body, {
      campaign_id: "00000000-0000-0000-0000-000000000001",
      referencia_externa: "PANEL-2026-000123",
      estado: "borrador",
    });
    assert.deepStrictEqual(Object.keys(created.body), [
      "campaign_id",
      "referencia_externa",
      "estado",
    ]);
    assert.strictEqual(campaignDb.campaigns[0].telefono, undefined);
    assert.strictEqual(campaignDb.campaigns[0].nombre, "Oferta psiquiatria julio 2026");
    assert.strictEqual(campaignDb.campaigns[0].especialidad_codigo, "590");
    campaignDb.campaigns[0].mensaje_template_id = "NO DEBE SALIR";
    campaignDb.campaigns[0].payload_interno = { no: "debe salir" };

    const emptyCampaignStatus = await request(
      configuredServer,
      "GET",
      `/api/campanas/${created.body.campaign_id}`,
      { "x-api-key": apiKey }
    );
    assert.strictEqual(emptyCampaignStatus.status, 200);
    assert.deepStrictEqual(Object.keys(emptyCampaignStatus.body), [
      "campaign_id",
      "referencia_externa",
      "nombre",
      "estado",
      "contadores",
      "fallos_por_motivo",
      "actualizado_en",
    ]);
    assert.deepStrictEqual(
      { ...emptyCampaignStatus.body, actualizado_en: "<iso>" },
      {
        campaign_id: created.body.campaign_id,
        referencia_externa: "PANEL-2026-000123",
        nombre: "Oferta psiquiatria julio 2026",
        estado: "borrador",
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
        actualizado_en: "<iso>",
      }
    );
    assert.strictEqual(
      new Date(emptyCampaignStatus.body.actualizado_en).toISOString(),
      emptyCampaignStatus.body.actualizado_en
    );

    const recipientBatch = {
      destinatarios: [
        {
          id_anonimo: " HUN-3040 ",
          cod_especialidad_requerida: " 590 ",
          nombre: "NO DEBE PASAR",
          telefono: "3000000000",
        },
        {
          audiencia_ref: "HUN-3041",
          especialidad_codigo: "312",
          correo: "no-debe-pasar@example.com",
        },
        {
          id_anonimo: "HUN-3042",
          nombre: "Registro incompleto",
        },
      ],
    };
    const recipientsCreated = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/destinatarios`,
      { "x-api-key": apiKey },
      recipientBatch
    );
    assert.strictEqual(recipientsCreated.status, 200);
    assert.deepStrictEqual(recipientsCreated.body, {
      campaign_id: created.body.campaign_id,
      total: 3,
      aceptados: 2,
      guardados: 2,
      duplicados: 0,
      rechazados: 1,
      errores: 0,
      detalles_rechazados: [
        {
          index: 2,
          motivo: "campos_obligatorios",
          campos: ["cod_especialidad_requerida"],
        },
      ],
    });
    assert.deepStrictEqual(campaignDb.recipientInputs, [
      {
        campaign_id: created.body.campaign_id,
        audiencia_ref: "HUN-3040",
        especialidad_codigo: "590",
      },
      {
        campaign_id: created.body.campaign_id,
        audiencia_ref: "HUN-3041",
        especialidad_codigo: "312",
      },
    ]);

    const repeatedRecipients = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/destinatarios`,
      { "x-api-key": apiKey },
      { destinatarios: recipientBatch.destinatarios.slice(0, 2) }
    );
    assert.strictEqual(repeatedRecipients.status, 200);
    assert.strictEqual(repeatedRecipients.body.aceptados, 0);
    assert.strictEqual(repeatedRecipients.body.guardados, 0);
    assert.strictEqual(repeatedRecipients.body.duplicados, 2);
    assert.strictEqual(campaignDb.recipients.length, 2);

    for (const invalidLimit of [0, 501, "10", 1.5]) {
      const invalidLaunch = await request(
        configuredServer,
        "POST",
        `/api/campanas/${created.body.campaign_id}/lanzar`,
        { "x-api-key": apiKey },
        { limite: invalidLimit }
      );
      assert.strictEqual(invalidLaunch.status, 422);
      assert.strictEqual(invalidLaunch.body.error, "validacion");
    }

    const firstLaunchStarted = Date.now();
    const firstLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      { limite: 1 }
    );
    assert(Date.now() - firstLaunchStarted < 2000);
    assert.deepStrictEqual(firstLaunch, {
      status: 202,
      body: {
        campaign_id: created.body.campaign_id,
        estado: "enviando",
        destinatarios_a_procesar: 1,
      },
    });

    const concurrentLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      { limite: 1 }
    );
    assert.strictEqual(concurrentLaunch.status, 409);
    assert.strictEqual(concurrentLaunch.body.error, "lanzamiento_en_curso");

    const stateUpdatesBeforeConcurrentCancel = campaignDb.campaignStateUpdates.length;
    const cancelDuringLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(cancelDuringLaunch, {
      status: 409,
      body: {
        error: "lanzamiento_en_curso",
        detalle: "esperar a que el envio termine antes de cancelar",
      },
    });
    assert.strictEqual(campaignDb.campaigns[0].estado, "enviando");
    assert.strictEqual(
      campaignDb.campaignStateUpdates.length,
      stateUpdatesBeforeConcurrentCancel
    );

    await waitFor(
      () => deferredSender.pending.length === 1,
      "El primer envio en segundo plano no inicio."
    );
    assert.strictEqual(deferredSender.calls[0].campaignId, created.body.campaign_id);
    assert.strictEqual(deferredSender.calls[0].limit, 1);
    assert.strictEqual(deferredSender.calls[0].env, launchEnv);
    campaignDb.recipients[0].estado_contacto = "enviado";
    deferredSender.pending[0].resolve({ enviados: 1, fallidos: 0 });
    await waitFor(
      () =>
        campaignDb.campaigns[0].estado === "activa" &&
        !lanzamientosEnCurso.has(created.body.campaign_id),
      "El primer lanzamiento no libero el lock o no termino activo."
    );
    assert.deepStrictEqual(campaignDb.operationalEvents.at(-1), {
      campaign_id: created.body.campaign_id,
      event_type: "campaign_launch",
      status: "exitosa",
      source: "campaign_api",
      endpoint_logico: "campaign_launch",
      error_code: null,
      error_category: null,
      resultado_operativo: '{"enviados":1,"fallidos":0}',
    });

    const activeRelaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(activeRelaunch.status, 202);
    assert.strictEqual(activeRelaunch.body.destinatarios_a_procesar, 1);
    await waitFor(
      () => deferredSender.pending.length === 2,
      "El relanzamiento de pendientes no inicio."
    );
    campaignDb.recipients[1].estado_contacto = "enviado";
    deferredSender.pending[1].resolve({ enviados: 1, fallidos: 0 });
    await waitFor(
      () =>
        campaignDb.campaigns[0].estado === "activa" &&
        !lanzamientosEnCurso.has(created.body.campaign_id),
      "El relanzamiento no termino."
    );

    const senderCallsBeforeEmptyLaunch = deferredSender.calls.length;
    const emptyLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.deepStrictEqual(emptyLaunch, {
      status: 200,
      body: {
        campaign_id: created.body.campaign_id,
        estado: "activa",
        destinatarios_a_procesar: 0,
      },
    });
    assert.strictEqual(deferredSender.calls.length, senderCallsBeforeEmptyLaunch);
    assert.strictEqual(lanzamientosEnCurso.has(created.body.campaign_id), false);

    campaignDb.recipients.push({
      id: "recipient-failure",
      campaign_id: created.body.campaign_id,
      audiencia_ref: "HUN-FAIL-LAUNCH",
      especialidad_codigo: "590",
      estado_contacto: "pendiente",
      opt_out: false,
    });
    const failingLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      { limite: 10 }
    );
    assert.strictEqual(failingLaunch.status, 202);
    await waitFor(
      () => deferredSender.pending.length === 3,
      "El lanzamiento fallido no inicio."
    );
    deferredSender.pending[2].reject(Object.assign(new Error("fallo simulado"), {
      code: "SIMULATED_SEND_FAILURE",
    }));
    await waitFor(
      () =>
        campaignDb.campaigns[0].estado === "activa" &&
        !lanzamientosEnCurso.has(created.body.campaign_id) &&
        campaignDb.operationalEvents.at(-1)?.status === "fallida",
      "El lanzamiento fallido no recupero estado y lock."
    );
    assert.strictEqual(
      campaignDb.operationalEvents.at(-1).error_code,
      "SIMULATED_SEND_FAILURE"
    );

    const retryAfterFailure = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      { limite: 10 }
    );
    assert.strictEqual(retryAfterFailure.status, 202);
    await waitFor(
      () => deferredSender.pending.length === 4,
      "El reintento posterior al fallo no inicio."
    );
    campaignDb.recipients.at(-1).estado_contacto = "fallido";
    campaignDb.recipients.at(-1).motivo_exclusion = "telefono_invalido";
    deferredSender.pending[3].resolve({ enviados: 0, fallidos: 1 });
    await waitFor(
      () =>
        campaignDb.campaigns[0].estado === "activa" &&
        !lanzamientosEnCurso.has(created.body.campaign_id),
      "El reintento posterior al fallo no termino."
    );

    campaignDb.recipients.push({
      id: "recipient-failure-2",
      campaign_id: created.body.campaign_id,
      audiencia_ref: "HUN-FAIL-STATUS",
      especialidad_codigo: "590",
      estado_contacto: "fallido",
      opt_out: false,
      motivo_exclusion: "telefono_invalido",
    });
    const activeCampaignStatus = await request(
      configuredServer,
      "GET",
      `/api/campanas/${created.body.campaign_id}`,
      { "x-api-key": apiKey }
    );
    assert.strictEqual(activeCampaignStatus.status, 200);
    assert.deepStrictEqual(activeCampaignStatus.body.contadores, {
      total: 4,
      pendientes: 0,
      enviados: 2,
      fallidos: 2,
      flow_iniciados: 0,
      agendados: 0,
      no_interesados: 0,
      excluidos: 0,
    });
    assert.deepStrictEqual(activeCampaignStatus.body.fallos_por_motivo, {
      telefono_invalido: 2,
    });
    assert.strictEqual(
      activeCampaignStatus.body.contadores.contador_interno,
      undefined
    );
    assert.strictEqual(activeCampaignStatus.body.resultado_interno, undefined);
    assert.strictEqual(activeCampaignStatus.body.mensaje_template_id, undefined);
    assert.strictEqual(activeCampaignStatus.body.payload_interno, undefined);

    const recipientInputsBeforeInvalidBatch = campaignDb.recipientInputs.length;
    const invalidBatches = [
      [{}, "destinatarios es obligatorio y debe ser un arreglo"],
      [{ destinatarios: [] }, "destinatarios no puede estar vacio"],
      [
        {
          destinatarios: Array.from({ length: 501 }, (_, index) => ({
            id_anonimo: `HUN-${index}`,
            cod_especialidad_requerida: "590",
          })),
        },
        "destinatarios no puede tener mas de 500 elementos",
      ],
    ];
    for (const [body, expectedDetail] of invalidBatches) {
      const invalidBatch = await request(
        configuredServer,
        "POST",
        `/api/campanas/${created.body.campaign_id}/destinatarios`,
        { "x-api-key": apiKey },
        body
      );
      assert.strictEqual(invalidBatch.status, 422);
      assert.deepStrictEqual(invalidBatch.body, {
        error: "validacion",
        detalle: expectedDetail,
      });
    }
    assert.strictEqual(campaignDb.recipientInputs.length, recipientInputsBeforeInvalidBatch);

    const recipientsBeforeCancellation = JSON.parse(
      JSON.stringify(campaignDb.recipients)
    );
    const stateUpdatesBeforeCancellation = campaignDb.campaignStateUpdates.length;
    const eventsBeforeCancellation = campaignDb.operationalEvents.length;
    const cancelled = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(cancelled, {
      status: 200,
      body: {
        campaign_id: created.body.campaign_id,
        estado: "cancelada",
      },
    });
    assert.strictEqual(campaignDb.campaigns[0].estado, "cancelada");
    assert.deepStrictEqual(
      campaignDb.campaignStateUpdates.at(-1),
      { campaignId: created.body.campaign_id, estado: "cancelada" }
    );
    assert.deepStrictEqual(campaignDb.operationalEvents.at(-1), {
      campaign_id: created.body.campaign_id,
      event_type: "campaign_cancel",
      status: "exitosa",
      source: "campaign_api",
      endpoint_logico: "campaign_cancel",
      resultado_operativo: "campana_cancelada",
    });
    assert.strictEqual(lanzamientosEnCurso.has(created.body.campaign_id), false);
    assert.deepStrictEqual(campaignDb.recipients, recipientsBeforeCancellation);

    const cancelledAgain = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(cancelledAgain, cancelled);
    assert.strictEqual(
      campaignDb.campaignStateUpdates.length,
      stateUpdatesBeforeCancellation + 1
    );
    assert.strictEqual(
      campaignDb.operationalEvents.length,
      eventsBeforeCancellation + 1
    );

    const launchAfterCancellation = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(launchAfterCancellation.status, 409);
    assert.strictEqual(
      launchAfterCancellation.body.error,
      "estado_no_admite_lanzamiento"
    );

    const recipientsAfterCancellation = await request(
      configuredServer,
      "POST",
      `/api/campanas/${created.body.campaign_id}/destinatarios`,
      { "x-api-key": apiKey },
      { destinatarios: recipientBatch.destinatarios.slice(0, 1) }
    );
    assert.strictEqual(recipientsAfterCancellation.status, 409);
    assert.strictEqual(
      recipientsAfterCancellation.body.error,
      "estado_no_admite_destinatarios"
    );
    assert.deepStrictEqual(campaignDb.recipients, recipientsBeforeCancellation);

    const unknownCampaign = await request(
      configuredServer,
      "POST",
      "/api/campanas/00000000-0000-0000-0000-999999999999/destinatarios",
      { "x-api-key": apiKey },
      { destinatarios: recipientBatch.destinatarios.slice(0, 1) }
    );
    assert.strictEqual(unknownCampaign.status, 404);
    assert.strictEqual(unknownCampaign.body.error, "campana_no_encontrada");

    const cancelledCampaignId = "00000000-0000-0000-0000-888888888888";
    campaignDb.campaigns.push({ id: cancelledCampaignId, estado: "cancelada" });
    const cancelledCampaign = await request(
      configuredServer,
      "POST",
      `/api/campanas/${cancelledCampaignId}/destinatarios`,
      { "x-api-key": apiKey },
      { destinatarios: recipientBatch.destinatarios.slice(0, 1) }
    );
    assert.strictEqual(cancelledCampaign.status, 409);
    assert.deepStrictEqual(cancelledCampaign.body, {
      error: "estado_no_admite_destinatarios",
      detalle: "estado actual: cancelada",
    });
    const cancelledLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${cancelledCampaignId}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(cancelledLaunch.status, 409);
    assert.strictEqual(cancelledLaunch.body.error, "estado_no_admite_lanzamiento");
    const alreadyCancelled = await request(
      configuredServer,
      "POST",
      `/api/campanas/${cancelledCampaignId}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(alreadyCancelled, {
      status: 200,
      body: { campaign_id: cancelledCampaignId, estado: "cancelada" },
    });

    const draftCampaignId = "00000000-0000-0000-0000-888888888889";
    campaignDb.campaigns.push({ id: draftCampaignId, estado: "borrador" });
    const cancelledDraft = await request(
      configuredServer,
      "POST",
      `/api/campanas/${draftCampaignId}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(cancelledDraft, {
      status: 200,
      body: { campaign_id: draftCampaignId, estado: "cancelada" },
    });
    assert.strictEqual(
      campaignDb.campaigns.find((campaign) => campaign.id === draftCampaignId)
        .estado,
      "cancelada"
    );

    const closedCampaignId = "00000000-0000-0000-0000-777777777778";
    campaignDb.campaigns.push({ id: closedCampaignId, estado: "cerrada" });
    const closedLaunch = await request(
      configuredServer,
      "POST",
      `/api/campanas/${closedCampaignId}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(closedLaunch.status, 409);
    assert.strictEqual(closedLaunch.body.error, "estado_no_admite_lanzamiento");
    const closedCancel = await request(
      configuredServer,
      "POST",
      `/api/campanas/${closedCampaignId}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(closedCancel, {
      status: 409,
      body: {
        error: "estado_no_admite_cancelacion",
        detalle: "una campana cerrada no admite cancelacion",
      },
    });

    const unknownLaunch = await request(
      configuredServer,
      "POST",
      "/api/campanas/00000000-0000-0000-0000-999999999999/lanzar",
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(unknownLaunch.status, 404);

    const unknownStatus = await request(
      configuredServer,
      "GET",
      "/api/campanas/00000000-0000-0000-0000-999999999999",
      { "x-api-key": apiKey }
    );
    assert.strictEqual(unknownStatus.status, 404);
    assert.strictEqual(unknownStatus.body.error, "campana_no_encontrada");

    const unknownCancel = await request(
      configuredServer,
      "POST",
      "/api/campanas/00000000-0000-0000-0000-999999999999/cancelar",
      { "x-api-key": apiKey }
    );
    assert.strictEqual(unknownCancel.status, 404);
    assert.strictEqual(unknownCancel.body.error, "campana_no_encontrada");

    const repeated = await request(
      configuredServer,
      "POST",
      "/api/campanas",
      { "x-api-key": apiKey },
      validCampaign
    );
    assert.strictEqual(repeated.status, 200);
    assert.strictEqual(repeated.body.campaign_id, created.body.campaign_id);
    assert.strictEqual(
      campaignDb.campaigns.filter(
        (campaign) => campaign.referencia_externa === "PANEL-2026-000123"
      ).length,
      1
    );

    for (const invalidBody of [
      {},
      { nombre: "   " },
      { nombre: "Campana", cupos_objetivo: -1 },
      { nombre: "Campana", cupos_objetivo: "abc" },
      { nombre: "Campana", referencia_externa: 123 },
    ]) {
      const invalid = await request(
        configuredServer,
        "POST",
        "/api/campanas",
        { "x-api-key": apiKey },
        invalidBody
      );
      assert.strictEqual(invalid.status, 422);
      assert.strictEqual(invalid.body.error, "validacion");
    }

    const withoutReferenceOne = await request(
      configuredServer,
      "POST",
      "/api/campanas",
      { "x-api-key": apiKey },
      { nombre: "Campana sin referencia" }
    );
    const withoutReferenceTwo = await request(
      configuredServer,
      "POST",
      "/api/campanas",
      { "x-api-key": apiKey },
      { nombre: "Campana sin referencia" }
    );
    assert.strictEqual(withoutReferenceOne.status, 201);
    assert.strictEqual(withoutReferenceTwo.status, 201);
    assert.notStrictEqual(
      withoutReferenceOne.body.campaign_id,
      withoutReferenceTwo.body.campaign_id
    );
    assert.strictEqual(withoutReferenceOne.body.referencia_externa, null);

    assert.strictEqual((await request(configuredServer, "GET", "/")).status, 200);
    assert.strictEqual(
      (await request(configuredServer, "POST", "/webhook")).status,
      200
    );
    assert.strictEqual(
      (await request(configuredServer, "POST", "/flow-endpoint")).status,
      200
    );
  } finally {
    await closeServer(configuredServer);
  }

  const missingConfigCampaignId = "00000000-0000-0000-0000-666666666666";
  const missingConfigDb = {
    async obtenerCampana() {
      return { id: missingConfigCampaignId, estado: "borrador" };
    },
    async listarDestinatariosPendientesCampana() {
      return [{ id: "recipient-config", audiencia_ref: "HUN-CONFIG" }];
    },
  };
  let missingConfigSenderCalls = 0;
  const missingConfigServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: missingConfigDb,
      sender: {
        async enviarOfertasCampania() {
          missingConfigSenderCalls += 1;
          return { enviados: 1, fallidos: 0 };
        },
      },
    }
  );
  try {
    const missingConfig = await request(
      missingConfigServer,
      "POST",
      `/api/campanas/${missingConfigCampaignId}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(missingConfig.status, 503);
    assert.strictEqual(missingConfig.body.error, "envio_no_configurado");
    assert.strictEqual(missingConfigSenderCalls, 0);
    assert.strictEqual(lanzamientosEnCurso.has(missingConfigCampaignId), false);
  } finally {
    await closeServer(missingConfigServer);
  }

  const stateFailureCampaignId = "00000000-0000-0000-0000-555555555555";
  let stateFailureSenderCalls = 0;
  const stateFailureServer = await startTestServer(launchEnv, {
    dbClient: {
      async obtenerCampana() {
        return { id: stateFailureCampaignId, estado: "borrador" };
      },
      async listarDestinatariosPendientesCampana() {
        return [{ id: "recipient-state", audiencia_ref: "HUN-STATE" }];
      },
      async actualizarEstadoCampana() {
        return null;
      },
    },
    sender: {
      async enviarOfertasCampania() {
        stateFailureSenderCalls += 1;
        return { enviados: 1, fallidos: 0 };
      },
    },
  });
  try {
    const stateFailure = await request(
      stateFailureServer,
      "POST",
      `/api/campanas/${stateFailureCampaignId}/lanzar`,
      { "x-api-key": apiKey },
      {}
    );
    assert.strictEqual(stateFailure.status, 503);
    assert.strictEqual(stateFailure.body.error, "persistencia_no_disponible");
    assert.strictEqual(stateFailureSenderCalls, 0);
    assert.strictEqual(lanzamientosEnCurso.has(stateFailureCampaignId), false);
  } finally {
    await closeServer(stateFailureServer);
  }

  const cancelFailureCampaignId = "00000000-0000-0000-0000-555555555556";
  let cancelFailureEventCalls = 0;
  const cancelFailureServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampana() {
          return { id: cancelFailureCampaignId, estado: "activa" };
        },
        async actualizarEstadoCampana() {
          return null;
        },
        async guardarEventoOperativo() {
          cancelFailureEventCalls += 1;
        },
      },
    }
  );
  try {
    const cancelFailure = await request(
      cancelFailureServer,
      "POST",
      `/api/campanas/${cancelFailureCampaignId}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(cancelFailure, {
      status: 503,
      body: {
        error: "persistencia_no_disponible",
        detalle: "no fue posible cancelar la campana",
      },
    });
    assert.strictEqual(cancelFailureEventCalls, 0);
    assert.strictEqual(lanzamientosEnCurso.has(cancelFailureCampaignId), false);
  } finally {
    await closeServer(cancelFailureServer);
  }

  const cancelAuditFailureCampaignId =
    "00000000-0000-0000-0000-555555555557";
  let cancelAuditState = "activa";
  const cancelAuditFailureServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampana() {
          return { id: cancelAuditFailureCampaignId, estado: cancelAuditState };
        },
        async actualizarEstadoCampana(campaignId, estado) {
          cancelAuditState = estado;
          return { id: campaignId };
        },
        async guardarEventoOperativo() {
          throw new Error("fallo de auditoria simulado");
        },
      },
    }
  );
  try {
    const cancelWithAuditFailure = await request(
      cancelAuditFailureServer,
      "POST",
      `/api/campanas/${cancelAuditFailureCampaignId}/cancelar`,
      { "x-api-key": apiKey }
    );
    assert.deepStrictEqual(cancelWithAuditFailure, {
      status: 200,
      body: {
        campaign_id: cancelAuditFailureCampaignId,
        estado: "cancelada",
      },
    });
    assert.strictEqual(cancelAuditState, "cancelada");
    assert.strictEqual(
      lanzamientosEnCurso.has(cancelAuditFailureCampaignId),
      false
    );
  } finally {
    await closeServer(cancelAuditFailureServer);
  }

  const counterFailureCampaignId = "00000000-0000-0000-0000-444444444444";
  const counterFailureServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampana() {
          return {
            id: counterFailureCampaignId,
            nombre: "Campana sin conteo",
            referencia_externa: null,
            estado: "activa",
          };
        },
        async contarDestinatariosCampana() {
          return null;
        },
      },
    }
  );
  try {
    const counterFailure = await request(
      counterFailureServer,
      "GET",
      `/api/campanas/${counterFailureCampaignId}`,
      { "x-api-key": apiKey }
    );
    assert.strictEqual(counterFailure.status, 503);
    assert.deepStrictEqual(counterFailure.body, {
      error: "persistencia_no_disponible",
      detalle: "no fue posible consultar los contadores de la campana",
    });
  } finally {
    await closeServer(counterFailureServer);
  }

  const unavailableServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampanaPorReferenciaExterna() {
          return null;
        },
        async crearCampana() {
          return null;
        },
      },
    }
  );
  try {
    const unavailable = await request(
      unavailableServer,
      "POST",
      "/api/campanas",
      { "x-api-key": apiKey },
      { nombre: "Campana sin persistencia", referencia_externa: "PANEL-FAIL" }
    );
    assert.strictEqual(unavailable.status, 503);
    assert.strictEqual(unavailable.body.error, "persistencia_no_disponible");
  } finally {
    await closeServer(unavailableServer);
  }

  let raceLookupCount = 0;
  const raceServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampanaPorReferenciaExterna(reference) {
          raceLookupCount += 1;
          return raceLookupCount === 1
            ? null
            : {
                id: "00000000-0000-0000-0000-000000000099",
                referencia_externa: reference,
                estado: "borrador",
              };
        },
        async crearCampana() {
          return null;
        },
      },
    }
  );
  try {
    const raced = await request(
      raceServer,
      "POST",
      "/api/campanas",
      { "x-api-key": apiKey },
      { nombre: "Campana concurrente", referencia_externa: "PANEL-RACE" }
    );
    assert.strictEqual(raced.status, 200);
    assert.strictEqual(
      raced.body.campaign_id,
      "00000000-0000-0000-0000-000000000099"
    );
    assert.strictEqual(raceLookupCount, 2);
  } finally {
    await closeServer(raceServer);
  }

  const recipientsUnavailableServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampana(campaignId) {
          return { id: campaignId, estado: "borrador" };
        },
        async guardarDestinatarioCampana() {
          return null;
        },
      },
    }
  );
  try {
    const unavailableRecipients = await request(
      recipientsUnavailableServer,
      "POST",
      "/api/campanas/00000000-0000-0000-0000-777777777777/destinatarios",
      { "x-api-key": apiKey },
      {
        destinatarios: [
          { id_anonimo: "HUN-FAIL", cod_especialidad_requerida: "590" },
        ],
      }
    );
    assert.strictEqual(unavailableRecipients.status, 503);
    assert.deepStrictEqual(unavailableRecipients.body, {
      error: "persistencia_no_disponible",
      detalle: "no fue posible guardar ningun destinatario del lote",
    });
  } finally {
    await closeServer(recipientsUnavailableServer);
  }

  // Recargar un lote donde todo lo existente es duplicado y solo un registro
  // sufre un error transitorio NO es una caida total de infraestructura:
  // debe responder 200 con el resumen (duplicados + errores), no 503.
  const duplicatesWithErrorServer = await startTestServer(
    { PANEL_CAMPAIGN_API_KEY: apiKey },
    {
      dbClient: {
        async obtenerCampana(campaignId) {
          return { id: campaignId, estado: "borrador" };
        },
        async guardarDestinatarioCampana(input) {
          if (input.audiencia_ref === "HUN-DUP") {
            return { id: "recipient-dup", duplicate: true };
          }
          return null;
        },
      },
    }
  );
  try {
    const duplicatesWithError = await request(
      duplicatesWithErrorServer,
      "POST",
      "/api/campanas/00000000-0000-0000-0000-777777777776/destinatarios",
      { "x-api-key": apiKey },
      {
        destinatarios: [
          { id_anonimo: "HUN-DUP", cod_especialidad_requerida: "590" },
          { id_anonimo: "HUN-TRANSIENT", cod_especialidad_requerida: "590" },
        ],
      }
    );
    assert.strictEqual(duplicatesWithError.status, 200);
    assert.strictEqual(duplicatesWithError.body.duplicados, 1);
    assert.strictEqual(duplicatesWithError.body.errores, 1);
    assert.strictEqual(duplicatesWithError.body.guardados, 0);
    assert.deepStrictEqual(duplicatesWithError.body.detalles_rechazados, [
      {
        index: 1,
        motivo: "error_sync",
        error_code: "persistencia_no_disponible",
      },
    ]);
  } finally {
    await closeServer(duplicatesWithErrorServer);
  }

  // Un handler async que lanza debe terminar en el errorHandler del router
  // (500 error_interno) y no dejar el request colgado. Es la garantia que
  // exige registrar toda ruta real de PANEL-004..008 con asyncHandler.
  const asyncErrorApp = express();
  asyncErrorApp.get(
    "/boom",
    asyncHandler(async () => {
      throw new Error("fallo async simulado");
    })
  );
  asyncErrorApp.use(errorHandler);
  const asyncErrorServer = await new Promise((resolve) => {
    const server = asyncErrorApp.listen(0, "127.0.0.1", () => resolve(server));
  });
  try {
    const boom = await request(asyncErrorServer, "GET", "/boom");
    assert.strictEqual(boom.status, 500);
    assert.deepStrictEqual(boom.body, {
      error: "error_interno",
      detalle: "error inesperado",
    });
  } finally {
    await closeServer(asyncErrorServer);
  }

}

if (require.main === module) {
  runCampaignApiChecks()
    .then(() => console.log("Campaign admin API checks passed."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runCampaignApiChecks };
