const crypto = require("crypto");

const hun = require("./hun");
const db = require("./db");
const { enviarConfirmacion } = require("./email");
const wa = require("./whatsapp");

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const SESSION_TTL_MS = Number(process.env.FLOW_SESSION_TTL_MINUTES || 30) * 60000;
const MAX_ESPECIALIDADES_FLOW = Number(process.env.FLOW_MAX_ESPECIALIDADES || 200);
const MAX_SLOTS_FLOW = Number(process.env.FLOW_MAX_SLOTS || 20);
const TIPOS_DOCUMENTO_VALIDOS = new Set(["CC", "CE", "PT", "TI", "RC", "PA"]);
const E2E_ALLOW_NON_AUTOGESTIONABLE =
  String(process.env.FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE || "")
    .trim()
    .toLowerCase() === "true";
const E2E_CANCEL_AFTER_ASSIGN =
  String(process.env.FLOW_E2E_CANCEL_AFTER_ASSIGN || "")
    .trim()
    .toLowerCase() === "true";
const runtimeSessions = new Map();
let slotTokenKeyCache = null;
let warnedRuntimeSlotSecret = false;

const FLOW_ERROR_MESSAGES = {
  validation:
    "Revisa los datos ingresados y corrige el campo marcado para continuar.",
  no_slots:
    "No hay cupos disponibles para esta especialidad. Elige otra especialidad o intenta mas tarde.",
  eps_missing:
    "No pudimos identificar tu EPS/contrato en HUN. Verifica tus datos o comunicate con la linea de citas.",
  hun_lookup:
    "No pudimos consultar la informacion en HUN en este momento. Intenta nuevamente mas tarde.",
  hun_availability:
    "No pudimos validar la disponibilidad en HUN. Vuelve a elegir la especialidad o intenta mas tarde.",
  session_missing:
    "La sesion expiro o fue reiniciada. Ingresa tus datos nuevamente para continuar.",
  slot_invalid:
    "Seleccion invalida. Vuelve a elegir un horario disponible.",
  slot_unavailable:
    "El cupo ya no esta disponible. Selecciona otro horario o elige otra especialidad.",
  assignment_missing:
    "No se pudo agendar porque faltan datos de la sesion. Inicia el proceso de nuevo.",
  assignment_eps_missing:
    "No pudimos determinar tu EPS/contrato. Verifica que tengas historial en el HUN o comunicate con la linea de citas.",
  assignment_rejected:
    "No se pudo agendar tu cita con la informacion disponible. Inicia el proceso de nuevo o comunicate con la linea de citas.",
  assignment_failed:
    "Hubo un problema al agendar tu cita. Intenta de nuevo o comunicate con la linea de citas.",
};

// Pacientes de prueba del HUN (documento -> codigo de EPS/contrato),
// usados como respaldo cuando no se puede derivar la EPS del historial.
const EPS_PRUEBA = {
  "41531776": "HUN22",
  "3488239": "HUN22",
  "1000727088": "HUN269",
  "21086458": "HUN269",
  "30008752": "HUN003",
  "17124550": "HUN47",
  "41530175": "HUN22",
  "1030695377": "HUN22",
  "19415479": "HUN46",
  "17098112": "HUN20",
  "51688224": "HUN003",
  "79003244": "HUN22",
};

// "2026-06-29" -> "29 jun".
function fechaCorta(yyyymmdd) {
  if (!yyyymmdd) return "";
  const [a, m, d] = yyyymmdd.split("-");
  const mes = MESES[Number(m) - 1] || m;
  return `${d} ${mes}`;
}

// "07:00:00" -> "07:00".
const horaCorta = (h) => (h ? String(h).slice(0, 5) : "");

function fechaFinalConsulta(dias = 60) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

function sessionRef(flowToken) {
  return crypto.createHash("sha256").update(String(flowToken)).digest("hex").slice(0, 12);
}

function decodeBase64Secret(value) {
  if (!value) return null;
  const decoded = Buffer.from(String(value), "base64");
  return decoded.length >= 32 ? decoded : null;
}

function getSlotTokenKey() {
  if (slotTokenKeyCache) return slotTokenKeyCache;

  const configuredSecret =
    decodeBase64Secret(process.env.FLOW_SLOT_TOKEN_SECRET_B64) ||
    decodeBase64Secret(process.env.FLOW_SESSION_PII_KEY_B64);

  if (configuredSecret) {
    slotTokenKeyCache = crypto
      .createHash("sha256")
      .update("hun-flow-slot-token-v1")
      .update(configuredSecret)
      .digest();
    return slotTokenKeyCache;
  }

  slotTokenKeyCache = crypto.randomBytes(32);
  if (!warnedRuntimeSlotSecret) {
    console.warn(
      "FLOW_SLOT_TOKEN_SECRET_B64/FLOW_SESSION_PII_KEY_B64 no configuradas: los slot_token se firmaran con secreto runtime local."
    );
    warnedRuntimeSlotSecret = true;
  }
  return slotTokenKeyCache;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalJson(item));
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalJson(value[key]);
      return acc;
    }, {});
}

function signSlotIdentity(identity, flowToken, expiresAt) {
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const payload = JSON.stringify(canonicalJson({
    exp,
    flow_token_ref: sessionRef(flowToken),
    identity,
  }));
  const signature = crypto
    .createHmac("sha256", getSlotTokenKey())
    .update(payload)
    .digest("base64url");

  return `slot_v1_${exp.toString(36)}_${signature}`;
}

function getRuntimeSession(flowToken) {
  const session = runtimeSessions.get(flowToken);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    runtimeSessions.delete(flowToken);
    db.finalizarSesionTemporal(flowToken, "fallido", {
      last_error_code: "session_expired",
      last_error_category: "runtime_session",
    }).catch((error) =>
      console.error("No se pudo expirar sesion temporal:", error.message)
    );
    return null;
  }

  return session;
}

function saveRuntimeSession(flowToken, patch) {
  const previous = getRuntimeSession(flowToken) || {};
  const session = {
    ...previous,
    ...patch,
    expires_at: patch.expires_at || previous.expires_at || sessionExpiresAt(),
  };
  runtimeSessions.set(flowToken, session);
  return session;
}

function clearRuntimeSession(flowToken) {
  runtimeSessions.delete(flowToken);
}

function missingRuntimeResponse(version) {
  return {
    version,
    screen: "IDENTIFICACION",
    data: {
      error_message: FLOW_ERROR_MESSAGES.session_missing,
    },
  };
}

function flowErrorResponse(version, message) {
  return {
    version,
    screen: "IDENTIFICACION",
    data: { error_message: message },
  };
}

function normalizeTipoDocumento(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeNumeroDocumento(value) {
  return String(value || "").trim().replace(/[\s.-]/g, "").toUpperCase();
}

function validarIdentificacion(data) {
  const tipo = normalizeTipoDocumento(data.tipo_documento);
  const documento = normalizeNumeroDocumento(data.numero_documento);

  if (!TIPOS_DOCUMENTO_VALIDOS.has(tipo)) {
    return {
      ok: false,
      tipo,
      documento,
      message: "Selecciona un tipo de documento valido.",
      reason: "tipo_documento_invalido",
    };
  }

  if (!/^[A-Z0-9]{4,20}$/.test(documento)) {
    return {
      ok: false,
      tipo,
      documento,
      message: "Ingresa un numero de documento valido.",
      reason: "numero_documento_invalido",
    };
  }

  return { ok: true, tipo, documento };
}

function extraerPacienteDesdeHistorial(citas) {
  const paciente = {
    nombre: "Paciente",
    eps: null,
    fuente: "sin_historial",
  };

  if (!Array.isArray(citas) || citas.length === 0) return paciente;

  for (let i = citas.length - 1; i >= 0; i -= 1) {
    const nombre = hun.limpiar(citas[i].Nombre_Paciente);
    if (nombre) {
      paciente.nombre = nombre;
      break;
    }
  }

  for (let i = citas.length - 1; i >= 0; i -= 1) {
    const eps = hun.limpiar(citas[i].Cod_Eps);
    if (eps) {
      paciente.eps = eps;
      paciente.fuente = "historial_hun";
      break;
    }
  }

  return paciente;
}

function aplicarFallbackPacientePrueba(paciente, documento) {
  if (paciente.eps || !EPS_PRUEBA[documento]) return paciente;

  return {
    ...paciente,
    eps: EPS_PRUEBA[documento],
    fuente: "fallback_prueba_hun",
  };
}

function especialidadesParaFlow(especialidades) {
  const seen = new Set();
  return (Array.isArray(especialidades) ? especialidades : [])
    .map((especialidad) => ({
      id: String(especialidad.id || "").trim(),
      title: String(especialidad.title || "").trim(),
    }))
    .filter((especialidad) => {
      if (!especialidad.id || !especialidad.title || seen.has(especialidad.id)) {
        return false;
      }
      seen.add(especialidad.id);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, MAX_ESPECIALIDADES_FLOW);
}

function normalizarBooleanoSi(value) {
  if (value === true) return true;
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["si", "s", "true", "1", "yes", "y"].includes(normalized);
}

function documentosE2ePermitidos() {
  return new Set(
    String(process.env.FLOW_E2E_TEST_DOCUMENTS || "")
      .split(",")
      .map((value) => normalizeNumeroDocumento(value))
      .filter(Boolean)
  );
}

function permiteWaiverNoAutogestionable(session) {
  if (!E2E_ALLOW_NON_AUTOGESTIONABLE) return false;

  const documento = normalizeNumeroDocumento(session?.paciente?.numero_documento);
  if (!documento) return false;

  return documentosE2ePermitidos().has(documento);
}

function numeroSeguro(value) {
  const cleaned = hun.limpiar(value);
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function slotIdentityFromAgenda(row, cup, codEsp) {
  const fecha = hun.limpiar(row.fecha_atencion);
  const hora = hun.limpiar(row.hora_inicial);
  const agendaDetalleId = hun.limpiar(cup.agenda_detalle_id);
  const codigoMedico = hun.limpiar(row.codigo_medico);
  const consultorio = numeroSeguro(row.numero_consultorio);
  const procedimiento = hun.limpiar(cup.codigo);
  const tiempoAtencion = numeroSeguro(row.tiempo_intervalo);

  if (
    !agendaDetalleId ||
    !codigoMedico ||
    consultorio === null ||
    !fecha ||
    !hora ||
    !procedimiento ||
    tiempoAtencion === null
  ) {
    return null;
  }

  return {
    agenda_detalle_id: String(agendaDetalleId),
    codigo_medico: String(codigoMedico),
    consultorio,
    especialidad: String(codEsp),
    fecha,
    hora,
    procedimiento: String(procedimiento),
    tiempo_atencion: tiempoAtencion,
  };
}

function slotVisibleTitle(fecha, hora, medico) {
  const medicoVisible = medico || "Medico HUN";
  return `${fechaCorta(fecha)} ${horaCorta(hora)} - ${medicoVisible}`;
}

function buildSlotsFromAgenda({
  agenda,
  codEsp,
  flowToken,
  expiresAt,
  permitirNoAutogestionable = false,
}) {
  const filas = [];
  const candidatos = {};

  for (const row of agenda) {
    for (const cup of row.cups || []) {
      const esAutogestionable = normalizarBooleanoSi(cup.autogestionable);
      if (!esAutogestionable && !permitirNoAutogestionable) continue;

      const identity = slotIdentityFromAgenda(row, cup, codEsp);
      if (!identity) continue;

      const id = signSlotIdentity(identity, flowToken, expiresAt);
      const medico = hun.limpiar(row.nombre_medico);
      const descripcion = hun.limpiar(cup.descripcion);
      const especialidadNombre = hun.limpiar(row.nombre_especialidad);

      filas.push({
        id,
        orden: `${identity.fecha} ${identity.hora} ${id}`,
        title: slotVisibleTitle(identity.fecha, identity.hora, medico),
        description: descripcion || "Consulta HUN",
      });

      candidatos[id] = {
        agenda_detalle_id: identity.agenda_detalle_id,
        codigo_medico: identity.codigo_medico,
        especialidad: Number(codEsp),
        consultorio: identity.consultorio,
        fecha: identity.fecha,
        hora: identity.hora,
        procedimiento: identity.procedimiento,
        tiempo_atencion: identity.tiempo_atencion,
        medico,
        descripcion,
        especialidad_nombre: especialidadNombre,
        waiver_no_autogestionable: !esAutogestionable && permitirNoAutogestionable,
      };
    }
  }

  filas.sort((a, b) => a.orden.localeCompare(b.orden));
  const limitedRows = filas.slice(0, MAX_SLOTS_FLOW);
  const limitedTokens = new Set(limitedRows.map((row) => row.id));

  return {
    slots: limitedRows.map(({ id, title, description }) => ({
      id,
      title,
      description,
    })),
    candidatos: Object.fromEntries(
      Object.entries(candidatos).filter(([id]) => limitedTokens.has(id))
    ),
  };
}

async function buildSlotsVigentes(flowToken, session) {
  const agenda = await hun.getAgendaPorEspecialidad(
    session.especialidad_codigo,
    fechaFinalConsulta()
  );
  return buildSlotsFromAgenda({
    agenda,
    codEsp: session.especialidad_codigo,
    flowToken,
    expiresAt: session.expires_at,
    permitirNoAutogestionable: permiteWaiverNoAutogestionable(session),
  });
}

async function recuperarEspecialidadesParaRetry() {
  try {
    return especialidadesParaFlow(await hun.getEspecialidades());
  } catch (error) {
    return [];
  }
}

async function slotNoDisponibleResponse(flowToken, session, version, slots = null) {
  const slotsVigentes = slots || (await buildSlotsVigentes(flowToken, session)).slots;
  await guardarEventoFlow(flowToken, {
    event_type: "flow_slot",
    status: "fallida",
    endpoint_logico: "validar_slot_vigente",
    especialidad_codigo: session?.especialidad_codigo || null,
    error_code: "slot_no_disponible",
    error_category: "hun_availability",
    resultado_operativo: "cupo_no_disponible",
    motivo_fallo_simple: "slot_no_disponible",
  });

  if (slotsVigentes.length) {
    return {
      version,
      screen: "SLOTS",
      data: {
        slots: slotsVigentes,
        error_message: FLOW_ERROR_MESSAGES.slot_unavailable,
      },
    };
  }

  return {
    version,
    screen: "ESPECIALIDAD",
    data: {
      especialidades: await recuperarEspecialidadesParaRetry(),
      error_message: FLOW_ERROR_MESSAGES.slot_unavailable,
    },
  };
}

async function hunAvailabilityErrorResponse(flowToken, version, error, endpointLogico) {
  await guardarEventoFlow(flowToken, {
    event_type: "flow_disponibilidad",
    status: "fallida",
    source: sourceFromError(error),
    endpoint_logico: endpointLogico,
    ...errorEvento(error, "hun_api_error"),
    resultado_operativo: "error_disponibilidad",
    motivo_fallo_simple: "hun_api_error",
  });

  return {
    version,
    screen: "ESPECIALIDAD",
    data: {
      especialidades: await recuperarEspecialidadesParaRetry(),
      error_message: FLOW_ERROR_MESSAGES.hun_availability,
    },
  };
}

function buildResumenCita(paciente, elegido) {
  return (
    `Paciente: ${paciente.nombre_paciente || ""}\n` +
    `Especialidad: ${elegido.especialidad_nombre}\n` +
    `Medico: ${elegido.medico}\n` +
    `Tipo de consulta: ${elegido.descripcion || ""}\n` +
    `Fecha: ${elegido.fecha} ${horaCorta(elegido.hora)}\n` +
    `Consultorio: ${elegido.consultorio}`
  );
}

function buildAsignacionPayload(paciente, elegido) {
  return {
    paciente: {
      tipo: paciente.tipo_documento,
      documento: paciente.numero_documento,
    },
    medico: {
      codigo_medico: elegido.codigo_medico,
      especialidad: elegido.especialidad,
    },
    agenda_detalle_id: elegido.agenda_detalle_id,
    consultorio: elegido.consultorio,
    fecha: elegido.fecha,
    hora: elegido.hora,
    procedimiento: elegido.procedimiento,
    tiempo_atencion: elegido.tiempo_atencion,
    eps: paciente.eps_codigo,
  };
}

function extraerNumeroCita(resp) {
  const texto = resp?.soap?.descripcion || resp?.message || "";
  const m = String(texto).match(/Cita\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function cancelarCitaE2eSiAplica(flowToken, numeroCita, session, started) {
  if (!E2E_CANCEL_AFTER_ASSIGN || !permiteWaiverNoAutogestionable(session)) {
    return false;
  }

  if (!numeroCita) {
    await guardarEventoFlow(flowToken, {
      event_type: "cancelacion_e2e",
      status: "fallida",
      source: "backend",
      endpoint_logico: "cancelar_cita_e2e",
      especialidad_codigo: session.especialidad_codigo,
      error_code: "numero_cita_no_extraido",
      error_category: "e2e_test",
      duration_ms: Date.now() - started,
      resultado_operativo: "cancelacion_e2e_no_ejecutada",
      motivo_fallo_simple: "numero_cita_no_extraido",
    });
    return false;
  }

  try {
    await hun.cancelarCita(numeroCita);
    await guardarEventoFlow(flowToken, {
      event_type: "cancelacion_e2e",
      status: "exitosa",
      source: "hun_api",
      endpoint_logico: "cancelar_cita",
      especialidad_codigo: session.especialidad_codigo,
      duration_ms: Date.now() - started,
      resultado_operativo: "cita_prueba_cancelada",
    });
    await sendTextConEvento(
      flowToken,
      "La cita creada para esta prueba controlada fue cancelada automaticamente.",
      {
        especialidad_codigo: session.especialidad_codigo,
        resultado_operativo: "cancelacion_e2e_notificada",
      }
    );
    return true;
  } catch (error) {
    await guardarEventoFlow(flowToken, {
      event_type: "cancelacion_e2e",
      status: "fallida",
      source: sourceFromError(error),
      endpoint_logico: "cancelar_cita",
      especialidad_codigo: session.especialidad_codigo,
      duration_ms: Date.now() - started,
      ...errorEvento(error, "hun_api_error"),
      resultado_operativo: "cancelacion_e2e_fallida",
      motivo_fallo_simple: "hun_api_error",
    });
    await sendTextConEvento(
      flowToken,
      "La cita de prueba fue creada, pero no pudimos cancelarla automaticamente. Debe cancelarse manualmente en HUN.",
      {
        especialidad_codigo: session.especialidad_codigo,
        resultado_operativo: "cancelacion_e2e_fallida",
        motivo_fallo_simple: "hun_api_error",
      }
    );
    return false;
  }
}

function errorEvento(error, fallbackCategory = "backend_error") {
  return {
    http_status: error.status || error.response?.status || null,
    error_code: error.code || (error.status ? String(error.status) : null),
    error_category: error.category || fallbackCategory,
  };
}

function sourceFromError(error) {
  if (error.name === "HunApiError") return "hun_api";
  return "backend";
}

async function guardarEventoFlow(flowToken, evento) {
  if (!flowToken) return;

  await db.guardarEventoOperativo({
    session_id_hash: sessionRef(flowToken),
    source: "flow",
    status: "exitosa",
    ...evento,
    ultimo_evento: evento.ultimo_evento || evento.event_type,
  });
}

async function sendTextConEvento(flowToken, message, evento = {}) {
  try {
    await wa.sendText(flowToken, message);
    await guardarEventoFlow(flowToken, {
      event_type: "whatsapp_mensaje",
      status: "enviado",
      source: "whatsapp",
      endpoint_logico: "whatsapp_send_text",
      ...evento,
    });
    return true;
  } catch (error) {
    await guardarEventoFlow(flowToken, {
      event_type: "whatsapp_mensaje",
      status: "fallida",
      source: "whatsapp",
      endpoint_logico: "whatsapp_send_text",
      ...evento,
      ...errorEvento(error, "whatsapp_error"),
    });
    console.error(`Error enviando WhatsApp session=${sessionRef(flowToken)}:`, error.message);
    return false;
  }
}

async function handleFlow(payload) {
  const { action, screen, data = {}, flow_token, version } = payload;

  if (action === "ping") {
    return { data: { status: "active" } };
  }

  if (data.error) {
    console.error("Error notificado por el cliente del Flow.");
    await guardarEventoFlow(flow_token, {
      event_type: "flow_cliente_error",
      status: "fallida",
      endpoint_logico: `flow_${screen || "unknown"}`,
      error_category: "flow_client_error",
    });
    return { data: { acknowledged: true } };
  }

  const flowToken = flow_token;

  if (action === "data_exchange") {
    const started = Date.now();
    await guardarEventoFlow(flowToken, {
      event_type: "flow_data_exchange",
      status: "recibida",
      endpoint_logico: `flow_${screen || "unknown"}`,
    });

    try {
      switch (screen) {
        case "IDENTIFICACION":
          return await pasoIdentificacion(flowToken, data, version);
        case "ESPECIALIDAD":
          return await pasoEspecialidad(flowToken, data, version);
        case "SLOTS":
          return await pasoSlots(flowToken, data, version);
        case "CONFIRMAR":
          return await pasoConfirmar(flowToken, version);
      }
    } catch (error) {
      await guardarEventoFlow(flowToken, {
        event_type: "flow_data_exchange",
        status: "fallida",
        source: sourceFromError(error),
        endpoint_logico: `flow_${screen || "unknown"}`,
        duration_ms: Date.now() - started,
        ...errorEvento(error),
      });
      throw error;
    }
  }

  return { version, screen: "IDENTIFICACION", data: {} };
}

async function pasoIdentificacion(flowToken, data, version) {
  const identificacion = validarIdentificacion(data);
  if (!identificacion.ok) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_identificacion",
      status: "fallida",
      endpoint_logico: "flow_identificacion",
      error_code: identificacion.reason,
      error_category: "flow_validation",
      resultado_operativo: "validacion_fallida",
      motivo_fallo_simple: identificacion.reason,
    });
    return flowErrorResponse(version, identificacion.message);
  }

  const { tipo, documento } = identificacion;
  const correo = data.correo || null;

  let paciente = {
    nombre: "Paciente",
    eps: null,
    fuente: "sin_historial",
  };
  try {
    const citas = await hun.consultarCitasDocumento(tipo, documento);
    paciente = extraerPacienteDesdeHistorial(citas);
  } catch (error) {
    console.error("No se pudo consultar historial HUN del paciente:", error.message);
    await guardarEventoFlow(flowToken, {
      event_type: "hun_consulta_historial",
      status: "fallida",
      source: "hun_api",
      endpoint_logico: "consultar_citas_documento",
      ...errorEvento(error, "hun_api_error"),
    });
  }

  paciente = aplicarFallbackPacientePrueba(paciente, documento);

  if (!paciente.eps) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_identificacion",
      status: "fallida",
      endpoint_logico: "flow_identificacion",
      error_code: "eps_no_detectada",
      error_category: "hun_patient_lookup",
      resultado_operativo: "identificacion_incompleta",
      motivo_fallo_simple: "eps_no_detectada",
    });
    return flowErrorResponse(
      version,
      FLOW_ERROR_MESSAGES.eps_missing
    );
  }

  const session = saveRuntimeSession(flowToken, {
    paciente: {
      tipo_documento: tipo,
      numero_documento: documento,
      eps_codigo: paciente.eps,
      nombre_paciente: paciente.nombre,
    },
    contacto_email: correo,
    candidatos: {},
    elegido: null,
  });

  console.log(`Flow identificacion recibida session=${sessionRef(flowToken)}`);

  await db.guardarSesionTemporal({
    flow_token: flowToken,
    estado: "eligiendo_especialidad",
    especialidad_codigo: null,
    slot_token: null,
    contacto_email: correo,
    expires_at: session.expires_at,
  });

  await guardarEventoFlow(flowToken, {
    event_type: "flow_identificacion",
    status: "exitosa",
    endpoint_logico: "flow_identificacion",
    estado_contacto: "flow_iniciado",
    resultado_operativo:
      paciente.fuente === "fallback_prueba_hun"
        ? "paciente_prueba_identificado"
        : "paciente_identificado",
  });

  let especialidades = [];
  try {
    especialidades = especialidadesParaFlow(await hun.getEspecialidades());
  } catch (error) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_especialidades",
      status: "fallida",
      source: sourceFromError(error),
      endpoint_logico: "get_especialidades",
      ...errorEvento(error, "hun_api_error"),
      resultado_operativo: "error_especialidades",
      motivo_fallo_simple: "hun_api_error",
    });
    return flowErrorResponse(
      version,
      FLOW_ERROR_MESSAGES.hun_lookup
    );
  }

  if (!especialidades.length) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_especialidades",
      status: "fallida",
      endpoint_logico: "get_especialidades",
      error_code: "especialidades_vacias",
      error_category: "hun_api",
      resultado_operativo: "sin_especialidades",
      motivo_fallo_simple: "especialidades_vacias",
    });
    return flowErrorResponse(
      version,
      FLOW_ERROR_MESSAGES.hun_lookup
    );
  }

  return {
    version,
    screen: "ESPECIALIDAD",
    data: { especialidades },
  };
}

async function pasoEspecialidad(flowToken, data, version) {
  const session = getRuntimeSession(flowToken);
  if (!session?.paciente) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_sesion",
      status: "fallida",
      endpoint_logico: "flow_especialidad",
      error_code: "runtime_session_missing",
      error_category: "session",
      resultado_operativo: "sesion_no_disponible",
      motivo_fallo_simple: "sesion_incompleta",
    });
    return missingRuntimeResponse(version);
  }

  const codEsp = String(data.especialidad);
  let agenda = [];
  try {
    agenda = await hun.getAgendaPorEspecialidad(codEsp, fechaFinalConsulta());
  } catch (error) {
    return hunAvailabilityErrorResponse(
      flowToken,
      version,
      error,
      "get_agenda_por_especialidad"
    );
  }

  const { slots, candidatos } = buildSlotsFromAgenda({
    agenda,
    codEsp,
    flowToken,
    expiresAt: session.expires_at,
    permitirNoAutogestionable: permiteWaiverNoAutogestionable(session),
  });

  const firstSlotToken = slots[0]?.id || null;
  const especialidadNombre = firstSlotToken
    ? candidatos[firstSlotToken].especialidad_nombre
    : null;

  saveRuntimeSession(flowToken, {
    candidatos,
    elegido: null,
    especialidad_codigo: codEsp,
    especialidad_nombre: especialidadNombre,
  });

  await db.guardarSesionTemporal({
    flow_token: flowToken,
    estado: "eligiendo_slot",
    especialidad_codigo: codEsp,
    slot_token: null,
    expires_at: session.expires_at,
  });

  await guardarEventoFlow(flowToken, {
    event_type: "flow_especialidad",
    status: "exitosa",
    endpoint_logico: "flow_especialidad",
    especialidad_codigo: codEsp,
    estado_contacto: "flow_especialidad",
    resultado_operativo: slots.length ? "cupos_disponibles" : "sin_cupos",
    motivo_fallo_simple: permiteWaiverNoAutogestionable(session)
      ? "waiver_e2e_no_autogestionable"
      : null,
  });

  if (slots.length === 0) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_cupos",
      status: "fallida",
      endpoint_logico: "get_agenda_por_especialidad",
      especialidad_codigo: codEsp,
      error_code: "sin_cupos",
      error_category: "hun_availability",
      resultado_operativo: "sin_cupos",
      motivo_fallo_simple: "sin_cupos",
    });
    const especialidades = await recuperarEspecialidadesParaRetry();
    return {
      version,
      screen: "ESPECIALIDAD",
      data: {
        especialidades,
        error_message: FLOW_ERROR_MESSAGES.no_slots,
      },
    };
  }

  return { version, screen: "SLOTS", data: { slots } };
}

async function pasoSlots(flowToken, data, version) {
  const slotToken = String(data.slot);
  const session = getRuntimeSession(flowToken);

  if (!session?.paciente || !session?.especialidad_codigo || !slotToken) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_slot",
      status: "fallida",
      endpoint_logico: "flow_slots",
      especialidad_codigo: session?.especialidad_codigo || null,
      error_category: "flow_validation",
      motivo_fallo_simple: "slot_invalido",
    });
    return {
      version,
      screen: "SLOTS",
      data: { slots: [], error_message: FLOW_ERROR_MESSAGES.slot_invalid },
    };
  }

  let slots = [];
  let candidatos = {};
  try {
    ({ slots, candidatos } = await buildSlotsVigentes(flowToken, session));
  } catch (error) {
    return hunAvailabilityErrorResponse(
      flowToken,
      version,
      error,
      "reconsultar_agenda_slots"
    );
  }
  const elegido = candidatos[slotToken];

  if (!elegido) {
    saveRuntimeSession(flowToken, {
      candidatos,
      elegido: null,
      slot_token: null,
    });
    await db.guardarSesionTemporal({
      flow_token: flowToken,
      estado: "eligiendo_slot",
      especialidad_codigo: session.especialidad_codigo,
      slot_token: null,
      expires_at: session.expires_at,
    });
    return slotNoDisponibleResponse(flowToken, session, version, slots);
  }

  saveRuntimeSession(flowToken, {
    candidatos,
    elegido,
    slot_token: slotToken,
    especialidad_nombre: elegido.especialidad_nombre,
  });

  await db.guardarSesionTemporal({
    flow_token: flowToken,
    estado: "confirmando",
    especialidad_codigo: session.especialidad_codigo,
    slot_token: slotToken,
    expires_at: session.expires_at,
  });

  await guardarEventoFlow(flowToken, {
    event_type: "flow_slot",
    status: "exitosa",
    endpoint_logico: "flow_slots",
    especialidad_codigo: session.especialidad_codigo,
    estado_contacto: "flow_cupo_elegido",
    resultado_operativo: "cupo_elegido",
    motivo_fallo_simple: elegido.waiver_no_autogestionable
      ? "waiver_e2e_no_autogestionable"
      : null,
  });

  return {
    version,
    screen: "CONFIRMAR",
    data: { resumen: buildResumenCita(session.paciente, elegido) },
  };
}

async function pasoConfirmar(flowToken, version) {
  const session = getRuntimeSession(flowToken);
  if (!session?.paciente || !session?.slot_token || !session?.especialidad_codigo) {
    await guardarEventoFlow(flowToken, {
      event_type: "flow_sesion",
      status: "fallida",
      endpoint_logico: "flow_confirmar",
      error_code: "runtime_session_missing",
      error_category: "session",
      resultado_operativo: "sesion_no_disponible",
      motivo_fallo_simple: "sesion_incompleta",
    });
    return missingRuntimeResponse(version);
  }

  let slots = [];
  let candidatos = {};
  try {
    ({ slots, candidatos } = await buildSlotsVigentes(flowToken, session));
  } catch (error) {
    return hunAvailabilityErrorResponse(
      flowToken,
      version,
      error,
      "reconsultar_agenda_confirmar"
    );
  }
  const elegido = candidatos[session.slot_token];

  if (!elegido) {
    saveRuntimeSession(flowToken, {
      candidatos,
      elegido: null,
      slot_token: null,
    });
    await db.guardarSesionTemporal({
      flow_token: flowToken,
      estado: "eligiendo_slot",
      especialidad_codigo: session.especialidad_codigo,
      slot_token: null,
      expires_at: session.expires_at,
    });
    return slotNoDisponibleResponse(flowToken, session, version, slots);
  }

  const freshSession = saveRuntimeSession(flowToken, {
    candidatos,
    elegido,
    especialidad_nombre: elegido.especialidad_nombre,
  });

  await db.guardarSesionTemporal({
    flow_token: flowToken,
    estado: "procesando_asignacion",
    especialidad_codigo: freshSession.especialidad_codigo,
    slot_token: freshSession.slot_token,
    expires_at: freshSession.expires_at,
  });

  await guardarEventoFlow(flowToken, {
    event_type: "flow_confirmacion",
    status: "exitosa",
    endpoint_logico: "flow_confirmar",
    especialidad_codigo: freshSession.especialidad_codigo,
    estado_contacto: "flow_confirmado",
    resultado_operativo: "asignacion_en_proceso",
    motivo_fallo_simple: freshSession.elegido?.waiver_no_autogestionable
      ? "waiver_e2e_no_autogestionable"
      : null,
  });

  procesarCita(flowToken).catch(async (error) => {
    console.error(`Error en asignacion asincrona session=${sessionRef(flowToken)}:`, error.message);
    await guardarEventoFlow(flowToken, {
      event_type: "asignacion_cita",
      status: "fallida",
      source: sourceFromError(error),
      endpoint_logico: "procesar_cita",
      especialidad_codigo: freshSession.especialidad_codigo,
      ...errorEvento(error, "backend_error"),
      resultado_operativo: "error_asignacion",
      motivo_fallo_simple: "error_inesperado",
    });
    await db.finalizarSesionTemporal(flowToken, "fallido", {
      especialidad_codigo: freshSession.especialidad_codigo,
      last_error_code: error.code || "unexpected_assignment_error",
      last_error_category: error.category || "backend_error",
    });
    await sendTextConEvento(flowToken, FLOW_ERROR_MESSAGES.assignment_failed, {
      especialidad_codigo: freshSession.especialidad_codigo,
      resultado_operativo: "error_asignacion",
      motivo_fallo_simple: "error_inesperado",
    });
    clearRuntimeSession(flowToken);
  });

  return {
    version,
    screen: "FINAL",
    data: {
      mensaje: "Estamos procesando tu cita",
      detalle: "Te confirmaremos por este chat en unos segundos.",
    },
  };
}

async function procesarCita(flowToken) {
  const started = Date.now();
  const session = getRuntimeSession(flowToken);
  const paciente = session?.paciente;
  const elegido = session?.elegido;

  if (!elegido || !paciente) {
    console.error(`Sesion incompleta session=${sessionRef(flowToken)}`);
    await db.finalizarSesionTemporal(flowToken, "fallido", {
      last_error_code: "runtime_session_missing",
      last_error_category: "session",
    });
    await guardarEventoFlow(flowToken, {
      event_type: "flow_asignacion",
      status: "fallida",
      source: "backend",
      endpoint_logico: "procesar_cita",
      error_code: "runtime_session_missing",
      error_category: "session",
      motivo_fallo_simple: "sesion_incompleta",
    });
    await sendTextConEvento(
      flowToken,
      FLOW_ERROR_MESSAGES.assignment_missing,
      {
        especialidad_codigo: session?.especialidad_codigo || null,
        resultado_operativo: "error_asignacion",
        motivo_fallo_simple: "sesion_incompleta",
      }
    );
    clearRuntimeSession(flowToken);
    return;
  }

  const payload = buildAsignacionPayload(paciente, elegido);

  if (!payload.eps) {
    console.error(`Asignacion abortada por EPS faltante session=${sessionRef(flowToken)}`);
    await db.finalizarSesionTemporal(flowToken, "fallido", {
      especialidad_codigo: session.especialidad_codigo,
      last_error_code: "eps_missing",
      last_error_category: "hun_payload",
    });
    await guardarEventoFlow(flowToken, {
      event_type: "flow_asignacion",
      status: "fallida",
      source: "backend",
      endpoint_logico: "validar_payload_asignacion",
      especialidad_codigo: session.especialidad_codigo,
      error_code: "eps_missing",
      error_category: "hun_payload",
      motivo_fallo_simple: "eps_missing",
    });
    await sendTextConEvento(
      flowToken,
      FLOW_ERROR_MESSAGES.assignment_eps_missing,
      {
        especialidad_codigo: session.especialidad_codigo,
        resultado_operativo: "error_asignacion",
        motivo_fallo_simple: "eps_missing",
      }
    );
    clearRuntimeSession(flowToken);
    return;
  }

  await asignarYConfirmar(flowToken, payload, elegido, session, started);
}

async function asignarYConfirmar(flowToken, payload, elegido, session, started) {
  try {
    const resp = await hun.asignarCita(payload);

    if (resp && resp.success === false) {
      const faltantes = resp.data?.campos_faltantes?.join(", ");
      console.error(`HUN rechazo asignacion session=${sessionRef(flowToken)}`);
      await guardarEventoFlow(flowToken, {
        event_type: "asignacion_cita",
        status: "rechazada",
        source: "hun_api",
        endpoint_logico: "asignar_cita",
        especialidad_codigo: session.especialidad_codigo,
        duration_ms: Date.now() - started,
        error_category: "hun_rejected",
        motivo_fallo_simple: faltantes ? "campos_faltantes" : "rechazo_hun",
      });
      await db.finalizarSesionTemporal(flowToken, "fallido", {
        especialidad_codigo: session.especialidad_codigo,
        last_error_code: "hun_rejected",
        last_error_category: "hun_api",
      });
      await sendTextConEvento(
        flowToken,
        FLOW_ERROR_MESSAGES.assignment_rejected,
        {
          especialidad_codigo: session.especialidad_codigo,
          resultado_operativo: "error_asignacion",
          motivo_fallo_simple: faltantes ? "campos_faltantes" : "rechazo_hun",
        }
      );
      clearRuntimeSession(flowToken);
      return;
    }

    const numeroCita = extraerNumeroCita(resp);

    await guardarEventoFlow(flowToken, {
      event_type: "asignacion_cita",
      status: "exitosa",
      source: "hun_api",
      endpoint_logico: "asignar_cita",
      especialidad_codigo: session.especialidad_codigo,
      duration_ms: Date.now() - started,
      resultado_operativo: "cita_creada",
      motivo_fallo_simple: elegido.waiver_no_autogestionable
        ? "waiver_e2e_no_autogestionable"
        : null,
    });
    await db.finalizarSesionTemporal(flowToken, "completado", {
      especialidad_codigo: session.especialidad_codigo,
    });

    await sendTextConEvento(
      flowToken,
      `Tu cita quedo agendada.\n\n` +
        `Especialidad: ${elegido.especialidad_nombre}\n` +
        `Medico: ${elegido.medico}\n` +
        `Fecha: ${elegido.fecha} ${horaCorta(elegido.hora)}\n` +
        `Consultorio: ${elegido.consultorio}` +
        (numeroCita ? `\nNumero de cita: ${numeroCita}` : ""),
      {
        especialidad_codigo: session.especialidad_codigo,
        resultado_operativo: "confirmacion_enviada",
      }
    );

    await cancelarCitaE2eSiAplica(flowToken, numeroCita, session, started);

    const correo = session.contacto_email || (await db.getContactoEmailSesion(flowToken));
    enviarConfirmacion({
      to_email: correo,
      to_name: session.paciente?.nombre_paciente || "Paciente",
      especialidad: elegido.especialidad_nombre,
      medico: elegido.medico,
      tipo_consulta: elegido.descripcion,
      fecha: elegido.fecha,
      hora: horaCorta(elegido.hora),
      consultorio: elegido.consultorio,
      numero_cita: numeroCita,
    }).catch((error) =>
      console.error(`Error enviando correo session=${sessionRef(flowToken)}:`, error.message)
    );

    clearRuntimeSession(flowToken);
  } catch (error) {
    console.error(`Error asignando cita session=${sessionRef(flowToken)}:`, error.message);
    await guardarEventoFlow(flowToken, {
      event_type: "asignacion_cita",
      status: "fallida",
      source: sourceFromError(error),
      endpoint_logico: "asignar_cita",
      especialidad_codigo: session.especialidad_codigo,
      duration_ms: Date.now() - started,
      ...errorEvento(error, "hun_api_error"),
    });
    await db.finalizarSesionTemporal(flowToken, "fallido", {
      especialidad_codigo: session.especialidad_codigo,
      last_error_code: error.code || "hun_api_error",
      last_error_category: "hun_api",
    });
    await sendTextConEvento(
      flowToken,
      FLOW_ERROR_MESSAGES.assignment_failed,
      {
        especialidad_codigo: session.especialidad_codigo,
        resultado_operativo: "error_asignacion",
        motivo_fallo_simple: "hun_api_error",
      }
    );
    clearRuntimeSession(flowToken);
  }
}

module.exports = { handleFlow };
