require("dotenv").config();

const { createReminderService, targetReminderDate } = require("../lib/reminders");

function parseArgs(argv) {
  const result = { dryRun: false, targetDate: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      result.dryRun = true;
    } else if (value === "--date") {
      result.targetDate = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Argumento no reconocido: ${value}`);
    }
  }

  if (result.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(result.targetDate)) {
    throw new Error("--date debe usar formato YYYY-MM-DD.");
  }
  return result;
}

function validateRuntimeConfiguration(env, { dryRun }) {
  const required = ["HUN_API_BASE", "HUN_API_KEY"];
  if (!dryRun) {
    required.push(
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "WHATSAPP_TOKEN",
      "PHONE_NUMBER_ID",
      "REMINDER_DEDUPE_SECRET_B64",
      "EMAILJS_SERVICE_ID",
      "EMAILJS_REMINDER_TEMPLATE_ID",
      "EMAILJS_PUBLIC_KEY",
      "EMAILJS_PRIVATE_KEY"
    );
  }

  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    const error = new Error(`Configuracion faltante: ${missing.join(", ")}`);
    error.code = "reminder_configuration_missing";
    throw error;
  }

  if (!dryRun && String(env.REMINDER_SEND_ENABLED || "").toLowerCase() !== "true") {
    const error = new Error("REMINDER_SEND_ENABLED debe ser true para enviar.");
    error.code = "reminder_send_disabled";
    throw error;
  }

  if (
    !dryRun &&
    String(env.REMINDER_TEST_MODE || "").toLowerCase() === "true" &&
    !String(env.REMINDER_TEST_APPOINTMENT_NUMBERS || "").trim()
  ) {
    const error = new Error(
      "REMINDER_TEST_APPOINTMENT_NUMBERS es obligatoria en modo de prueba."
    );
    error.code = "reminder_test_allowlist_missing";
    throw error;
  }

}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateRuntimeConfiguration(process.env, args);
  const targetDate = args.targetDate || targetReminderDate({
    timeZone: process.env.REMINDER_TIME_ZONE || "America/Bogota",
  });

  const summary = await createReminderService().run({
    targetDate,
    dryRun: args.dryRun,
  });

  console.log("Resumen de recordatorios:", JSON.stringify(summary));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fallo ejecucion de recordatorios:", error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseArgs,
  validateRuntimeConfiguration,
};
