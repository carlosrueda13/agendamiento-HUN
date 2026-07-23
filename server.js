require("dotenv").config();

const express = require("express");
const axios = require("axios");

const { decryptRequest, encryptResponse } = require("./lib/flowCrypto");
const { handleFlow } = require("./lib/flowHandler");
const { handleIncomingMessage, DEFAULT_PHONE_LINE } = require("./lib/inboundRouter");
const { createCampaignAdminRouter } = require("./lib/campaignAdminApi");
const rescheduleHandler = require("./lib/rescheduleHandler");
const hun = require("./lib/hun");
const whatsapp = require("./lib/whatsapp");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || "256kb" }));

// Variables de entorno.
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const FLOW_ID = process.env.FLOW_ID;
const FLOW_SCREEN_ID = process.env.FLOW_SCREEN_ID;
const RESCHEDULE_FLOW_ID = process.env.RESCHEDULE_FLOW_ID;
const RESCHEDULE_FLOW_SCREEN_ID =
  process.env.RESCHEDULE_FLOW_SCREEN_ID || "IDENTIFICACION_REAGENDAMIENTO";
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v23.0";
const REQUIRED_RUNTIME_CONFIG = [
  "VERIFY_TOKEN",
  "WHATSAPP_TOKEN",
  "PHONE_NUMBER_ID",
  "FLOW_ID",
  "FLOW_PRIVATE_KEY_B64",
  "FLOW_SESSION_PII_KEY_B64",
  "HUN_API_BASE",
  "HUN_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function redactFlowData(data = {}) {
  const sensitive = new Set([
    "numero_documento",
    "documento",
    "correo",
    "slot",
    "cita_original",
  ]);
  return Object.fromEntries(
    Object.keys(data).map((key) => [
      key,
      sensitive.has(key) ? "[redacted]" : "[present]",
    ])
  );
}

function isFlowCompletionMessage(message = {}) {
  return message.type === "interactive" && message.interactive?.type === "nfm_reply";
}

// 1. Endpoint de salud.
app.get("/", (req, res) => {
  res.send("Backend WhatsApp Flow activo");
});

app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/health/ready", (req, res) => {
  const missing = REQUIRED_RUNTIME_CONFIG.filter(
    (key) => !String(process.env[key] || "").trim()
  );
  return res.status(missing.length ? 503 : 200).json({
    status: missing.length ? "not_ready" : "ready",
  });
});

// Diagnostico temporal de conectividad HUN. Debe permanecer deshabilitado
// salvo durante una ventana controlada de despliegue.
app.get("/test-hun", async (req, res) => {
  if (String(process.env.ENABLE_DIAGNOSTIC_ENDPOINTS || "").toLowerCase() !== "true") {
    return res.sendStatus(404);
  }

  const inicio = Date.now();
  try {
    const especialidades = await hun.getEspecialidades();
    res.status(200).json({
      alcanzable: true,
      mensaje: "El backend alcanza la API HUN",
      especialidades_recibidas: especialidades.length,
      tiempo_ms: Date.now() - inicio,
    });
  } catch (error) {
    res.status(503).json({
      alcanzable: false,
      mensaje: "El backend no alcanza la API HUN",
      categoria: error.category || "hun_api_error",
      tiempo_ms: Date.now() - inicio,
    });
  }
});

// 2. Verificacion del webhook (Meta).
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

// 3. Recepcion de mensajes.
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // Ignorar eventos de status/delivery/read o payloads sin mensaje.
    if (message && message.from && isFlowCompletionMessage(message)) {
      console.log("Mensaje de cierre de Flow ignorado por webhook general.");
    } else if (message && message.from) {
      console.log("Mensaje entrante recibido. Enrutando menu inicial.");
      await handleIncomingMessage(message, {
        whatsapp,
        hun,
        sendFlowMessage,
        sendRescheduleFlow: sendRescheduleFlowMessage,
        rescheduleHandler,
        phoneLine: DEFAULT_PHONE_LINE,
      });
    }
  } catch (error) {
    console.error("Error procesando el webhook:", error.message);
  }

  // Responder siempre rapido para evitar reintentos de Meta.
  return res.status(200).json({ status: "ok" });
});

// Endpoint dinamico del Flow (data_exchange).
// Recibe peticiones cifradas de Meta, las descifra, procesa cada pantalla
// consultando HUN/Supabase, y devuelve la respuesta cifrada en base64.
app.post("/flow-endpoint", async (req, res) => {
  let aesKey, iv;
  try {
    const descifrado = decryptRequest(req.body);
    aesKey = descifrado.aesKey;
    iv = descifrado.iv;

    const p = descifrado.payload;
    console.log(
      `Flow: action=${p.action} screen=${p.screen} data=${JSON.stringify(
        redactFlowData(p.data || {})
      )}`
    );

    const respuesta = await handleFlow(descifrado.payload);
    const cifrada = encryptResponse(respuesta, aesKey, iv);
    return res.status(200).type("text/plain").send(cifrada);
  } catch (error) {
    console.error("Error en /flow-endpoint:", error.message);
    if (error.response?.data) {
      console.error("Detalle HUN/API omitido por privacidad. HTTP:", error.response.status);
    }
    if (error.config?.url) {
      console.error("Endpoint llamado:", error.config.url);
    }
    // Si falla el descifrado, 421 hace que Meta reintente refrescando la llave.
    if (!aesKey) return res.sendStatus(421);
    return res.sendStatus(500);
  }
});

// 4. Enviar el WhatsApp Flow.
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
    console.log("Flow enviado. ID:", response.data?.messages?.[0]?.id);
  } catch (error) {
    // No romper el servidor si falla el envio.
    console.error("Error enviando el Flow:", error.message);
    if (error.response && error.response.data) {
      console.error("Detalle de API omitido por privacidad. HTTP:", error.response.status);
    }
  }
}

async function sendRescheduleFlowMessage(to, flowToken) {
  if (!RESCHEDULE_FLOW_ID) {
    throw new Error("RESCHEDULE_FLOW_ID no configurado.");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      header: { type: "text", text: "Modificar una cita" },
      body: {
        text: "Completa el formulario para elegir tu cita actual y consultar horarios equivalentes.",
      },
      footer: { text: "Hospital Universitario Nacional" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: flowToken,
          flow_id: RESCHEDULE_FLOW_ID,
          flow_cta: "Modificar cita",
          flow_action: "navigate",
          flow_action_payload: { screen: RESCHEDULE_FLOW_SCREEN_ID },
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
    console.log("Flow de modificacion enviado. ID:", response.data?.messages?.[0]?.id);
    return true;
  } catch (error) {
    console.error("Error enviando Flow de modificacion:", error.message);
    if (error.response?.data) {
      console.error("Detalle de API omitido por privacidad. HTTP:", error.response.status);
    }
    return false;
  }
}

// 5. API administrativa de campanas para el panel del hospital.
app.use("/api/campanas", createCampaignAdminRouter());

// Render inyecta PORT; Docker y ejecucion local usan 3000 por defecto.
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Cierre controlado iniciado por ${signal}.`);

  const forceExit = setTimeout(() => {
    console.error("Cierre controlado excedio el tiempo limite.");
    process.exit(1);
  }, 15000);
  forceExit.unref();

  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      console.error("Error cerrando servidor HTTP:", error.message);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
