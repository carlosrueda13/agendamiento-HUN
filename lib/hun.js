const axios = require("axios");

const BASE = process.env.HUN_API_BASE || "http://190.109.10.204";
const API_KEY =
  process.env.HUN_API_KEY || "HospitalUniversitarioNacionaldeColombia";

const client = axios.create({
  baseURL: BASE,
  headers: { "x-api-key": API_KEY },
  timeout: 20000,
});

// La API del HUN devuelve muchos strings con espacios de relleno al final.
const limpiar = (v) => (typeof v === "string" ? v.trim() : v);

// Listado de especialidades -> [{ id, title }] ordenadas alfabéticamente.
async function getEspecialidades() {
  const { data } = await client.get("/webServiceEspecialidad/especialidades");
  return (data?.data || [])
    .map((e) => ({
      id: String(limpiar(e.codigo)),
      title: limpiar(e.descripcion),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// Agenda disponible para una especialidad hasta una fecha final.
async function getAgendaPorEspecialidad(codEspecialidad, fechaFinal) {
  const { data } = await client.get("/webServiceAgenda/agenda", {
    params: { cod_especialidad: codEspecialidad, fecha_final: fechaFinal },
  });
  return data?.results || [];
}

// Historial de citas del paciente (para obtener nombre y EPS).
async function consultarCitasDocumento(tipo, documento) {
  const { data } = await client.get(
    "/webServiceCitaDocumento/consultar_citas_documento",
    { params: { tipo, documento } }
  );
  return data?.results || [];
}

// Asigna una cita nueva.
async function asignarCita(payload) {
  const { data } = await client.post(
    "/webServiceCita/api/asignar_cita",
    payload
  );
  return data;
}

module.exports = {
  limpiar,
  getEspecialidades,
  getAgendaPorEspecialidad,
  consultarCitasDocumento,
  asignarCita,
};
