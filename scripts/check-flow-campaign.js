process.env.FLOW_SLOT_TOKEN_SECRET_B64 = Buffer.alloc(32, 13).toString("base64");
process.env.CAMPAIGN_FLOW_TOKEN_SECRET_B64 = Buffer.alloc(32, 13).toString("base64");
delete process.env.FLOW_SESSION_PII_KEY_B64;
process.env.FLOW_MAX_SLOTS = "3";

const hun = require("../lib/hun");
const db = require("../lib/db");
const wa = require("../lib/whatsapp");

const savedSessions = [];
const savedEvents = [];
const sentMessages = [];

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

hun.asignarCita = async () => ({
  success: true,
  soap: {
    descripcion: "Cita 1534701 asignada correctamente",
  },
});

wa.sendText = async (to, message) => {
  sentMessages.push({ to, message });
};

db.guardarSesionTemporal = async (session) => {
  savedSessions.push(session);
};

db.guardarEventoOperativo = async (event) => {
  savedEvents.push(event);
};

db.finalizarSesionTemporal = async () => {};
db.getContactoEmailSesion = async () => null;

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

async function waitFor(predicate, message) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

async function assertCampaignIdentificationSkipsSpecialty() {
  const flowToken = createCampaignFlowToken({
    campaign_id: "campaign-test",
    recipient_id: "recipient-test",
    audiencia_ref: "HUN-3040",
    especialidad_codigo: "590",
    contacto_email: "PACIENTE.CAMPANIA@example.com",
    contacto_telefono: "573001112233",
    expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
  });
  assert(
    !flowToken.includes("PACIENTE.CAMPANIA") &&
      !flowToken.includes("paciente.campania") &&
      !flowToken.includes("573001112233"),
    "El correo y telefono de campania no deben viajar en claro en el flow_token."
  );

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
    session.contacto_email === "paciente.campania@example.com",
    "Debe recuperar correo de campania cifrado en token para guardarlo como contacto transitorio."
  );
  assert(
    session.whatsapp_numero === undefined,
    "No debe persistir telefono de campania en Supabase."
  );

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

  const summary = await handleFlow(
    flowPayload(flowToken, "SLOTS", { slot: response.data.slots[0].id })
  );
  assert(summary.screen === "CONFIRMAR", "Debe permitir seleccionar slot de campania.");
  const final = await handleFlow(flowPayload(flowToken, "CONFIRMAR"));
  assert(final.screen === "FINAL", "Debe confirmar Flow de campania.");
  await waitFor(
    () => sentMessages.length === 1,
    "Debe enviar confirmacion WhatsApp de campania."
  );
  assert(
    sentMessages[0].to === "573001112233",
    "Confirmacion de campania debe enviarse al telefono cifrado en el token, no al flow_token."
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
