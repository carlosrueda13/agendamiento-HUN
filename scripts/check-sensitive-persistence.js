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
const server = read("server.js");
const whatsapp = read("lib/whatsapp.js");
const email = read("lib/email.js");

assertMatch("lib/db.js", db, /flow_sesiones_temporales/);
assertMatch("lib/db.js", db, /contacto_email_enc/);
assertMatch("lib/db.js", db, /contacto_email_hmac/);
assertMatch("lib/db.js", db, /aes-256-gcm/);
assertMatch("lib/db.js", db, /createHmac\("sha256"/);

[
  /pacientes_whatsapp/,
  /citas_agendadas/,
  /\.from\(["']sesiones["']\)/,
  /guardarPaciente/,
  /getPaciente/,
  /guardarCita/,
  /slot_seleccionado/,
  /respuesta_hun/,
  /numero_cita/,
  /fecha_cita/,
  /hora_cita/,
  /agenda_detalle_id.*insert/s,
].forEach((pattern) => assertNoMatch("lib/db.js", db, pattern));

[
  /db\.guardarPaciente/,
  /db\.getPaciente/,
  /db\.guardarCita/,
  /db\.guardarSesion\(/,
  /db\.getSesion\(/,
  /slot_seleccionado/,
  /respuesta_hun/,
  /JSON\.stringify\(resp/,
  /Respuesta asignar_cita/,
].forEach((pattern) => assertNoMatch("lib/flowHandler.js", flowHandler, pattern));

[
  /JSON\.stringify\(p\.data/,
  /JSON\.stringify\(error\.response\.data/,
  /JSON\.stringify\(error\.config\.params/,
  /Mensaje entrante de \$\{to\}/,
  /Flow enviado a \$\{to\}/,
].forEach((pattern) => assertNoMatch("server.js", server, pattern));

[
  /confirmacion enviado a \$\{to\}/,
  /JSON\.stringify\(e\.response\.data/,
].forEach((pattern) => assertNoMatch("lib/whatsapp.js", whatsapp, pattern));

[
  /to_email\}/,
  /enviado a \$\{to_email\}/,
  /JSON\.stringify\(.*to_email/s,
].forEach((pattern) => assertNoMatch("lib/email.js", email, pattern));

console.log("Sensitive persistence checks passed.");
