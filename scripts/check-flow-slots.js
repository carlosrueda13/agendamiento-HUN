process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 7).toString("base64");
process.env.FLOW_MAX_SLOTS = "2";

const hun = require("../lib/hun");
const db = require("../lib/db");

const savedSessions = [];
const savedEvents = [];
let agendaMode = "mixed";

hun.consultarCitasDocumento = async () => [
  {
    Nombre_Paciente: " PACIENTE SLOT ",
    Cod_Eps: " HUN22 ",
  },
];

hun.getEspecialidades = async () => [
  { id: "21", title: "ANESTESIOLOGIA" },
  { id: "30", title: "CARDIOLOGIA" },
];

hun.getAgendaPorEspecialidad = async (codEspecialidad) => {
  if (agendaMode === "empty") {
    return [
      {
        codigo_medico: " ME999 ",
        fecha_atencion: "2026-08-01",
        hora_inicial: "10:00:00",
        nombre_medico: " MEDICO SIN CUPO ",
        nombre_especialidad: " ANESTESIOLOGIA ",
        numero_consultorio: "101",
        tiempo_intervalo: "20",
        cups: [
          {
            agenda_detalle_id: "A-0",
            autogestionable: "no",
            codigo: "890201",
            descripcion: "No autogestionable",
          },
        ],
      },
    ];
  }

  return [
    {
      codigo_medico: " ME002 ",
      fecha_atencion: "2026-08-02",
      hora_inicial: "09:00:00",
      nombre_medico: " MEDICO B ",
      nombre_especialidad: " ANESTESIOLOGIA ",
      numero_consultorio: "202",
      tiempo_intervalo: "30",
      cups: [
        {
          agenda_detalle_id: "A-2",
          autogestionable: "SI",
          codigo: "890202",
          descripcion: "Consulta B",
        },
        {
          agenda_detalle_id: "A-3",
          autogestionable: "no",
          codigo: "890203",
          descripcion: "No visible",
        },
      ],
    },
    {
      codigo_medico: " ME001 ",
      fecha_atencion: "2026-08-01",
      hora_inicial: "07:00:00",
      nombre_medico: " MEDICO A ",
      nombre_especialidad: " ANESTESIOLOGIA ",
      numero_consultorio: "101",
      tiempo_intervalo: "20",
      cups: [
        {
          agenda_detalle_id: "A-1",
          autogestionable: " si ",
          codigo: "890201",
          descripcion: "Consulta A",
        },
        {
          agenda_detalle_id: "A-4",
          autogestionable: "no",
          codigo: "890204",
          descripcion: "No visible por filtro",
        },
        {
          autogestionable: "si",
          codigo: "890205",
          descripcion: "Sin agenda_detalle_id",
        },
      ],
    },
  ].map((row) => ({
    ...row,
    nombre_especialidad: `${row.nombre_especialidad} ${codEspecialidad}`.trim(),
  }));
};

db.guardarSesionTemporal = async (session) => {
  savedSessions.push(session);
};

db.guardarEventoOperativo = async (event) => {
  savedEvents.push(event);
};

db.finalizarSesionTemporal = async () => {};

const { handleFlow } = require("../lib/flowHandler");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function flowPayload(flowToken, screen, data) {
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
  return handleFlow(
    flowPayload(flowToken, "ESPECIALIDAD", {
      especialidad: "21",
    })
  );
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
    assert(
      !serialized.includes(forbidden),
      `Sesion temporal no debe persistir dato de slot: ${forbidden}`
    );
  });
}

async function assertAutogestionableSlots() {
  const flowToken = "flow_slots_mixed";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);

  assert(response.screen === "SLOTS", "Debe avanzar a seleccion de slots.");
  assert(response.data.slots.length === 2, "Debe respetar FLOW_MAX_SLOTS.");

  const [first, second] = response.data.slots;
  assert(first.title.includes("01 ago 07:00"), "Slots deben ordenarse por fecha/hora.");
  assert(second.title.includes("02 ago 09:00"), "Segundo slot ordenado incorrectamente.");
  assert(first.description === "Consulta A", "Debe aplanar CUPS en opcion independiente.");
  assert(!JSON.stringify(response.data.slots).includes("No visible"), "No debe ofrecer cupos no autogestionables.");
  assert(
    /^slot_v1_[a-z0-9]+_[A-Za-z0-9_-]+$/.test(first.id),
    "slot_token debe tener formato opaco firmado."
  );

  const repeat = await selectSpecialty(flowToken);
  assert(
    repeat.data.slots[0].id === first.id,
    "slot_token debe poder regenerarse para la misma agenda vigente."
  );

  const eligiendoSlot = savedSessions.find(
    (session) => session.flow_token === flowToken && session.estado === "eligiendo_slot"
  );
  assert(eligiendoSlot, "Debe guardar sesion temporal al listar slots.");
  assert(eligiendoSlot.especialidad_codigo === "21", "Debe persistir especialidad minima.");
  assert(eligiendoSlot.slot_token === null, "No debe persistir slot antes de seleccion.");
  assertMinimalSessionPersistence(eligiendoSlot);

  const confirm = await handleFlow(flowPayload(flowToken, "SLOTS", { slot: first.id }));
  assert(confirm.screen === "CONFIRMAR", "Seleccion de slot debe avanzar a confirmar.");

  const confirmando = savedSessions.find(
    (session) => session.flow_token === flowToken && session.estado === "confirmando"
  );
  assert(confirmando, "Debe guardar sesion temporal al seleccionar slot.");
  assert(confirmando.slot_token === first.id, "Debe guardar solo el slot_token seleccionado.");
  assertMinimalSessionPersistence(confirmando);
}

async function assertNoSlotsIsRecoverable() {
  agendaMode = "empty";
  const flowToken = "flow_slots_empty";
  await identify(flowToken);
  const response = await selectSpecialty(flowToken);

  assert(response.screen === "ESPECIALIDAD", "Sin cupos debe volver a especialidad.");
  assert(response.data.error_message, "Sin cupos debe devolver error recuperable.");
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_especialidad" &&
        event.resultado_operativo === "sin_cupos"
    ),
    "Sin cupos debe registrar evento operativo no sensible."
  );
}

async function main() {
  await assertAutogestionableSlots();
  await assertNoSlotsIsRecoverable();
  console.log("Flow slot checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
