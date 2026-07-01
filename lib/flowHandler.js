const crypto = require("crypto");

const hun = require("./hun");
const db = require("./db");
const wa = require("./whatsapp");

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const SESSION_TTL_MS = Number(process.env.FLOW_SESSION_TTL_MINUTES || 30) * 60000;
const runtimeSessions = new Map();

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

function makeSlotToken() {
  return `slot_${crypto.randomBytes(18).toString("base64url")}`;
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
      error_message:
        "La sesion expiro o fue reiniciada. Ingresa tus datos nuevamente.",
    },
  };
}

function extraerNumeroCita(resp) {
  const texto = resp?.soap?.descripcion || resp?.message || "";
  const m = String(texto).match(/Cita\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function handleFlow(payload) {
  const { action, screen, data = {}, flow_token, version } = payload;

  if (action === "ping") {
    return { data: { status: "active" } };
  }

  if (data.error) {
    console.error("Error notificado por el cliente del Flow.");
    return { data: { acknowledged: true } };
  }

  const flowToken = flow_token;

  if (action === "data_exchange") {
    switch (screen) {
      case "IDENTIFICACION":
        return pasoIdentificacion(flowToken, data, version);
      case "ESPECIALIDAD":
        return pasoEspecialidad(flowToken, data, version);
      case "SLOTS":
        return pasoSlots(flowToken, data, version);
      case "CONFIRMAR":
        return pasoConfirmar(flowToken, version);
    }
  }

  return { version, screen: "IDENTIFICACION", data: {} };
}

async function pasoIdentificacion(flowToken, data, version) {
  const tipo = data.tipo_documento;
  const documento = String(data.numero_documento);
  const correo = data.correo || null;

  let nombre = "Paciente";
  let eps = null;
  try {
    const citas = await hun.consultarCitasDocumento(tipo, documento);
    if (citas.length) {
      nombre = hun.limpiar(citas[citas.length - 1].Nombre_Paciente) || nombre;
      for (let i = citas.length - 1; i >= 0; i--) {
        const cod = hun.limpiar(citas[i].Cod_Eps);
        if (cod) {
          eps = cod;
          break;
        }
      }
    }
  } catch (error) {
    console.error("No se pudo consultar historial HUN del paciente:", error.message);
  }

  if (!eps && EPS_PRUEBA[documento]) {
    eps = EPS_PRUEBA[documento];
  }

  const session = saveRuntimeSession(flowToken, {
    paciente: {
      tipo_documento: tipo,
      numero_documento: documento,
      eps_codigo: eps,
      nombre_paciente: nombre,
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

  const especialidades = await hun.getEspecialidades();
  return {
    version,
    screen: "ESPECIALIDAD",
    data: { especialidades: especialidades.slice(0, 200) },
  };
}

async function pasoEspecialidad(flowToken, data, version) {
  const session = getRuntimeSession(flowToken);
  if (!session?.paciente) {
    return missingRuntimeResponse(version);
  }

  const codEsp = String(data.especialidad);
  const agenda = await hun.getAgendaPorEspecialidad(codEsp, fechaFinalConsulta());

  const filas = [];
  const candidatos = {};
  for (const row of agenda) {
    for (const cup of row.cups || []) {
      const id = makeSlotToken();
      const fecha = hun.limpiar(row.fecha_atencion);
      const hora = hun.limpiar(row.hora_inicial);
      const medico = hun.limpiar(row.nombre_medico);
      const descripcion = hun.limpiar(cup.descripcion);

      filas.push({
        id,
        orden: `${fecha} ${hora}`,
        title: `${fechaCorta(fecha)} ${horaCorta(hora)} · ${medico}`,
        description: descripcion,
      });

      candidatos[id] = {
        agenda_detalle_id: cup.agenda_detalle_id,
        codigo_medico: hun.limpiar(row.codigo_medico),
        especialidad: Number(codEsp),
        consultorio: Number(hun.limpiar(row.numero_consultorio)),
        fecha,
        hora,
        procedimiento: hun.limpiar(cup.codigo),
        tiempo_atencion: Number(hun.limpiar(row.tiempo_intervalo)),
        medico,
        descripcion,
        especialidad_nombre: hun.limpiar(row.nombre_especialidad),
      };
    }
  }

  filas.sort((a, b) => a.orden.localeCompare(b.orden));
  const slots = filas
    .slice(0, 20)
    .map(({ id, title, description }) => ({ id, title, description }));

  const especialidadNombre = filas.length
    ? candidatos[filas[0].id].especialidad_nombre
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

  if (slots.length === 0) {
    const especialidades = await hun.getEspecialidades();
    return {
      version,
      screen: "ESPECIALIDAD",
      data: {
        especialidades: especialidades.slice(0, 200),
        error_message: "No hay cupos disponibles para esta especialidad.",
      },
    };
  }

  return { version, screen: "SLOTS", data: { slots } };
}

async function pasoSlots(flowToken, data, version) {
  const slotToken = String(data.slot);
  const session = getRuntimeSession(flowToken);
  const elegido = session?.candidatos?.[slotToken];

  if (!session?.paciente || !elegido) {
    return {
      version,
      screen: "SLOTS",
      data: { slots: [], error_message: "Seleccion invalida, intenta de nuevo." },
    };
  }

  saveRuntimeSession(flowToken, {
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

  const resumen =
    `Paciente: ${session.paciente.nombre_paciente || ""}\n` +
    `Especialidad: ${elegido.especialidad_nombre}\n` +
    `Médico: ${elegido.medico}\n` +
    `Tipo de consulta: ${elegido.descripcion || ""}\n` +
    `Fecha: ${elegido.fecha} ${horaCorta(elegido.hora)}\n` +
    `Consultorio: ${elegido.consultorio}`;

  return { version, screen: "CONFIRMAR", data: { resumen } };
}

async function pasoConfirmar(flowToken, version) {
  const session = getRuntimeSession(flowToken);
  if (!session?.paciente || !session?.elegido) {
    return missingRuntimeResponse(version);
  }

  await db.guardarSesionTemporal({
    flow_token: flowToken,
    estado: "procesando_asignacion",
    especialidad_codigo: session.especialidad_codigo,
    slot_token: session.slot_token,
    expires_at: session.expires_at,
  });

  procesarCita(flowToken).catch((error) =>
    console.error("Error en asignacion asincrona:", error.message)
  );

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
    await wa.sendText(
      flowToken,
      "No se pudo agendar: faltan datos de la sesion. Inicia el proceso de nuevo."
    );
    clearRuntimeSession(flowToken);
    return;
  }

  const payload = {
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

  if (!payload.eps) {
    console.error(`Asignacion abortada por EPS faltante session=${sessionRef(flowToken)}`);
    await db.finalizarSesionTemporal(flowToken, "fallido", {
      especialidad_codigo: session.especialidad_codigo,
      last_error_code: "eps_missing",
      last_error_category: "hun_payload",
    });
    await wa.sendText(
      flowToken,
      "No pudimos determinar tu EPS/contrato. " +
        "Verifica que tengas historial en el HUN o comunicate con la linea de citas."
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
      await db.registrarEventoOperativo({
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
      await wa.sendText(
        flowToken,
        `No se pudo agendar tu cita.\n${resp.message || ""}` +
          (faltantes ? `\nFaltan datos: ${faltantes}` : "")
      );
      clearRuntimeSession(flowToken);
      return;
    }

    const numeroCita = extraerNumeroCita(resp);

    await db.registrarEventoOperativo({
      event_type: "asignacion_cita",
      status: "exitosa",
      source: "hun_api",
      endpoint_logico: "asignar_cita",
      especialidad_codigo: session.especialidad_codigo,
      duration_ms: Date.now() - started,
      resultado_operativo: "cita_creada",
    });
    await db.finalizarSesionTemporal(flowToken, "completado", {
      especialidad_codigo: session.especialidad_codigo,
    });

    await wa.sendText(
      flowToken,
      `Tu cita quedo agendada.\n\n` +
        `Especialidad: ${elegido.especialidad_nombre}\n` +
        `Medico: ${elegido.medico}\n` +
        `Fecha: ${elegido.fecha} ${horaCorta(elegido.hora)}\n` +
        `Consultorio: ${elegido.consultorio}` +
        (numeroCita ? `\nNumero de cita: ${numeroCita}` : "")
    );

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
    await db.registrarEventoOperativo({
      event_type: "asignacion_cita",
      status: "fallida",
      source: "hun_api",
      endpoint_logico: "asignar_cita",
      especialidad_codigo: session.especialidad_codigo,
      duration_ms: Date.now() - started,
      error_code: error.code || null,
      error_category: "hun_api_error",
    });
    await db.finalizarSesionTemporal(flowToken, "fallido", {
      especialidad_codigo: session.especialidad_codigo,
      last_error_code: error.code || "hun_api_error",
      last_error_category: "hun_api",
    });
    await wa.sendText(
      flowToken,
      "Hubo un problema al agendar tu cita. " +
        "Intenta de nuevo o comunicate con la linea de citas."
    );
    clearRuntimeSession(flowToken);
  }
}

module.exports = { handleFlow };
