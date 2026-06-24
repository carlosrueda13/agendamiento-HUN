const axios = require("axios");

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERSION = process.env.GRAPH_API_VERSION || "v23.0";

// Envía un mensaje de texto normal al usuario (dentro de la ventana de 24h,
// que aplica porque el usuario inició la conversación con el Flow).
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
    console.log(`Mensaje de confirmación enviado a ${to}`);
  } catch (e) {
    console.error("Error enviando mensaje de texto:", e.message);
    if (e.response?.data) {
      console.error("Detalle:", JSON.stringify(e.response.data));
    }
  }
}

module.exports = { sendText };
