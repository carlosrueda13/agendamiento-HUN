const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) {
    throw new Error(`${label}: falta patron requerido ${pattern}`);
  }
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) {
    throw new Error(`${label}: patron prohibido encontrado ${pattern}`);
  }
}

const db = read("lib/db.js");
const flowHandler = read("lib/flowHandler.js");

function eventBodies(content) {
  const bodies = [];
  let index = 0;

  while (index < content.length) {
    const callIndex = content.indexOf("guardarEventoFlow(", index);
    if (callIndex === -1) break;

    const objectStart = content.indexOf("{", callIndex);
    if (objectStart === -1) break;

    let depth = 0;
    for (let i = objectStart; i < content.length; i += 1) {
      if (content[i] === "{") depth += 1;
      if (content[i] === "}") depth -= 1;
      if (depth === 0) {
        bodies.push(content.slice(objectStart, i + 1));
        index = i + 1;
        break;
      }
    }
  }

  return bodies;
}

[
  /async function guardarEventoOperativo/,
  /session_id_hash: evento\.session_id_hash/,
  /estado_contacto: evento\.estado_contacto/,
  /ultimo_evento: evento\.ultimo_evento/,
  /try \{/,
  /catch \(error\)/,
].forEach((pattern) => assertMatch("lib/db.js", db, pattern));

[
  /function errorEvento/,
  /function sourceFromError/,
  /async function guardarEventoFlow/,
  /async function sendTextConEvento/,
  /event_type: "flow_data_exchange"/,
  /event_type: "flow_identificacion"/,
  /event_type: "flow_especialidad"/,
  /event_type: "flow_slot"/,
  /event_type: "flow_confirmacion"/,
  /event_type: "asignacion_cita"/,
  /event_type: "whatsapp_mensaje"/,
].forEach((pattern) => assertMatch("lib/flowHandler.js", flowHandler, pattern));

const forbiddenEventPatterns = [
  /documento\s*:/,
  /numero_cita\s*:/,
  /eps_codigo\s*:/,
  /nombre_paciente\s*:/,
  /fecha\s*:/,
  /hora\s*:/,
  /agenda_detalle_id\s*:/,
  /respuesta_hun\s*:/,
];

eventBodies(flowHandler).forEach((body, index) => {
  forbiddenEventPatterns.forEach((pattern) =>
    assertNoMatch(`guardarEventoFlow #${index + 1}`, body, pattern)
  );
});

console.log("Flow operational event checks passed.");
