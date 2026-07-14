process.env.FLOW_SESSION_PII_KEY_B64 = Buffer.alloc(32, 31).toString("base64");
process.env.CANCEL_VERIFY_INITIAL_DELAY_MS = "0";
process.env.CANCEL_VERIFY_INTERVAL_MS = "0";
process.env.CANCEL_VERIFY_MAX_ATTEMPTS = "2";

const {
  SCREENS,
  createRescheduleHandler,
} = require("../lib/rescheduleHandler");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function appointmentRow() {
  return {
    Numero_Cita: "111111",
    Cita_Fecha: "Fri, 17 Jul 2026 00:00:00 GMT",
    Hora_Cita: "08:30:00",
    Cod_Eps: "HUN22",
    Especialidad: "DERMATOLOGIA",
    Cod_Pro: "890201",
    Procedimiento: "CONSULTA DE PRIMERA VEZ POR DERMATOLOGIA",
    Nombre_Paciente: "PACIENTE PRUEBA",
    ESTADO: "Reservada",
  };
}

function agendaRows(includeSelected = true) {
  const rows = [
    {
      fecha_atencion: "2026-07-20",
      hora_inicial: "09:00:00",
      codigo_medico: "MED-1",
      nombre_medico: "PROFESIONAL PRUEBA",
      numero_consultorio: "12",
      tiempo_intervalo: "30",
      nombre_especialidad: "DERMATOLOGIA",
      cups: [
        {
          agenda_detalle_id: "DET-1",
          codigo: "890201",
          descripcion: "CONSULTA DE PRIMERA VEZ POR DERMATOLOGIA",
          autogestionable: "SI",
        },
        {
          agenda_detalle_id: "DET-2",
          codigo: "890202",
          descripcion: "CONSULTA DE CONTROL POR DERMATOLOGIA",
          autogestionable: "SI",
        },
      ],
    },
  ];
  return includeSelected ? rows : [];
}

function createHarness(options = {}) {
  const calls = [];
  const dbWrites = [];
  const messages = [];
  let assignmentCount = 0;
  let cancelCount = 0;
  let agendaAvailable = true;

  const hun = {
    consultarCitasDocumento: async () => {
      calls.push("consultar_documento");
      return [appointmentRow()];
    },
    getEspecialidades: async () => [{ id: "382", title: "DERMATOLOGIA" }],
    getAgendaPorEspecialidad: async (specialty) => {
      assert(String(specialty) === "382", "Debe consultar la especialidad de la cita original.");
      calls.push("consultar_agenda");
      return agendaRows(agendaAvailable);
    },
    asignarCita: async (payload) => {
      assignmentCount += 1;
      calls.push("asignar_nueva");
      assert(payload.procedimiento === "890201", "Debe asignar el mismo procedimiento.");
      if (options.assignmentRejected) return { success: false };
      return { success: true, soap: { descripcion: "Cita 999999 asignada" } };
    },
    consultarCitaNumero: async (number) => {
      calls.push("confirmar_nueva");
      return String(number) === "999999" ? [{ Numero_Cita: "999999" }] : [];
    },
    cancelarCita: async (number) => {
      cancelCount += 1;
      calls.push("cancelar_original");
      assert(String(number) === "111111", "Debe cancelar exclusivamente la cita original.");
      return { success: true };
    },
    verificarCancelacion: async () => {
      calls.push("verificar_cancelacion");
      return options.cancellationFails
        ? { resultado: { CodigoRespuesta: "0", Mensaje: "No fue cancelada" } }
        : { resultado: { CodigoRespuesta: "1", Mensaje: "Cancelada correctamente" } };
    },
  };

  const db = {
    guardarSesionTemporal: async (record) => dbWrites.push({ type: "session", ...record }),
    guardarOperacionReagendamiento: async (record) =>
      dbWrites.push({ type: "operation", ...record }),
    finalizarOperacionReagendamiento: async (id, estado, extra) =>
      dbWrites.push({ type: "operation_final", id, estado, extra }),
    guardarEventoOperativo: async (event) => dbWrites.push({ type: "event", ...event }),
  };

  const handler = createRescheduleHandler({
    hun,
    db,
    whatsapp: {
      sendText: async (_to, message) => {
        messages.push(message);
        return true;
      },
    },
    now: () => Date.parse("2026-07-14T12:00:00-05:00"),
  });

  return {
    calls,
    dbWrites,
    handler,
    messages,
    setAgendaAvailable: (value) => {
      agendaAvailable = value;
    },
    getAssignmentCount: () => assignmentCount,
    getCancelCount: () => cancelCount,
  };
}

async function navigateToConfirm(harness) {
  const flowToken = harness.handler.createFlowSession("573001112233");
  const identified = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.IDENTIFICATION,
    flow_token: flowToken,
    version: "3.0",
    data: { tipo_documento: "CC", numero_documento: "123456" },
  });
  assert(identified.screen === SCREENS.APPOINTMENT, "Debe listar citas del paciente.");
  assert(identified.data.citas.length === 1, "Debe listar una cita modificable.");
  assert(!/111111/.test(identified.data.citas[0].id), "El token no debe exponer numero de cita.");

  const slots = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.APPOINTMENT,
    flow_token: flowToken,
    version: "3.0",
    data: { cita_original: identified.data.citas[0].id },
  });
  assert(slots.screen === SCREENS.SLOTS, "Debe avanzar a horarios equivalentes.");
  assert(slots.data.slots.length === 1, "Debe filtrar cupos de procedimientos diferentes.");
  assert(
    /PRIMERA VEZ/.test(slots.data.slots[0].description),
    "Debe mostrar el mismo procedimiento de la cita original."
  );

  const confirmation = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.SLOTS,
    flow_token: flowToken,
    version: "3.0",
    data: { slot: slots.data.slots[0].id },
  });
  assert(confirmation.screen === SCREENS.CONFIRM, "Debe pedir confirmacion explicita.");
  return { flowToken };
}

async function confirmAndWait(harness, flowToken) {
  const response = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.CONFIRM,
    flow_token: flowToken,
    version: "3.0",
    data: {},
  });
  assert(response.screen === SCREENS.FINAL, "La confirmacion debe responder inmediatamente.");
  const session = harness.handler._private.getSession(flowToken);
  const operation = harness.handler._private.operations.get(session.operationId);
  await operation.promise;
  return operation;
}

async function assertSuccessfulSaga() {
  const harness = createHarness();
  const { flowToken } = await navigateToConfirm(harness);
  const confirmationPromise = harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.CONFIRM,
    flow_token: flowToken,
    version: "3.0",
    data: {},
  });
  const duplicatePromise = harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.CONFIRM,
    flow_token: flowToken,
    version: "3.0",
    data: {},
  });
  await Promise.all([confirmationPromise, duplicatePromise]);
  const session = harness.handler._private.getSession(flowToken);
  const operation = harness.handler._private.operations.get(session.operationId);
  await operation.promise;

  assert(harness.getAssignmentCount() === 1, "Idempotencia debe evitar doble asignacion.");
  assert(harness.getCancelCount() === 1, "Debe cancelar una sola vez la cita original.");
  assert(
    harness.calls.indexOf("confirmar_nueva") < harness.calls.indexOf("cancelar_original"),
    "Debe confirmar la nueva cita antes de cancelar la original."
  );
  assert(operation.state === "reagendamiento_completado", "Debe cerrar como completado.");
  assert(/modificada correctamente/i.test(harness.messages.at(-1)), "Debe notificar exito final.");
  const persisted = JSON.stringify(harness.dbWrites);
  assert(!persisted.includes("123456"), "Supabase no debe recibir documento plano.");
  assert(!persisted.includes("111111"), "Supabase no debe recibir cita original.");
  assert(!persisted.includes("999999"), "Supabase no debe recibir cita nueva.");
  assert(!persisted.includes("890201"), "Supabase no debe recibir procedimiento.");
  assert(operation.selectedSlot === null, "Debe limpiar el slot sensible al finalizar.");
}

async function assertAssignmentRejected() {
  const harness = createHarness({ assignmentRejected: true });
  const { flowToken } = await navigateToConfirm(harness);
  const operation = await confirmAndWait(harness, flowToken);
  assert(operation.state === "reagendamiento_fallido", "Rechazo debe cerrar como fallido.");
  assert(harness.getCancelCount() === 0, "No debe cancelar la original si falla asignacion.");
}

async function assertCancellationFailure() {
  const harness = createHarness({ cancellationFails: true });
  const { flowToken } = await navigateToConfirm(harness);
  const operation = await confirmAndWait(harness, flowToken);
  assert(
    operation.state === "reagendamiento_revision_manual",
    "Cancelacion fallida debe requerir revision manual."
  );
  assert(/ambas citas/i.test(harness.messages.at(-1)), "Debe advertir posible doble reserva.");
}

async function assertLostSlot() {
  const harness = createHarness();
  const { flowToken } = await navigateToConfirm(harness);
  harness.setAgendaAvailable(false);
  const response = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.CONFIRM,
    flow_token: flowToken,
    version: "3.0",
    data: {},
  });
  assert(/no esta disponible/i.test(response.data.mensaje), "Debe detectar cupo perdido.");
  assert(harness.getAssignmentCount() === 0, "Cupo perdido no debe asignar.");
  assert(harness.getCancelCount() === 0, "Cupo perdido no debe cancelar.");
}

async function main() {
  await assertSuccessfulSaga();
  await assertAssignmentRejected();
  await assertCancellationFailure();
  await assertLostSlot();
  console.log("Reschedule flow checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
