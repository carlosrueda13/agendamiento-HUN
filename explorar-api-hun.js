/**
 * Script de exploración de la API del HUN
 * Ejecutar: node explorar-api-hun.js
 * Requiere: npm install axios (ya instalado en este proyecto)
 */

const axios = require("axios");

const BASE_URL = "http://190.109.10.204";
const HEADERS = { "x-api-key": "HospitalUniversitarioNacionaldeColombia" };

// Fecha de hoy y 60 días adelante
const hoy = new Date().toISOString().split("T")[0];
const en60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

async function consultar(nombre, url, params = {}) {
  console.log("\n" + "=".repeat(80));
  console.log(`CONSULTA: ${nombre}`);
  console.log(`URL: ${url}`);
  if (Object.keys(params).length) console.log("PARAMS:", params);
  console.log("=".repeat(80));

  try {
    const res = await axios.get(url, { headers: HEADERS, params, timeout: 15000 });
    const data = res.data;

    // Si tiene results, mostrar solo los primeros 3 para no saturar la consola
    if (data.results && Array.isArray(data.results)) {
      console.log(`✅ STATUS: ${res.status} | Total registros: ${data.count ?? data.results.length}`);
      console.log("\n--- ESTRUCTURA (primeros 3 registros) ---");
      console.log(JSON.stringify(data.results.slice(0, 3), null, 2));
      console.log("\n--- CAMPOS DISPONIBLES en cada registro ---");
      if (data.results[0]) {
        console.log(Object.keys(data.results[0]).join(", "));
      }
    } else if (data.data && Array.isArray(data.data)) {
      console.log(`✅ STATUS: ${res.status} | Total registros: ${data.data.length}`);
      console.log("\n--- ESTRUCTURA (primeros 3 registros) ---");
      console.log(JSON.stringify(data.data.slice(0, 3), null, 2));
      console.log("\n--- CAMPOS DISPONIBLES en cada registro ---");
      if (data.data[0]) {
        console.log(Object.keys(data.data[0]).join(", "));
      }
    } else {
      console.log(`✅ STATUS: ${res.status}`);
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    if (err.response) {
      console.log("Respuesta:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

async function main() {
  console.log(`\n${"*".repeat(80)}`);
  console.log("EXPLORACIÓN API HUN — " + new Date().toLocaleString());
  console.log(`Rango de fechas usado: ${hoy} → ${en60}`);
  console.log("*".repeat(80));

  // 1. Especialidades disponibles
  await consultar(
    "1. ESPECIALIDADES",
    `${BASE_URL}/webServiceEspecialidad/especialidades`
  );

  // 2. Agenda disponible por especialidad (usamos código 21 = Anestesiología como ejemplo)
  await consultar(
    "2. AGENDA DISPONIBLE POR ESPECIALIDAD (cod=21 Anestesiología)",
    `${BASE_URL}/webServiceAgenda/agenda`,
    { cod_especialidad: 21, Fecha_final: en60 }
  );

  // 3. Agenda disponible por médico (ME411 del ejemplo del PDF)
  await consultar(
    "3. AGENDA DISPONIBLE POR MÉDICO (ME411)",
    `${BASE_URL}/webServiceDisponibilidadMedico/consultar`,
    { medico: "ME411", fecha_inicial: hoy, fecha_final: en60 }
  );

  // 4. Citas de un paciente de prueba (del PDF)
  await consultar(
    "4. CITAS POR DOCUMENTO (CC 41531776)",
    `${BASE_URL}/webServiceCitaDocumento/consultar_citas_documento`,
    { tipo: "CC", documento: "41531776" }
  );

  // 5. Otro paciente de prueba
  await consultar(
    "5. CITAS POR DOCUMENTO (CC 1000727088)",
    `${BASE_URL}/webServiceCitaDocumento/consultar_citas_documento`,
    { tipo: "CC", documento: "1000727088" }
  );

  // 6. Cita por número (del PDF)
  await consultar(
    "6. CITA POR NÚMERO (1534700)",
    `${BASE_URL}/webServiceCitaNumero/consultar_citas_numero`,
    { numero_cita: 1534700 }
  );

  // 7. Citas agendadas a un médico en rango de fechas
  await consultar(
    "7. CITAS POR MÉDICO EN RANGO DE FECHAS",
    `${BASE_URL}/webServiceFechaMedico/consultar`,
    { fecha_inicial: hoy, fecha_final: en60 }
  );

  console.log("\n" + "*".repeat(80));
  console.log("FIN DE LA EXPLORACIÓN");
  console.log("*".repeat(80) + "\n");
  console.log("👉 Copia TODO el output de esta consola y pégalo en el chat.");
}

main();
