require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variables de entorno
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const FLOW_ID = process.env.FLOW_ID;
const FLOW_SCREEN_ID = process.env.FLOW_SCREEN_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v23.0";

// 1. Endpoint de salud
app.get("/", (req, res) => {
  res.send("Backend WhatsApp Flow activo");
});

// 2. Verificación del webhook (Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// 3. Recepción de mensajes
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // Ignorar eventos de status/delivery/read o payloads sin mensaje
    if (message && message.from) {
      const to = message.from;
      console.log(`Mensaje entrante de ${to}. Enviando Flow...`);
      await sendFlowMessage(to);
    }
  } catch (error) {
    console.error("Error procesando el webhook:", error.message);
  }

  // Responder siempre rápido para evitar reintentos de Meta
  return res.status(200).json({ status: "ok" });
});

// 4. Enviar el WhatsApp Flow
async function sendFlowMessage(to) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "flow",
      header: {
        type: "text",
        text: "Agendamiento de cita",
      },
      body: {
        text: "Hola. Para continuar con el agendamiento, por favor completa el siguiente formulario.",
      },
      footer: {
        text: "Hospital Universitario Nacional",
      },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: "test-flow-token",
          flow_id: FLOW_ID,
          flow_cta: "Agendar cita",
          flow_action: "navigate",
          flow_action_payload: {
            screen: FLOW_SCREEN_ID,
            data: {},
          },
        },
      },
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`Flow enviado a ${to}. ID:`, response.data?.messages?.[0]?.id);
  } catch (error) {
    // 5. Manejo de errores: no romper el servidor si falla el envío
    console.error("Error enviando el Flow:", error.message);
    if (error.response && error.response.data) {
      console.error(
        "Detalle del error de la API:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
  }
}

// Puerto: Render asigna process.env.PORT automáticamente
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
