const assert = require("assert");

const hun = require("../lib/hun");

function fakeHttpClient(routes) {
  return {
    async get(endpoint, options = {}) {
      const route = routes[`GET ${endpoint}`];
      if (!route) throw new Error(`Ruta GET no esperada: ${endpoint}`);
      return typeof route === "function" ? route(options) : route;
    },
    async post(endpoint, payload, options = {}) {
      const route = routes[`POST ${endpoint}`];
      if (!route) throw new Error(`Ruta POST no esperada: ${endpoint}`);
      return typeof route === "function" ? route(payload, options) : route;
    },
  };
}

async function testEspecialidades() {
  const api = hun.createHunClient(fakeHttpClient({
    "GET /webServiceEspecialidad/especialidades": {
      data: {
        data: [
          { codigo: " 2 ", descripcion: " ZETA " },
          { codigo: " 1 ", descripcion: " ALFA " },
        ],
      },
    },
  }));

  assert.deepStrictEqual(await api.getEspecialidades(), [
    { id: "1", title: "ALFA" },
    { id: "2", title: "ZETA" },
  ]);
}

async function testAgendaNormalizada() {
  const api = hun.createHunClient(fakeHttpClient({
    "GET /webServiceAgenda/agenda": ({ params }) => {
      assert.deepStrictEqual(params, {
        cod_especialidad: "21",
        fecha_final: "2026-08-01",
      });
      return {
        data: {
          results: [
            {
              nombre_medico: " MEDICO PRUEBA ",
              id_agenda_detalle: " ROW-1 ",
              cups: [
                { codigo: " 890201 ", descripcion: " Consulta ", id_agenda_detalle: " CUP-1 " },
                { codigo: " 890202 ", descripcion: " Control " },
                { codigo: " 890242 ", descripcion: null },
                { codigo: "89.0.3.42", descripcion: null },
                {
                  codigo_cups: " ABC123 ",
                  descripcion: null,
                  descripcion_cups: " Nombre desde alias ",
                },
                { codigo: " ZZZZZZ ", descripcion: null },
              ],
            },
          ],
        },
      };
    },
  }));

  const agenda = await api.getAgendaPorEspecialidad("21", "2026-08-01");
  assert.strictEqual(agenda[0].nombre_medico, "MEDICO PRUEBA");
  assert.strictEqual(agenda[0].cups[0].codigo, "890201");
  assert.strictEqual(agenda[0].cups[0].agenda_detalle_id, "CUP-1");
  assert.strictEqual(agenda[0].cups[1].agenda_detalle_id, "ROW-1");
  assert.strictEqual(agenda[0].cups[0].descripcion, "Consulta");
  assert.strictEqual(agenda[0].cups[0].descripcion_fuente, "hun");
  assert.strictEqual(
    agenda[0].cups[2].descripcion,
    "CONSULTA DE PRIMERA VEZ POR ESPECIALISTA EN DERMATOLOGÍA"
  );
  assert.strictEqual(agenda[0].cups[2].descripcion_fuente, "catalogo_cups");
  assert.strictEqual(agenda[0].cups[3].codigo, "890342");
  assert.strictEqual(
    agenda[0].cups[3].descripcion,
    "CONSULTA DE CONTROL O DE SEGUIMIENTO POR ESPECIALISTA EN DERMATOLOGÍA"
  );
  assert.strictEqual(agenda[0].cups[4].descripcion, "Nombre desde alias");
  assert.strictEqual(agenda[0].cups[4].descripcion_fuente, "hun");
  assert.strictEqual(agenda[0].cups[5].descripcion, null);
  assert.strictEqual(agenda[0].cups[5].descripcion_fuente, null);
}

async function testCitasYCancelacion() {
  const api = hun.createHunClient(fakeHttpClient({
    "GET /webServiceCitaDocumento/consultar_citas_documento": {
      data: { results: [{ Nombre_Paciente: " PACIENTE ", Cod_Eps: " HUN22 " }] },
    },
    "GET /webServiceCitaNumero/consultar_citas_numero": {
      data: { results: [{ Estado: " ASIGNADA " }] },
    },
    "POST /webServiceCancelarCitaH/cancelar_cita": (payload) => {
      assert.deepStrictEqual(payload, {
        cita: "123",
        tipo_documento: "CC",
        documento: "999",
      });
      return { data: { success: true, message: " OK " } };
    },
    "GET /webServiceCancelarCitaH/verificar_cancelacion/123": {
      data: { success: true, estado: " CANCELADA " },
    },
  }));

  assert.deepStrictEqual(await api.consultarCitasDocumento("CC", "999"), [
    { Nombre_Paciente: "PACIENTE", Cod_Eps: "HUN22" },
  ]);
  assert.deepStrictEqual(await api.consultarCitaNumero("123"), [
    { Estado: "ASIGNADA" },
  ]);
  assert.deepStrictEqual(await api.cancelarCita("123", "cc", "999"), {
    success: true,
    message: "OK",
  });
  await assert.rejects(
    () => api.cancelarCita("123"),
    (error) =>
      error instanceof hun.HunApiError && error.category === "invalid_request"
  );
  assert.deepStrictEqual(await api.verificarCancelacion("123"), {
    success: true,
    estado: "CANCELADA",
  });
}

async function testErroresEstandarizados() {
  const api = hun.createHunClient(fakeHttpClient({
    "GET /webServiceCitaNumero/consultar_citas_numero": () => {
      const error = new Error("timeout of 20000ms exceeded");
      error.code = "ECONNABORTED";
      throw error;
    },
    "GET /webServiceEspecialidad/especialidades": () => {
      const error = new Error("Request failed with status code 401");
      error.response = { status: 401, data: { detail: "secret" } };
      throw error;
    },
    "GET /webServiceCancelarCitaH/verificar_cancelacion/987": () => {
      const error = new Error("boom");
      error.response = { status: 500 };
      throw error;
    },
  }));

  await assert.rejects(
    () => api.consultarCitaNumero("123"),
    (error) =>
      error instanceof hun.HunApiError &&
      error.category === "timeout" &&
      error.method === "GET" &&
      error.endpoint === "/webServiceCitaNumero/consultar_citas_numero"
  );

  await assert.rejects(
    () => api.getEspecialidades(),
    (error) =>
      error instanceof hun.HunApiError &&
      error.category === "unauthorized" &&
      error.status === 401
  );

  await assert.rejects(
    () => api.verificarCancelacion("987"),
    (error) =>
      error instanceof hun.HunApiError &&
      error.endpoint === "/webServiceCancelarCitaH/verificar_cancelacion/[redacted]" &&
      !error.message.includes("987")
  );
}

async function testRespuestaVacia() {
  const api = hun.createHunClient(fakeHttpClient({
    "GET /webServiceEspecialidad/especialidades": { data: null },
    "GET /webServiceAgenda/agenda": {
      data: { codigo: 204, message: "No se encontraron registros para la especialidad indicada." },
    },
  }));

  await assert.rejects(
    () => api.getEspecialidades(),
    (error) =>
      error instanceof hun.HunApiError &&
      error.category === "empty_response" &&
      error.endpoint === "/webServiceEspecialidad/especialidades"
  );

  assert.deepStrictEqual(await api.getAgendaPorEspecialidad("21", "2026-08-01"), []);
}

async function main() {
  await testEspecialidades();
  await testAgendaNormalizada();
  await testCitasYCancelacion();
  await testErroresEstandarizados();
  await testRespuestaVacia();
  console.log("HUN client checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
