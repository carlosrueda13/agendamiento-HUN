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

function buildInteractiveButtonsPayload({ to, body, footer, buttons }) {
  if (!to) throw new Error("to es obligatorio.");
  if (!body) throw new Error("body es obligatorio.");
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error("buttons debe tener entre 1 y 3 opciones.");
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  };
}

function buildInteractiveListPayload({ to, body, footer, button, sectionTitle, rows }) {
  if (!to) throw new Error("to es obligatorio.");
  if (!body) throw new Error("body es obligatorio.");
  if (!button) throw new Error("button es obligatorio.");
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10) {
    throw new Error("rows debe tener entre 1 y 10 opciones.");
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button,
        sections: [
          {
            title: sectionTitle || "Opciones",
            rows: rows.map((row) => ({
              id: row.id,
              title: row.title,
              ...(row.description ? { description: row.description } : {}),
            })),
          },
        ],
      },
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
    return true;
  } catch (e) {
    console.error("Error enviando mensaje de texto:", e.message);
    if (e.response?.data) {
      console.error("Detalle de WhatsApp omitido por privacidad. HTTP:", e.response.status);
    }
    return false;
  }
}

async function sendInteractiveButtons({ to, body, footer, buttons }) {
  const url = `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = buildInteractiveButtonsPayload({ to, body, footer, buttons });

  try {
    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log("Mensaje interactivo enviado.");
    return true;
  } catch (e) {
    console.error("Error enviando mensaje interactivo:", e.message);
    if (e.response?.data) {
      console.error("Detalle de WhatsApp omitido por privacidad. HTTP:", e.response.status);
    }
    return false;
  }
}

async function sendInteractiveList({ to, body, footer, button, sectionTitle, rows }) {
  const url = `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = buildInteractiveListPayload({
    to,
    body,
    footer,
    button,
    sectionTitle,
    rows,
  });

  try {
    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log("Lista interactiva enviada.");
    return true;
  } catch (e) {
    console.error("Error enviando lista interactiva:", e.message);
    if (e.response?.data) {
      console.error("Detalle de WhatsApp omitido por privacidad. HTTP:", e.response.status);
    }
    return false;
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
  sendInteractiveButtons,
  sendInteractiveList,
  sendCampaignFlowTemplate,
  _private: {
    buildCampaignFlowTemplatePayload,
    buildInteractiveButtonsPayload,
    buildInteractiveListPayload,
  },
};
