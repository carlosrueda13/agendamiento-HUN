const axios = require("axios");

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const REMINDER_TEMPLATE_ID = process.env.EMAILJS_REMINDER_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";
const configuredTimeout = Number(process.env.EMAILJS_TIMEOUT_MS);
const EMAILJS_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.min(Math.max(configuredTimeout, 1000), 60000)
  : 20000;

const configured = SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY && PRIVATE_KEY;
const reminderConfigured =
  SERVICE_ID && REMINDER_TEMPLATE_ID && PUBLIC_KEY && PRIVATE_KEY;

if (!configured) {
  console.warn(
    "Variables de EmailJS no configuradas: el envio de correos esta deshabilitado."
  );
}

function buildEmailJsPayload(templateId, templateParams) {
  return {
    service_id: SERVICE_ID,
    template_id: templateId,
    user_id: PUBLIC_KEY,
    accessToken: PRIVATE_KEY,
    template_params: templateParams,
  };
}

async function sendEmailJsTemplate(
  templateId,
  templateParams,
  httpClient = axios
) {
  return httpClient.post(
    EMAILJS_SEND_URL,
    buildEmailJsPayload(templateId, templateParams),
    {
      timeout: EMAILJS_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

function emailJsFailure(error) {
  const providerStatus = Number(error?.status || error?.response?.status) || null;
  const timedOut =
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT" ||
    error?.name === "TimeoutError";

  return {
    sent: false,
    reason: timedOut ? "provider_timeout" : "provider_rejected",
    provider_status: providerStatus,
  };
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
    console.log("Inicio envio correo de confirmacion.");
    await sendEmailJsTemplate(
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
      }
    );
    console.log("Correo de confirmacion enviado.");
    return { sent: true, reason: null };
  } catch (error) {
    const failure = emailJsFailure(error);
    console.error(
      `Error enviando correo de confirmacion: ${failure.reason}${
        failure.provider_status ? ` status=${failure.provider_status}` : ""
      }`
    );
    return failure;
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

  return sendEmailJsTemplate(
    REMINDER_TEMPLATE_ID,
    buildReminderTemplateParams(params)
  );
}

module.exports = {
  enviarConfirmacion,
  enviarRecordatorio,
  _private: {
    EMAILJS_SEND_URL,
    EMAILJS_TIMEOUT_MS,
    buildEmailJsPayload,
    buildReminderTemplateParams,
    emailJsFailure,
    sendEmailJsTemplate,
  },
};
