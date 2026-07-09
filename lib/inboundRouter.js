const ACTIONS = {
  SCHEDULE: "agendar",
  CONSULT: "consultar",
  MODIFY_CANCEL: "modificar_cancelar",
};

const MENU_BUTTONS = [
  { id: "INTAKE_MENU_AGENDAR", title: "Agendar cita" },
  { id: "INTAKE_MENU_CONSULTAR", title: "Consultar citas" },
  { id: "INTAKE_MENU_CANCELAR", title: "Modificar/cancelar" },
];

const CONSENT_BUTTONS = [
  { id: "INTAKE_CONSENT_ACCEPT", title: "Acepto" },
  { id: "INTAKE_CONSENT_REJECT", title: "Rechazo" },
];

const ACTION_BY_BUTTON = {
  INTAKE_MENU_AGENDAR: ACTIONS.SCHEDULE,
  INTAKE_MENU_CONSULTAR: ACTIONS.CONSULT,
  INTAKE_MENU_CANCELAR: ACTIONS.MODIFY_CANCEL,
};

const VALID_DOCUMENT_TYPES = new Set(["CC", "CE", "PT", "TI", "RC", "PA"]);
const DEFAULT_SESSION_TTL_MS =
  Number(process.env.INBOUND_SESSION_TTL_MINUTES || 30) * 60000;
const DEFAULT_PHONE_LINE = "(601) 3904888 atencion al usuario";

const runtimeSessions = new Map();

const CONSENT_TEXT =
  "Para continuar por WhatsApp, autorizas al Hospital Universitario Nacional a tratar tus datos personales y datos sensibles de salud exclusivamente para consultar, gestionar, agendar, modificar o cancelar tus citas, de acuerdo con su politica de tratamiento de datos personales. Puedes rechazar esta autorizacion y comunicarte directamente con la linea telefonica del hospital.";

function buildRejectText(phoneLine = DEFAULT_PHONE_LINE) {
  return `No podemos continuar por WhatsApp sin tu autorizacion. Por favor comunicate directamente con la linea telefonica del hospital: ${phoneLine}.`;
}

function expiresAt(now = Date.now(), ttlMs = DEFAULT_SESSION_TTL_MS) {
  return now + ttlMs;
}

function isExpired(session, now = Date.now()) {
  return !session || Number(session.expires_at || 0) <= now;
}

function getMessageText(message = {}) {
  return String(message.text?.body || "").trim();
}

function getInteractiveId(message = {}) {
  const interactive = message.interactive || {};
  if (interactive.type === "button_reply") {
    return interactive.button_reply?.id || "";
  }
  if (interactive.type === "list_reply") {
    return interactive.list_reply?.id || "";
  }
  return "";
}

function parseActionFromText(text) {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/agendar|agenda|cita nueva/.test(normalized)) return ACTIONS.SCHEDULE;
  if (/consultar|consulta|proxima|proximas|mis citas/.test(normalized)) {
    return ACTIONS.CONSULT;
  }
  if (/cancelar|modificar|reprogramar|cambiar/.test(normalized)) {
    return ACTIONS.MODIFY_CANCEL;
  }
  return null;
}

function parseIncoming(message = {}) {
  const interactiveId = getInteractiveId(message);
  const text = getMessageText(message);

  return {
    interactiveId,
    text,
    action:
      ACTION_BY_BUTTON[interactiveId] ||
      (interactiveId ? null : parseActionFromText(text)),
  };
}

function normalizedText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isConsentAccept(incoming) {
  const text = normalizedText(incoming.text);
  return incoming.interactiveId === "INTAKE_CONSENT_ACCEPT" || text === "acepto";
}

function isConsentReject(incoming) {
  const text = normalizedText(incoming.text);
  return (
    incoming.interactiveId === "INTAKE_CONSENT_REJECT" ||
    text === "rechazo" ||
    text === "no acepto"
  );
}

function parseDocumentInput(text) {
  const normalized = String(text || "")
    .trim()
    .toUpperCase()
    .replace(/[:;,]/g, " ")
    .replace(/\s+/g, " ");
  const match = normalized.match(/\b(CC|CE|PT|TI|RC|PA)\b\s+([A-Z0-9.-]+)/);
  if (!match) return null;

  const tipo = match[1];
  const documento = match[2].replace(/[^A-Z0-9]/g, "");
  if (!VALID_DOCUMENT_TYPES.has(tipo) || !/^[A-Z0-9]{4,20}$/.test(documento)) {
    return null;
  }
  return { tipo, documento };
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function parseAppointmentDate(fecha, hora) {
  if (!fecha) return null;

  let isoDate = "";
  const cleanFecha = String(fecha).trim();
  const cleanHora = String(hora || "00:00:00").trim();
  const ymd = cleanFecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = cleanFecha.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (ymd) isoDate = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  if (dmy) isoDate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (!isoDate) return null;

  const date = new Date(`${isoDate}T${cleanHora.slice(0, 8) || "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAppointment(row) {
  const fecha = firstValue(row, [
    "Fecha_Cita",
    "fecha_cita",
    "Fecha",
    "fecha",
    "Fecha_Asignada",
    "fecha_asignada",
    "fec_cita",
  ]);
  const hora = firstValue(row, [
    "Hora_Cita",
    "hora_cita",
    "Hora",
    "hora",
    "Hora_Inicial",
    "hora_inicial",
  ]);

  return {
    fecha,
    hora,
    especialidad: firstValue(row, [
      "Nombre_Especialidad",
      "nombre_especialidad",
      "Especialidad",
      "especialidad",
      "Servicio",
      "servicio",
      "Nombre_Servicio",
    ]),
    medico: firstValue(row, [
      "Nombre_Medico",
      "nombre_medico",
      "Medico",
      "medico",
      "Profesional",
      "profesional",
    ]),
    estado: firstValue(row, ["Estado", "estado", "Estado_Cita", "estado_cita"]),
    date: parseAppointmentDate(fecha, hora),
  };
}

function upcomingAppointments(rows, now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  return (Array.isArray(rows) ? rows : [])
    .map(normalizeAppointment)
    .filter((item) => item.fecha || item.especialidad || item.estado)
    .filter((item) => !item.date || item.date >= startOfToday)
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });
}

function formatAppointment(item, index) {
  const parts = [];
  if (item.fecha) parts.push(item.hora ? `${item.fecha} ${item.hora.slice(0, 5)}` : item.fecha);
  if (item.especialidad) parts.push(item.especialidad);
  if (item.medico) parts.push(`Profesional: ${item.medico}`);
  if (item.estado) parts.push(`Estado: ${item.estado}`);
  return `${index + 1}. ${parts.join(" - ")}`;
}

function formatAppointmentsMessage(rows, now = new Date()) {
  const citas = upcomingAppointments(rows, now).slice(0, 5);
  if (!citas.length) {
    return "No encontramos citas proximas registradas con la informacion consultada. Si necesitas ayuda, comunicate con la linea telefonica del hospital.";
  }

  return [
    "Estas son tus proximas citas registradas en HUN:",
    ...citas.map(formatAppointment),
    "Si necesitas modificar o cancelar una cita, selecciona esa opcion en el menu.",
  ].join("\n");
}

async function sendMenu(to, whatsapp) {
  await whatsapp.sendInteractiveButtons({
    to,
    body:
      "Hola. Soy *Natalia*, asistente de citas del Hospital Universitario Nacional. Elige una opcion para continuar.",
    footer: "Hospital Universitario Nacional",
    buttons: MENU_BUTTONS,
  });
}

async function sendConsent(to, whatsapp) {
  await whatsapp.sendInteractiveButtons({
    to,
    body: CONSENT_TEXT,
    footer: "Tratamiento de datos personales",
    buttons: CONSENT_BUTTONS,
  });
}

async function promptDocument(to, whatsapp, action) {
  const intro =
    action === ACTIONS.MODIFY_CANCEL
      ? "Para revisar tus citas antes de modificar o cancelar,"
      : "Para consultar tus citas proximas,";
  await whatsapp.sendText(
    to,
    `${intro} responde con tipo y numero de documento. Ejemplo: CC 123456789.`
  );
}

async function handleAcceptedConsent(to, session, deps) {
  const { whatsapp, sendFlowMessage, now = () => Date.now(), ttlMs } = deps;

  if (session.action === ACTIONS.SCHEDULE) {
    await sendFlowMessage(to);
    deps.sessions.delete(to);
    return;
  }

  deps.sessions.set(to, {
    action: session.action,
    step: "awaiting_document",
    expires_at: expiresAt(now(), ttlMs),
  });
  await promptDocument(to, whatsapp, session.action);
}

async function handleDocumentStep(to, session, incoming, deps) {
  const { whatsapp, hun, nowDate = () => new Date() } = deps;
  const parsed = parseDocumentInput(incoming.text);

  if (!parsed) {
    await promptDocument(to, whatsapp, session.action);
    return;
  }

  try {
    const citas = await hun.consultarCitasDocumento(parsed.tipo, parsed.documento);
    await whatsapp.sendText(to, formatAppointmentsMessage(citas, nowDate()));

    if (session.action === ACTIONS.MODIFY_CANCEL) {
      await whatsapp.sendText(
        to,
        "La modificacion o cancelacion por WhatsApp requiere confirmacion adicional y quedara habilitada en el flujo de cancelacion. Por ahora, para modificar o cancelar comunicate con la linea telefonica del hospital."
      );
    }
  } catch (error) {
    await whatsapp.sendText(
      to,
      "No pudimos consultar tus citas en HUN en este momento. Intenta nuevamente mas tarde o comunicate con la linea telefonica del hospital."
    );
  } finally {
    deps.sessions.delete(to);
  }
}

async function handleIncomingMessage(message, deps = {}) {
  const to = message?.from;
  if (!to) return { handled: false, reason: "missing_from" };

  const sessions = deps.sessions || runtimeSessions;
  deps.sessions = sessions;

  const whatsapp = deps.whatsapp;
  if (!whatsapp?.sendText || !whatsapp?.sendInteractiveButtons) {
    throw new Error("whatsapp debe exponer sendText y sendInteractiveButtons.");
  }
  if (!deps.sendFlowMessage) {
    throw new Error("sendFlowMessage es obligatorio para agendamiento.");
  }

  const now = deps.now || (() => Date.now());
  const incoming = parseIncoming(message);
  const currentSession = sessions.get(to);
  if (isExpired(currentSession, now())) sessions.delete(to);
  const session = sessions.get(to);

  if (incoming.action) {
    sessions.set(to, {
      action: incoming.action,
      step: "awaiting_consent",
      expires_at: expiresAt(now(), deps.ttlMs),
    });
    await sendConsent(to, whatsapp);
    return { handled: true, action: incoming.action, step: "consent" };
  }

  if (!session) {
    await sendMenu(to, whatsapp);
    return { handled: true, step: "menu" };
  }

  if (session.step === "awaiting_consent") {
    if (isConsentAccept(incoming)) {
      await handleAcceptedConsent(to, session, deps);
      return { handled: true, action: session.action, step: "accepted" };
    }

    if (isConsentReject(incoming)) {
      sessions.delete(to);
      await whatsapp.sendText(to, buildRejectText(deps.phoneLine || DEFAULT_PHONE_LINE));
      return { handled: true, action: session.action, step: "rejected" };
    }

    await sendConsent(to, whatsapp);
    return { handled: true, action: session.action, step: "consent_retry" };
  }

  if (session.step === "awaiting_document") {
    await handleDocumentStep(to, session, incoming, deps);
    return { handled: true, action: session.action, step: "document" };
  }

  sessions.delete(to);
  await sendMenu(to, whatsapp);
  return { handled: true, step: "menu_reset" };
}

module.exports = {
  ACTIONS,
  CONSENT_TEXT,
  DEFAULT_PHONE_LINE,
  MENU_BUTTONS,
  CONSENT_BUTTONS,
  buildRejectText,
  formatAppointmentsMessage,
  handleIncomingMessage,
  parseDocumentInput,
  parseIncoming,
  _private: {
    normalizeAppointment,
    upcomingAppointments,
    isConsentAccept,
    isConsentReject,
    runtimeSessions,
  },
};
