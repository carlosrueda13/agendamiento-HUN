const assert = require("assert");

const {
  catalogMetadata,
  getCupsDescription,
  normalizeCupsCode,
  resolveProcedureDescription,
} = require("../lib/cupsCatalog");

assert.strictEqual(catalogMetadata.effective_year, 2026);
assert.strictEqual(catalogMetadata.procedure_count, 9459);
assert.strictEqual(normalizeCupsCode("89.0.2.42"), "890242");
assert.strictEqual(
  getCupsDescription("890242"),
  "CONSULTA DE PRIMERA VEZ POR ESPECIALISTA EN DERMATOLOGÍA"
);
assert.strictEqual(
  getCupsDescription("89.0.3.42"),
  "CONSULTA DE CONTROL O DE SEGUIMIENTO POR ESPECIALISTA EN DERMATOLOGÍA"
);

assert.deepStrictEqual(
  resolveProcedureDescription({
    codigo: "890242",
    descripcion: " Nombre entregado por HUN ",
  }),
  {
    code: "890242",
    description: "Nombre entregado por HUN",
    source: "hun",
  }
);
assert.deepStrictEqual(
  resolveProcedureDescription({
    codigo_cups: "ABC123",
    descripcion: null,
    descripcion_cups: " Nombre desde alias ",
  }),
  {
    code: "ABC123",
    description: "Nombre desde alias",
    source: "hun",
  }
);
assert.deepStrictEqual(resolveProcedureDescription({ codigo: "ZZZZZZ" }), {
  code: "ZZZZZZ",
  description: null,
  source: null,
});

console.log("CUPS catalog checks passed.");
