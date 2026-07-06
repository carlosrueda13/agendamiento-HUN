const assert = require("assert");

process.env.FLOW_SESSION_PII_KEY_B64 = Buffer.alloc(32, 11).toString("base64");
process.env.CAMPAIGN_FLOW_TOKEN_SECRET_B64 = Buffer.alloc(32, 12).toString("base64");

const { createCampaignSender } = require("../lib/campaignSender");
const whatsapp = require("../lib/whatsapp");

const notificaciones = [];
const eventos = [];
const estados = [];
const whatsappPayloads = [];

const recipient = {
  id: "10000000-0000-0000-0000-000000000001",
  campaign_id: "20000000-0000-0000-0000-000000000002",
  audiencia_ref: "anon-123",
  especialidad_codigo: "590",
  estado_contacto: "pendiente",
  opt_out: false,
};

const fakeDb = {
  async listarDestinatariosPendientesCampana(campaignId, limit) {
    assert.strictEqual(campaignId, recipient.campaign_id);
    assert.strictEqual(limit, 10);
    return [recipient];
  },
  async registrarNotificacion(record) {
    notificaciones.push(record);
    assert.strictEqual(record.whatsapp_numero, undefined);
    assert.strictEqual(record.telefono, undefined);
    assert.strictEqual(record.nombre, undefined);
    assert.strictEqual(record.payload, undefined);
    return { id: `notif-${notificaciones.length}` };
  },
  async actualizarEstadoDestinatario(recipientId, estado, extra) {
    estados.push({ recipientId, estado, extra });
    return { id: recipientId };
  },
  async guardarEventoOperativo(record) {
    eventos.push(record);
    assert.strictEqual(record.whatsapp_numero, undefined);
    assert.strictEqual(record.telefono, undefined);
    assert.strictEqual(record.nombre, undefined);
    assert.strictEqual(record.payload, undefined);
  },
};

const sender = createCampaignSender({
  dbClient: fakeDb,
  resolver: async ({ idAnonimo }) => {
    assert.strictEqual(idAnonimo, "anon-123");
    return { ok: true, telefono: "573001112233", especialidad_codigo: "590" };
  },
  whatsappClient: {
    async sendCampaignFlowTemplate(params) {
      whatsappPayloads.push(params);
      return { messages: [{ id: "wamid.test-message" }] };
    },
  },
  now: (() => {
    let tick = 1000;
    return () => {
      tick += 10;
      return tick;
    };
  })(),
});

(async () => {
  const result = await sender.enviarOfertasCampania({
    campaignId: recipient.campaign_id,
    limit: 10,
    env: {
      CAMPAIGN_FLOW_ID: "2195324014654953",
      CAMPAIGN_FLOW_SCREEN_ID: "IDENTIFICACION",
      CAMPAIGN_TEMPLATE_NAME: "hun_oferta_cita_flow",
      CAMPAIGN_TEMPLATE_LANGUAGE: "es_CO",
    },
  });

  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.enviados, 1);
  assert.strictEqual(result.fallidos, 0);
  assert.strictEqual(whatsappPayloads.length, 1);
  assert.strictEqual(whatsappPayloads[0].to, "573001112233");
  assert.strictEqual(whatsappPayloads[0].templateName, "hun_oferta_cita_flow");
  assert.strictEqual(whatsappPayloads[0].languageCode, "es_CO");
  assert.match(whatsappPayloads[0].flowToken, /^campaign_v1\./);
  assert.strictEqual(estados.at(-1).estado, "enviado");
  assert.strictEqual(notificaciones.some((item) => item.estado === "enviado"), true);
  assert.strictEqual(eventos.some((item) => item.status === "success"), true);

  const payload = whatsapp._private.buildCampaignFlowTemplatePayload({
    to: "573001112233",
    templateName: "hun_oferta_cita_flow",
    languageCode: "es_CO",
    flowToken: "campaign_v1.test.token",
    flowScreenId: "IDENTIFICACION",
  });

  assert.strictEqual(payload.type, "template");
  assert.strictEqual(payload.template.name, "hun_oferta_cita_flow");
  assert.strictEqual(payload.template.language.code, "es_CO");
  assert.strictEqual(payload.template.components[0].sub_type, "flow");
  assert.strictEqual(
    payload.template.components[0].parameters[0].action.flow_action_data.screen,
    "IDENTIFICACION"
  );

  const failingSender = createCampaignSender({
    dbClient: fakeDb,
    resolver: async () => ({ ok: false, error_code: "telefono_invalido" }),
    whatsappClient: {
      async sendCampaignFlowTemplate() {
        throw new Error("No debe enviarse WhatsApp sin telefono valido.");
      },
    },
  });

  const failed = await failingSender.enviarOfertaDestinatario(recipient, {
    env: { CAMPAIGN_FLOW_ID: "2195324014654953" },
  });
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.motivo, "telefono_invalido");
  assert.strictEqual(estados.at(-1).estado, "fallido");

  console.log("Campaign send checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
