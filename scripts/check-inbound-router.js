process.env.FLOW_SESSION_PII_KEY_B64 = Buffer.alloc(32, 17).toString("base64");

const {
  ACTIONS,
  DOCUMENT_TYPE_OPTIONS,
  buildRejectText,
  formatAppointmentsMessage,
  handleIncomingMessage,
  parseDocumentNumber,
  parseDocumentType,
  parseDocumentInput,
} = require("../lib/inboundRouter");
const {
  _private: { buildInteractiveListPayload },
} = require("../lib/whatsapp");

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

function listMessage(id) {
  return {
    from: "573001112233",
    type: "interactive",
    interactive: {
      type: "list_reply",
      list_reply: { id, title: id },
    },
  };
}

function createDeps() {
  const sent = [];
  const sessions = new Map();
  let flowCount = 0;
  let rescheduleFlowCount = 0;
  let cancelCount = 0;
  let lastCanceled = null;
  const events = [];
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
      sendInteractiveList: async (payload) => {
        sent.push({ type: "list", ...payload });
      },
    },
    hun: {
      consultarCitasDocumento: async (tipo, documento) => {
        assert(tipo === "CC", "Debe consultar con tipo de documento recibido.");
        assert(documento === "123456", "Debe consultar con documento recibido.");
        return [
          {
            Numero_Cita: "111111",
            Cita_Fecha: "Fri, 17 Jul 2026 00:00:00 GMT",
            Hora_Cita: "08:30:00",
            Especialidad: "Dermatologia",
            Medico: "Profesional Prueba",
            Procedimiento: "Consulta dermatologia",
            ESTADO: "Reservada",
          },
          {
            Numero_Cita: "222222",
            Fecha_Cita: "2026-07-01",
            Hora_Cita: "10:00:00",
            Nombre_Especialidad: "Historica",
          },
          {
            Numero_Cita: "333333",
            Fecha_Cita: "2026-07-10",
            Hora_Cita: "11:00:00",
            Nombre_Especialidad: "No cancelable",
            Estado: "Atendida",
          },
          {
            Numero_Cita: "444444",
            Fecha_Cita: "2026-07-12",
            Hora_Cita: "12:00:00",
            Nombre_Especialidad: "Cita cancelada futura",
            Estado: "Cancelada",
          },
        ];
      },
      cancelarCita: async (cita, tipoDocumento, documento) => {
        assert(tipoDocumento === "CC", "Debe cancelar con tipo de documento en memoria.");
        assert(documento === "123456", "Debe cancelar con documento en memoria.");
        cancelCount += 1;
        lastCanceled = cita;
        return { ok: true };
      },
    },
    db: {
      guardarEventoOperativo: async (evento) => {
        events.push(evento);
      },
    },
    sendFlowMessage: async (to) => {
      flowCount += 1;
      sent.push({ to, type: "flow" });
    },
    sendRescheduleFlow: async (to, flowToken) => {
      rescheduleFlowCount += 1;
      sent.push({ to, type: "reschedule_flow", flowToken });
    },
    rescheduleHandler: {
      createFlowSession: () => "reschedule_test_token",
      hasOperation: () => false,
    },
  };

  return {
    deps,
    sent,
    sessions,
    events,
    getFlowCount: () => flowCount,
    getRescheduleFlowCount: () => rescheduleFlowCount,
    getCancelCount: () => cancelCount,
    getLastCanceled: () => lastCanceled,
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
    sessions.get("573001112233").step === "awaiting_document_type",
    "Consulta aceptada debe pedir primero el tipo de documento."
  );
  assert(sent.at(-1).type === "list", "Tipo de documento debe presentarse como lista.");
  assert(sent.at(-1).rows.length === 6, "La lista debe incluir los seis tipos soportados.");
  assert(
    sent.at(-1).rows.some((row) => row.title === "Pasaporte"),
    "La lista debe mostrar el nombre completo Pasaporte."
  );

  await handleIncomingMessage(listMessage("INTAKE_DOC_CC"), deps);
  assert(
    sessions.get("573001112233").step === "awaiting_document_number",
    "Despues del tipo debe pedir el numero en un segundo mensaje."
  );
  assert(/Cédula de ciudadanía/.test(sent.at(-1).text), "Debe confirmar el tipo elegido.");

  await handleIncomingMessage(textMessage("123456"), deps);
  assert(!sessions.has("573001112233"), "Consulta debe limpiar sesion al terminar.");
  const response = sent.at(-1).text;
  assert(/Dermatologia/.test(response), "Debe listar cita proxima desde HUN.");
  assert(/Reservada/.test(response), "Debe mostrar el estado reservado.");
  assert(!/123456/.test(response), "No debe devolver documento en el mensaje.");
  assert(!/Historica/.test(response), "No debe listar citas pasadas.");
  assert(!/Atendida/.test(response), "No debe listar citas atendidas.");
  assert(!/Cita cancelada futura/.test(response), "No debe listar citas canceladas.");
}

async function assertModifyCancelEntryPoint() {
  const { deps, sent, sessions, events, getCancelCount, getLastCanceled } = createDeps();
  await handleIncomingMessage(buttonMessage("INTAKE_MENU_CANCELAR"), deps);
  await handleIncomingMessage(buttonMessage("INTAKE_CONSENT_ACCEPT"), deps);
  assert(
    sessions.get("573001112233").step === "awaiting_modify_cancel_choice",
    "Modificar/cancelar debe separar ambas acciones despues del consentimiento."
  );
  assert(
    sent.at(-1).buttons.some((button) => button.id === "INTAKE_CANCEL_APPOINTMENT"),
    "Debe ofrecer la opcion explicita de cancelar."
  );
  await handleIncomingMessage(buttonMessage("INTAKE_CANCEL_APPOINTMENT"), deps);
  assert(sent.at(-1).type === "list", "Cancelar debe pedir el tipo como lista.");
  await handleIncomingMessage(listMessage("INTAKE_DOC_CC"), deps);
  await handleIncomingMessage(textMessage("123456"), deps);

  assert(
    sent.some((message) => /Estas son las citas que puedes cancelar/.test(message.text || "")),
    "Modificar/cancelar debe listar citas cancelables."
  );
  assert(
    sent.some((message) =>
      Array.isArray(message.buttons) &&
      message.buttons.some((button) => button.id === "CANCEL_SELECT_0")
    ),
    "Modificar/cancelar debe presentar botones de seleccion."
  );
  assert(
    !sent.some((message) => /Atendida/.test(message.text || "")),
    "No debe listar citas no cancelables."
  );
  assert(
    sessions.get("573001112233").step === "awaiting_cancel_selection",
    "Debe esperar seleccion de cita antes de cancelar."
  );

  await handleIncomingMessage(buttonMessage("CANCEL_SELECT_0"), deps);
  assert(
    sent.at(-1).buttons.some((button) => button.id === "CANCEL_CONFIRM_YES"),
    "Debe pedir confirmacion explicita antes de llamar HUN."
  );
  assert(getCancelCount() === 0, "No debe cancelar antes de confirmar.");

  await handleIncomingMessage(buttonMessage("CANCEL_CONFIRM_YES"), deps);
  assert(getCancelCount() === 1, "Debe llamar HUN una sola vez al confirmar.");
  assert(getLastCanceled() === "111111", "Debe cancelar la cita seleccionada en memoria.");
  assert(!sessions.has("573001112233"), "Debe limpiar contexto efimero al solicitar cancelacion.");
  assert(
    events.some((event) => event.status === "cancelacion_procesando"),
    "Debe registrar evento operativo no sensible de cancelacion en proceso."
  );
}

async function assertRescheduleEntryPoint() {
  const { deps, sent, sessions, getRescheduleFlowCount } = createDeps();
  await handleIncomingMessage(buttonMessage("INTAKE_MENU_CANCELAR"), deps);
  await handleIncomingMessage(buttonMessage("INTAKE_CONSENT_ACCEPT"), deps);
  await handleIncomingMessage(buttonMessage("INTAKE_MODIFY_APPOINTMENT"), deps);

  assert(getRescheduleFlowCount() === 1, "Modificar debe enviar el tercer Flow.");
  assert(
    sent.at(-1).flowToken === "reschedule_test_token",
    "El Flow debe usar token opaco de reagendamiento."
  );
  assert(!sessions.has("573001112233"), "Debe limpiar la sesion de menu al abrir el Flow.");
}

async function assertLostCancellationContext() {
  const { deps, sent, events } = createDeps();
  const finalized = [];
  deps.db.getOperacionCancelacionActivaPorSesion = async () => ({
    cancel_operation_id: "c".repeat(64),
    estado: "cancelacion_procesando",
  });
  deps.db.finalizarOperacionCancelacion = async (id, estado, extra) => {
    finalized.push({ id, estado, extra });
  };
  deps.cancellationVerifier = {
    hasOperation: () => false,
  };

  const result = await handleIncomingMessage(textMessage("hola"), deps);
  assert(result.step === "cancel_context_lost", "Debe detectar contexto perdido.");
  assert(finalized[0].estado === "cancelacion_fallida", "Debe cerrar estado agregado.");
  assert(
    events.some((event) => event.error_code === "runtime_context_lost"),
    "Debe registrar perdida de contexto sin datos de cita."
  );
  assert(/se interrumpió/i.test(sent.at(-1).text), "Debe informar que reinicie el proceso.");
}

async function assertLostRescheduleContext() {
  const { deps, sent, events } = createDeps();
  const finalized = [];
  deps.db.getOperacionCancelacionActivaPorSesion = async () => null;
  deps.db.getOperacionReagendamientoActivaPorSesion = async () => ({
    reschedule_operation_id: "d".repeat(64),
    estado: "reagendamiento_asignando",
  });
  deps.db.finalizarOperacionReagendamiento = async (id, estado, extra) => {
    finalized.push({ id, estado, extra });
  };

  const result = await handleIncomingMessage(textMessage("hola"), deps);
  assert(result.step === "reschedule_context_lost", "Debe detectar saga interrumpida.");
  assert(
    finalized[0].estado === "reagendamiento_revision_manual",
    "Saga interrumpida debe quedar para revision manual."
  );
  assert(
    events.some((event) => event.error_code === "runtime_context_lost"),
    "Debe registrar perdida de contexto sin numeros de cita."
  );
  assert(/necesita revisión/i.test(sent.at(-1).text), "Debe informar conciliacion.");
}

function assertHelpers() {
  assert(parseDocumentInput("CC 123.456").documento === "123456", "Debe normalizar documento.");
  assert(parseDocumentInput("xx 123456") === null, "Debe rechazar tipo invalido.");
  assert(parseDocumentNumber("123.456") === "123456", "Debe normalizar solo el numero.");
  assert(parseDocumentNumber("12") === null, "Debe rechazar un numero demasiado corto.");
  assert(
    parseDocumentType({ interactiveId: "INTAKE_DOC_PA" }).type === "PA",
    "Debe resolver Pasaporte desde la opcion legible."
  );
  assert(DOCUMENT_TYPE_OPTIONS.length === 6, "Debe mantener el catalogo completo.");
  const listPayload = buildInteractiveListPayload({
    to: "573001112233",
    body: "Selecciona tu documento",
    footer: "HUN",
    button: "Elegir documento",
    sectionTitle: "Tipos de documento",
    rows: DOCUMENT_TYPE_OPTIONS,
  });
  assert(listPayload.interactive.type === "list", "WhatsApp debe recibir una lista real.");
  assert(
    listPayload.interactive.action.sections[0].rows[5].title === "Pasaporte",
    "El payload real debe conservar nombres legibles."
  );
  assert(
    /No encontramos citas reservadas próximas/.test(
      formatAppointmentsMessage([], new Date("2026-07-08"))
    ),
    "Sin citas debe responder mensaje recuperable."
  );
}

async function main() {
  assertHelpers();
  await assertMenuAndScheduleFlow();
  await assertRejectConsent();
  await assertConsultAppointments();
  await assertModifyCancelEntryPoint();
  await assertRescheduleEntryPoint();
  await assertLostCancellationContext();
  await assertLostRescheduleContext();
  console.log("Inbound router checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
