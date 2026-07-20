process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 11).toString("base64");
process.env.FLOW_MAX_SLOTS = "2";

const fs = require("fs");
const path = require("path");
const hun = require("../lib/hun");
const db = require("../lib/db");

const savedSessions = [];
const savedEvents = [];
let agendaMode = "mixed";

hun.consultarCitasDocumento = async () => [
  { Nombre_Paciente: " PACIENTE SLOT ", Cod_Eps: " HUN22 " },
];

hun.getEspecialidades = async () => [
  { id: "21", title: "ANESTESIOLOGIA" },
  { id: "30", title: "CARDIOLOGIA" },
];

function agendaSlot({ date, time, detailId, code, description, auto = "si" }) {
  return {
    codigo_medico: `ME-${detailId}`,
    fecha_atencion: date,
    hora_inicial: time,
    nombre_medico: `MEDICO ${detailId}`,
    nombre_especialidad: "ANESTESIOLOGIA",
    numero_consultorio: "101",
    tiempo_intervalo: "20",
    cups: [
      {
        agenda_detalle_id: detailId,
        autogestionable: auto,
        codigo: code,
        descripcion: description,
      },
    ],
  };
}

hun.getAgendaPorEspecialidad = async () => {
  if (agendaMode === "catalog-null") {
    return [
      agendaSlot({
        date: "2026-08-10",
        time: "08:00:00",
        detailId: "DERMA-1",
        code: "890242",
        description: null,
      }),
      agendaSlot({
        date: "2026-08-11",
        time: "09:00:00",
        detailId: "DERMA-2",
        code: "890342",
        description: null,
      }),
    ];
  }

  if (agendaMode === "unknown-null") {
    return [
      agendaSlot({
        date: "2026-08-12",
        time: "10:00:00",
        detailId: "UNKNOWN",
        code: "ZZZZZZ",
        description: null,
      }),
    ];
  }

  if (agendaMode === "empty") {
    return [
      agendaSlot({
        date: "2026-08-01",
        time: "10:00:00",
        detailId: "EMPTY",
        code: "890999",
        description: "No visible",
        auto: "no",
      }),
    ];
  }

  return [
    agendaSlot({
      date: "2026-07-01",
      time: "07:00:00",
      detailId: "PAST",
      code: "890201",
      description: "Consulta A",
    }),
    agendaSlot({
      date: "2026-08-01",
      time: "07:00:00",
      detailId: "A1",
      code: "890201",
      description: "Consulta A",
    }),
    agendaSlot({
      date: "2026-08-01",
      time: "08:00:00",
      detailId: "A2",
      code: "890201",
      description: "Consulta A",
    }),
    agendaSlot({
      date: "2026-08-01",
      time: "09:00:00",
      detailId: "A3",
      code: "890201",
      description: "Consulta A",
    }),
    agendaSlot({
      date: "2026-08-02",
      time: "10:00:00",
      detailId: "A4",
      code: "890201",
      description: "Consulta A",
    }),
    agendaSlot({
      date: "2026-08-03",
      time: "11:00:00",
      detailId: "B1",
      code: "890202",
      description: "Consulta B",
    }),
    agendaSlot({
      date: "2026-08-03",
      time: "11:30:00",
      detailId: "MALFORMED",
      code: undefined,
      description: "Registro sin CUPS",
    }),
    agendaSlot({
      date: "2026-08-04",
      time: "12:00:00",
      detailId: "NOAUTO",
      code: "890203",
      description: "No visible",
      auto: "no",
    }),
  ];
};

db.guardarSesionTemporal = async (session) => savedSessions.push(session);
db.guardarEventoOperativo = async (event) => savedEvents.push(event);
db.finalizarSesionTemporal = async () => {};

const { handleFlow } = require("../lib/flowHandler");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flowPayload(flowToken, screen, data = {}) {
  return { action: "data_exchange", screen, flow_token: flowToken, version: "7.3", data };
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

function assertMinimalSessionPersistence(session) {
  const serialized = JSON.stringify(session);
  [
    "agenda_detalle_id",
    "codigo_medico",
    "consultorio",
    "fecha",
    "hora",
    "procedimiento",
    "tiempo_atencion",
    "medico",
    "descripcion",
    "cups",
  ].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `Sesion temporal contiene ${forbidden}.`);
  });
}

function assertPublishedFlowContract() {
  const flow = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "flow-agendamiento.json"), "utf8")
  );
  const ids = flow.screens.map((screen) => screen.id);
  assert(
    ids.join(">") === "IDENTIFICACION>ESPECIALIDAD>PROCEDIMIENTO>FECHA>SLOTS>CONFIRMAR>FINAL",
    "El JSON debe separar procedimiento, fecha y hora."
  );
  assert(flow.routing_model.ESPECIALIDAD.includes("PROCEDIMIENTO"), "Falta ruta a procedimiento.");
  assert(flow.routing_model.PROCEDIMIENTO.includes("FECHA"), "Falta ruta a fecha.");
  assert(flow.routing_model.FECHA.includes("SLOTS"), "Falta ruta a horarios.");
  const procedure = flow.screens.find((screen) => screen.id === "PROCEDIMIENTO");
  assert(
    !/cups|890201/i.test(JSON.stringify(procedure.data.procedimientos.__example__)),
    "El ejemplo visible no debe exponer el codigo CUPS."
  );
}

async function assertProcedureDateAndTimeSelection() {
  const flowToken = "flow_slots_grouped";
  await identify(flowToken);
  const procedures = await selectSpecialty(flowToken);

  assert(procedures.screen === "PROCEDIMIENTO", "Especialidad debe abrir procedimientos.");
  assert(procedures.data.procedimientos.length === 2, "Debe deduplicar por CUPS interno.");
  assert(
    procedures.data.procedimientos.map((item) => item.title).join("|") === "Consulta A|Consulta B",
    "Solo debe mostrar nombres de procedimiento ordenados."
  );
  assert(!JSON.stringify(procedures.data).includes("890201"), "No debe exponer CUPS.");
  assert(
    /^procedure_v1_[a-z0-9]+_[A-Za-z0-9_-]+$/.test(procedures.data.procedimientos[0].id),
    "El procedimiento debe usar token opaco firmado."
  );

  const procedureToken = procedures.data.procedimientos[0].id;
  const dates = await handleFlow(
    flowPayload(flowToken, "PROCEDIMIENTO", { procedimiento_token: procedureToken })
  );
  assert(dates.screen === "FECHA", "Procedimiento debe abrir fechas.");
  assert(dates.data.fechas.length === 2, "Debe mostrar todos los dias del procedimiento.");
  assert(
    dates.data.fechas[0].description === "3 horarios disponibles",
    "La fecha debe indicar cuantos horarios contiene."
  );
  assert(
    /^date_v1_[a-z0-9]+_[A-Za-z0-9_-]+$/.test(dates.data.fechas[0].id),
    "La fecha debe usar token opaco firmado."
  );

  const repeatedDates = await handleFlow(
    flowPayload(flowToken, "PROCEDIMIENTO", { procedimiento_token: procedureToken })
  );
  assert(
    repeatedDates.data.fechas[0].id === dates.data.fechas[0].id,
    "Los tokens deben regenerarse de forma deterministica al reconsultar HUN."
  );

  const slots = await handleFlow(
    flowPayload(flowToken, "FECHA", { fecha_token: dates.data.fechas[0].id })
  );
  assert(slots.screen === "SLOTS", "Fecha debe abrir horarios.");
  assert(slots.data.slots.length === 3, "El limite global anterior no debe ocultar horas del dia.");
  assert(slots.data.slots[0].title.startsWith("07:00"), "Debe mostrar primero la hora.");
  assert(slots.data.slots.every((slot) => !slot.title.includes("02 ago")), "No debe mezclar dias.");
  assert(slots.data.procedimiento_seleccionado.includes("Consulta A"), "Debe recordar procedimiento.");

  const confirm = await handleFlow(
    flowPayload(flowToken, "SLOTS", { slot: slots.data.slots[0].id })
  );
  assert(confirm.screen === "CONFIRMAR", "Horario vigente debe avanzar a confirmar.");

  for (const persisted of savedSessions) assertMinimalSessionPersistence(persisted);
  const serializedEvents = JSON.stringify(savedEvents);
  assert(!serializedEvents.includes("890201"), "Los eventos no deben guardar CUPS.");
  assert(!serializedEvents.includes("2026-08-01"), "Los eventos no deben guardar fechas.");
}

async function assertNoProceduresIsRecoverable() {
  agendaMode = "empty";
  const flowToken = "flow_slots_empty";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);
  assert(response.screen === "ESPECIALIDAD", "Sin procedimientos debe volver a especialidad.");
  assert(response.data.error_message, "Debe devolver un error recuperable.");
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_especialidad" &&
        event.resultado_operativo === "sin_procedimientos"
    ),
    "Debe registrar solo el resultado agregado sin procedimientos."
  );
}

async function assertCatalogResolvesNullHunDescriptions() {
  agendaMode = "catalog-null";
  const flowToken = "flow_slots_catalog_null";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);
  assert(response.screen === "PROCEDIMIENTO", "Debe resolver nombres desde catalogo.");
  assert(
    response.data.procedimientos.map((item) => item.title).join("|") ===
      [
        "CONSULTA DE CONTROL O DE SEGUIMIENTO POR ESPECIALISTA EN DERMATOLOGÍA",
        "CONSULTA DE PRIMERA VEZ POR ESPECIALISTA EN DERMATOLOGÍA",
      ].join("|"),
    "Debe mostrar los nombres oficiales de ambos procedimientos."
  );
  assert(
    !JSON.stringify(response).includes("Procedimiento disponible"),
    "No debe mostrar el fallback generico."
  );
  assert(
    !JSON.stringify(response).includes("catalogo_cups"),
    "El Flow no debe exponer la fuente de la descripcion."
  );
  for (const persisted of savedSessions) assertMinimalSessionPersistence(persisted);
  assert(
    !JSON.stringify(savedEvents).includes("catalogo_cups"),
    "Los eventos no deben guardar la fuente de la descripcion."
  );
}

async function assertUnknownProceduresAreOmitted() {
  agendaMode = "unknown-null";
  const flowToken = "flow_slots_unknown_null";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);
  assert(response.screen === "ESPECIALIDAD", "CUPS sin nombre debe ser recuperable.");
  assert(
    response.data.error_message.includes("no informo los nombres"),
    "Debe explicar que HUN no entrego nombres resolubles."
  );
  assert(
    savedEvents.some(
      (event) =>
        event.resultado_operativo === "sin_procedimientos" &&
        event.motivo_fallo_simple === "nombres_procedimiento_no_disponibles" &&
        event.conteo_resultados?.procedimientos_omitidos_sin_nombre === 1
    ),
    "Debe registrar solo el conteo agregado de opciones omitidas."
  );
  assert(!JSON.stringify(savedEvents).includes("ZZZZZZ"), "El evento no debe guardar CUPS.");
}

async function main() {
  assertPublishedFlowContract();
  await assertProcedureDateAndTimeSelection();
  await assertNoProceduresIsRecoverable();
  await assertCatalogResolvesNullHunDescriptions();
  await assertUnknownProceduresAreOmitted();
  console.log("Flow procedure/date/slot checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
