const hun = require("../lib/hun");
const db = require("../lib/db");

const savedSessions = [];
const savedEvents = [];

hun.consultarCitasDocumento = async (tipo, documento) => {
  if (tipo === "CC" && documento === "123456") {
    return [
      {
        Nombre_Paciente: "  ANA PRUEBA  ",
        Cod_Eps: "  HUN22  ",
      },
    ];
  }

  return [];
};

hun.getEspecialidades = async () => [
  { id: "30", title: "ZETA" },
  { id: "21", title: "ANESTESIOLOGIA" },
  { id: "", title: "SIN ID" },
  { id: "21", title: "DUPLICADA" },
  { id: "2", title: "ELECTROMIOGRAFIA" },
];

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

function flowPayload(flowToken, data) {
  return {
    action: "data_exchange",
    screen: "IDENTIFICACION",
    flow_token: flowToken,
    version: "7.3",
    data,
  };
}

async function assertValidPatientFromHistory() {
  const response = await handleFlow(
    flowPayload("flow_history_patient", {
      tipo_documento: " cc ",
      numero_documento: " 123.456 ",
      correo: "paciente@example.com",
    })
  );

  assert(response.screen === "ESPECIALIDAD", "Paciente con historial debe avanzar.");
  assert(
    response.data.especialidades.map((item) => item.title).join("|") ===
      "ANESTESIOLOGIA|ELECTROMIOGRAFIA|ZETA",
    "Especialidades deben estar ordenadas, deduplicadas y sin opciones invalidas."
  );

  const session = savedSessions.find(
    (item) => item.flow_token === "flow_history_patient"
  );
  assert(session, "Debe guardar sesion temporal minima.");
  assert(session.estado === "eligiendo_especialidad", "Estado de sesion incorrecto.");

  const serialized = JSON.stringify(session);
  [
    "tipo_documento",
    "numero_documento",
    "ANA PRUEBA",
    "HUN22",
    "Nombre_Paciente",
    "Cod_Eps",
  ].forEach((forbidden) => {
    assert(
      !serialized.includes(forbidden),
      `Sesion temporal no debe persistir dato sensible: ${forbidden}`
    );
  });
}

async function assertInvalidDocumentStopsFlow() {
  const beforeSessions = savedSessions.length;
  const response = await handleFlow(
    flowPayload("flow_invalid_document", {
      tipo_documento: "CC",
      numero_documento: "",
      correo: "paciente@example.com",
    })
  );

  assert(response.screen === "IDENTIFICACION", "Documento invalido debe quedarse en identificacion.");
  assert(response.data.error_message, "Documento invalido debe devolver mensaje de error.");
  assert(
    savedSessions.length === beforeSessions,
    "Documento invalido no debe guardar sesion temporal."
  );
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_identificacion" &&
        event.status === "fallida" &&
        event.error_category === "flow_validation"
    ),
    "Documento invalido debe registrar evento no sensible de validacion."
  );
}

async function assertTestPatientFallback() {
  const response = await handleFlow(
    flowPayload("flow_test_patient", {
      tipo_documento: "CC",
      numero_documento: "41531776",
      correo: "paciente@example.com",
    })
  );

  assert(response.screen === "ESPECIALIDAD", "Paciente de prueba debe avanzar con fallback.");
  assert(
    savedEvents.some(
      (event) =>
        event.event_type === "flow_identificacion" &&
        event.resultado_operativo === "paciente_prueba_identificado"
    ),
    "Fallback de paciente de prueba debe quedar trazado sin datos sensibles."
  );
}

async function assertMissingPatientDataStopsFlow() {
  const response = await handleFlow(
    flowPayload("flow_missing_eps", {
      tipo_documento: "CC",
      numero_documento: "99999999",
      correo: "paciente@example.com",
    })
  );

  assert(response.screen === "IDENTIFICACION", "Paciente sin EPS debe volver a identificacion.");
  assert(
    /EPS\/contrato/.test(response.data.error_message),
    "Paciente sin EPS debe explicar que falta informacion minima."
  );
}

async function main() {
  await assertValidPatientFromHistory();
  await assertInvalidDocumentStopsFlow();
  await assertTestPatientFallback();
  await assertMissingPatientDataStopsFlow();

  console.log("Flow identification checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
