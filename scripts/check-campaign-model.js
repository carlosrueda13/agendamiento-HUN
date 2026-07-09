const assert = require("assert");

process.env.FLOW_SESSION_PII_KEY_B64 = Buffer.alloc(32, 7).toString("base64");

const db = require("../lib/db");

function assertNoForbiddenFields(record) {
  [
    "nombre_paciente",
    "numero_documento",
    "eps",
    "medico",
    "fecha_cita",
    "hora_cita",
    "cups",
    "procedimiento",
    "numero_cita",
    "respuesta_hun",
  ].forEach((field) => {
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(record, field),
      false,
      `No debe persistir ${field}`
    );
  });
}

assert.deepStrictEqual(db.CAMPANA_ESTADOS, [
  "borrador",
  "programada",
  "enviando",
  "activa",
  "cerrada",
  "cancelada",
]);

[
  "pendiente",
  "enviado",
  "entregado",
  "respondido",
  "flow_iniciado",
  "agendado",
  "fallido",
  "excluido",
].forEach((estado) => {
  assert(db.DESTINATARIO_ESTADOS.includes(estado), `Falta estado ${estado}`);
});

const campana = db._private.buildCampanaRecord({
  nombre: "Demanda inducida psiquiatria",
  especialidad_codigo: "590",
  mensaje_template_id: "flow_agendamiento",
  estado: "programada",
  origen_datos: "api_hun_demanda_inducida",
  responsable: "Consulta Externa",
  cupos_objetivo: 50,
  nombre_paciente: "NO DEBE PASAR",
});

assert.strictEqual(campana.estado, "programada");
assert.strictEqual(campana.especialidad_codigo, "590");
assert.strictEqual(campana.responsable, "Consulta Externa");
assert.strictEqual(campana.cupos_objetivo, 50);
assertNoForbiddenFields(campana);

const campanaMultiespecialidad = db._private.buildCampanaRecord({
  nombre: "PQRS Sanitas julio",
  mensaje_template_id: "hun_oferta_cita_flow",
  estado: "programada",
  origen_datos: "api_hun_demanda_inducida",
});

assert.strictEqual(campanaMultiespecialidad.especialidad_codigo, null);
assert.strictEqual(campanaMultiespecialidad.nombre, "PQRS Sanitas julio");
assertNoForbiddenFields(campanaMultiespecialidad);

const destinatario = db._private.buildDestinatarioRecord({
  campaign_id: "00000000-0000-0000-0000-000000000001",
  whatsapp_numero: "573001112233",
  tipo_documento: "CC",
  numero_documento: " 41531776 ",
  especialidad_codigo: "590",
  nombre_paciente: "NO DEBE PASAR",
});

assert.strictEqual(destinatario.estado_contacto, "pendiente");
assert.strictEqual(destinatario.tipo_documento, "CC");
assert.match(destinatario.documento_hash, /^[a-f0-9]{64}$/);
assert.strictEqual(destinatario.numero_documento, undefined);
assertNoForbiddenFields(destinatario);

const excluido = db._private.buildDestinatarioRecord({
  campaign_id: "00000000-0000-0000-0000-000000000001",
  whatsapp_numero: "573001112233",
  documento_hash: destinatario.documento_hash,
  especialidad_codigo: "590",
  opt_out: true,
});

assert.strictEqual(excluido.estado_contacto, "excluido");
assert.strictEqual(excluido.opt_out, true);
assert.strictEqual(excluido.motivo_exclusion, "opt_out");
assertNoForbiddenFields(excluido);

const destinatarioAudiencia = db._private.buildDestinatarioRecord({
  campaign_id: "00000000-0000-0000-0000-000000000001",
  audiencia_ref: "anon-123",
  especialidad_codigo: "590",
});

assert.strictEqual(destinatarioAudiencia.audiencia_ref, "anon-123");
assert.strictEqual(destinatarioAudiencia.whatsapp_numero, null);
assert.strictEqual(destinatarioAudiencia.documento_hash, null);
assert.strictEqual(destinatarioAudiencia.estado_contacto, "pendiente");
assertNoForbiddenFields(destinatarioAudiencia);

assert.throws(
  () => db._private.buildCampanaRecord({ nombre: "X", estado: "lista" }),
  /estado no permitido/
);

console.log("Campaign model checks passed.");
