const axios = require("axios");
const db = require("./db");

const REQUIRED_FIELDS = Object.freeze([
  "id_anonimo",
  "cod_especialidad_requerida",
]);

const DEFAULT_MOCK_AUDIENCE = Object.freeze([
  {
    id_anonimo: "mock-audiencia-001",
    cod_especialidad_requerida: "590",
  },
]);

function cleanText(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

function readField(record, names) {
  for (const name of names) {
    const value = cleanText(record?.[name]);
    if (value) return value;
  }
  return null;
}

function normalizeDocumento(value) {
  return cleanText(value)?.replace(/\s+/g, "") || null;
}

function normalizeTipoDocumento(value) {
  return cleanText(value)?.toUpperCase() || null;
}

function normalizeTelefono(value) {
  const digits = cleanText(value)?.replace(/\D+/g, "") || "";
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  return null;
}

function normalizeEmail(value) {
  const email = cleanText(value)?.toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isOfficialApiConfigured(env = process.env) {
  return Boolean(cleanText(env.HUN_DEMANDA_API_BASE) && cleanText(env.HUN_DEMANDA_API_ENDPOINT));
}

function isOrchestratorConfigured(env = process.env) {
  return Boolean(
    cleanText(env.HUN_ORQUESTADOR_API_BASE) &&
      cleanText(env.HUN_ORQUESTADOR_API_ENDPOINT) &&
      cleanText(env.HUN_ORQUESTADOR_API_KEY)
  );
}

function buildAuthHeaders(env = process.env) {
  const authType = cleanText(env.HUN_DEMANDA_API_AUTH_TYPE)?.toLowerCase() || "none";
  const token = cleanText(env.HUN_DEMANDA_API_TOKEN);

  if (authType === "none") return {};
  if (!token) {
    throw new Error("HUN_DEMANDA_API_TOKEN es obligatorio para la autenticacion configurada.");
  }
  if (authType === "bearer") return { Authorization: `Bearer ${token}` };
  if (authType === "api_key" || authType === "x-api-key") return { "x-api-key": token };

  throw new Error(`HUN_DEMANDA_API_AUTH_TYPE no soportado: ${authType}`);
}

function buildApiUrl(env = process.env) {
  const base = cleanText(env.HUN_DEMANDA_API_BASE);
  const endpoint = cleanText(env.HUN_DEMANDA_API_ENDPOINT);
  if (!base || !endpoint) {
    throw new Error("HUN_DEMANDA_API_BASE y HUN_DEMANDA_API_ENDPOINT son obligatorios.");
  }
  return new URL(endpoint.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).toString();
}

function buildOrchestratorUrl(idAnonimo, env = process.env) {
  const base = cleanText(env.HUN_ORQUESTADOR_API_BASE);
  const endpoint = cleanText(env.HUN_ORQUESTADOR_API_ENDPOINT);
  const id = cleanText(idAnonimo);
  if (!base || !endpoint) {
    throw new Error("HUN_ORQUESTADOR_API_BASE y HUN_ORQUESTADOR_API_ENDPOINT son obligatorios.");
  }
  if (!id) throw new Error("id_anonimo es obligatorio.");

  const encodedId = encodeURIComponent(id);
  const resolvedEndpoint = endpoint.includes("{id_anonimo}")
    ? endpoint.replace("{id_anonimo}", encodedId)
    : `${endpoint.replace(/\/+$/, "")}/${encodedId}`;

  return new URL(resolvedEndpoint.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).toString();
}

function rowsFromApiResponse(payload) {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.data,
    payload?.resultados,
    payload?.results,
    payload?.items,
    payload?.audiencia,
    payload?.pacientes,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function normalizeOrchestratorResponse(payload, idAnonimo) {
  const record = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const telefono = normalizeTelefono(
    readField(record, ["telefono", "numero_telefonico", "numeroTelefonico", "whatsapp_numero"])
  );
  const correo = normalizeEmail(readField(record, ["correo", "email", "to_email"]));
  const especialidadCodigo = readField(record, [
    "cod_especialidad_requerida",
    "codEspecialidadRequerida",
    "especialidad_codigo",
    "codigo_especialidad",
  ]);

  if (!telefono) {
    return {
      ok: false,
      id_anonimo: cleanText(idAnonimo),
      error_code: "telefono_invalido",
      error_category: "orquestador_validacion",
    };
  }

  return {
    ok: true,
    id_anonimo: cleanText(idAnonimo),
    telefono,
    correo,
    especialidad_codigo: especialidadCodigo ? String(especialidadCodigo) : null,
  };
}

async function resolverPacienteCampania({
  idAnonimo,
  env = process.env,
  httpClient = axios,
} = {}) {
  const apiKey = cleanText(env.HUN_ORQUESTADOR_API_KEY);
  if (!apiKey) {
    throw Object.assign(new Error("HUN_ORQUESTADOR_API_KEY es obligatorio."), {
      code: "orquestador_no_configurado",
      category: "config",
    });
  }

  const response = await httpClient.get(buildOrchestratorUrl(idAnonimo, env), {
    timeout: Number(env.HUN_DEMANDA_API_TIMEOUT_MS || 20000),
    headers: { "x-api-key": apiKey },
  });

  return normalizeOrchestratorResponse(response.data, idAnonimo);
}

async function fetchAudienciaOficial({
  filtros = {},
  page = null,
  limit = null,
  env = process.env,
  httpClient = axios,
} = {}) {
  const timeout = Number(env.HUN_DEMANDA_API_TIMEOUT_MS || 20000);
  const params = { ...filtros };
  if (page !== null && page !== undefined) params.page = page;
  if (limit !== null && limit !== undefined) params.limit = limit;

  const response = await httpClient.get(buildApiUrl(env), {
    params,
    timeout,
    headers: buildAuthHeaders(env),
  });

  return rowsFromApiResponse(response.data);
}

async function fetchAudienciaMock({ records = DEFAULT_MOCK_AUDIENCE } = {}) {
  return Array.from(records);
}

async function obtenerAudienciaDemanda(options = {}) {
  if (isOfficialApiConfigured(options.env || process.env)) {
    return fetchAudienciaOficial(options);
  }
  return fetchAudienciaMock({ records: options.mockRecords });
}

function normalizeAudienceRecord(record, index = 0) {
  const audienciaRef = readField(record, ["id_anonimo", "audiencia_ref", "idAnonimo"]);
  const especialidadCodigo = readField(record, [
    "cod_especialidad_requerida",
    "codEspecialidadRequerida",
    "especialidad_codigo",
  ]);

  const missing = [];
  if (!audienciaRef) missing.push("id_anonimo");
  if (!especialidadCodigo) missing.push("cod_especialidad_requerida");

  if (missing.length) {
    return {
      ok: false,
      index,
      motivo: "campos_obligatorios",
      campos: missing,
    };
  }

  return {
    ok: true,
    index,
    source_key: audienciaRef,
    audiencia_ref: audienciaRef,
    especialidad_codigo: String(especialidadCodigo),
  };
}

async function sincronizarAudienciaCampana({
  campaignId,
  records,
  dbClient = db,
} = {}) {
  if (!campaignId) throw new Error("campaignId es obligatorio.");
  if (!Array.isArray(records)) throw new Error("records debe ser un arreglo.");

  const seen = new Set();
  const summary = {
    total: records.length,
    aceptados: 0,
    guardados: 0,
    rechazados: 0,
    duplicados: 0,
    errores: 0,
    detalles_rechazados: [],
  };

  for (let index = 0; index < records.length; index += 1) {
    const normalized = normalizeAudienceRecord(records[index], index);
    if (!normalized.ok) {
      summary.rechazados += 1;
      summary.detalles_rechazados.push(normalized);
      continue;
    }

    if (seen.has(normalized.source_key)) {
      summary.duplicados += 1;
      continue;
    }
    seen.add(normalized.source_key);

    try {
      const result = await dbClient.guardarDestinatarioCampana({
        campaign_id: campaignId,
        audiencia_ref: normalized.audiencia_ref,
        especialidad_codigo: normalized.especialidad_codigo,
      });

      if (!result) {
        summary.errores += 1;
        summary.detalles_rechazados.push({
          ok: false,
          index,
          motivo: "error_sync",
          error_code: "persistencia_no_disponible",
        });
        continue;
      }

      if (result.duplicate) {
        summary.duplicados += 1;
        continue;
      }

      summary.aceptados += 1;
      summary.guardados += 1;
    } catch (error) {
      summary.errores += 1;
      summary.detalles_rechazados.push({
        ok: false,
        index,
        motivo: "error_sync",
        error_code: error.code || "sync_error",
      });
    }
  }

  return summary;
}

module.exports = {
  REQUIRED_FIELDS,
  DEFAULT_MOCK_AUDIENCE,
  isOfficialApiConfigured,
  isOrchestratorConfigured,
  buildAuthHeaders,
  buildApiUrl,
  buildOrchestratorUrl,
  rowsFromApiResponse,
  normalizeOrchestratorResponse,
  normalizeEmail,
  resolverPacienteCampania,
  fetchAudienciaOficial,
  fetchAudienciaMock,
  obtenerAudienciaDemanda,
  normalizeAudienceRecord,
  normalizeTelefono,
  sincronizarAudienciaCampana,
};
