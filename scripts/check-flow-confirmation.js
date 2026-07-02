process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 9).toString("base64");
process.env.FLOW_MAX_SLOTS = "5";

const hun = require("../lib/hun");
const db = require("../lib/db");
const wa = require("../lib/whatsapp");

const savedSessions = [];
const savedEvents = [];
const sentMessages = [];
const assignedPayloads = [];
let agendaMode = "available";
let agendaCalls = 0;

function agendaRow({ autogestionable = "si", medico = "MEDICO FRESCO" } = {}) {
  return {
    codigo_medico: " ME777 ",
    fecha_atencion: "2026-08-05",
    hora_inicial: "08:00:00",
    nombre_medico: ` ${medico} `,
    nombre_especialidad: " ANESTESIOLOGIA ",
    numero_consultorio: "303",
    tiempo_intervalo: "25",
    cups: [
      {
        agenda_detalle_id: "AG-777",
        autogestionable,
        codigo: "890777",
        descripcion: "Consulta fresca",
      },
    ],
  };
}

hun.consultarCitasDocumento = async () => [
  {
    Nombre_Paciente: " PACIENTE CONFIRMACION ",
    Cod_Eps: " HUN22 ",
  },
];

hun.getEspecialidades = async () => [
  { id: "21", title: "ANESTESIOLOGIA" },
];

hun.getAgendaPorEspecialidad = async () => {
  agendaCalls += 1;
  if (agendaMode === "unavailable") {
    return [agendaRow({ autogestionable: "no", medico: "MEDICO NO VISIBLE" })];
  }
  return [agendaRow()];
};

hun.asignarCita = async (payload) => {
  assignedPayloads.push(payload);
  return {
    success: true,
    soap: {
      descripcion: "Cita 1534700 asignada correctamente",
    },
  };
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

async function identifyAndList(flowToken) {
  await handleFlow(
    flowPayload(flowToken, "IDENTIFICACION", {
      tipo_documento: "CC",
      numero_documento: "123456",
      correo: "paciente@example.com",
    })
  );
  return handleFlow(flowPayload(flowToken, "ESPECIALIDAD", { especialidad: "21" }));
}

async function waitFor(predicate, message) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function assertNoSensitiveEventPayloads() {
  const serialized = JSON.stringify(savedEvents);
  [
    "1534700",
    "PACIENTE CONFIRMACION",
    "AG-777",
    "ME777",
    "2026-08-05",
    "08:00:00",
    "890777",
  ].forEach((forbidden) => {
    assert(
      !serialized.includes(forbidden),
      `Eventos operativos no deben persistir dato sensible: ${forbidden}`
    );
  });
}

async function assertConfirmRequeriesAndAssignsFreshSlot() {
  const flowToken = "flow_confirm_success";
  const listed = await identifyAndList(flowToken);
  const slotToken = listed.data.slots[0].id;

  const summary = await handleFlow(flowPayload(flowToken, "SLOTS", { slot: slotToken }));
  assert(summary.screen === "CONFIRMAR", "Seleccion vigente debe mostrar confirmacion.");
  assert(summary.data.resumen.includes("MEDICO FRESCO"), "Resumen debe usar datos frescos de HUN.");

  const beforeConfirmAgendaCalls = agendaCalls;
  const final = await handleFlow(flowPayload(flowToken, "CONFIRMAR"));
  assert(final.screen === "FINAL", "Confirmacion valida debe responder pantalla final.");
  assert(
    agendaCalls > beforeConfirmAgendaCalls,
    "CONFIRMAR debe reconsultar HUN antes de asignar."
  );

  await waitFor(
    () => assignedPayloads.length === 1 && sentMessages.length === 1,
    "Asignacion asincrona no termino."
  );

  assert(assignedPayloads[0].agenda_detalle_id === "AG-777", "Debe asignar con agenda fresca.");
  assert(assignedPayloads[0].eps === "HUN22", "Debe validar EPS antes de asignar.");
  assert(sentMessages[0].message.includes("Tu cita quedo agendada."), "Debe confirmar por WhatsApp.");
  assert(sentMessages[0].message.includes("1534700"), "Numero de cita solo debe enviarse al paciente.");
  assertNoSensitiveEventPayloads();
}

async function assertExpiredSlotIsRecoverable() {
  const flowToken = "flow_confirm_expired";
  agendaMode = "available";
  const listed = await identifyAndList(flowToken);
  const slotToken = listed.data.slots[0].id;
  const summary = await handleFlow(flowPayload(flowToken, "SLOTS", { slot: slotToken }));
  assert(summary.screen === "CONFIRMAR", "Seleccion inicial debe ser valida.");

  agendaMode = "unavailable";
  const response = await handleFlow(flowPayload(flowToken, "CONFIRMAR"));
  assert(
    response.screen === "ESPECIALIDAD" || response.screen === "SLOTS",
    "Slot vencido debe devolver una pantalla recuperable."
  );
  assert(
    /cupo ya no esta disponible/i.test(response.data.error_message),
    "Slot vencido debe explicar que el cupo ya no esta disponible."
  );
  assert(
    assignedPayloads.length === 1,
    "Slot vencido no debe disparar una nueva asignacion."
  );
}

async function main() {
  await assertConfirmRequeriesAndAssignsFreshSlot();
  await assertExpiredSlotIsRecoverable();
  console.log("Flow confirmation checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
