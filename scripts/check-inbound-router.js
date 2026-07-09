const {
  ACTIONS,
  buildRejectText,
  formatAppointmentsMessage,
  handleIncomingMessage,
  parseDocumentInput,
} = require("../lib/inboundRouter");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function textMessage(body) {
  return {
    from: "573001112233",
    type: "text",
    text: { body },
  };
}

function buttonMessage(id) {
  return {
    from: "573001112233",
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id, title: id },
    },
  };
}

function createDeps() {
  const sent = [];
  const sessions = new Map();
  let flowCount = 0;
  const deps = {
    sessions,
    now: () => 1000,
    nowDate: () => new Date("2026-07-08T12:00:00"),
    phoneLine: "(601) 3904888 atencion al usuario",
    whatsapp: {
      sendText: async (to, text) => {
        sent.push({ to, type: "text", text });
      },
      sendInteractiveButtons: async (payload) => {
        sent.push({ type: "buttons", ...payload });
      },
    },
    hun: {
      consultarCitasDocumento: async (tipo, documento) => {
        assert(tipo === "CC", "Debe consultar con tipo de documento recibido.");
        assert(documento === "123456", "Debe consultar con documento recibido.");
        return [
          {
            Fecha_Cita: "2026-07-09",
            Hora_Cita: "08:30:00",
            Nombre_Especialidad: "Dermatologia",
            Nombre_Medico: "Profesional Prueba",
            Estado: "Asignada",
          },
          {
            Fecha_Cita: "2026-07-01",
            Hora_Cita: "10:00:00",
            Nombre_Especialidad: "Historica",
          },
        ];
      },
    },
    sendFlowMessage: async (to) => {
      flowCount += 1;
      sent.push({ to, type: "flow" });
    },
  };

  return {
    deps,
    sent,
    sessions,
    getFlowCount: () => flowCount,
  };
}

async function assertMenuAndScheduleFlow() {
  const { deps, sent, sessions, getFlowCount } = createDeps();

  await handleIncomingMessage(textMessage("hola"), deps);
  assert(sent[0].type === "buttons", "Primer mensaje debe enviar menu.");
  assert(
    sent[0].buttons.some((button) => button.id === "INTAKE_MENU_AGENDAR"),
    "Menu debe incluir agendar cita."
  );

  await handleIncomingMessage(buttonMessage("INTAKE_MENU_AGENDAR"), deps);
  assert(sent[1].type === "buttons", "Seleccion debe pedir consentimiento.");
  assert(
    sessions.get("573001112233").action === ACTIONS.SCHEDULE,
    "Sesion debe conservar accion elegida solo en memoria."
  );

  await handleIncomingMessage(buttonMessage("INTAKE_CONSENT_ACCEPT"), deps);
  assert(getFlowCount() === 1, "Aceptar consentimiento debe enviar Flow.");
  assert(!sessions.has("573001112233"), "Agendar debe limpiar sesion efimera.");
}

async function assertRejectConsent() {
  const { deps, sent, sessions } = createDeps();
  await handleIncomingMessage(buttonMessage("INTAKE_MENU_CONSULTAR"), deps);
  await handleIncomingMessage(buttonMessage("INTAKE_CONSENT_REJECT"), deps);

  assert(!sessions.has("573001112233"), "Rechazo debe limpiar sesion.");
  assert(
    sent.at(-1).text === buildRejectText("(601) 3904888 atencion al usuario"),
    "Rechazo debe enviar mensaje aprobado con linea telefonica."
  );
}

async function assertConsultAppointments() {
  const { deps, sent, sessions } = createDeps();
  await handleIncomingMessage(buttonMessage("INTAKE_MENU_CONSULTAR"), deps);
  await handleIncomingMessage(buttonMessage("INTAKE_CONSENT_ACCEPT"), deps);
  assert(
    sessions.get("573001112233").step === "awaiting_document",
    "Consulta aceptada debe pedir documento."
  );

  await handleIncomingMessage(textMessage("CC 123456"), deps);
  assert(!sessions.has("573001112233"), "Consulta debe limpiar sesion al terminar.");
  const response = sent.at(-1).text;
  assert(/Dermatologia/.test(response), "Debe listar cita proxima desde HUN.");
  assert(!/123456/.test(response), "No debe devolver documento en el mensaje.");
  assert(!/Historica/.test(response), "No debe listar citas pasadas.");
}

async function assertModifyCancelEntryPoint() {
  const { deps, sent } = createDeps();
  await handleIncomingMessage(buttonMessage("INTAKE_MENU_CANCELAR"), deps);
  await handleIncomingMessage(buttonMessage("INTAKE_CONSENT_ACCEPT"), deps);
  await handleIncomingMessage(textMessage("CC 123456"), deps);

  assert(
    sent.some((message) => /modificacion o cancelacion por WhatsApp/.test(message.text || "")),
    "Modificar/cancelar debe avisar que el flujo completo queda en CANCEL-001."
  );
}

function assertHelpers() {
  assert(parseDocumentInput("CC 123.456").documento === "123456", "Debe normalizar documento.");
  assert(parseDocumentInput("xx 123456") === null, "Debe rechazar tipo invalido.");
  assert(
    /No encontramos citas proximas/.test(formatAppointmentsMessage([], new Date("2026-07-08"))),
    "Sin citas debe responder mensaje recuperable."
  );
}

async function main() {
  assertHelpers();
  await assertMenuAndScheduleFlow();
  await assertRejectConsent();
  await assertConsultAppointments();
  await assertModifyCancelEntryPoint();
  console.log("Inbound router checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
