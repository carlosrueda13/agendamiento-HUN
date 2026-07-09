const assert = require("assert");

const notifications = require("../lib/notifications");
const reminders = require("../lib/reminders");

const inserted = [];
const fakeDb = {
  async registrarNotificacion(record) {
    inserted.push(record);
    return { id: `notification-${inserted.length}` };
  },
};

(async () => {
  await notifications.registrarConfirmacionWhatsApp("flow-token-123", "enviado", {
    campaignId: "campaign-1",
    recipientId: "recipient-1",
    dbClient: fakeDb,
  });

  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0].canal, "whatsapp");
  assert.strictEqual(inserted[0].tipo, "confirmacion");
  assert.strictEqual(inserted[0].estado, "enviado");
  assert.strictEqual(inserted[0].proveedor, "whatsapp_cloud_api");
  assert.match(inserted[0].session_id_hash, /^[a-f0-9]{12}$/);

  [
    "telefono",
    "whatsapp_numero",
    "nombre",
    "documento",
    "numero_documento",
    "eps",
    "medico",
    "fecha",
    "hora",
    "numero_cita",
    "payload",
    "body",
  ].forEach((field) => {
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(inserted[0], field),
      false,
      `No debe persistir ${field} en notificaciones.`
    );
  });

  const window = reminders.buildReminderWindow({
    from: "2026-07-01T00:00:00.000Z",
    lookaheadHours: 24,
  });
  assert.deepStrictEqual(window, {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-02T00:00:00.000Z",
  });

  const provider = new reminders.HunReminderCandidateProvider();
  const result = await provider.getCandidatesByWindow(window);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.reason, "hun_reminder_window_endpoint_missing");
  assert.deepStrictEqual(result.candidates, []);

  const rules = reminders.reminderRules({
    REMINDER_LOOKAHEAD_HOURS: "72",
    REMINDER_MAX_ATTEMPTS: "2",
  });
  assert.strictEqual(rules.lookahead_hours, 72);
  assert.strictEqual(rules.max_attempts, 2);
  assert.strictEqual(rules.source_of_truth, "hun_window_query");
  assert.strictEqual(rules.stores_appointment_locally, false);

  console.log("Notification checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
