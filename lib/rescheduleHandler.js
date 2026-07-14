const crypto = require("crypto");

const defaultHun = require("./hun");
const defaultDb = require("./db");
const defaultWhatsapp = require("./whatsapp");
const cancellationVerifier = require("./cancellationVerifier");

const SCREENS = Object.freeze({
  IDENTIFICATION: "IDENTIFICACION_REAGENDAMIENTO",
  APPOINTMENT: "CITA_ORIGINAL",
  SLOTS: "SLOTS_REAGENDAMIENTO",
  CONFIRM: "CONFIRMAR_REAGENDAMIENTO",
  FINAL: "FINAL_REAGENDAMIENTO",
});

const VALID_DOCUMENT_TYPES = new Set(["CC", "CE", "PT", "TI", "RC", "PA"]);
const MODIFIABLE_STATES = new Set(["asignada", "reservada", "confirmada", "programada"]);
const SESSION_TTL_MS = Number(process.env.FLOW_SESSION_TTL_MINUTES || 30) * 60000;
const MAX_APPOINTMENTS = Number(process.env.RESCHEDULE_MAX_APPOINTMENTS || 10);
const MAX_SLOTS = Number(process.env.FLOW_MAX_SLOTS || 20);
const VERIFY_MAX_ATTEMPTS = Number(process.env.CANCEL_VERIFY_MAX_ATTEMPTS || 6);
const VERIFY_INTERVAL_MS = Number(process.env.CANCEL_VERIFY_INTERVAL_MS || 2000);
const VERIFY_INITIAL_DELAY_MS = Number(
  process.env.CANCEL_VERIFY_INITIAL_DELAY_MS || 1500
);

let tokenKeyCache = null;

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function firstField(row, candidates) {
  if (!row || typeof row !== "object") return "";
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  const wanted = candidates.map((key) => normalizeText(key).replace(/[^a-z0-9]/g, ""));
  const match = Object.keys(row).find((key) =>
    wanted.includes(normalizeText(key).replace(/[^a-z0-9]/g, ""))
  );
  return match ? String(row[match] || "").trim() : "";
}

function decodeSecret(value) {
  if (!value) return null;
  const decoded = Buffer.from(String(value), "base64");
  return decoded.length >= 32 ? decoded : null;
}

function tokenKey() {
  if (tokenKeyCache) return tokenKeyCache;
  const configured =
    decodeSecret(process.env.FLOW_SLOT_TOKEN_SECRET_B64) ||
    decodeSecret(process.env.FLOW_SESSION_PII_KEY_B64);
  tokenKeyCache = configured
    ? crypto.createHash("sha256").update("hun-reschedule-token-v1").update(configured).digest()
    : crypto.randomBytes(32);
  return tokenKeyCache;
}

function opaqueIdentityToken(prefix, flowToken, identity, expiresAt) {
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const digest = crypto
    .createHmac("sha256", tokenKey())
    .update(`${prefix}:${flowToken}:${exp}:${identity}`)
    .digest("base64url");
  return `${prefix}_${exp.toString(36)}_${digest}`;
}

function sessionHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function recipientHash(phone) {
  const key = decodeSecret(process.env.FLOW_SESSION_PII_KEY_B64);
  if (!key || !phone) return sessionHash(`runtime:${phone}`).slice(0, 64);
  return crypto
    .createHmac("sha256", key)
    .update(`inbound-recipient:${String(phone)}`)
    .digest("hex");
}

function normalizeDocument(data = {}) {
  const type = normalizeCode(data.tipo_documento);
  const number = normalizeCode(data.numero_documento).replace(/[\s.-]/g, "");
  if (!VALID_DOCUMENT_TYPES.has(type)) {
    return { ok: false, message: "Selecciona un tipo de documento valido." };
  }
  if (!/^[A-Z0-9]{4,20}$/.test(number)) {
    return { ok: false, message: "Ingresa un numero de documento valido." };
  }
  return { ok: true, type, number };
}

function parseDate(value, time = "00:00:00") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  let iso = "";
  if (ymd) iso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  if (dmy) iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const date = iso ? new Date(`${iso}T${String(time || "00:00:00").slice(0, 8)}`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : String(value || "").trim();
}

function normalizeAppointment(row) {
  const dateRaw = firstField(row, ["Cita_Fecha", "Fecha_Cita", "fecha_cita", "Fecha", "fecha"]);
  const time = firstField(row, ["Hora_Cita", "hora_cita", "Hora", "hora"]);
  return {
    number: firstField(row, ["Numero_Cita", "numero_cita", "NumeroCita", "Cita", "cita"]),
    date: formatDate(dateRaw),
    time,
    dateTime: parseDate(dateRaw, time),
    specialtyCode: firstField(row, [
      "Cod_Especialidad",
      "cod_especialidad",
      "Codigo_Especialidad",
      "codigo_especialidad",
      "Cod_Esp",
      "cod_esp",
    ]),
    specialtyName: firstField(row, [
      "Especialidad",
      "especialidad",
      "Nombre_Especialidad",
      "nombre_especialidad",
      "Servicio",
    ]),
    procedureCode: firstField(row, [
      "Cod_Pro",
      "cod_pro",
      "Codigo_Procedimiento",
      "codigo_procedimiento",
      "CUPS",
      "cups",
    ]),
    procedureName: firstField(row, ["Procedimiento", "procedimiento", "Tipo_Procedimiento"]),
    epsCode: firstField(row, ["Cod_Eps", "cod_eps", "Codigo_Eps", "codigo_eps"]),
    patientName: firstField(row, ["Nombre_Paciente", "nombre_paciente"]),
    state: firstField(row, ["ESTADO", "Estado", "estado", "Estado_Cita"]),
  };
}

function isFutureModifiable(appointment, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const state = normalizeText(appointment.state).replace(/\s+/g, "_");
  return (
    appointment.number &&
    appointment.procedureCode &&
    MODIFIABLE_STATES.has(state) &&
    (!appointment.dateTime || appointment.dateTime >= start)
  );
}

function appointmentIdentity(appointment) {
  return [
    appointment.number,
    appointment.date,
    appointment.time,
    appointment.procedureCode,
  ].join("|");
}

function appointmentTitle(item) {
  const dateTime = [item.date, String(item.time || "").slice(0, 5)].filter(Boolean).join(" ");
  return `${dateTime} - ${item.specialtyName || "Cita HUN"}`.slice(0, 80);
}

function appointmentDescription(item) {
  return (item.procedureName || `Procedimiento ${item.procedureCode}`).slice(0, 300);
}

function normalizeYes(value) {
  return ["si", "s", "true", "1", "yes", "y"].includes(normalizeText(value));
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function slotIdentity(row, cup, specialtyCode) {
  const identity = {
    agendaDetailId: String(cup.agenda_detalle_id || "").trim(),
    doctorCode: String(row.codigo_medico || "").trim(),
    office: numberValue(row.numero_consultorio),
    specialtyCode: String(specialtyCode || "").trim(),
    date: String(row.fecha_atencion || "").trim(),
    time: String(row.hora_inicial || "").trim(),
    procedureCode: String(cup.codigo || "").trim(),
    duration: numberValue(row.tiempo_intervalo),
  };
  if (
    !identity.agendaDetailId ||
    !identity.doctorCode ||
    identity.office === null ||
    !identity.specialtyCode ||
    !identity.date ||
    !identity.time ||
    !identity.procedureCode ||
    identity.duration === null
  ) {
    return null;
  }
  const dateTime = parseDate(identity.date, identity.time);
  return dateTime && dateTime > new Date() ? identity : null;
}

function slotIdentityText(identity) {
  return [
    identity.agendaDetailId,
    identity.doctorCode,
    identity.office,
    identity.specialtyCode,
    identity.date,
    identity.time,
    identity.procedureCode,
    identity.duration,
  ].join("|");
}

function buildProcedureSlots(agenda, session, specialtyCode, procedureCode) {
  const slots = [];
  const candidates = {};
  for (const row of Array.isArray(agenda) ? agenda : []) {
    for (const cup of row.cups || []) {
      if (!normalizeYes(cup.autogestionable)) continue;
      if (normalizeCode(cup.codigo) !== normalizeCode(procedureCode)) continue;
      const identity = slotIdentity(row, cup, specialtyCode);
      if (!identity) continue;
      const token = opaqueIdentityToken(
        "reslot_v1",
        session.flowToken,
        slotIdentityText(identity),
        session.expiresAt
      );
      const doctor = String(row.nombre_medico || "Profesional HUN").trim();
      const description = String(cup.descripcion || "Consulta HUN").trim();
      slots.push({
        id: token,
        title: `${identity.date} ${identity.time.slice(0, 5)} - ${doctor}`.slice(0, 80),
        description: description.slice(0, 300),
        order: `${identity.date} ${identity.time} ${token}`,
      });
      candidates[token] = {
        ...identity,
        doctor,
        description,
        specialtyName: String(row.nombre_especialidad || session.originalAppointment.specialtyName || "").trim(),
      };
    }
  }
  slots.sort((a, b) => a.order.localeCompare(b.order));
  const limited = slots.slice(0, MAX_SLOTS);
  const allowed = new Set(limited.map((slot) => slot.id));
  return {
    slots: limited.map(({ id, title, description }) => ({ id, title, description })),
    candidates: Object.fromEntries(
      Object.entries(candidates).filter(([token]) => allowed.has(token))
    ),
  };
}

function buildAssignmentPayload(session, selectedSlot) {
  return {
    paciente: {
      tipo: session.patient.documentType,
      documento: session.patient.documentNumber,
    },
    medico: {
      codigo_medico: selectedSlot.doctorCode,
      especialidad: Number(selectedSlot.specialtyCode),
    },
    agenda_detalle_id: selectedSlot.agendaDetailId,
    consultorio: selectedSlot.office,
    fecha: selectedSlot.date,
    hora: selectedSlot.time,
    procedimiento: selectedSlot.procedureCode,
    tiempo_atencion: selectedSlot.duration,
    eps: session.patient.epsCode,
  };
}

function extractAppointmentNumber(response) {
  const text = response?.soap?.descripcion || response?.message || response?.descripcion || "";
  const match = String(text).match(/Cita\s+(\d+)/i);
  return match ? match[1] : null;
}

function finalResponse(version, message, detail) {
  return {
    version,
    screen: SCREENS.FINAL,
    data: { mensaje: message, detalle: detail },
  };
}

function wait(ms) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function resolveSpecialtyCode(hun, appointment) {
  const specialties = await hun.getEspecialidades();
  if (appointment.specialtyCode) {
    const direct = specialties.find(
      (item) => normalizeCode(item.id) === normalizeCode(appointment.specialtyCode)
    );
    if (direct) return String(direct.id);
  }
  const name = normalizeText(appointment.specialtyName);
  const matches = specialties.filter((item) => normalizeText(item.title) === name);
  return matches.length === 1 ? String(matches[0].id) : null;
}

function createRescheduleHandler(customDeps = {}) {
  const hun = customDeps.hun || defaultHun;
  const db = customDeps.db || defaultDb;
  const whatsapp = customDeps.whatsapp || defaultWhatsapp;
  const now = customDeps.now || (() => Date.now());
  const sessions = customDeps.sessions || new Map();
  const operations = customDeps.operations || new Map();

  async function record(session, event) {
    if (!db.guardarEventoOperativo) return;
    await db.guardarEventoOperativo({
      event_type: event.event_type,
      status: event.status,
      source: event.source || "backend",
      session_id_hash: session?.recipientSessionHash || sessionHash(session?.flowToken),
      especialidad_codigo: event.especialidad_codigo || session?.specialtyCode || null,
      endpoint_logico: event.endpoint_logico || null,
      error_code: event.error_code || null,
      error_category: event.error_category || null,
      http_status: event.http_status || null,
      retry_count: event.retry_count || 0,
      resultado_operativo: event.resultado_operativo || null,
      motivo_fallo_simple: event.motivo_fallo_simple || null,
    });
  }

  async function saveState(session, state, extra = {}) {
    if (extra.operationId && db.guardarOperacionReagendamiento) {
      if (
        [
          "reagendamiento_completado",
          "reagendamiento_revision_manual",
          "reagendamiento_fallido",
        ].includes(state) &&
        db.finalizarOperacionReagendamiento
      ) {
        await db.finalizarOperacionReagendamiento(extra.operationId, state, {
          last_error_code: extra.lastErrorCode || null,
          last_error_category: extra.lastErrorCategory || null,
        });
        return;
      }
      await db.guardarOperacionReagendamiento({
        reschedule_operation_id: extra.operationId,
        estado: state,
        especialidad_codigo: session.specialtyCode || null,
        expires_at: new Date(session.expiresAt).toISOString(),
      });
      return;
    }
    if (!db.guardarSesionTemporal) return;
    await db.guardarSesionTemporal({
      flow_token: session.flowToken,
      estado: state,
      especialidad_codigo: session.specialtyCode || null,
      slot_token: extra.slotToken || null,
      expires_at: session.expiresAt,
    });
  }

  function getSession(flowToken) {
    const session = sessions.get(flowToken);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(flowToken);
      return null;
    }
    return session;
  }

  function createFlowSession(whatsappNumber) {
    const flowToken = `reschedule_${crypto.randomBytes(24).toString("base64url")}`;
    sessions.set(flowToken, {
      flowToken,
      whatsappNumber: String(whatsappNumber || ""),
      recipientSessionHash: recipientHash(whatsappNumber),
      expiresAt: now() + SESSION_TTL_MS,
      status: "created",
    });
    return flowToken;
  }

  function appointmentCandidates(rows, session) {
    const start = new Date(now());
    const appointments = (Array.isArray(rows) ? rows : [])
      .map(normalizeAppointment)
      .filter((item) => isFutureModifiable(item, start))
      .sort((a, b) => (a.dateTime?.getTime() || Infinity) - (b.dateTime?.getTime() || Infinity))
      .slice(0, MAX_APPOINTMENTS);
    const candidates = {};
    const visible = appointments.map((appointment) => {
      const token = opaqueIdentityToken(
        "resappt_v1",
        session.flowToken,
        appointmentIdentity(appointment),
        session.expiresAt
      );
      candidates[token] = appointment;
      return {
        id: token,
        title: appointmentTitle(appointment),
        description: appointmentDescription(appointment),
      };
    });
    return { visible, candidates };
  }

  async function identify(flowToken, data, version) {
    const session = getSession(flowToken);
    if (!session) {
      return finalResponse(version, "La sesion expiro", "Inicia nuevamente la opcion Modificar/cancelar.");
    }
    const document = normalizeDocument(data);
    if (!document.ok) {
      return {
        version,
        screen: SCREENS.IDENTIFICATION,
        data: { error_message: document.message },
      };
    }
    let rows;
    try {
      rows = await hun.consultarCitasDocumento(document.type, document.number);
    } catch (error) {
      await record(session, {
        event_type: "reagendamiento_consulta_citas",
        status: "fallida",
        source: "hun_api",
        endpoint_logico: "consultar_citas_documento",
        error_code: error.code || null,
        error_category: error.category || "hun_api_error",
      });
      return finalResponse(version, "No pudimos consultar tus citas", "Intenta nuevamente mas tarde.");
    }
    const patientFromHistory = (Array.isArray(rows) ? rows : [])
      .map(normalizeAppointment)
      .find((item) => item.epsCode);
    const result = appointmentCandidates(rows, session);
    if (!result.visible.length) {
      return finalResponse(
        version,
        "No encontramos citas para modificar",
        "Puedes intentar de nuevo o comunicarte con la linea telefonica del hospital."
      );
    }
    Object.assign(session, {
      patient: {
        documentType: document.type,
        documentNumber: document.number,
        epsCode: patientFromHistory?.epsCode || null,
        name: patientFromHistory?.patientName || "Paciente",
      },
      appointmentCandidates: result.candidates,
      status: "selecting_appointment",
    });
    await saveState(session, "reagendamiento_seleccionando_cita");
    await record(session, {
      event_type: "reagendamiento_identificacion",
      status: "exitosa",
      endpoint_logico: "consultar_citas_documento",
      resultado_operativo: "citas_modificables_disponibles",
    });
    return { version, screen: SCREENS.APPOINTMENT, data: { citas: result.visible } };
  }

  async function selectAppointment(flowToken, data, version) {
    const session = getSession(flowToken);
    const selectedToken = String(data.cita_original || "");
    const selected = session?.appointmentCandidates?.[selectedToken];
    if (!session?.patient || !selected) {
      return finalResponse(version, "La seleccion ya no es valida", "Inicia nuevamente la modificacion.");
    }
    const freshRows = await hun.consultarCitasDocumento(
      session.patient.documentType,
      session.patient.documentNumber
    );
    const fresh = appointmentCandidates(freshRows, session).candidates[selectedToken];
    if (!fresh) {
      return finalResponse(version, "La cita cambio de estado", "Consulta nuevamente tus citas antes de modificar.");
    }
    const specialtyCode = await resolveSpecialtyCode(hun, fresh);
    if (!specialtyCode) {
      await record(session, {
        event_type: "reagendamiento_especialidad",
        status: "fallida",
        endpoint_logico: "get_especialidades",
        error_code: "specialty_ambiguous",
        error_category: "hun_mapping",
        motivo_fallo_simple: "especialidad_no_resuelta",
      });
      return finalResponse(
        version,
        "No pudimos identificar la especialidad",
        "La cita no puede modificarse automaticamente. Comunicate con la linea del hospital."
      );
    }
    Object.assign(session, {
      originalAppointmentToken: selectedToken,
      originalAppointment: fresh,
      specialtyCode,
      procedureCode: fresh.procedureCode,
      status: "selecting_slot",
    });
    const agenda = await hun.getAgendaPorEspecialidad(specialtyCode, new Date(now() + 60 * 86400000).toISOString().slice(0, 10));
    const result = buildProcedureSlots(agenda, session, specialtyCode, fresh.procedureCode);
    session.slotCandidates = result.candidates;
    if (!result.slots.length) {
      return finalResponse(
        version,
        "No hay horarios equivalentes",
        "HUN no tiene cupos autogestionables para el mismo procedimiento. Tu cita actual no fue modificada."
      );
    }
    await saveState(session, "reagendamiento_eligiendo_slot");
    await record(session, {
      event_type: "reagendamiento_cita_original",
      status: "exitosa",
      endpoint_logico: "get_agenda_por_especialidad",
      especialidad_codigo: specialtyCode,
      resultado_operativo: "slots_mismo_procedimiento_disponibles",
    });
    return {
      version,
      screen: SCREENS.SLOTS,
      data: {
        procedimiento: fresh.procedureName || `Procedimiento ${fresh.procedureCode}`,
        slots: result.slots,
      },
    };
  }

  async function selectSlot(flowToken, data, version) {
    const session = getSession(flowToken);
    const token = String(data.slot || "");
    if (!session?.originalAppointment || !session.slotCandidates?.[token]) {
      return finalResponse(version, "El horario ya no es valido", "Inicia nuevamente la modificacion.");
    }
    const agenda = await hun.getAgendaPorEspecialidad(
      session.specialtyCode,
      new Date(now() + 60 * 86400000).toISOString().slice(0, 10)
    );
    const result = buildProcedureSlots(agenda, session, session.specialtyCode, session.procedureCode);
    const selected = result.candidates[token];
    if (!selected) {
      session.slotCandidates = result.candidates;
      return {
        version,
        screen: SCREENS.SLOTS,
        data: {
          procedimiento:
            session.originalAppointment.procedureName || `Procedimiento ${session.procedureCode}`,
          slots: result.slots,
        },
      };
    }
    Object.assign(session, {
      selectedSlotToken: token,
      selectedSlot: selected,
      slotCandidates: result.candidates,
      status: "confirming",
    });
    await saveState(session, "reagendamiento_confirmando", { slotToken: token });
    return {
      version,
      screen: SCREENS.CONFIRM,
      data: {
        cita_actual: `Cita actual: ${session.originalAppointment.date} ${String(session.originalAppointment.time || "").slice(0, 5)}`,
        cita_nueva: `Nueva cita: ${selected.date} ${String(selected.time || "").slice(0, 5)}`,
      },
    };
  }

  async function verifyNewAppointment(number) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const rows = await hun.consultarCitaNumero(number);
        if (Array.isArray(rows) && rows.length) return rows[0];
      } catch (_) {
        // Reintentar: HUN puede tardar en reflejar la asignacion.
      }
      if (attempt < 3) await wait(1000);
    }
    return null;
  }

  async function verifyOriginalCancellation(originalNumber) {
    if (VERIFY_INITIAL_DELAY_MS) await wait(VERIFY_INITIAL_DELAY_MS);
    let lastError = null;
    for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await hun.verificarCancelacion(originalNumber);
        const result = cancellationVerifier._private.classifyVerification(response);
        if (result.status === "success") return { ok: true, attempts: attempt };
        if (result.status === "failure") {
          return { ok: false, attempts: attempt, code: result.code || "hun_rejected" };
        }
      } catch (error) {
        lastError = error;
      }
      if (attempt < VERIFY_MAX_ATTEMPTS) await wait(VERIFY_INTERVAL_MS);
    }
    return {
      ok: false,
      attempts: VERIFY_MAX_ATTEMPTS,
      code: lastError?.code || "verification_exhausted",
    };
  }

  async function finishOperation(session, operation, state, message, event = {}) {
    operation.state = state;
    await saveState(session, state, { operationId: operation.id });
    await record(session, {
      event_type: "reagendamiento_final",
      status: state,
      endpoint_logico: "reagendamiento_saga",
      resultado_operativo: `reschedule_operation_id:${operation.id}`,
      ...event,
    });
    try {
      const sent = await whatsapp.sendText(session.whatsappNumber, message);
      if (sent === false) throw new Error("whatsapp_send_failed");
    } catch (error) {
      await record(session, {
        event_type: "reagendamiento_notificacion",
        status: "fallida",
        source: "whatsapp",
        endpoint_logico: "whatsapp_send_text",
        error_code: error.code || "whatsapp_send_failed",
        error_category: "whatsapp_error",
        resultado_operativo: `reschedule_operation_id:${operation.id}`,
      });
    } finally {
      operation.originalNumber = null;
      operation.newNumber = null;
      operation.whatsappNumber = null;
      operation.selectedSlot = null;
      session.patient = null;
      session.originalAppointment = null;
      session.selectedSlot = null;
      session.appointmentCandidates = null;
      session.slotCandidates = null;
      session.status = state;
      const cleanupDelay = Math.max(0, session.expiresAt - now());
      const timer = setTimeout(() => operations.delete(operation.id), cleanupDelay);
      timer.unref?.();
    }
  }

  async function processOperation(session, operation) {
    try {
      await saveState(session, "reagendamiento_asignando", { operationId: operation.id });
      const assignment = await hun.asignarCita(buildAssignmentPayload(session, operation.selectedSlot));
      if (!assignment || assignment.success === false) {
        return finishOperation(
          session,
          operation,
          "reagendamiento_fallido",
          "No pudimos reservar el nuevo horario. Tu cita actual no fue modificada.",
          { motivo_fallo_simple: "asignacion_rechazada" }
        );
      }
      operation.newNumber = extractAppointmentNumber(assignment);
      if (!operation.newNumber || !(await verifyNewAppointment(operation.newNumber))) {
        return finishOperation(
          session,
          operation,
          "reagendamiento_revision_manual",
          "HUN recibio la nueva reserva, pero no pudimos confirmar su estado. No cancelamos tu cita actual. El hospital debe revisar el caso.",
          { motivo_fallo_simple: "nueva_cita_no_verificada" }
        );
      }
      await saveState(session, "reagendamiento_cancelando_original", { operationId: operation.id });
      await hun.cancelarCita(
        operation.originalNumber,
        session.patient.documentType,
        session.patient.documentNumber
      );
      const cancellation = await verifyOriginalCancellation(operation.originalNumber);
      if (!cancellation.ok) {
        return finishOperation(
          session,
          operation,
          "reagendamiento_revision_manual",
          "La nueva cita quedo confirmada, pero no pudimos confirmar la cancelacion de la cita anterior. Puedes tener ambas citas temporalmente; comunicate con el hospital para revisar el caso.",
          {
            retry_count: Math.max(0, cancellation.attempts - 1),
            error_code: cancellation.code,
            error_category: "cancelacion_original",
            motivo_fallo_simple: "posible_doble_reserva",
          }
        );
      }
      return finishOperation(
        session,
        operation,
        "reagendamiento_completado",
        `Tu cita fue modificada correctamente.\n\nNueva cita: ${operation.selectedSlot.date} ${operation.selectedSlot.time.slice(0, 5)}\nEspecialidad: ${operation.selectedSlot.specialtyName}\nProcedimiento: ${operation.selectedSlot.description}`,
        { retry_count: Math.max(0, cancellation.attempts - 1) }
      );
    } catch (error) {
      const newAppointmentWasCreated = Boolean(operation.newNumber);
      return finishOperation(
        session,
        operation,
        newAppointmentWasCreated
          ? "reagendamiento_revision_manual"
          : "reagendamiento_fallido",
        newAppointmentWasCreated
          ? "La nueva cita pudo quedar creada, pero no completamos la cancelacion anterior. Comunicate con el hospital para revisar ambas citas."
          : "No pudimos completar la modificacion. Tu cita actual no fue cancelada.",
        {
          http_status: error.status || null,
          error_code: error.code || "reschedule_unexpected_error",
          error_category: error.category || "backend_error",
          motivo_fallo_simple: newAppointmentWasCreated
            ? "posible_doble_reserva"
            : "reagendamiento_fallido",
        }
      );
    }
  }

  async function confirm(flowToken, version) {
    const session = getSession(flowToken);
    if (!session?.patient || !session?.selectedSlotToken || !session?.originalAppointmentToken) {
      return finalResponse(version, "La sesion expiro", "Inicia nuevamente la modificacion.");
    }
    const existing = session.operationId && operations.get(session.operationId);
    if (existing || session.status === "validating_confirmation") {
      return finalResponse(
        version,
        "La modificacion ya esta en proceso",
        "Te enviaremos el resultado final por WhatsApp."
      );
    }
    session.status = "validating_confirmation";
    const freshRows = await hun.consultarCitasDocumento(
      session.patient.documentType,
      session.patient.documentNumber
    );
    const original = appointmentCandidates(freshRows, session).candidates[
      session.originalAppointmentToken
    ];
    if (!original) {
      session.status = "confirming";
      return finalResponse(version, "La cita original cambio", "No se realizo ninguna modificacion.");
    }
    const agenda = await hun.getAgendaPorEspecialidad(
      session.specialtyCode,
      new Date(now() + 60 * 86400000).toISOString().slice(0, 10)
    );
    const currentSlots = buildProcedureSlots(
      agenda,
      session,
      session.specialtyCode,
      session.procedureCode
    );
    const selectedSlot = currentSlots.candidates[session.selectedSlotToken];
    if (!selectedSlot) {
      session.status = "confirming";
      return finalResponse(version, "El nuevo horario ya no esta disponible", "Tu cita actual no fue modificada.");
    }
    const operationId = sessionHash(
      `reschedule:${session.flowToken}:${session.originalAppointmentToken}:${session.selectedSlotToken}`
    );
    const operation = {
      id: operationId,
      state: "reagendamiento_asignando",
      originalNumber: original.number,
      newNumber: null,
      selectedSlot,
      whatsappNumber: session.whatsappNumber,
    };
    operations.set(operationId, operation);
    session.operationId = operationId;
    session.originalAppointment = original;
    session.selectedSlot = selectedSlot;
    session.status = "processing";
    await saveState(session, "reagendamiento_asignando", { operationId });
    await record(session, {
      event_type: "reagendamiento_solicitado",
      status: "reagendamiento_asignando",
      endpoint_logico: "asignar_cita",
      resultado_operativo: `reschedule_operation_id:${operationId}`,
    });
    operation.promise = processOperation(session, operation);
    return finalResponse(
      version,
      "Estamos procesando la modificacion",
      "Primero confirmaremos la nueva cita y despues cancelaremos la anterior. Te enviaremos el resultado final por WhatsApp."
    );
  }

  async function handleFlow(payload) {
    const { action, screen, data = {}, flow_token: flowToken, version = "3.0" } = payload;
    if (action === "ping") return { data: { status: "active" } };
    if (action !== "data_exchange") {
      return { version, screen: SCREENS.IDENTIFICATION, data: {} };
    }
    try {
      if (screen === SCREENS.IDENTIFICATION) return identify(flowToken, data, version);
      if (screen === SCREENS.APPOINTMENT) return selectAppointment(flowToken, data, version);
      if (screen === SCREENS.SLOTS) return selectSlot(flowToken, data, version);
      if (screen === SCREENS.CONFIRM) return confirm(flowToken, version);
      return finalResponse(version, "Pantalla no reconocida", "Inicia nuevamente la modificacion.");
    } catch (error) {
      const session = getSession(flowToken);
      await record(session, {
        event_type: "reagendamiento_error",
        status: "fallida",
        source: error.name === "HunApiError" ? "hun_api" : "backend",
        endpoint_logico: `flow_${screen || "unknown"}`,
        http_status: error.status || null,
        error_code: error.code || "reschedule_flow_error",
        error_category: error.category || "backend_error",
      });
      return finalResponse(version, "No pudimos continuar", "Tu cita actual no fue modificada. Intenta nuevamente mas tarde.");
    }
  }

  return {
    createFlowSession,
    handleFlow,
    hasOperation: (operationId) => Boolean(operations.get(operationId)),
    isRescheduleScreen: (screen) => Object.values(SCREENS).includes(screen),
    _private: {
      appointmentCandidates,
      buildProcedureSlots,
      buildAssignmentPayload,
      extractAppointmentNumber,
      getSession,
      normalizeAppointment,
      operations,
      processOperation,
      resolveSpecialtyCode,
      sessions,
    },
  };
}

const handler = createRescheduleHandler();

module.exports = {
  SCREENS,
  createRescheduleHandler,
  createFlowSession: handler.createFlowSession,
  handleFlow: handler.handleFlow,
  hasOperation: handler.hasOperation,
  isRescheduleScreen: handler.isRescheduleScreen,
  _private: handler._private,
};
