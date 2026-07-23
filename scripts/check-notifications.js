const assert = require("assert");

process.env.EMAILJS_SERVICE_ID = "service-test";
process.env.EMAILJS_TEMPLATE_ID = "confirmation-test";
process.env.EMAILJS_REMINDER_TEMPLATE_ID = "reminder-test";
process.env.EMAILJS_PUBLIC_KEY = "public-test";
process.env.EMAILJS_PRIVATE_KEY = "private-test";

const notifications = require("../lib/notifications");
const reminders = require("../lib/reminders");
const whatsapp = require("../lib/whatsapp");
const email = require("../lib/email");
const reminderRunner = require("./send-appointment-reminders");

const SENSITIVE_FIELDS = [
  "telefono",
  "whatsapp_numero",
  "correo",
  "to_email",
  "nombre",
  "documento",
  "numero_documento",
  "eps",
  "medico",
  "fecha",
  "hora",
  "especialidad",
  "procedimiento",
  "numero_cita",
  "payload",
  "body",
];

function assertNoSensitiveFields(record) {
  SENSITIVE_FIELDS.forEach((field) => {
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(record, field),
      false,
      `No debe persistir ${field} en notificaciones.`
    );
  });
}

function createFakeDb() {
  const records = new Map();
  let sequence = 0;
  return {
    records,
    async reservarRecordatorio(record) {
      assertNoSensitiveFields(record);
      assert.match(record.dedupe_key_hash, /^[a-f0-9]{64}$/);
      const key = `${record.canal}:${record.dedupe_key_hash}`;
      const existing = records.get(key);
      if (existing) return { ...existing, created: false };
      sequence += 1;
      const created = {
        ...record,
        id: `notification-${sequence}`,
        estado: "pendiente",
        retry_count: 0,
        updated_at: new Date().toISOString(),
      };
      records.set(key, created);
      return { ...created, created: true };
    },
    async actualizarNotificacion(id, changes) {
      const entry = [...records.entries()].find(([, value]) => value.id === id);
      assert.ok(entry, "La notificacion debe existir antes de actualizarla.");
      assertNoSensitiveFields(changes);
      Object.assign(entry[1], changes, { updated_at: new Date().toISOString() });
      return { ...entry[1] };
    },
  };
}

function appointment(overrides = {}) {
  return {
    Cita_Fecha: "Thu, 23 Jul 2026 00:00:00 GMT",
    Hora_Cita: "07:00",
    ESTADO: "Reservada",
    Numero_Cita: "1753791",
    Celular: "300 111 22 33",
    Correo: "PACIENTE@example.com",
    Nombre_Paciente: "PACIENTE PRUEBA",
    Especialidad: "DERMATOLOGIA",
    Medico: "MEDICO PRUEBA",
    Procedimiento: "CONSULTA DE CONTROL",
    ...overrides,
  };
}

async function testExistingNotificationContract() {
  const inserted = [];
  const fakeDb = {
    async registrarNotificacion(record) {
      inserted.push(record);
      return { id: "notification-existing" };
    },
  };

  await notifications.registrarConfirmacionWhatsApp("flow-token-123", "enviado", {
    campaignId: "campaign-1",
    recipientId: "recipient-1",
    dbClient: fakeDb,
  });
  assert.strictEqual(inserted[0].canal, "whatsapp");
  assert.strictEqual(inserted[0].tipo, "confirmacion");
  assert.match(inserted[0].session_id_hash, /^[a-f0-9]{12}$/);
  assertNoSensitiveFields(inserted[0]);
}

async function testProviderAndNormalization() {
  const calls = [];
  const provider = new reminders.HunReminderCandidateProvider({
    hunClient: {
      async consultarRecordatoriosVentana(params) {
        calls.push(params);
        return [appointment()];
      },
    },
  });
  const result = await provider.getCandidatesByWindow({
    from: "2026-07-23",
    to: "2026-07-23",
  });
  assert.deepStrictEqual(calls, [
    { fechaInicial: "2026-07-23", fechaFinal: "2026-07-23" },
  ]);
  assert.strictEqual(result.ok, true);

  const normalized = reminders.normalizeCandidate(result.candidates[0]);
  assert.strictEqual(normalized.date, "2026-07-23");
  assert.strictEqual(normalized.hour, "07:00");
  assert.strictEqual(normalized.phone, "573001112233");
  assert.strictEqual(normalized.email, "paciente@example.com");

  const blocked = await new reminders.HunReminderCandidateProvider({
    hunClient: {},
  }).getCandidatesByWindow({ from: "2026-07-23", to: "2026-07-23" });
  assert.strictEqual(blocked.blocked, true);
}

function testDatesAndPayloads() {
  assert.strictEqual(
    reminders.targetReminderDate({
      now: new Date("2026-07-23T04:30:00.000Z"),
      timeZone: "America/Bogota",
    }),
    "2026-07-23"
  );
  assert.strictEqual(
    reminders.normalizeAppointmentDate("Thu, 23 Jul 2026 00:00:00 GMT"),
    "2026-07-23"
  );
  assert.throws(
    () => reminders._private.toApiDate("2026-02-30", "fecha"),
    /fecha valida/
  );

  const payload = whatsapp._private.buildReminderTemplatePayload({
    to: "573001112233",
    templateName: "hun_recordatorio_cita_24h",
    languageCode: "es_CO",
    fecha: "Jueves, 23 de julio de 2026",
    hora: "7:00 a. m.",
    especialidad: "DERMATOLOGIA",
    nombre: "PACIENTE PRUEBA",
  });
  assert.deepStrictEqual(
    payload.template.components[0].parameters.map((parameter) => parameter.text),
    [
      "Jueves, 23 de julio de 2026",
      "7:00 a. m.",
      "DERMATOLOGIA",
      "PACIENTE PRUEBA",
    ]
  );

  const emailParams = email._private.buildReminderTemplateParams({
    to_email: "paciente@example.com",
    to_name: "PACIENTE PRUEBA",
    especialidad: "DERMATOLOGIA",
    medico: "MEDICO PRUEBA",
    tipo_consulta: "CONSULTA DE CONTROL",
    fecha: "Jueves, 23 de julio de 2026",
    hora: "7:00 a. m.",
    numero_cita: "1753791",
    anio: "2026",
  });
  assert.strictEqual(emailParams.tipo_consulta, "CONSULTA DE CONTROL");
  assert.strictEqual(emailParams.numero_cita, "1753791");
  assert.strictEqual(emailParams.consultorio, undefined);

  const secret = Buffer.alloc(32, 17).toString("base64");
  const dedupe = reminders.createReminderDedupeKey(
    reminders.normalizeCandidate(appointment()),
    secret
  );
  assert.match(dedupe, /^[a-f0-9]{64}$/);
  assert.strictEqual(dedupe.includes("1753791"), false);
}

async function testEmailJsAdapterTimeout() {
  const calls = [];
  const fakeHttpClient = {
    async post(url, body, options) {
      calls.push({ url, body, options });
      return { status: 200, data: "OK" };
    },
  };

  await email._private.sendEmailJsTemplate(
    "confirmation-test",
    { to_email: "paciente@example.com" },
    fakeHttpClient
  );

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, email._private.EMAILJS_SEND_URL);
  assert.strictEqual(calls[0].body.service_id, "service-test");
  assert.strictEqual(calls[0].body.template_id, "confirmation-test");
  assert.strictEqual(calls[0].body.user_id, "public-test");
  assert.strictEqual(calls[0].body.accessToken, "private-test");
  assert.strictEqual(calls[0].options.timeout, 20000);

  assert.deepStrictEqual(
    email._private.emailJsFailure({ code: "ECONNABORTED" }),
    {
      sent: false,
      reason: "provider_timeout",
      provider_status: null,
    }
  );
  assert.deepStrictEqual(
    email._private.emailJsFailure({ response: { status: 403 } }),
    {
      sent: false,
      reason: "provider_rejected",
      provider_status: 403,
    }
  );
}

async function testServiceAndDedupe() {
  const rows = [
    appointment(),
    appointment({ Numero_Cita: "2", ESTADO: "Cancelada" }),
    appointment({ Numero_Cita: "3", Cita_Fecha: "Fri, 24 Jul 2026 00:00:00 GMT" }),
  ];
  const provider = {
    async getCandidatesByWindow() {
      return { ok: true, blocked: false, candidates: rows };
    },
  };
  const fakeDb = createFakeDb();
  const whatsappCalls = [];
  const emailCalls = [];
  const env = {
    REMINDER_DEDUPE_SECRET_B64: Buffer.alloc(32, 18).toString("base64"),
    REMINDER_TEMPLATE_NAME: "hun_recordatorio_cita_24h",
    REMINDER_TEMPLATE_LANGUAGE: "es_CO",
    EMAILJS_REMINDER_TEMPLATE_ID: "reminder-test",
    REMINDER_MAX_ATTEMPTS: "3",
    REMINDER_CONCURRENCY: "2",
    REMINDER_RETRY_BASE_MS: "0",
  };
  const service = reminders.createReminderService({
    provider,
    dbClient: fakeDb,
    whatsappClient: {
      async sendReminderTemplate(params) {
        whatsappCalls.push(params);
        return { messages: [{ id: "wamid.test" }] };
      },
    },
    emailClient: {
      async enviarRecordatorio(params) {
        emailCalls.push(params);
        return { id: "email-test" };
      },
    },
    env,
    sleep: async () => {},
  });

  const first = await service.run({ targetDate: "2026-07-23" });
  assert.strictEqual(first.consulted, 3);
  assert.strictEqual(first.eligible, 1);
  assert.strictEqual(first.ignored, 2);
  assert.strictEqual(first.whatsapp.sent, 1);
  assert.strictEqual(first.email.sent, 1);
  assert.strictEqual(whatsappCalls[0].nombre, "PACIENTE PRUEBA");
  assert.strictEqual(emailCalls[0].tipo_consulta, "CONSULTA DE CONTROL");
  assert.strictEqual(emailCalls[0].consultorio, undefined);

  const second = await service.run({ targetDate: "2026-07-23" });
  assert.strictEqual(second.whatsapp.duplicate, 1);
  assert.strictEqual(second.email.duplicate, 1);
  assert.strictEqual(whatsappCalls.length, 1);
  assert.strictEqual(emailCalls.length, 1);

  for (const record of fakeDb.records.values()) assertNoSensitiveFields(record);
}

async function testChannelIndependenceAndRetry() {
  const fakeDb = createFakeDb();
  let whatsappAttempts = 0;
  let emailAttempts = 0;
  const service = reminders.createReminderService({
    provider: {
      async getCandidatesByWindow() {
        return {
          ok: true,
          blocked: false,
          candidates: [appointment({ Numero_Cita: "retry-1" })],
        };
      },
    },
    dbClient: fakeDb,
    whatsappClient: {
      async sendReminderTemplate() {
        whatsappAttempts += 1;
        if (whatsappAttempts === 1) {
          const error = new Error("network");
          error.code = "ECONNRESET";
          throw error;
        }
        return { messages: [{ id: "wamid.retry" }] };
      },
    },
    emailClient: {
      async enviarRecordatorio() {
        emailAttempts += 1;
        const error = new Error("invalid template");
        error.response = { status: 400 };
        throw error;
      },
    },
    env: {
      REMINDER_DEDUPE_SECRET_B64: Buffer.alloc(32, 19).toString("base64"),
      EMAILJS_REMINDER_TEMPLATE_ID: "reminder-test",
      REMINDER_MAX_ATTEMPTS: "3",
      REMINDER_RETRY_BASE_MS: "0",
    },
    sleep: async () => {},
  });

  const result = await service.run({ targetDate: "2026-07-23" });
  assert.strictEqual(whatsappAttempts, 2);
  assert.strictEqual(emailAttempts, 1);
  assert.strictEqual(result.whatsapp.sent, 1);
  assert.strictEqual(result.email.failed, 1);
  const emailRecord = [...fakeDb.records.values()].find(
    (record) => record.canal === "email"
  );
  assert.strictEqual(emailRecord.retry_count, 3);
}

async function testDryRunAndRunnerConfig() {
  let wrote = false;
  const service = reminders.createReminderService({
    provider: {
      async getCandidatesByWindow() {
        return { ok: true, blocked: false, candidates: [appointment()] };
      },
    },
    dbClient: {
      async reservarRecordatorio() {
        wrote = true;
      },
    },
    whatsappClient: { async sendReminderTemplate() { throw new Error("unexpected"); } },
    emailClient: { async enviarRecordatorio() { throw new Error("unexpected"); } },
    env: {},
  });
  const result = await service.run({ targetDate: "2026-07-23", dryRun: true });
  assert.strictEqual(wrote, false);
  assert.strictEqual(result.whatsapp.would_send, 1);
  assert.strictEqual(result.email.would_send, 1);

  assert.deepStrictEqual(
    reminderRunner.parseArgs(["--dry-run", "--date", "2026-07-23"]),
    { dryRun: true, targetDate: "2026-07-23" }
  );
  assert.doesNotThrow(() =>
    reminderRunner.validateRuntimeConfiguration(
      { HUN_API_BASE: "http://hun", HUN_API_KEY: "test" },
      { dryRun: true }
    )
  );
  assert.throws(
    () => reminderRunner.validateRuntimeConfiguration({}, { dryRun: false }),
    /Configuracion faltante/
  );

  const liveEnv = {
    HUN_API_BASE: "http://hun",
    HUN_API_KEY: "test",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test",
    WHATSAPP_TOKEN: "test",
    PHONE_NUMBER_ID: "test",
    REMINDER_DEDUPE_SECRET_B64: Buffer.alloc(32, 20).toString("base64"),
    EMAILJS_SERVICE_ID: "test",
    EMAILJS_REMINDER_TEMPLATE_ID: "test",
    EMAILJS_PUBLIC_KEY: "test",
    EMAILJS_PRIVATE_KEY: "test",
  };
  assert.throws(
    () => reminderRunner.validateRuntimeConfiguration(liveEnv, { dryRun: false }),
    /REMINDER_SEND_ENABLED/
  );
  assert.doesNotThrow(() =>
    reminderRunner.validateRuntimeConfiguration(
      { ...liveEnv, REMINDER_SEND_ENABLED: "true" },
      { dryRun: false }
    )
  );

  const filteredService = reminders.createReminderService({
    provider: {
      async getCandidatesByWindow() {
        return { ok: true, blocked: false, candidates: [appointment()] };
      },
    },
    env: {
      REMINDER_TEST_MODE: "true",
      REMINDER_TEST_APPOINTMENT_NUMBERS: "otra-cita",
    },
  });
  const filtered = await filteredService.run({
    targetDate: "2026-07-23",
    dryRun: true,
  });
  assert.strictEqual(filtered.eligible, 1);
  assert.strictEqual(filtered.test_filtered, 1);
}

async function main() {
  await testExistingNotificationContract();
  await testProviderAndNormalization();
  testDatesAndPayloads();
  await testEmailJsAdapterTimeout();
  await testServiceAndDedupe();
  await testChannelIndependenceAndRetry();
  await testDryRunAndRunnerConfig();

  const rules = reminders.reminderRules({
    REMINDER_LOOKAHEAD_HOURS: "72",
    REMINDER_MAX_ATTEMPTS: "2",
  });
  assert.strictEqual(rules.lookahead_hours, 72);
  assert.strictEqual(rules.max_attempts, 2);
  assert.strictEqual(rules.source_of_truth, "hun_window_query");
  assert.strictEqual(rules.stores_appointment_locally, false);

  console.log("Notification checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
