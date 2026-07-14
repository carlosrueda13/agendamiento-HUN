const axios = require("axios");

const BASE = process.env.HUN_API_BASE || "http://190.109.10.204";
const API_KEY =
  process.env.HUN_API_KEY || "HospitalUniversitarioNacionaldeColombia";

const DEFAULT_TIMEOUT_MS = Number(process.env.HUN_API_TIMEOUT_MS || 20000);
const ASSIGN_TIMEOUT_MS = Number(process.env.HUN_ASSIGN_TIMEOUT_MS || 60000);

const ENDPOINTS = {
  especialidades: "/webServiceEspecialidad/especialidades",
  agendaEspecialidad: "/webServiceAgenda/agenda",
  citasDocumento: "/webServiceCitaDocumento/consultar_citas_documento",
  citaNumero: "/webServiceCitaNumero/consultar_citas_numero",
  asignarCita: "/webServiceCita/api/asignar_cita",
  cancelarCita: "/webServiceCancelarCitaH/cancelar_cita",
  verificarCancelacion: "/webServiceCancelarCitaH/verificar_cancelacion",
};

const client = axios.create({
  baseURL: BASE,
  headers: { "x-api-key": API_KEY },
  timeout: DEFAULT_TIMEOUT_MS,
});

class HunApiError extends Error {
  constructor({ message, method, endpoint, status, code, category, cause }) {
    super(message);
    this.name = "HunApiError";
    this.method = method;
    this.endpoint = endpoint;
    this.status = status || null;
    this.code = code || null;
    this.category = category || "hun_api_error";
    this.cause = cause;
  }
}

// La API del HUN devuelve muchos strings con espacios de relleno al final.
function limpiar(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizarValor(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizarValor(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizarValor(item)])
    );
  }

  return limpiar(value);
}

function normalizarLista(rows) {
  return Array.isArray(rows) ? rows.map((row) => normalizarValor(row)) : [];
}

function keyToken(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getField(row, candidates) {
  if (!row || typeof row !== "object") return null;

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, candidate)) {
      return limpiar(row[candidate]);
    }
  }

  const wanted = candidates.map(keyToken);
  const match = Object.keys(row).find((key) => wanted.includes(keyToken(key)));
  return match ? limpiar(row[match]) : null;
}

function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function normalizeAgendaDetalleId(row, cup) {
  return firstPresent(
    getField(cup, [
      "agenda_detalle_id",
      "id_agenda_detalle",
      "agendaDetalleId",
      "idAgendaDetalle",
      "id_detalle_agenda",
      "Agenda_Detalle_Id",
    ]),
    getField(row, [
      "agenda_detalle_id",
      "id_agenda_detalle",
      "agendaDetalleId",
      "idAgendaDetalle",
      "id_detalle_agenda",
      "Agenda_Detalle_Id",
    ])
  );
}

function normalizeCups(row) {
  const cups = getField(row, ["cups", "CUPS", "procedimientos"]) || [];
  if (!Array.isArray(cups)) return [];

  return cups.map((cup) => {
    const normalizedCup = normalizarValor(cup);
    return {
      ...normalizedCup,
      agenda_detalle_id: normalizeAgendaDetalleId(row, normalizedCup),
    };
  });
}

function normalizeAgendaRows(rows) {
  return normalizarLista(rows).map((row) => ({
    ...row,
    cups: normalizeCups(row),
  }));
}

function rowsFromResponse(data, context) {
  const normalized = normalizarValor(data);

  if (Array.isArray(normalized?.results)) return normalized.results;
  if (Array.isArray(normalized?.data)) return normalized.data;
  if (Array.isArray(normalized)) return normalized;

  if (
    normalized &&
    typeof normalized === "object" &&
    (normalized.codigo === 204 || normalized.status === 204) &&
    /no se encontraron registros/i.test(String(normalized.message || ""))
  ) {
    return [];
  }

  if (normalized === null || normalized === undefined || normalized === "") {
    throw new HunApiError({
      message: `Respuesta vacia de HUN ${context.method} ${context.endpoint}`,
      method: context.method,
      endpoint: context.endpoint,
      category: "empty_response",
    });
  }

  throw new HunApiError({
    message: `Respuesta HUN sin lista esperada en ${context.method} ${context.endpoint}`,
    method: context.method,
    endpoint: context.endpoint,
    category: "unexpected_response_shape",
  });
}

function redactEndpoint(endpoint) {
  return String(endpoint || "").replace(
    /(\/webServiceCancelarCitaH\/verificar_cancelacion\/)[^/?]+/i,
    "$1[redacted]"
  );
}

function hunError(error, context) {
  if (error instanceof HunApiError) return error;

  const method = context.method;
  const endpoint = redactEndpoint(context.endpoint);
  const status = error.response?.status || null;
  const code = error.code || null;

  if (code === "ECONNABORTED" || /timeout/i.test(error.message || "")) {
    return new HunApiError({
      message: `Timeout consultando HUN ${method} ${endpoint}`,
      method,
      endpoint,
      status,
      code,
      category: "timeout",
      cause: error,
    });
  }

  if (status === 401) {
    return new HunApiError({
      message: `HUN rechazo autenticacion en ${method} ${endpoint}`,
      method,
      endpoint,
      status,
      code,
      category: "unauthorized",
      cause: error,
    });
  }

  return new HunApiError({
    message: `Error HUN ${method} ${endpoint}`,
    method,
    endpoint,
    status,
    code,
    category: status ? "http_error" : "network_error",
    cause: error,
  });
}

async function requestData(httpClient, method, endpoint, options = {}) {
  const context = {
    method: method.toUpperCase(),
    endpoint: redactEndpoint(endpoint),
  };

  try {
    const response = method === "post"
      ? await httpClient.post(endpoint, options.payload, options.requestOptions)
      : await httpClient.get(endpoint, options.requestOptions);
    return normalizarValor(response.data);
  } catch (error) {
    throw hunError(error, context);
  }
}

async function requestRows(httpClient, endpoint, requestOptions) {
  const data = await requestData(httpClient, "get", endpoint, { requestOptions });
  return rowsFromResponse(data, { method: "GET", endpoint: redactEndpoint(endpoint) });
}

function createHunClient(httpClient = client) {
  return {
    /**
     * Devuelve especialidades para WhatsApp Flow:
     * [{ id: string, title: string }]
     */
    async getEspecialidades() {
      const rows = await requestRows(httpClient, ENDPOINTS.especialidades);
      return rows
        .map((especialidad) => ({
          id: String(getField(especialidad, ["codigo", "id"])),
          title: String(getField(especialidad, ["descripcion", "title", "nombre"])),
        }))
        .filter((especialidad) => especialidad.id && especialidad.title)
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    /**
     * Devuelve agenda normalizada por especialidad.
     * Cada row conserva los campos HUN normalizados y `cups[]` siempre es arreglo.
     * Cada cup expone `agenda_detalle_id` aunque HUN lo entregue con alias.
     */
    async getAgendaPorEspecialidad(codEspecialidad, fechaFinal) {
      const rows = await requestRows(httpClient, ENDPOINTS.agendaEspecialidad, {
        params: { cod_especialidad: codEspecialidad, fecha_final: fechaFinal },
      });
      return normalizeAgendaRows(rows);
    },

    /**
     * Devuelve citas por documento con strings normalizados.
     * No persiste ni loguea documento; solo consulta HUN como fuente de verdad.
     */
    async consultarCitasDocumento(tipo, documento) {
      const rows = await requestRows(httpClient, ENDPOINTS.citasDocumento, {
        params: { tipo, documento },
      });
      return normalizarLista(rows);
    },

    /**
     * Devuelve citas por numero con strings normalizados.
     * El numero de cita solo viaja hacia HUN; no se agrega al mensaje de error.
     */
    async consultarCitaNumero(numeroCita) {
      const rows = await requestRows(httpClient, ENDPOINTS.citaNumero, {
        params: { numero_cita: numeroCita },
      });
      return normalizarLista(rows);
    },

    /**
     * Asigna una cita nueva en la API HUN de pruebas controlada.
     * Usa timeout mayor porque HUN hace trabajo asincrono/SOAP aguas abajo.
     */
    async asignarCita(payload) {
      return requestData(httpClient, "post", ENDPOINTS.asignarCita, {
        payload,
        requestOptions: { timeout: ASSIGN_TIMEOUT_MS },
      });
    },

    /**
     * Cancela una cita en HUN. Los identificadores solo viven durante la solicitud.
     */
    async cancelarCita(cita, tipoDocumento, documento) {
      if (!cita || !tipoDocumento || !documento) {
        throw new HunApiError({
          message: "La cancelacion HUN requiere cita, tipo de documento y documento",
          method: "POST",
          endpoint: ENDPOINTS.cancelarCita,
          category: "invalid_request",
        });
      }

      return requestData(httpClient, "post", ENDPOINTS.cancelarCita, {
        payload: {
          cita: String(cita),
          tipo_documento: String(tipoDocumento).trim().toUpperCase(),
          documento: String(documento).trim(),
        },
      });
    },

    /**
     * Consulta el resultado asincrono de cancelacion.
     */
    async verificarCancelacion(cita) {
      const endpoint = `${ENDPOINTS.verificarCancelacion}/${encodeURIComponent(cita)}`;
      return requestData(httpClient, "get", endpoint);
    },
  };
}

const hun = createHunClient(client);

module.exports = {
  HunApiError,
  limpiar,
  normalizarValor,
  normalizarLista,
  createHunClient,
  getEspecialidades: hun.getEspecialidades,
  getAgendaPorEspecialidad: hun.getAgendaPorEspecialidad,
  consultarCitasDocumento: hun.consultarCitasDocumento,
  consultarCitaNumero: hun.consultarCitaNumero,
  asignarCita: hun.asignarCita,
  cancelarCita: hun.cancelarCita,
  verificarCancelacion: hun.verificarCancelacion,
  _private: {
    ENDPOINTS,
    getField,
    hunError,
    normalizeAgendaDetalleId,
    normalizeAgendaRows,
    rowsFromResponse,
    redactEndpoint,
  },
};
