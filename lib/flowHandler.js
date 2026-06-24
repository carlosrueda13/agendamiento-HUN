const hun = require("./hun");
const db = require("./db");
const wa = require("./whatsapp");

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// Pacientes de prueba del HUN (documento -> código de EPS/contrato),
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

// "2026-06-29" -> "29 jun"
function fechaCorta(yyyymmdd) {
  if (!yyyymmdd) return "";
  const [a, m, d] = yyyymmdd.split("-");
  const mes = MESES[Number(m) - 1] || m;
  return `${d} ${mes}`;
}

// "07:00:00" -> "07:00"
const horaCorta = (h) => (h ? String(h).slice(0, 5) : "");

const acortar = (txt, n) =>
  txt && txt.length > n ? txt.slice(0, n - 1) + "…" : txt || "";

// Días hacia adelante para consultar disponibilidad.
function fechaFinalConsulta(dias = 60) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

// Extrae el número de cita del texto SOAP: "Se Creo La Cita 1534675 para..."
function extraerNumeroCita(resp) {
  const texto = resp?.soap?.descripcion || resp?.message || "";
  const m = String(texto).match(/Cita\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Punto de entrada: recibe el payload ya descifrado y devuelve la respuesta.
async function handleFlow(payload) {
  const { action, screen, data = {}, flow_token, version } = payload;

  // Health check de Meta.
  if (action === "ping") {
    return { data: { status: "active" } };
  }

  // El cliente puede notificar errores de validación/datos.
  if (data.error) {
    console.error("Error notificado por el cliente del Flow:", data.error);
    return { data: { acknowledged: true } };
  }

  const numero = flow_token; // usamos el flow_token (= número) como id de sesión

  if (action === "data_exchange") {
    switch (screen) {
      case "IDENTIFICACION":
        return pasoIdentificacion(numero, data, version);
      case "ESPECIALIDAD":
        return pasoEspecialidad(numero, data, version);
      case "SLOTS":
        return pasoSlots(numero, data, version);
      case "CONFIRMAR":
        return pasoConfirmar(numero, version);
    }
  }

  // INIT u otros: arrancamos pidiendo la especialidad si ya hay sesión.
  return { version, screen: "IDENTIFICACION", data: {} };
}

// Paso 1: documento -> identifica paciente, devuelve especialidades.
async function pasoIdentificacion(numero, data, version) {
  const tipo = data.tipo_documento;
  const documento = String(data.numero_documento);

  let nombre = "Paciente";
  let eps = null;
  try {
    const citas = await hun.consultarCitasDocumento(tipo, documento);
    if (citas.length) {
      // Nombre: de la cita más reciente.
      nombre = hun.limpiar(citas[citas.length - 1].Nombre_Paciente) || nombre;
      // EPS: la cita más reciente que tenga un Cod_Eps no vacío.
      for (let i = citas.length - 1; i >= 0; i--) {
        const cod = hun.limpiar(citas[i].Cod_Eps);
        if (cod) {
          eps = cod;
          break;
        }
      }
    }
  } catch (e) {
    console.error("Error consultando citas del paciente:", e.message);
  }

  // Fallback: pacientes de prueba del HUN (documento -> EPS).
  if (!eps && EPS_PRUEBA[documento]) {
    eps = EPS_PRUEBA[documento];
  }

  console.log(
    `Identificación: ${tipo} ${documento} -> nombre="${nombre}" eps="${eps}"`
  );

  await db.guardarPaciente({
    whatsapp_numero: numero,
    tipo_documento: tipo,
    numero_documento: documento,
    eps_codigo: eps,
    nombre_paciente: nombre,
  });
  await db.guardarSesion({
    whatsapp_numero: numero,
    estado: "eligiendo_especialidad",
    especialidad_codigo: null,
    especialidad_nombre: null,
    slot_seleccionado: null,
  });

  const especialidades = await hun.getEspecialidades();
  return {
    version,
    screen: "ESPECIALIDAD",
    data: { especialidades: especialidades.slice(0, 200) },
  };
}

// Paso 2: especialidad -> devuelve los slots disponibles.
async function pasoEspecialidad(numero, data, version) {
  const codEsp = String(data.especialidad);
  const agenda = await hun.getAgendaPorEspecialidad(
    codEsp,
    fechaFinalConsulta()
  );

  // Aplanamos la agenda: cada cup (procedimiento) es un cupo agendable.
  const filas = [];
  const candidatos = {};
  for (const r of agenda) {
    for (const cup of r.cups || []) {
      const id = String(cup.agenda_detalle_id);
      const fecha = hun.limpiar(r.fecha_atencion);
      const hora = hun.limpiar(r.hora_inicial);
      const medico = hun.limpiar(r.nombre_medico);
      filas.push({
        id,
        orden: `${fecha} ${hora}`,
        title: `${fechaCorta(fecha)} ${horaCorta(hora)} · ${acortar(medico, 18)}`,
      });
      candidatos[id] = {
        agenda_detalle_id: cup.agenda_detalle_id,
        codigo_medico: hun.limpiar(r.codigo_medico),
        especialidad: Number(codEsp),
        consultorio: Number(hun.limpiar(r.numero_consultorio)),
        fecha,
        hora,
        procedimiento: hun.limpiar(cup.codigo),
        tiempo_atencion: Number(hun.limpiar(r.tiempo_intervalo)),
        medico,
        especialidad_nombre: hun.limpiar(r.nombre_especialidad),
      };
    }
  }

  filas.sort((a, b) => a.orden.localeCompare(b.orden));
  const slots = filas.slice(0, 20).map(({ id, title }) => ({ id, title }));

  await db.guardarSesion({
    whatsapp_numero: numero,
    estado: "eligiendo_slot",
    especialidad_codigo: codEsp,
    especialidad_nombre: filas.length
      ? candidatos[filas[0].id].especialidad_nombre
      : null,
    slot_seleccionado: { candidatos },
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

// Paso 3: slot elegido -> arma el resumen para confirmar.
async function pasoSlots(numero, data, version) {
  const slotId = String(data.slot);
  const sesion = await db.getSesion(numero);
  const candidatos = sesion?.slot_seleccionado?.candidatos || {};
  const elegido = candidatos[slotId];

  if (!elegido) {
    return {
      version,
      screen: "SLOTS",
      data: { slots: [], error_message: "Selección inválida, intenta de nuevo." },
    };
  }

  const paciente = await db.getPaciente(numero);
  const resumen =
    `Paciente: ${paciente?.nombre_paciente || ""}\n` +
    `Especialidad: ${elegido.especialidad_nombre}\n` +
    `Médico: ${elegido.medico}\n` +
    `Fecha: ${elegido.fecha} ${horaCorta(elegido.hora)}\n` +
    `Consultorio: ${elegido.consultorio}`;

  await db.guardarSesion({
    whatsapp_numero: numero,
    estado: "confirmando",
    especialidad_codigo: sesion?.especialidad_codigo,
    especialidad_nombre: elegido.especialidad_nombre,
    slot_seleccionado: { candidatos, elegido },
  });

  return { version, screen: "CONFIRMAR", data: { resumen } };
}

// Paso 4: confirma. El timeout del Flow de WhatsApp es muy corto, así que
// respondemos de inmediato (sin tocar Supabase ni el HUN) y procesamos toda
// la asignación en segundo plano, confirmando luego por un mensaje de chat.
async function pasoConfirmar(numero, version) {
  procesarCita(numero).catch((e) =>
    console.error("Error en asignación asíncrona:", e.message)
  );

  return {
    version,
    screen: "FINAL",
    data: {
      mensaje: "⏳ Estamos procesando tu cita",
      detalle: "Te confirmaremos por este chat en unos segundos.",
    },
  };
}

// Carga la sesión, arma el payload y asigna la cita en el HUN (en segundo
// plano). Envía el resultado (éxito con Nº de cita o el motivo del error)
// como mensaje de WhatsApp.
async function procesarCita(numero) {
  const sesion = await db.getSesion(numero);
  const paciente = await db.getPaciente(numero);
  const elegido = sesion?.slot_seleccionado?.elegido;

  if (!elegido || !paciente) {
    console.error("Sesión incompleta para", numero);
    await wa.sendText(
      numero,
      "❌ No se pudo agendar: faltan datos de la sesión. Inicia el proceso de nuevo."
    );
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
    console.error("Asignación abortada: EPS no determinada para", numero);
    await wa.sendText(
      numero,
      "❌ No pudimos determinar tu EPS/contrato. " +
        "Verifica que tengas historial en el HUN o comunícate con la línea de citas."
    );
    return;
  }

  await asignarYConfirmar(numero, payload, elegido, sesion);
}

// Asigna la cita en el HUN y envía la confirmación (o el error) por chat.
async function asignarYConfirmar(numero, payload, elegido, sesion) {
  try {
    const resp = await hun.asignarCita(payload);
    console.log("Respuesta asignar_cita del HUN:", JSON.stringify(resp));

    // El HUN puede responder HTTP 200 pero con success:false (ej. validación).
    if (resp && resp.success === false) {
      const faltantes = resp.data?.campos_faltantes?.join(", ");
      console.error(
        "El HUN rechazó la cita:",
        resp.message,
        faltantes ? `(faltan: ${faltantes})` : ""
      );
      await wa.sendText(
        numero,
        `❌ No se pudo agendar tu cita.\n${resp.message || ""}` +
          (faltantes ? `\nFaltan datos: ${faltantes}` : "")
      );
      return;
    }

    const numeroCita = extraerNumeroCita(resp);

    await db.guardarCita({
      whatsapp_numero: numero,
      numero_cita: numeroCita,
      especialidad: elegido.especialidad_nombre,
      medico: elegido.medico,
      fecha_cita: elegido.fecha,
      hora_cita: horaCorta(elegido.hora),
      consultorio: String(elegido.consultorio),
      agenda_detalle_id: elegido.agenda_detalle_id,
      estado: "activa",
      respuesta_hun: resp,
    });
    await db.guardarSesion({
      whatsapp_numero: numero,
      estado: "completado",
      especialidad_codigo: sesion.especialidad_codigo,
      especialidad_nombre: elegido.especialidad_nombre,
      slot_seleccionado: sesion.slot_seleccionado,
    });

    await wa.sendText(
      numero,
      `✅ ¡Tu cita quedó agendada!\n\n` +
        `🏥 ${elegido.especialidad_nombre}\n` +
        `👨‍⚕️ ${elegido.medico}\n` +
        `📅 ${elegido.fecha} ${horaCorta(elegido.hora)}\n` +
        `🚪 Consultorio ${elegido.consultorio}` +
        (numeroCita ? `\n🎫 Nº de cita: ${numeroCita}` : "")
    );
  } catch (e) {
    const detalle = e.response?.data
      ? JSON.stringify(e.response.data)
      : e.message;
    console.error("Error asignando cita:", detalle);
    await wa.sendText(
      numero,
      "❌ Hubo un problema al agendar tu cita. " +
        "Intenta de nuevo o comunícate con la línea de citas."
    );
  }
}

module.exports = { handleFlow };
