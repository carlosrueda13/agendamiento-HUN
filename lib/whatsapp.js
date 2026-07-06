const axios = require("axios");

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERSION = process.env.GRAPH_API_VERSION || "v23.0";

function buildCampaignFlowTemplatePayload({
  to,
  templateName,
  languageCode,
  flowToken,
  flowScreenId,
}) {
  if (!to) throw new Error("to es obligatorio.");
  if (!templateName) throw new Error("templateName es obligatorio.");
  if (!flowToken) throw new Error("flowToken es obligatorio.");

  const action = { flow_token: flowToken };
  if (flowScreenId) {
    action.flow_action_data = { screen: flowScreenId };
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode || "es_CO" },
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "action",
              action,
            },
          ],
        },
      ],
    },
  };
}

// Envia un mensaje de texto normal al usuario dentro de la ventana de 24h.
async function sendText(to, text) {
  const url = `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`;
  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Mensaje de confirmacion enviado.");
  } catch (e) {
    console.error("Error enviando mensaje de texto:", e.message);
    if (e.response?.data) {
      console.error("Detalle de WhatsApp omitido por privacidad. HTTP:", e.response.status);
    }
  }
}

async function sendCampaignFlowTemplate({
  to,
  templateName,
  languageCode = "es_CO",
  flowToken,
  flowScreenId,
  flowId,
  httpClient = axios,
}) {
  const url = `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = buildCampaignFlowTemplatePayload({
    to,
    templateName,
    languageCode,
    flowToken,
    flowScreenId,
  });

  const response = await httpClient.post(url, payload, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  console.log("Plantilla de campana enviada.", {
    template: templateName,
    flow_id: flowId || process.env.CAMPAIGN_FLOW_ID || null,
  });

  return response.data;
}

module.exports = {
  sendText,
  sendCampaignFlowTemplate,
  _private: {
    buildCampaignFlowTemplatePayload,
  },
};
