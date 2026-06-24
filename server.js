require("dotenv").config();

const express = require("express");
const axios = require("axios");

const { decryptRequest, encryptResponse } = require("./lib/flowCrypto");
const { handleFlow } = require("./lib/flowHandler");

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

// Diagnóstico: ¿Render alcanza la API del HUN?
// Abrir en el navegador: https://agendamiento-hun.onrender.com/test-hun
app.get("/test-hun", async (req, res) => {
  const inicio = Date.now();
  try {
    const r = await axios.get(
      "http://190.109.10.204/webServiceEspecialidad/especialidades",
      {
        headers: { "x-api-key": "HospitalUniversitarioNacionaldeColombia" },
        timeout: 15000,
      }
    );
    const total = r.data?.data?.length ?? 0;
    res.status(200).json({
      alcanzable: true,
      mensaje: "✅ Render SÍ alcanza la API del HUN",
      status_hun: r.status,
      especialidades_recibidas: total,
      ejemplo: r.data?.data?.slice(0, 2) ?? null,
      tiempo_ms: Date.now() - inicio,
    });
  } catch (error) {
    res.status(200).json({
      alcanzable: false,
      mensaje: "❌ Render NO alcanza la API del HUN",
      error: error.message,
      codigo: error.code ?? null,
      tiempo_ms: Date.now() - inicio,
    });
  }
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

// Endpoint del Flow dinámico (data_exchange).
// Recibe peticiones cifradas de Meta, las descifra, procesa cada pantalla
// consultando el HUN/Supabase, y devuelve la respuesta cifrada en base64.
app.post("/flow-endpoint", async (req, res) => {
  let aesKey, iv;
  try {
    const descifrado = decryptRequest(req.body);
    aesKey = descifrado.aesKey;
    iv = descifrado.iv;

    const p = descifrado.payload;
    console.log(
      `Flow: action=${p.action} screen=${p.screen} data=${JSON.stringify(p.data || {})}`
    );

    const respuesta = await handleFlow(descifrado.payload);
    const cifrada = encryptResponse(respuesta, aesKey, iv);
    return res.status(200).type("text/plain").send(cifrada);
  } catch (error) {
    console.error("Error en /flow-endpoint:", error.message);
    if (error.response?.data) {
      console.error(
        "Detalle del error (HUN/API):",
        JSON.stringify(error.response.data)
      );
    }
    if (error.config?.url) {
      console.error(
        "URL llamada:",
        error.config.url,
        "params:",
        JSON.stringify(error.config.params || {})
      );
    }
    // Si falla el descifrado, 421 hace que Meta reintente refrescando la llave.
    if (!aesKey) return res.sendStatus(421);
    return res.sendStatus(500);
  }
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
          flow_token: to,
          flow_id: FLOW_ID,
          flow_cta: "Agendar cita",
          flow_action: "navigate",
          flow_action_payload: {
            screen: FLOW_SCREEN_ID,
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
