process.env.FLOW_SESSION_PII_KEY_B64 = Buffer.alloc(32, 31).toString("base64");
process.env.CANCEL_VERIFY_INITIAL_DELAY_MS = "0";
process.env.CANCEL_VERIFY_INTERVAL_MS = "0";
process.env.CANCEL_VERIFY_MAX_ATTEMPTS = "2";

const fs = require("fs");
const path = require("path");
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

function agendaRow(date, time, index) {
  return {
    fecha_atencion: date,
    hora_inicial: time,
    codigo_medico: `MED-${index}`,
    nombre_medico: `PROFESIONAL PRUEBA ${index}`,
    numero_consultorio: String(10 + index),
    tiempo_intervalo: "20",
    nombre_especialidad: "DERMATOLOGIA",
    cups: [
      {
        agenda_detalle_id: `DET-${index}`,
        codigo: "890201",
        descripcion: "CONSULTA DE PRIMERA VEZ POR DERMATOLOGIA",
        autogestionable: "SI",
      },
      {
        agenda_detalle_id: `DET-OTRO-${index}`,
        codigo: "890202",
        descripcion: "CONSULTA DE CONTROL POR DERMATOLOGIA",
        autogestionable: "SI",
      },
    ],
  };
}

function agendaRows(includeSelected = true, options = {}) {
  const rows = [agendaRow("2026-07-20", "09:00:00", 1)];
  if (options.multipleDates) {
    rows.length = 0;
    for (let index = 0; index < 21; index += 1) {
      const hour = String(7 + Math.floor(index / 3)).padStart(2, "0");
      const minute = String((index % 3) * 20).padStart(2, "0");
      rows.push(agendaRow("2026-07-20", `${hour}:${minute}:00`, index + 1));
    }
    rows.push(agendaRow("2026-07-21", "14:00:00", 30));
    rows.push(agendaRow("2026-07-21", "16:00:00", 31));
  }
  return includeSelected ? rows : [];
}

function createHarness(options = {}) {
  const calls = [];
  const dbWrites = [];
  const messages = [];
  const completionActions = [];
  let assignmentCount = 0;
  let cancelCount = 0;
  let agendaAvailable = true;
  let agendaFilter = (rows) => rows;

  const hun = {
    consultarCitasDocumento: async () => {
      calls.push("consultar_documento");
      const row = appointmentRow();
      if (options.appointmentWithoutProcedureName) delete row.Procedimiento;
      return [row];
    },
    getEspecialidades: async () => [{ id: "382", title: "DERMATOLOGIA" }],
    getAgendaPorEspecialidad: async (specialty) => {
      assert(String(specialty) === "382", "Debe consultar la especialidad de la cita original.");
      calls.push("consultar_agenda");
      const rows = agendaFilter(agendaRows(agendaAvailable, options));
      if (options.agendaWithoutDescription && rows[0]?.cups?.[0]) {
        delete rows[0].cups[0].descripcion;
      }
      return rows;
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
      sendInteractiveButtons: async (payload) => {
        completionActions.push(payload);
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
    completionActions,
    setAgendaAvailable: (value) => {
      agendaAvailable = value;
    },
    setAgendaFilter: (filter) => {
      agendaFilter = filter;
    },
    getAssignmentCount: () => assignmentCount,
    getCancelCount: () => cancelCount,
  };
}

async function navigateToDates(harness) {
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

  const dates = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.APPOINTMENT,
    flow_token: flowToken,
    version: "3.0",
    data: { cita_original: identified.data.citas[0].id },
  });
  assert(dates.screen === SCREENS.DATE, "Debe avanzar primero a las fechas disponibles.");
  assert(dates.data.fechas.length >= 1, "Debe listar al menos una fecha disponible.");
  assert(!/2026-07-20/.test(dates.data.fechas[0].id), "El token no debe exponer la fecha.");
  return { flowToken, dates };
}

async function navigateToSlots(harness) {
  const { flowToken, dates } = await navigateToDates(harness);
  const slots = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.DATE,
    flow_token: flowToken,
    version: "3.0",
    data: { fecha_token: dates.data.fechas[0].id },
  });
  assert(slots.screen === SCREENS.SLOTS, "Debe avanzar a los horarios de la fecha.");
  assert(slots.data.slots.length >= 1, "Debe listar horarios del procedimiento correcto.");
  return { flowToken, dates, slots };
}

async function navigateToConfirm(harness) {
  const { flowToken, slots } = await navigateToSlots(harness);
  assert(
    slots.data.procedimiento ===
      "Procedimiento: CONSULTA DE PRIMERA VEZ POR DERMATOLOGIA",
    "Debe enviar el rotulo completo de procedimiento como dato dinamico."
  );
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

function assertFlowUsesWholeDynamicProperties() {
  const flowPath = path.join(__dirname, "..", "flow-reagendamiento.json");
  const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));

  function visit(value, location = "flow") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => visit(item, `${location}.${key}`));
      return;
    }
    if (typeof value !== "string" || !/\$\{(?:data|form)\./.test(value)) return;
    assert(
      /^\$\{(?:data|form)\.[A-Za-z0-9_]+\}$/.test(value),
      `${location} mezcla texto estatico con una referencia dinamica.`
    );
  }

  visit(flow);

  const screens = Object.fromEntries(flow.screens.map((screen) => [screen.id, screen]));
  assert(screens[SCREENS.DATE], "El JSON debe incluir la pantalla de fechas.");
  assert(
    flow.routing_model[SCREENS.APPOINTMENT].includes(SCREENS.DATE),
    "La cita original debe navegar a la seleccion de fecha."
  );
  assert(
    flow.routing_model[SCREENS.DATE].includes(SCREENS.SLOTS),
    "La fecha debe navegar a la seleccion de hora."
  );
  assert(
    !flow.routing_model[SCREENS.DATE].includes(SCREENS.DATE) &&
      !flow.routing_model[SCREENS.SLOTS].includes(SCREENS.SLOTS),
    "El routing_model debe permanecer aciclico para Meta."
  );
  const dateJson = JSON.stringify(screens[SCREENS.DATE]);
  assert(dateJson.includes('"type":"Dropdown"'), "Las fechas deben usar un Dropdown compacto.");
  assert(dateJson.includes('"fecha_token"'), "El formulario debe enviar fecha_token.");
  for (const key of ["procedimiento", "fecha_seleccionada", "pagina_horarios", "slots"]) {
    assert(screens[SCREENS.SLOTS].data[key], `La pantalla de horas debe declarar ${key}.`);
  }
}

async function assertDatesAreSeparatedFromSlots() {
  const harness = createHarness({ multipleDates: true });
  const { flowToken, dates } = await navigateToDates(harness);
  assert(
    dates.data.fechas.length === 2,
    "Debe mostrar la segunda fecha aunque el primer dia tenga mas de veinte cupos."
  );
  assert(
    /21 horarios disponibles/.test(dates.data.fechas[0].description),
    "Debe agregar el conteo completo por fecha."
  );
  assert(
    /2 horarios disponibles/.test(dates.data.fechas[1].description),
    "Debe contar independientemente los horarios de la segunda fecha."
  );

  const secondDateSlots = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.DATE,
    flow_token: flowToken,
    version: "3.0",
    data: { fecha_token: dates.data.fechas[1].id },
  });
  assert(secondDateSlots.screen === SCREENS.SLOTS, "Debe abrir la segunda fecha.");
  assert(secondDateSlots.data.slots.length === 2, "Solo debe mostrar horas de la segunda fecha.");
  assert(
    secondDateSlots.data.fecha_seleccionada.includes("21 de julio"),
    "Debe identificar la fecha seleccionada."
  );

  const firstDateSlots = await harness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.DATE,
    flow_token: flowToken,
    version: "3.0",
    data: { fecha_token: dates.data.fechas[0].id },
  });
  assert(firstDateSlots.screen === SCREENS.SLOTS, "Debe permitir cambiar de fecha al regresar.");
  assert(
    firstDateSlots.data.slots.length === 21,
    "No debe aplicar el recorte global de veinte horarios."
  );
  assert(
    harness.calls.filter((call) => call === "consultar_agenda").length === 3,
    "Debe reconsultar HUN al seleccionar cada fecha."
  );

  const persistedSessions = JSON.stringify(
    harness.dbWrites.filter((write) => write.type === "session")
  );
  assert(!persistedSessions.includes("2026-07-20"), "Supabase no debe guardar la fecha elegida.");
  assert(!persistedSessions.includes("890201"), "Supabase no debe guardar el procedimiento.");

  const sessionWrites = harness.dbWrites.filter((write) => write.type === "session");
  assert(sessionWrites.length > 0, "Debe persistir el estado temporal del Flow.");
  sessionWrites.forEach((write) => {
    assert(
      typeof write.expires_at === "string" &&
        new Date(write.expires_at).toISOString() === write.expires_at,
      "El vencimiento persistido debe ser un timestamp ISO valido."
    );
  });
}

async function assertStaleDateAndSlotAreRecoverable() {
  const staleDateHarness = createHarness({ multipleDates: true });
  const { flowToken, dates } = await navigateToDates(staleDateHarness);
  staleDateHarness.setAgendaFilter((rows) =>
    rows.filter((row) => row.fecha_atencion === "2026-07-20")
  );
  const staleDate = await staleDateHarness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.DATE,
    flow_token: flowToken,
    version: "3.0",
    data: { fecha_token: dates.data.fechas[1].id },
  });
  assert(staleDate.screen === SCREENS.DATE, "Una fecha agotada debe refrescar las fechas.");
  assert(staleDate.data.fechas.length === 1, "Debe retirar la fecha que perdio sus cupos.");
  assert(/cambiaron/i.test(staleDate.data.error_message), "Debe explicar que los cupos cambiaron.");

  const staleSlotHarness = createHarness({ multipleDates: true });
  const navigation = await navigateToSlots(staleSlotHarness);
  const lostToken = navigation.slots.data.slots[0].id;
  staleSlotHarness.setAgendaFilter((rows) =>
    rows.filter(
      (row) =>
        row.fecha_atencion !== "2026-07-20" || row.hora_inicial !== "07:00:00"
    )
  );
  const staleSlot = await staleSlotHarness.handler.handleFlow({
    action: "data_exchange",
    screen: SCREENS.SLOTS,
    flow_token: navigation.flowToken,
    version: "3.0",
    data: { slot: lostToken },
  });
  assert(staleSlot.screen === SCREENS.SLOTS, "Un horario perdido debe refrescar el mismo dia.");
  assert(staleSlot.data.slots.length === 20, "Debe conservar los demas horarios del dia.");
  assert(/no esta disponible/i.test(staleSlot.data.error_message), "Debe informar el horario perdido.");
}

async function assertProcedureFallbacks() {
  const harness = createHarness({
    appointmentWithoutProcedureName: true,
    agendaWithoutDescription: true,
  });
  const { slots } = await navigateToSlots(harness);
  assert(
    slots.data.procedimiento === "Procedimiento: 890201",
    "Sin nombre debe mostrar el codigo del procedimiento."
  );
  assert(
    slots.data.slots[0].description === "Procedimiento 890201",
    "La descripcion del horario debe reutilizar el procedimiento original como fallback."
  );
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
  assert(harness.completionActions.length === 1, "Debe ofrecer acciones al finalizar.");
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
  assertFlowUsesWholeDynamicProperties();
  await assertDatesAreSeparatedFromSlots();
  await assertStaleDateAndSlotAreRecoverable();
  await assertProcedureFallbacks();
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
