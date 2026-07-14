const crypto = require("crypto");
const db = require("./db");

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
const CANCELABLE_STATES = new Set([
  "asignada",
  "reservada",
  "confirmada",
  "programada",
]);
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

function isCancelSelection(interactiveId) {
  return /^CANCEL_SELECT_\d+$/.test(String(interactiveId || ""));
}

function cancelSelectionIndex(interactiveId) {
  const match = String(interactiveId || "").match(/^CANCEL_SELECT_(\d+)$/);
  return match ? Number(match[1]) : -1;
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

function normalizeState(value) {
  return normalizedText(value).replace(/\s+/g, "_");
}

function isCancelableAppointment(item) {
  return CANCELABLE_STATES.has(normalizeState(item.estado));
}

function createOpaqueToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function createCorrelationId(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.filter(Boolean).join(":"))
    .digest("hex");
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

  const normalizedKeys = keys.map((key) =>
    String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  );
  const matchingKey = Object.keys(row || {}).find((key) =>
    normalizedKeys.includes(String(key).toLowerCase().replace(/[^a-z0-9]/g, ""))
  );
  if (matchingKey) {
    const value = row[matchingKey];
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
  if (!isoDate) {
    const parsedDate = new Date(cleanFecha);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const date = new Date(`${isoDate}T${cleanHora.slice(0, 8) || "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAppointmentDate(fecha) {
  const cleanFecha = String(fecha || "").trim();
  const ymd = cleanFecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = cleanFecha.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const parsedDate = new Date(cleanFecha);
  if (Number.isNaN(parsedDate.getTime())) return cleanFecha;
  return parsedDate.toISOString().slice(0, 10);
}

function normalizeAppointment(row) {
  const fecha = firstValue(row, [
    "Cita_Fecha",
    "cita_fecha",
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
    numeroCita: firstValue(row, [
      "Numero_Cita",
      "numero_cita",
      "NumeroCita",
      "Cita",
      "cita",
      "Id_Cita",
      "id_cita",
    ]),
    fecha: formatAppointmentDate(fecha),
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
    procedimiento: firstValue(row, [
      "Procedimiento",
      "procedimiento",
      "Tipo_Procedimiento",
      "tipo_procedimiento",
      "Cod_Pro",
      "cod_pro",
    ]),
    estado: firstValue(row, ["Estado", "estado", "ESTADO", "Estado_Cita", "estado_cita"]),
    date: parseAppointmentDate(fecha, hora),
    raw: row,
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
  if (item.procedimiento) parts.push(item.procedimiento);
  if (item.medico) parts.push(`Profesional: ${item.medico}`);
  if (item.estado) parts.push(`Estado: ${item.estado}`);
  return `${index + 1}. ${parts.join(" - ")}`;
}

function formatCancelableAppointmentsMessage(citas) {
  if (!citas.length) {
    return "No encontramos citas disponibles para cancelar por WhatsApp con la informacion consultada. Si necesitas ayuda, comunicate con la linea telefonica del hospital.";
  }

  return [
    "Estas son las citas que puedes cancelar por WhatsApp:",
    ...citas.map(formatAppointment),
    "Selecciona una opcion para continuar. No se cancelara nada hasta que confirmes.",
  ].join("\n");
}

function buildCancelButtons(citas) {
  return citas.slice(0, 3).map((_, index) => ({
    id: `CANCEL_SELECT_${index}`,
    title: `Cancelar cita ${index + 1}`,
  }));
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

async function sendCancelableAppointments(to, whatsapp, citas) {
  await whatsapp.sendText(to, formatCancelableAppointmentsMessage(citas));

  if (!citas.length) return;

  await whatsapp.sendInteractiveButtons({
    to,
    body: "Elige la cita que quieres cancelar.",
    footer: "Confirmacion requerida",
    buttons: buildCancelButtons(citas),
  });
}

async function sendCancelConfirmation(to, whatsapp, cita) {
  await whatsapp.sendInteractiveButtons({
    to,
    body: [
      "Confirma si deseas cancelar esta cita:",
      formatAppointment(cita, 0).replace(/^1\. /, ""),
      "Esta accion se enviara al sistema HUN solo si confirmas.",
    ].join("\n"),
    footer: "Hospital Universitario Nacional",
    buttons: [
      { id: "CANCEL_CONFIRM_YES", title: "Si, cancelar" },
      { id: "CANCEL_CONFIRM_NO", title: "No cancelar" },
    ],
  });
}

async function recordCancelEvent(evento, deps) {
  const store = deps.db || db;
  if (!store?.guardarEventoOperativo) return;

  await store.guardarEventoOperativo({
    event_type: evento.event_type,
    status: evento.status,
    source: "backend",
    session_id_hash: evento.session_id_hash || null,
    endpoint_logico: evento.endpoint_logico || null,
    error_code: evento.error_code || null,
    error_category: evento.error_category || null,
    resultado_operativo: evento.resultado_operativo || null,
    motivo_fallo_simple: evento.motivo_fallo_simple || null,
  });
}

async function recordCancelOperation(operacion, deps) {
  const store = deps.db || db;
  if (!store?.guardarOperacionCancelacion) return;
  await store.guardarOperacionCancelacion(operacion);
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
    session_id_hash: session.session_id_hash,
    expires_at: expiresAt(now(), ttlMs),
  });
  await promptDocument(to, whatsapp, session.action);
}

async function handleDocumentStep(to, session, incoming, deps) {
  const { whatsapp, hun, now = () => Date.now(), nowDate = () => new Date() } = deps;
  const parsed = parseDocumentInput(incoming.text);

  if (!parsed) {
    await promptDocument(to, whatsapp, session.action);
    return;
  }

  try {
    const citas = await hun.consultarCitasDocumento(parsed.tipo, parsed.documento);

    if (session.action === ACTIONS.MODIFY_CANCEL) {
      const cancelables = upcomingAppointments(citas, nowDate())
        .filter((item) => item.numeroCita)
        .filter(isCancelableAppointment)
        .slice(0, 3)
        .map((item) => ({
          ...item,
          cancel_token: createOpaqueToken(),
        }));

      if (!cancelables.length) {
        await whatsapp.sendText(to, formatCancelableAppointmentsMessage([]));
        deps.sessions.delete(to);
        return;
      }

      deps.sessions.set(to, {
        action: session.action,
        step: "awaiting_cancel_selection",
        session_id_hash: session.session_id_hash || createOpaqueToken(16),
        cancel_patient: parsed,
        cancel_options: cancelables,
        expires_at: expiresAt(now(), deps.ttlMs),
      });
      await sendCancelableAppointments(to, whatsapp, cancelables);
      return;
    }

    await whatsapp.sendText(to, formatAppointmentsMessage(citas, nowDate()));
  } catch (error) {
    await whatsapp.sendText(
      to,
      "No pudimos consultar tus citas en HUN en este momento. Intenta nuevamente mas tarde o comunicate con la linea telefonica del hospital."
    );
  } finally {
    if (session.action !== ACTIONS.MODIFY_CANCEL) {
      deps.sessions.delete(to);
    }
  }
}

async function handleCancelSelectionStep(to, session, incoming, deps) {
  const { whatsapp, now = () => Date.now() } = deps;
  const index = cancelSelectionIndex(incoming.interactiveId);
  const cita = Array.isArray(session.cancel_options)
    ? session.cancel_options[index]
    : null;

  if (!cita?.cancel_token || !cita?.numeroCita) {
    await sendCancelableAppointments(to, whatsapp, session.cancel_options || []);
    return;
  }

  deps.sessions.set(to, {
    ...session,
    step: "awaiting_cancel_confirmation",
    selected_cancel_token: cita.cancel_token,
    expires_at: expiresAt(now(), deps.ttlMs),
  });
  await sendCancelConfirmation(to, whatsapp, cita);
}

async function handleCancelConfirmationStep(to, session, incoming, deps) {
  const { whatsapp, hun, now = () => Date.now() } = deps;
  const selected = (session.cancel_options || []).find(
    (item) => item.cancel_token === session.selected_cancel_token
  );

  if (incoming.interactiveId === "CANCEL_CONFIRM_NO") {
    deps.sessions.delete(to);
    await whatsapp.sendText(to, "No se cancelo ninguna cita.");
    return;
  }

  if (incoming.interactiveId !== "CANCEL_CONFIRM_YES") {
    await sendCancelConfirmation(to, whatsapp, selected || {});
    return;
  }

  if (!selected?.numeroCita || !isCancelableAppointment(selected)) {
    deps.sessions.delete(to);
    await whatsapp.sendText(
      to,
      "No pudimos validar la cita seleccionada para cancelacion. Inicia el proceso nuevamente."
    );
    return;
  }

  const operationId = createCorrelationId(
    session.session_id_hash,
    selected.cancel_token,
    String(now())
  );
  const operationExpiresAt = new Date(expiresAt(now(), deps.ttlMs)).toISOString();

  try {
    await hun.cancelarCita(
      selected.numeroCita,
      session.cancel_patient?.tipo,
      session.cancel_patient?.documento
    );
    await recordCancelOperation(
      {
        cancel_operation_id: operationId,
        estado: "cancelacion_procesando",
        expires_at: operationExpiresAt,
      },
      deps
    );
    await recordCancelEvent(
      {
        event_type: "cancelacion_solicitada",
        status: "cancelacion_procesando",
        session_id_hash: session.session_id_hash,
        endpoint_logico: "hun.cancelar_cita",
        resultado_operativo: `cancel_operation_id:${operationId}`,
      },
      deps
    );
    deps.sessions.delete(to);
    await whatsapp.sendText(
      to,
      "Recibimos tu solicitud de cancelacion y quedo en proceso. Te avisaremos el resultado cuando HUN confirme la cancelacion."
    );
  } catch (error) {
    console.error("Cancelacion HUN fallida:", {
      status: error.status || null,
      code: error.code || null,
      category: error.category || "hun_api_error",
      endpoint: error.endpoint || "cancelar_cita",
    });
    await recordCancelEvent(
      {
        event_type: "cancelacion_error",
        status: "fallido",
        session_id_hash: session.session_id_hash,
        endpoint_logico: "hun.cancelar_cita",
        error_code: error.code || null,
        error_category: error.category || "hun_api_error",
        motivo_fallo_simple: "cancelacion_post_fallida",
      },
      deps
    );
    deps.sessions.delete(to);
    await whatsapp.sendText(
      to,
      "No pudimos solicitar la cancelacion en HUN en este momento. Intenta nuevamente mas tarde o comunicate con la linea telefonica del hospital."
    );
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
      session_id_hash: createOpaqueToken(16),
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

  if (session.step === "awaiting_cancel_selection") {
    if (!isCancelSelection(incoming.interactiveId)) {
      await sendCancelableAppointments(to, whatsapp, session.cancel_options || []);
      return { handled: true, action: session.action, step: "cancel_selection_retry" };
    }

    await handleCancelSelectionStep(to, session, incoming, deps);
    return { handled: true, action: session.action, step: "cancel_selection" };
  }

  if (session.step === "awaiting_cancel_confirmation") {
    await handleCancelConfirmationStep(to, session, incoming, deps);
    return { handled: true, action: session.action, step: "cancel_confirmation" };
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
  formatCancelableAppointmentsMessage,
  handleIncomingMessage,
  parseDocumentInput,
  parseIncoming,
  _private: {
    normalizeAppointment,
    upcomingAppointments,
    isCancelableAppointment,
    isConsentAccept,
    isConsentReject,
    runtimeSessions,
  },
};
