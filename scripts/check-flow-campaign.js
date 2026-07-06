process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 13).toString("base64");
process.env.CAMPAIGN_FLOW_TOKEN_SECRET_B64 = Buffer.alloc(32, 13).toString("base64");
delete process.env.FLOW_SESSION_PII_KEY_B64;
process.env.FLOW_MAX_SLOTS = "3";

const hun = require("../lib/hun");
const db = require("../lib/db");

const savedSessions = [];
const savedEvents = [];

hun.consultarCitasDocumento = async () => [
  {
    Nombre_Paciente: " PACIENTE CAMPANIA ",
    Cod_Eps: " HUN22 ",
  },
];

hun.getEspecialidades = async () => {
  throw new Error("El Flow de campania no debe consultar especialidades.");
};

hun.getAgendaPorEspecialidad = async (codEspecialidad) => [
  {
    codigo_medico: " CM590 ",
    fecha_atencion: "2027-08-10",
    hora_inicial: "10:30:00",
    nombre_medico: " MEDICO CAMPANIA ",
    nombre_especialidad: ` ESPECIALIDAD ${codEspecialidad} `,
    numero_consultorio: "404",
    tiempo_intervalo: "20",
    cups: [
      {
        agenda_detalle_id: "AD-CAMP-1",
        autogestionable: "si",
        codigo: "890301",
        descripcion: "Consulta campania",
      },
    ],
  },
];

db.guardarSesionTemporal = async (session) => {
  savedSessions.push(session);
};

db.guardarEventoOperativo = async (event) => {
  savedEvents.push(event);
};

db.finalizarSesionTemporal = async () => {};

const { createCampaignFlowToken, handleFlow } = require("../lib/flowHandler");

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

async function assertCampaignIdentificationSkipsSpecialty() {
  const flowToken = createCampaignFlowToken({
    campaign_id: "campaign-test",
    recipient_id: "recipient-test",
    audiencia_ref: "HUN-3040",
    especialidad_codigo: "590",
    expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
  });

  const response = await handleFlow(
    flowPayload(flowToken, "IDENTIFICACION", {
      tipo_documento: "CC",
      numero_documento: "123456",
    })
  );

  assert(
    response.screen === "SLOTS",
    `Flow de campania debe ir directo a SLOTS. Recibido: ${JSON.stringify(response)}`
  );
  assert(response.data.slots.length === 1, "Debe devolver slots de la especialidad de campania.");
  assert(
    response.data.slots[0].description === "Consulta campania",
    "Debe usar agenda HUN de la especialidad firmada."
  );

  const session = savedSessions.find(
    (item) => item.flow_token === flowToken && item.estado === "eligiendo_slot"
  );
  assert(session, "Debe guardar sesion temporal minima.");
  assert(session.especialidad_codigo === "590", "Debe persistir solo especialidad de campania.");
  assert(session.slot_token === null, "No debe persistir slot completo.");

  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_identificacion_campania" &&
        event.campaign_id === "campaign-test" &&
        event.recipient_id === "recipient-test" &&
        event.especialidad_codigo === "590"
    ),
    "Debe registrar evento operativo no sensible con contexto de campania."
  );
}

async function assertCampaignMissingTokenDoesNotUseSelfScheduling() {
  const response = await handleFlow(
    flowPayload("token-no-firmado", "IDENTIFICACION", {
      tipo_documento: "CC",
      numero_documento: "123456",
    })
  );

  assert(
    response.screen === "IDENTIFICACION",
    "Campania sin token firmado debe quedarse en identificacion."
  );
  assert(response.data.error_message, "Debe explicar que la oferta expiro o no esta disponible.");
}

async function main() {
  await assertCampaignIdentificationSkipsSpecialty();
  await assertCampaignMissingTokenDoesNotUseSelfScheduling();
  console.log("Campaign Flow checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
