const assert = require("assert");
const crypto = require("crypto");

process.env.FLOW_SESSION_PII_KEY_B64 = Buffer.alloc(32, 9).toString("base64");

const demanda = require("../lib/demandaInducida");

const validRecord = {
  id_anonimo: "anon-123",
  cod_especialidad_requerida: "590",
};

assert.deepStrictEqual(demanda.REQUIRED_FIELDS, [
  "id_anonimo",
  "cod_especialidad_requerida",
]);

assert.strictEqual(demanda.normalizeTelefono("+57 300 123 4567"), "573001234567");
assert.strictEqual(demanda.normalizeTelefono("3001234567"), "573001234567");
assert.strictEqual(demanda.normalizeTelefono("123"), null);
assert.strictEqual(demanda.normalizeEmail(" PACIENTE@Example.COM "), "paciente@example.com");
assert.strictEqual(demanda.normalizeEmail("correo-invalido"), null);

assert.strictEqual(demanda.isOfficialApiConfigured({}), false);
assert.strictEqual(
  demanda.isOfficialApiConfigured({
    HUN_DEMANDA_API_BASE: "https://hun.example",
    HUN_DEMANDA_API_ENDPOINT: "/audiencia",
  }),
  true
);

assert.deepStrictEqual(demanda.rowsFromApiResponse({ items: [validRecord] }), [validRecord]);
assert.deepStrictEqual(demanda.rowsFromApiResponse({ data: [validRecord] }), [validRecord]);
assert.deepStrictEqual(demanda.rowsFromApiResponse({ data: { nested: true } }), []);

assert.strictEqual(
  demanda.buildOrchestratorUrl("anon 123", {
    HUN_ORQUESTADOR_API_BASE: "https://orquestador.example",
    HUN_ORQUESTADOR_API_ENDPOINT: "/api/v1/get-appointment/{id_anonimo}",
  }),
  "https://orquestador.example/api/v1/get-appointment/anon%20123"
);

assert.deepStrictEqual(
  demanda.normalizeOrchestratorResponse({ telefono: "3001234567", nombre: "No persistir" }, "anon-123"),
  {
    ok: true,
    id_anonimo: "anon-123",
    telefono: "573001234567",
    correo: null,
    especialidad_codigo: null,
  }
);
assert.deepStrictEqual(
  demanda.normalizeOrchestratorResponse(
    { telefono: "3001234567", correo: "PACIENTE@Example.COM" },
    "anon-123"
  ),
  {
    ok: true,
    id_anonimo: "anon-123",
    telefono: "573001234567",
    correo: "paciente@example.com",
    especialidad_codigo: null,
  }
);

assert.deepStrictEqual(
  demanda.buildAuthHeaders({
    HUN_DEMANDA_API_AUTH_TYPE: "bearer",
    HUN_DEMANDA_API_TOKEN: "TOKEN",
  }),
  { Authorization: "Bearer TOKEN" }
);

assert.strictEqual(
  demanda.buildApiUrl({
    HUN_DEMANDA_API_BASE: "https://hun.example/base/",
    HUN_DEMANDA_API_ENDPOINT: "/audiencia",
  }),
  "https://hun.example/base/audiencia"
);

let capturedRequest = null;
const fakeHttpClient = {
  async get(url, options) {
    capturedRequest = { url, options };
    return { data: { resultados: [validRecord] } };
  },
};

(async () => {
  const fetched = await demanda.fetchAudienciaOficial({
    env: {
      HUN_DEMANDA_API_BASE: "https://hun.example",
      HUN_DEMANDA_API_ENDPOINT: "/audiencia",
      HUN_DEMANDA_API_AUTH_TYPE: "x-api-key",
      HUN_DEMANDA_API_TOKEN: "TOKEN",
      HUN_DEMANDA_API_TIMEOUT_MS: "1234",
    },
    filtros: { especialidad: "590" },
    page: 2,
    limit: 50,
    httpClient: fakeHttpClient,
  });

  assert.deepStrictEqual(fetched, [validRecord]);
  assert.strictEqual(capturedRequest.url, "https://hun.example/audiencia");
  assert.strictEqual(capturedRequest.options.timeout, 1234);
  assert.deepStrictEqual(capturedRequest.options.params, {
    especialidad: "590",
    page: 2,
    limit: 50,
  });
  assert.deepStrictEqual(capturedRequest.options.headers, { "x-api-key": "TOKEN" });

  const mock = await demanda.obtenerAudienciaDemanda({
    env: {},
    mockRecords: [validRecord],
  });
  assert.deepStrictEqual(mock, [validRecord]);

  const invalid = demanda.normalizeAudienceRecord(
    { ...validRecord, id_anonimo: "", cod_especialidad_requerida: "" },
    7
  );
  assert.strictEqual(invalid.ok, false);
  assert.deepStrictEqual(invalid.campos, ["id_anonimo", "cod_especialidad_requerida"]);

  const saved = [];
  const fakeDb = {
    crearDocumentoHash(tipo, documento) {
      return crypto
        .createHmac("sha256", Buffer.alloc(32, 5))
        .update(`${tipo}:${documento}`)
        .digest("hex");
    },
    async guardarDestinatarioCampana(record) {
      saved.push(record);
      return { id: `recipient-${saved.length}` };
    },
  };

  const summary = await demanda.sincronizarAudienciaCampana({
    campaignId: "00000000-0000-0000-0000-000000000001",
    records: [
      validRecord,
      { ...validRecord },
      { ...validRecord, id_anonimo: "anon-456", cod_especialidad_requerida: "" },
      { ...validRecord, id_anonimo: "" },
    ],
    dbClient: fakeDb,
  });

  assert.deepStrictEqual(
    {
      total: summary.total,
      aceptados: summary.aceptados,
      guardados: summary.guardados,
      rechazados: summary.rechazados,
      duplicados: summary.duplicados,
      errores: summary.errores,
    },
    {
      total: 4,
      aceptados: 1,
      guardados: 1,
      rechazados: 2,
      duplicados: 1,
      errores: 0,
    }
  );

  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].audiencia_ref, "anon-123");
  assert.strictEqual(saved[0].especialidad_codigo, "590");
  assert.strictEqual(saved[0].whatsapp_numero, undefined);
  assert.strictEqual(saved[0].tipo_documento, undefined);
  assert.strictEqual(saved[0].documento_hash, undefined);
  assert.strictEqual(saved[0].numero_documento, undefined);
  assert.strictEqual(saved[0].nombre_paciente, undefined);

  console.log("Campaign audience adapter checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
