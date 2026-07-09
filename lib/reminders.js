const DEFAULT_LOOKAHEAD_HOURS = Number(process.env.REMINDER_LOOKAHEAD_HOURS || 48);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.REMINDER_MAX_ATTEMPTS || 3);

function toIsoDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} debe ser una fecha valida.`);
  }
  return date.toISOString();
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

class ReminderCandidateProvider {
  async getCandidatesByWindow() {
    throw new Error("ReminderCandidateProvider.getCandidatesByWindow debe implementarse.");
  }
}

class HunReminderCandidateProvider extends ReminderCandidateProvider {
  constructor({ hunClient = null, endpointConfigured = false } = {}) {
    super();
    this.hunClient = hunClient;
    this.endpointConfigured = endpointConfigured;
  }

  async getCandidatesByWindow({ from, to } = {}) {
    const window = {
      from: toIsoDate(from, "from"),
      to: toIsoDate(to, "to"),
    };

    if (!this.endpointConfigured || !this.hunClient?.consultarRecordatoriosVentana) {
      return {
        ok: false,
        blocked: true,
        reason: "hun_reminder_window_endpoint_missing",
        window,
        candidates: [],
      };
    }

    const candidates = await this.hunClient.consultarRecordatoriosVentana(window);
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
    max_attempts: Number(env.REMINDER_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS),
    dedupe_scope: "session_or_campaign_recipient_and_window",
    source_of_truth: "hun_window_query",
    stores_appointment_locally: false,
  };
}

module.exports = {
  ReminderCandidateProvider,
  HunReminderCandidateProvider,
  buildReminderWindow,
  reminderRules,
};
