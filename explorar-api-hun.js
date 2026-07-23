/**
 * Exploracion controlada de la API HUN.
 *
 * Lecturas por defecto:
 *   node explorar-api-hun.js
 *
 * Cambiar rango/especialidad/paciente de prueba:
 *   node explorar-api-hun.js --especialidad 21 --dias 30 --tipo CC --documento 41531776
 *
 * Operaciones modificadoras solo en entorno HUN de pruebas controlado:
 *   node explorar-api-hun.js --allow-mutations --confirm-hun-test --assign-payload payload.json
 *   node explorar-api-hun.js --allow-mutations --confirm-hun-test --cancel-cita 1534700 --tipo CC --documento 41531776
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DEFAULT_OUTPUT = "resultados-api-hun.resumen.json";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Exploracion API HUN

Uso:
  node explorar-api-hun.js [opciones]

Opciones de lectura:
  --base-url URL            Obligatorio: argumento o HUN_API_BASE
  --api-key KEY             Obligatorio: argumento o HUN_API_KEY
  --fecha-inicial YYYY-MM-DD
  --fecha-final YYYY-MM-DD
  --dias N                  Default: 60, usado si no se pasa --fecha-final
  --especialidad COD        Default: 21
  --medico COD              Default: ME411
  --tipo TIPO               Default: CC
  --documento NUM           Default: 41531776
  --numero-cita NUM         Default: 1534700
  --timeout-ms N            Default: 20000
  --out ARCHIVO             Default: ${DEFAULT_OUTPUT}

Operaciones modificadoras, deshabilitadas por defecto:
  --allow-mutations
  --confirm-hun-test
  --assign-payload ARCHIVO  JSON para POST /webServiceCita/api/asignar_cita
  --cancel-cita NUM         POST /webServiceCancelarCitaH/cancelar_cita usando --tipo y --documento

El reporte guarda resumen tecnico y estructura de campos, no payloads completos.`);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function configFromArgs(args) {
  const today = new Date();
  const dias = toInt(args.dias, 60);
  const fechaInicial = args["fecha-inicial"] || isoDate(today);
  const fechaFinal = args["fecha-final"] || isoDate(addDays(today, dias));

  return {
    baseUrl: args["base-url"] || process.env.HUN_API_BASE,
    apiKey: args["api-key"] || process.env.HUN_API_KEY,
    fechaInicial,
    fechaFinal,
    especialidad: String(args.especialidad || "21"),
    medico: String(args.medico || "ME411"),
    tipo: String(args.tipo || "CC"),
    documento: String(args.documento || "41531776"),
    numeroCita: String(args["numero-cita"] || "1534700"),
    timeoutMs: toInt(args["timeout-ms"], 20000),
    outputFile: args.out || DEFAULT_OUTPUT,
    allowMutations: Boolean(args["allow-mutations"]),
    confirmHunTest: Boolean(args["confirm-hun-test"]),
    assignPayloadPath: args["assign-payload"],
    cancelCita: args["cancel-cita"],
  };
}

function endpointUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/, "")}${endpoint}`;
}

function extractRows(data) {
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return null;
}

function valueShape(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item_keys:
        value.length && value[0] && typeof value[0] === "object"
          ? Object.keys(value[0])
          : [],
    };
  }
  if (value && typeof value === "object") {
    return { type: "object", keys: Object.keys(value) };
  }
  return {
    type: value === null ? "null" : typeof value,
    empty: value === "" || value === null || value === undefined,
  };
}

function summarizeData(data) {
  const rows = extractRows(data);
  if (rows) {
    const first = rows[0] || null;
    return {
      container: Array.isArray(data?.results)
        ? "results"
        : Array.isArray(data?.data)
          ? "data"
          : "root_array",
      count: data?.count ?? rows.length,
      returned: rows.length,
      fields: first && typeof first === "object" ? Object.keys(first) : [],
      first_record_shape:
        first && typeof first === "object"
          ? Object.fromEntries(
              Object.entries(first).map(([key, value]) => [key, valueShape(value)])
            )
          : null,
    };
  }

  return {
    container: "object",
    fields: data && typeof data === "object" ? Object.keys(data) : [],
    shape:
      data && typeof data === "object"
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, valueShape(value)])
          )
        : valueShape(data),
  };
}

function errorSummary(error) {
  return {
    ok: false,
    message: error.message,
    http_status: error.response?.status || null,
    response_fields:
      error.response?.data && typeof error.response.data === "object"
        ? Object.keys(error.response.data)
        : [],
  };
}

function redactEndpoint(endpoint) {
  return String(endpoint).replace(
    /(\/webServiceCancelarCitaH\/verificar_cancelacion\/)[^/?]+/i,
    "$1[redacted]"
  );
}

function redactParams(params = {}) {
  const sensitive = new Set([
    "documento",
    "numero_documento",
    "numero_cita",
    "cita",
  ]);
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      sensitive.has(key) ? "[redacted]" : value,
    ])
  );
}

async function runGet(client, check) {
  const started = Date.now();
  try {
    const response = await client.get(check.endpoint, { params: check.params });
    return {
      id: check.id,
      name: check.name,
      method: "GET",
      endpoint: redactEndpoint(check.endpoint),
      params: redactParams(check.params),
      ok: true,
      http_status: response.status,
      duration_ms: Date.now() - started,
      summary: summarizeData(response.data),
    };
  } catch (error) {
    return {
      id: check.id,
      name: check.name,
      method: "GET",
      endpoint: redactEndpoint(check.endpoint),
      params: redactParams(check.params),
      duration_ms: Date.now() - started,
      ...errorSummary(error),
    };
  }
}

async function runPost(client, mutation) {
  const started = Date.now();
  try {
    const response = await client.post(mutation.endpoint, mutation.payload, {
      timeout: mutation.timeoutMs,
    });
    return {
      id: mutation.id,
      name: mutation.name,
      method: "POST",
      endpoint: redactEndpoint(mutation.endpoint),
      ok: true,
      http_status: response.status,
      duration_ms: Date.now() - started,
      summary: summarizeData(response.data),
    };
  } catch (error) {
    return {
      id: mutation.id,
      name: mutation.name,
      method: "POST",
      endpoint: redactEndpoint(mutation.endpoint),
      duration_ms: Date.now() - started,
      ...errorSummary(error),
    };
  }
}

function buildReadChecks(config) {
  return [
    {
      id: "especialidades",
      name: "Especialidades disponibles",
      endpoint: "/webServiceEspecialidad/especialidades",
      params: {},
    },
    {
      id: "agenda_especialidad",
      name: "Agenda disponible por especialidad",
      endpoint: "/webServiceAgenda/agenda",
      params: {
        cod_especialidad: config.especialidad,
        fecha_final: config.fechaFinal,
      },
    },
    {
      id: "agenda_medico",
      name: "Agenda disponible por medico",
      endpoint: "/webServiceDisponibilidadMedico/consultar",
      params: {
        medico: config.medico,
        fecha_inicial: config.fechaInicial,
        fecha_final: config.fechaFinal,
      },
    },
    {
      id: "citas_documento",
      name: "Citas por documento de prueba",
      endpoint: "/webServiceCitaDocumento/consultar_citas_documento",
      params: {
        tipo: config.tipo,
        documento: config.documento,
      },
    },
    {
      id: "cita_numero",
      name: "Cita por numero de prueba",
      endpoint: "/webServiceCitaNumero/consultar_citas_numero",
      params: {
        numero_cita: config.numeroCita,
      },
    },
    {
      id: "citas_fecha_medico",
      name: "Citas por rango de fechas",
      endpoint: "/webServiceFechaMedico/consultar",
      params: {
        fecha_inicial: config.fechaInicial,
        fecha_final: config.fechaFinal,
      },
    },
    {
      id: "verificar_cancelacion",
      name: "Verificar cancelacion por numero de cita",
      endpoint: `/webServiceCancelarCitaH/verificar_cancelacion/${encodeURIComponent(
        config.numeroCita
      )}`,
      params: {},
    },
  ];
}

function buildMutations(config) {
  const mutations = [];

  if (config.assignPayloadPath) {
    const absolutePayloadPath = path.resolve(config.assignPayloadPath);
    const payload = JSON.parse(fs.readFileSync(absolutePayloadPath, "utf8"));
    mutations.push({
      id: "asignar_cita",
      name: "Asignar cita",
      endpoint: "/webServiceCita/api/asignar_cita",
      payload,
      timeoutMs: Math.max(config.timeoutMs, 60000),
    });
  }

  if (config.cancelCita) {
    mutations.push({
      id: "cancelar_cita",
      name: "Cancelar cita",
      endpoint: "/webServiceCancelarCitaH/cancelar_cita",
      payload: {
        cita: String(config.cancelCita),
        tipo_documento: config.tipo,
        documento: config.documento,
      },
      timeoutMs: config.timeoutMs,
    });
  }

  return mutations;
}

function assertMutationSafety(config, mutations) {
  if (!mutations.length) return;
  if (!config.allowMutations || !config.confirmHunTest) {
    throw new Error(
      "Operaciones POST bloqueadas. Usa --allow-mutations y --confirm-hun-test solo contra la API HUN de pruebas controlada."
    );
  }
}

function writeReport(outputFile, report) {
  const absolute = path.resolve(outputFile);
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return absolute;
}

function printResult(result) {
  const status = result.ok ? "OK" : "ERROR";
  console.log(
    `${status} ${result.method} ${result.endpoint} (${result.duration_ms} ms)`
  );
  if (result.ok) {
    const count = result.summary?.count ?? result.summary?.returned;
    const fields = result.summary?.fields || [];
    console.log(`  Registros: ${count ?? "n/a"} | Campos: ${fields.join(", ")}`);
  } else {
    console.log(`  ${result.message}`);
    if (result.http_status) console.log(`  HTTP: ${result.http_status}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const config = configFromArgs(args);
  const missing = [
    !config.baseUrl && "HUN_API_BASE/--base-url",
    !config.apiKey && "HUN_API_KEY/--api-key",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Configuracion obligatoria faltante: ${missing.join(", ")}`);
  }

  const client = axios.create({
    baseURL: config.baseUrl,
    headers: { "x-api-key": config.apiKey },
    timeout: config.timeoutMs,
  });

  const checks = buildReadChecks(config);
  const mutations = buildMutations(config);
  assertMutationSafety(config, mutations);

  console.log("Exploracion API HUN");
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Rango: ${config.fechaInicial} -> ${config.fechaFinal}`);
  console.log("Modo: lecturas" + (mutations.length ? " + POST controlados" : ""));
  console.log("");

  const readResults = [];
  for (const check of checks) {
    const result = await runGet(client, check);
    readResults.push(result);
    printResult(result);
  }

  const mutationResults = [];
  for (const mutation of mutations) {
    const result = await runPost(client, mutation);
    mutationResults.push(result);
    printResult(result);
  }

  const skippedMutations = [];
  if (!mutations.find((m) => m.id === "asignar_cita")) {
    skippedMutations.push({
      id: "asignar_cita",
      method: "POST",
      endpoint: "/webServiceCita/api/asignar_cita",
      reason: "Requiere --allow-mutations --confirm-hun-test --assign-payload",
    });
  }
  if (!mutations.find((m) => m.id === "cancelar_cita")) {
    skippedMutations.push({
      id: "cancelar_cita",
      method: "POST",
      endpoint: "/webServiceCancelarCitaH/cancelar_cita",
      reason: "Requiere --allow-mutations --confirm-hun-test --cancel-cita --tipo --documento",
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    base_url: config.baseUrl,
    range: {
      fecha_inicial: config.fechaInicial,
      fecha_final: config.fechaFinal,
    },
    defaults_used: {
      especialidad: config.especialidad,
      medico: config.medico,
      tipo_documento: config.tipo,
      documento: "[redacted]",
      numero_cita: "[redacted]",
    },
    safety: {
      read_only_by_default: true,
      mutations_require_flags: ["--allow-mutations", "--confirm-hun-test"],
      stores_full_payloads: false,
    },
    read_results: readResults,
    mutation_results: mutationResults,
    skipped_mutations: skippedMutations,
  };

  const outputPath = writeReport(config.outputFile, report);
  const okCount = readResults.filter((r) => r.ok).length;
  console.log("");
  console.log(
    `Lecturas exitosas: ${okCount}/${readResults.length}. Reporte: ${outputPath}`
  );

  if (okCount !== readResults.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
