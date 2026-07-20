process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 13).toString("base64");
process.env.FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE = "true";
process.env.FLOW_E2E_CANCEL_AFTER_ASSIGN = "true";
process.env.FLOW_E2E_TEST_DOCUMENTS = "41531776";

const hun = require("../lib/hun");
const db = require("../lib/db");
const wa = require("../lib/whatsapp");

const savedSessions = [];
const savedEvents = [];
const sentMessages = [];
const assignedPayloads = [];
const cancelledCitas = [];

hun.consultarCitasDocumento = async () => [
  {
    Nombre_Paciente: " PACIENTE WAIVER ",
    Cod_Eps: " HUN22 ",
  },
];

hun.getEspecialidades = async () => [
  { id: "590", title: "PSIQUIATRIA" },
];

hun.getAgendaPorEspecialidad = async () => [
  {
    codigo_medico: " ME590 ",
    fecha_atencion: "2026-10-20",
    hora_inicial: "07:00:00",
    nombre_medico: " MEDICO WAIVER ",
    nombre_especialidad: " PSIQUIATRIA ",
    numero_consultorio: "501",
    tiempo_intervalo: "30",
    cups: [
      {
        agenda_detalle_id: "AG-WAIVER",
        autogestionable: "no",
        codigo: "890590",
        descripcion: "Consulta waiver",
      },
    ],
  },
];

hun.asignarCita = async (payload) => {
  assignedPayloads.push(payload);
  return {
    success: true,
    soap: {
      descripcion: "Cita 222222 asignada correctamente",
    },
  };
};

hun.cancelarCita = async (numeroCita) => {
  cancelledCitas.push(numeroCita);
  return { success: true };
};

wa.sendText = async (to, message) => {
  sentMessages.push({ to, message });
};

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

async function identify(flowToken, documento) {
  return handleFlow(
    flowPayload(flowToken, "IDENTIFICACION", {
      tipo_documento: "CC",
      numero_documento: documento,
      correo: "paciente@example.com",
    })
  );
}

async function selectSpecialty(flowToken) {
  return handleFlow(flowPayload(flowToken, "ESPECIALIDAD", { especialidad: "590" }));
}

async function selectProcedureAndDate(flowToken) {
  const procedures = await selectSpecialty(flowToken);
  assert(procedures.screen === "PROCEDIMIENTO", "Debe listar procedimientos en modo waiver.");
  const dates = await handleFlow(
    flowPayload(flowToken, "PROCEDIMIENTO", {
      procedimiento_token: procedures.data.procedimientos[0].id,
    })
  );
  assert(dates.screen === "FECHA", "Debe listar fechas en modo waiver.");
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

function assertNoSensitivePersistence() {
  const serialized = JSON.stringify({ savedEvents, savedSessions });
  [
    "222222",
    "PACIENTE WAIVER",
    "AG-WAIVER",
    "ME590",
    "2026-10-20",
    "07:00:00",
    "890590",
  ].forEach((forbidden) => {
    assert(
      !serialized.includes(forbidden),
      `No debe persistirse dato sensible en sesiones/eventos: ${forbidden}`
    );
  });
}

async function assertUnauthorizedDocumentDoesNotBypass() {
  const flowToken = "flow_waiver_denied";
  await identify(flowToken, "99999999");
  const response = await selectSpecialty(flowToken);

  assert(response.screen === "ESPECIALIDAD", "Documento no autorizado debe volver a especialidad.");
  assert(response.data.error_message, "Documento no autorizado no debe ver slots no autogestionables.");
}

async function assertAllowedDocumentAssignsAndCancels() {
  const flowToken = "flow_waiver_allowed";
  await identify(flowToken, "41531776");
  const listed = await selectProcedureAndDate(flowToken);

  assert(listed.screen === "SLOTS", "Documento autorizado debe ver slots en modo waiver.");
  assert(listed.data.slots.length === 1, "Debe exponer el cupo no autogestionable solo en waiver.");

  await handleFlow(flowPayload(flowToken, "SLOTS", { slot: listed.data.slots[0].id }));
  const final = await handleFlow(flowPayload(flowToken, "CONFIRMAR"));

  assert(final.screen === "FINAL", "Confirmacion debe responder pantalla final.");
  await waitFor(
    () => assignedPayloads.length === 1 && cancelledCitas.length === 1,
    "La asignacion/cancelacion e2e no termino."
  );

  assert(cancelledCitas[0] === 222222, "Debe cancelar en memoria el numero de cita creado.");
  assert(
    sentMessages.some((message) => /cancelada automaticamente/i.test(message.message)),
    "Debe notificar cancelacion automatica de prueba."
  );
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "cancelacion_e2e" &&
        event.status === "exitosa" &&
        event.resultado_operativo === "cita_prueba_cancelada"
    ),
    "Debe registrar cancelacion e2e sin numero de cita."
  );
}

async function main() {
  await assertUnauthorizedDocumentDoesNotBypass();
  await assertAllowedDocumentAssignsAndCancels();
  assertNoSensitivePersistence();
  console.log("Flow E2E waiver checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
