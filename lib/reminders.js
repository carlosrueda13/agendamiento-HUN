const crypto = require("crypto");
const hun = require("./hun");
const db = require("./db");
const whatsapp = require("./whatsapp");
const email = require("./email");

const DEFAULT_LOOKAHEAD_HOURS = Number(process.env.REMINDER_LOOKAHEAD_HOURS || 48);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.REMINDER_MAX_ATTEMPTS || 3);
const DEFAULT_CONCURRENCY = Number(process.env.REMINDER_CONCURRENCY || 5);
const DEFAULT_TIME_ZONE = process.env.REMINDER_TIME_ZONE || "America/Bogota";
const DEFAULT_TEMPLATE_NAME =
  process.env.REMINDER_TEMPLATE_NAME || "hun_recordatorio_cita_24h";
const DEFAULT_TEMPLATE_LANGUAGE =
  process.env.REMINDER_TEMPLATE_LANGUAGE || "es_CO";

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toIsoDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} debe ser una fecha valida.`);
  }
  return date.toISOString();
}

function toApiDate(value, fieldName) {
  const text = cleanText(value);
  const direct = text?.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) {
    const [year, month, day] = direct[1].split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error(`${fieldName} debe ser una fecha valida.`);
    }
    return direct[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} debe ser una fecha valida.`);
  }
  return date.toISOString().slice(0, 10);
}

function buildReminderWindow({
  from = new Date(),
  lookaheadHours = DEFAULT_LOOKAHEAD_HOURS,
} = {}) {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) {
    throw new Error("from debe ser una fecha valida.");
  }

  const hours = Number(lookaheadHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("lookaheadHours debe ser mayor a cero.");
  }

  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + hours * 3600000).toISOString(),
  };
}

function isoDateInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addIsoDays(isoDate, days) {
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("isoDate debe usar formato YYYY-MM-DD.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function targetReminderDate({ now = new Date(), timeZone = DEFAULT_TIME_ZONE } = {}) {
  return addIsoDays(isoDateInTimeZone(now, timeZone), 1);
}

function normalizeAppointmentDate(value) {
  const text = cleanText(value);
  if (!text) return null;

  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  const latin = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (latin) return `${latin[3]}-${latin[2]}-${latin[1]}`;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

function normalizeHour(value) {
  const text = cleanText(value);
  const match = text?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeColombianPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("573")) return digits;
  return null;
}

function normalizeEmail(value) {
  const emailAddress = cleanText(value)?.toLowerCase();
  if (!emailAddress || emailAddress.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)
    ? emailAddress
    : null;
}

function formatDateForMessage(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatHourForMessage(hour) {
  const [hours, minutes] = hour.split(":").map(Number);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)));
}

function normalizeCandidate(row) {
  return {
    appointmentNumber: cleanText(row?.Numero_Cita ?? row?.numero_cita),
    date: normalizeAppointmentDate(row?.Cita_Fecha ?? row?.fecha),
    hour: normalizeHour(row?.Hora_Cita ?? row?.hora),
    status: cleanText(row?.ESTADO ?? row?.Estado ?? row?.estado)?.toUpperCase(),
    name: cleanText(row?.Nombre_Paciente ?? row?.nombre_paciente),
    specialty: cleanText(row?.Especialidad ?? row?.especialidad),
    doctor: cleanText(row?.Medico ?? row?.medico),
    procedure: cleanText(row?.Procedimiento ?? row?.procedimiento),
    phone: normalizeColombianPhone(row?.Celular) || normalizeColombianPhone(row?.Telefono),
    email: normalizeEmail(row?.Correo ?? row?.correo),
  };
}

function decodeDedupeSecret(value) {
  const text = cleanText(value);
  if (!text) {
    const error = new Error("REMINDER_DEDUPE_SECRET_B64 no esta configurada.");
    error.code = "reminder_dedupe_secret_missing";
    error.category = "configuration";
    throw error;
  }
  const key = Buffer.from(text, "base64");
  if (key.length < 32 || key.equals(Buffer.alloc(key.length))) {
    const error = new Error("REMINDER_DEDUPE_SECRET_B64 debe contener al menos 32 bytes aleatorios.");
    error.code = "reminder_dedupe_secret_invalid";
    error.category = "configuration";
    throw error;
  }
  return key;
}

function createReminderDedupeKey(candidate, secret) {
  if (!candidate.appointmentNumber || !candidate.date || !candidate.hour) {
    return null;
  }
  const key = Buffer.isBuffer(secret) ? secret : decodeDedupeSecret(secret);
  const canonical = [candidate.appointmentNumber, candidate.date, candidate.hour].join("|");
  return crypto.createHmac("sha256", key).update(canonical).digest("hex");
}

function hashExternalMessageId(value) {
  const id = cleanText(value);
  return id ? crypto.createHash("sha256").update(id).digest("hex") : null;
}

function isTransientError(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  return (
    status === 429 ||
    status >= 500 ||
    ["ECONNABORTED", "ETIMEDOUT", "ECONNRESET", "ENETUNREACH", "EAI_AGAIN"].includes(error?.code) ||
    error?.category === "timeout" ||
    error?.category === "network_error"
  );
}

function safeError(error) {
  return {
    code: cleanText(error?.code || error?.response?.status || "provider_error")?.slice(0, 80),
    category: cleanText(error?.category || (isTransientError(error) ? "transient" : "provider"))?.slice(0, 80),
  };
}

async function retryOperation(operation, {
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = Number(process.env.REMINDER_RETRY_BASE_MS || 1000),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      return { value: await operation(), attempts };
    } catch (error) {
      error.reminderAttempts = attempts;
      if (!isTransientError(error) || attempts >= maxAttempts) throw error;
      const jitter = Math.floor(Math.random() * Math.max(1, baseDelayMs / 4));
      await sleep(baseDelayMs * 2 ** (attempts - 1) + jitter);
    }
  }
  throw new Error("No fue posible ejecutar el recordatorio.");
}

async function mapWithConcurrency(items, concurrency, worker) {
  const safeConcurrency = Math.max(1, Math.min(20, Number(concurrency) || 1));
  let index = 0;
  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}

class ReminderCandidateProvider {
  async getCandidatesByWindow() {
    throw new Error("ReminderCandidateProvider.getCandidatesByWindow debe implementarse.");
  }
}

class HunReminderCandidateProvider extends ReminderCandidateProvider {
  constructor({ hunClient = hun } = {}) {
    super();
    this.hunClient = hunClient;
  }

  async getCandidatesByWindow({ from, to } = {}) {
    const window = {
      from: toApiDate(from, "from"),
      to: toApiDate(to, "to"),
    };

    if (!this.hunClient?.consultarRecordatoriosVentana) {
      return {
        ok: false,
        blocked: true,
        reason: "hun_reminder_window_endpoint_missing",
        window,
        candidates: [],
      };
    }

    const candidates = await this.hunClient.consultarRecordatoriosVentana({
      fechaInicial: window.from,
      fechaFinal: window.to,
    });
    return {
      ok: true,
      blocked: false,
      window,
      candidates: Array.isArray(candidates) ? candidates : [],
    };
  }
}

function reminderRules(env = process.env) {
  return {
    lookahead_hours: Number(env.REMINDER_LOOKAHEAD_HOURS || DEFAULT_LOOKAHEAD_HOURS),
    max_attempts: Math.max(
      1,
      Math.min(10, Number(env.REMINDER_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS) || 1)
    ),
    concurrency: Math.max(
      1,
      Math.min(20, Number(env.REMINDER_CONCURRENCY || DEFAULT_CONCURRENCY) || 1)
    ),
    time_zone: env.REMINDER_TIME_ZONE || DEFAULT_TIME_ZONE,
    dedupe_scope: "appointment_date_time_hmac_and_channel",
    source_of_truth: "hun_window_query",
    stores_appointment_locally: false,
  };
}

function createSummary(targetDate, dryRun) {
  return {
    target_date: targetDate,
    dry_run: dryRun,
    consulted: 0,
    eligible: 0,
    ignored: 0,
    invalid_identity: 0,
    test_filtered: 0,
    whatsapp: { sent: 0, failed: 0, omitted: 0, duplicate: 0, would_send: 0 },
    email: { sent: 0, failed: 0, omitted: 0, duplicate: 0, would_send: 0 },
  };
}

function shouldSkipReservation(reservation, maxAttempts) {
  if (["enviado", "entregado", "omitido"].includes(reservation.estado)) return true;
  if (Number(reservation.retry_count || 0) >= maxAttempts) return true;
  // Un estado incierto no se reenvia automaticamente: se prioriza no duplicar.
  return reservation.estado === "enviando";
}

function createReminderService({
  provider = new HunReminderCandidateProvider(),
  dbClient = db,
  whatsappClient = whatsapp,
  emailClient = email,
  env = process.env,
  now = () => new Date(),
  sleep,
} = {}) {
  const rules = reminderRules(env);
  const templateName = env.REMINDER_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME;
  const templateLanguage = env.REMINDER_TEMPLATE_LANGUAGE || DEFAULT_TEMPLATE_LANGUAGE;
  const emailTemplateId = env.EMAILJS_REMINDER_TEMPLATE_ID || null;
  const retryBaseDelayMs = Number(env.REMINDER_RETRY_BASE_MS || 1000);
  const testMode = String(env.REMINDER_TEST_MODE || "").toLowerCase() === "true";
  const testAppointments = new Set(
    String(env.REMINDER_TEST_APPOINTMENT_NUMBERS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  async function reserveAndSend({ candidate, channel, dedupeKey, send, summary }) {
    const contact = channel === "whatsapp" ? candidate.phone : candidate.email;
    const channelSummary = summary[channel];

    if (summary.dry_run) {
      channelSummary[contact ? "would_send" : "omitted"] += 1;
      return;
    }

    const reservation = await dbClient.reservarRecordatorio?.({
      canal: channel,
      dedupe_key_hash: dedupeKey,
      proveedor: channel === "whatsapp" ? "whatsapp_cloud_api" : "emailjs",
      mensaje_template_id: channel === "whatsapp" ? templateName : emailTemplateId,
    });
    if (!reservation) {
      const error = new Error("No fue posible reservar la notificacion en Supabase.");
      error.code = "reminder_persistence_unavailable";
      error.category = "persistence";
      throw error;
    }

    if (shouldSkipReservation(reservation, rules.max_attempts)) {
      channelSummary.duplicate += 1;
      return;
    }

    if (!contact) {
      await dbClient.actualizarNotificacion?.(reservation.id, {
        estado: "omitido",
        error_code: `${channel}_contact_invalid`,
        error_category: "validation",
      });
      channelSummary.omitted += 1;
      return;
    }

    const previousAttempts = Number(reservation.retry_count || 0);
    const sendingState = await dbClient.actualizarNotificacion?.(reservation.id, {
      estado: "enviando",
      retry_count: previousAttempts,
      error_code: null,
      error_category: null,
    });
    if (!sendingState) {
      const error = new Error("No fue posible confirmar el estado enviando.");
      error.code = "reminder_persistence_unavailable";
      error.category = "persistence";
      throw error;
    }

    try {
      const result = await retryOperation(send, {
        maxAttempts: Math.max(1, rules.max_attempts - previousAttempts),
        baseDelayMs: retryBaseDelayMs,
        sleep,
      });
      const externalId =
        result.value?.messages?.[0]?.id || result.value?.messageId || result.value?.id;
      const sentState = await dbClient.actualizarNotificacion?.(reservation.id, {
        estado: "enviado",
        retry_count: previousAttempts + result.attempts,
        external_message_id_hash: hashExternalMessageId(externalId),
        error_code: null,
        error_category: null,
      });
      if (!sentState) {
        // Se conserva `enviando` para impedir reenvio automatico tras respuesta incierta.
        channelSummary.failed += 1;
        return;
      }
      channelSummary.sent += 1;
    } catch (error) {
      const errorInfo = safeError(error);
      const retryCount = isTransientError(error)
        ? previousAttempts + Number(error.reminderAttempts || 1)
        : rules.max_attempts;
      await dbClient.actualizarNotificacion?.(reservation.id, {
        estado: "fallido",
        retry_count: retryCount,
        error_code: errorInfo.code,
        error_category: errorInfo.category,
      });
      channelSummary.failed += 1;
    }
  }

  return {
    async run({ targetDate, dryRun = false } = {}) {
      const date = targetDate || targetReminderDate({ now: now(), timeZone: rules.time_zone });
      const summary = createSummary(toApiDate(date, "targetDate"), Boolean(dryRun));
      const result = await provider.getCandidatesByWindow({
        from: summary.target_date,
        to: summary.target_date,
      });

      if (!result.ok || result.blocked) {
        const error = new Error("El proveedor HUN de recordatorios no esta disponible.");
        error.code = result.reason || "hun_reminder_provider_unavailable";
        error.category = "configuration";
        throw error;
      }

      summary.consulted = result.candidates.length;
      const eligibleCandidates = result.candidates.map(normalizeCandidate).filter((candidate) => {
        const eligible = candidate.status === "RESERVADA" && candidate.date === summary.target_date;
        if (!eligible) summary.ignored += 1;
        return eligible;
      });
      summary.eligible = eligibleCandidates.length;
      const candidates = eligibleCandidates.filter((candidate) => {
        const allowed = !testMode || testAppointments.has(candidate.appointmentNumber);
        if (!allowed) summary.test_filtered += 1;
        return allowed;
      });

      const secret = dryRun ? null : decodeDedupeSecret(env.REMINDER_DEDUPE_SECRET_B64);
      await mapWithConcurrency(candidates, rules.concurrency, async (candidate) => {
        const dedupeKey = dryRun ? "dry-run" : createReminderDedupeKey(candidate, secret);
        if (!dedupeKey || !candidate.name || !candidate.specialty || !candidate.date || !candidate.hour) {
          summary.invalid_identity += 1;
          return;
        }

        const fecha = formatDateForMessage(candidate.date);
        const hora = formatHourForMessage(candidate.hour);
        await Promise.all([
          reserveAndSend({
            candidate,
            channel: "whatsapp",
            dedupeKey,
            summary,
            send: () => whatsappClient.sendReminderTemplate({
              to: candidate.phone,
              templateName,
              languageCode: templateLanguage,
              fecha,
              hora,
              especialidad: candidate.specialty,
              nombre: candidate.name,
            }),
          }),
          reserveAndSend({
            candidate,
            channel: "email",
            dedupeKey,
            summary,
            send: () => emailClient.enviarRecordatorio({
              to_email: candidate.email,
              to_name: candidate.name,
              especialidad: candidate.specialty,
              medico: candidate.doctor || "Por confirmar",
              tipo_consulta: candidate.procedure || "Por confirmar",
              fecha,
              hora,
              numero_cita: candidate.appointmentNumber,
              anio: candidate.date.slice(0, 4),
            }),
          }),
        ]);
      });

      return summary;
    },
  };
}

module.exports = {
  ReminderCandidateProvider,
  HunReminderCandidateProvider,
  buildReminderWindow,
  targetReminderDate,
  normalizeCandidate,
  normalizeAppointmentDate,
  normalizeColombianPhone,
  normalizeEmail,
  formatDateForMessage,
  formatHourForMessage,
  createReminderDedupeKey,
  createReminderService,
  reminderRules,
  _private: {
    addIsoDays,
    decodeDedupeSecret,
    hashExternalMessageId,
    isTransientError,
    mapWithConcurrency,
    retryOperation,
    safeError,
    shouldSkipReservation,
    toApiDate,
  },
};
