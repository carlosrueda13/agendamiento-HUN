process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 11).toString("base64");
process.env.FLOW_MAX_SLOTS = "3";

const hun = require("../lib/hun");
const db = require("../lib/db");
const wa = require("../lib/whatsapp");

const savedSessions = [];
const savedEvents = [];
const sentMessages = [];
let agendaMode = "available";
let asignarMode = "success";

function hunError(category = "network_error") {
  return new hun.HunApiError({
    message: "Error HUN simulado",
    method: "GET",
    endpoint: "/mock",
    status: 503,
    code: "SIMULATED_HUN_ERROR",
    category,
  });
}

function agendaRow() {
  return {
    codigo_medico: " MEFLOW ",
    fecha_atencion: "2026-09-10",
    hora_inicial: "11:00:00",
    nombre_medico: " MEDICO FLOW ",
    nombre_especialidad: " ANESTESIOLOGIA ",
    numero_consultorio: "404",
    tiempo_intervalo: "30",
    cups: [
      {
        agenda_detalle_id: "AG-FLOW",
        autogestionable: agendaMode === "empty" ? "no" : "si",
        codigo: "890FLOW",
        descripcion: "Consulta flow",
      },
    ],
  };
}

hun.consultarCitasDocumento = async () => [
  {
    Nombre_Paciente: " PACIENTE ERROR ",
    Cod_Eps: " HUN22 ",
  },
];

hun.getEspecialidades = async () => [
  { id: "21", title: "ANESTESIOLOGIA" },
  { id: "30", title: "CARDIOLOGIA" },
];

hun.getAgendaPorEspecialidad = async () => {
  if (agendaMode === "throw") throw hunError("network_error");
  return [agendaRow()];
};

hun.asignarCita = async () => {
  if (asignarMode === "throw") throw hunError("timeout");
  return {
    success: true,
    soap: { descripcion: "Cita 111111 asignada correctamente" },
  };
};

wa.sendText = async (to, message) => {
  sentMessages.push({ to, message });
};
wa.sendInteractiveButtons = async () => true;

db.guardarSesionTemporal = async (session) => {
  savedSessions.push(session);
};

db.guardarEventoOperativo = async (event) => {
  savedEvents.push(event);
};

db.finalizarSesionTemporal = async (flowToken, estado, extra = {}) => {
  savedSessions.push({ flow_token: flowToken, estado, ...extra });
};

db.getContactoEmailSesion = async () => null;

const { handleFlow } = require("../lib/flowHandler");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function flowPayload(flowToken, screen, data = {}) {
  return {
    action: "data_exchange",
    screen,
    flow_token: flowToken,
    version: "7.3",
    data,
  };
}

async function identify(flowToken) {
  return handleFlow(
    flowPayload(flowToken, "IDENTIFICACION", {
      tipo_documento: "CC",
      numero_documento: "123456",
      correo: "paciente@example.com",
    })
  );
}

async function selectSpecialty(flowToken) {
  return handleFlow(flowPayload(flowToken, "ESPECIALIDAD", { especialidad: "21" }));
}

async function selectProcedureAndDate(flowToken) {
  const procedures = await selectSpecialty(flowToken);
  assert(procedures.screen === "PROCEDIMIENTO", "Debe listar procedimientos disponibles.");
  const dates = await handleFlow(
    flowPayload(flowToken, "PROCEDIMIENTO", {
      procedimiento_token: procedures.data.procedimientos[0].id,
    })
  );
  assert(dates.screen === "FECHA", "Debe listar fechas del procedimiento.");
  return handleFlow(
    flowPayload(flowToken, "FECHA", { fecha_token: dates.data.fechas[0].id })
  );
}

async function waitFor(predicate, message) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function assertActionableError(response, expectedScreen, pattern, message) {
  assert(response.screen === expectedScreen, message);
  assert(response.data?.error_message, "Debe retornar mensaje visible de error.");
  assert(
    pattern.test(response.data.error_message),
    `Mensaje de error sin accion esperada: ${response.data.error_message}`
  );
}

function assertNoSensitiveEvents() {
  const serialized = JSON.stringify(savedEvents);
  [
    "PACIENTE ERROR",
    "AG-FLOW",
    "MEFLOW",
    "2026-09-10",
    "11:00:00",
    "890FLOW",
    "111111",
  ].forEach((forbidden) => {
    assert(
      !serialized.includes(forbidden),
      `Eventos operativos no deben persistir dato sensible: ${forbidden}`
    );
  });
}

async function assertValidationErrorHasAction() {
  const response = await handleFlow(
    flowPayload("flow_error_validation", "IDENTIFICACION", {
      tipo_documento: "XX",
      numero_documento: "123456",
      correo: "paciente@example.com",
    })
  );

  assertActionableError(
    response,
    "IDENTIFICACION",
    /documento|corrige|selecciona/i,
    "Validacion fallida debe volver a identificacion."
  );
}

async function assertNoSlotsHasRetryAction() {
  agendaMode = "empty";
  const flowToken = "flow_error_no_slots";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);

  assertActionableError(
    response,
    "ESPECIALIDAD",
    /elige otra especialidad|intenta mas tarde/i,
    "Sin cupos debe volver a especialidad."
  );
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_especialidad" &&
        event.status === "fallida" &&
        event.resultado_operativo === "sin_procedimientos"
    ),
    "Sin cupos debe registrar evento de error no sensible."
  );
}

async function assertHunAvailabilityFailureIsRecoverable() {
  agendaMode = "throw";
  const flowToken = "flow_error_hun_availability";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);

  assertActionableError(
    response,
    "ESPECIALIDAD",
    /vuelve a elegir|intenta mas tarde/i,
    "Fallo HUN de disponibilidad debe ser recuperable."
  );
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_disponibilidad" &&
        event.status === "fallida" &&
        event.source === "hun_api"
    ),
    "Fallo HUN de disponibilidad debe registrar evento tecnico."
  );
}

async function assertAsyncAssignmentFailureNotifiesPatient() {
  agendaMode = "available";
  asignarMode = "throw";
  const flowToken = "flow_error_assignment";
  await identify(flowToken);
  const listed = await selectProcedureAndDate(flowToken);
  const slotToken = listed.data.slots[0].id;
  await handleFlow(flowPayload(flowToken, "SLOTS", { slot: slotToken }));
  const final = await handleFlow(flowPayload(flowToken, "CONFIRMAR"));

  assert(final.screen === "FINAL", "Confirmacion asincrona debe responder pantalla final.");
  await waitFor(
    () => sentMessages.some((message) => /problema al agendar/i.test(message.message)),
    "Fallo asincrono debe enviar WhatsApp al paciente."
  );
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "asignacion_cita" &&
        event.status === "fallida" &&
        event.source === "hun_api"
    ),
    "Fallo asincrono debe registrar evento tecnico no sensible."
  );
}

async function main() {
  await assertValidationErrorHasAction();
  await assertNoSlotsHasRetryAction();
  await assertHunAvailabilityFailureIsRecoverable();
  await assertAsyncAssignmentFailureNotifiesPatient();
  assertNoSensitiveEvents();
  console.log("Flow conversational error checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
