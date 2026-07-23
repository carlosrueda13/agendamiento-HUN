const emailjs = require("@emailjs/nodejs");

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const REMINDER_TEMPLATE_ID = process.env.EMAILJS_REMINDER_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

const configured = SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY && PRIVATE_KEY;
const reminderConfigured =
  SERVICE_ID && REMINDER_TEMPLATE_ID && PUBLIC_KEY && PRIVATE_KEY;

if (!configured) {
  console.warn(
    "Variables de EmailJS no configuradas: el envio de correos esta deshabilitado."
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
  if (!configured) {
    console.warn(
      "Correo de confirmacion omitido: configuracion_emailjs_ausente."
    );
    return { sent: false, reason: "emailjs_not_configured" };
  }

  if (!to_email) {
    console.warn(
      "Correo de confirmacion omitido: destinatario_ausente."
    );
    return { sent: false, reason: "recipient_missing" };
  }

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
        numero_cita: numero_cita ? String(numero_cita) : "-",
        anio: String(new Date().getFullYear()),
      },
      { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }
    );
    console.log("Correo de confirmacion enviado.");
    return { sent: true, reason: null };
  } catch (error) {
    const providerStatus = Number(error?.status || error?.response?.status) || null;
    console.error(
      `Error enviando correo de confirmacion: proveedor_rechazo${
        providerStatus ? ` status=${providerStatus}` : ""
      }`
    );
    return {
      sent: false,
      reason: "provider_rejected",
      provider_status: providerStatus,
    };
  }
}

function buildReminderTemplateParams({
  to_email,
  to_name,
  especialidad,
  medico,
  tipo_consulta,
  fecha,
  hora,
  numero_cita,
  anio = new Date().getFullYear(),
}) {
  return {
    to_email,
    to_name,
    especialidad,
    medico,
    tipo_consulta,
    fecha,
    hora,
    numero_cita: String(numero_cita),
    anio: String(anio),
  };
}

async function enviarRecordatorio(params) {
  if (!reminderConfigured) {
    const error = new Error("EmailJS de recordatorios no esta configurado.");
    error.code = "emailjs_reminder_not_configured";
    error.category = "configuration";
    throw error;
  }

  if (!params?.to_email) {
    const error = new Error("El recordatorio por correo requiere destinatario.");
    error.code = "email_recipient_missing";
    error.category = "validation";
    throw error;
  }

  return emailjs.send(
    SERVICE_ID,
    REMINDER_TEMPLATE_ID,
    buildReminderTemplateParams(params),
    { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }
  );
}

module.exports = {
  enviarConfirmacion,
  enviarRecordatorio,
  _private: {
    buildReminderTemplateParams,
  },
};
