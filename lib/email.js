const emailjs = require("@emailjs/nodejs");

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

const configured = SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY && PRIVATE_KEY;

if (!configured) {
  console.warn(
    "⚠️ Variables de EmailJS no configuradas: el envío de correos está deshabilitado."
  );
}

async function enviarConfirmacion({
  to_email,
  to_name,
  especialidad,
  medico,
  tipo_consulta,
  fecha,
  hora,
  consultorio,
  numero_cita,
}) {
  if (!configured || !to_email) return;
  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email,
        to_name,
        especialidad,
        medico,
        tipo_consulta: tipo_consulta || "",
        fecha,
        hora,
        consultorio: String(consultorio),
        numero_cita: numero_cita ? String(numero_cita) : "—",
        anio: String(new Date().getFullYear()),
      },
      { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }
    );
    console.log(`Correo de confirmación enviado a ${to_email}`);
  } catch (e) {
    console.error("Error enviando correo de confirmación:", e?.text || e.message);
  }
}

module.exports = { enviarConfirmacion };
