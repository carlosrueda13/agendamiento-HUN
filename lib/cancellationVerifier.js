const DEFAULT_MAX_ATTEMPTS = Number(process.env.CANCEL_VERIFY_MAX_ATTEMPTS || 6);
const DEFAULT_INTERVAL_MS = Number(process.env.CANCEL_VERIFY_INTERVAL_MS || 2000);
const DEFAULT_INITIAL_DELAY_MS = Number(
  process.env.CANCEL_VERIFY_INITIAL_DELAY_MS || 1500
);

const operations = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getField(object, candidates) {
  if (!object || typeof object !== "object") return null;
  const wanted = candidates.map((key) =>
    String(key).toLowerCase().replace(/[^a-z0-9]/g, "")
  );
  const key = Object.keys(object).find((item) =>
    wanted.includes(String(item).toLowerCase().replace(/[^a-z0-9]/g, ""))
  );
  return key ? object[key] : null;
}

function classifyVerification(response) {
  const result = getField(response, ["resultado", "result"]) || {};
  const code = getField(result, ["CodigoRespuesta", "codigo_respuesta", "codigo"]);
  const message = normalizedText(
    getField(result, ["Mensaje", "mensaje", "descripcion"]) ||
      getField(response, ["Mensaje", "mensaje"])
  );
  const state = normalizedText(getField(response, ["estado", "status"]));

  if (String(code).trim() === "1" || /cancelad.*(correct|exitos)/.test(message)) {
    return { status: "success", code: code === null ? null : String(code) };
  }
  if (/proces|pendiente|ejecutando/.test(state) || /proces|pendiente|ejecutando/.test(message)) {
    return { status: "pending", code: code === null ? null : String(code) };
  }
  if (code !== null && code !== undefined && String(code).trim() !== "") {
    return { status: "failure", code: String(code) };
  }
  if (/error|fall|no se pudo|no fue cancel/.test(message)) {
    return { status: "failure", code: null };
  }
  return { status: "pending", code: null };
}

function pruneOperation(cancelOperationId, now = Date.now()) {
  const operation = operations.get(cancelOperationId);
  if (operation && operation.expiresAt <= now) {
    operations.delete(cancelOperationId);
    return null;
  }
  return operation || null;
}

function claimOperation(operation) {
  const existing = pruneOperation(operation.cancelOperationId);
  if (existing) return false;

  operations.set(operation.cancelOperationId, {
    ...operation,
    status: "posting",
    verificationPromise: null,
  });
  return true;
}

function abandonOperation(cancelOperationId) {
  operations.delete(cancelOperationId);
}

function hasOperation(cancelOperationId) {
  return Boolean(pruneOperation(cancelOperationId));
}

async function persistFinalState(operation, state, details, deps) {
  try {
    await deps.db?.finalizarOperacionCancelacion?.(operation.cancelOperationId, state, {
      last_error_code: details.errorCode || null,
      last_error_category: details.errorCategory || null,
    });
  } catch (error) {
    console.error("No se pudo persistir estado final de cancelacion:", error.message);
  }

  try {
    await deps.db?.guardarEventoOperativo?.({
      event_type: "cancelacion_verificada",
      status: state,
      source: "hun_api",
      session_id_hash: operation.sessionIdHash,
      endpoint_logico: "hun.verificar_cancelacion",
      http_status: details.httpStatus || null,
      error_code: details.errorCode || null,
      error_category: details.errorCategory || null,
      retry_count: details.retryCount || 0,
      resultado_operativo: `cancel_operation_id:${operation.cancelOperationId}`,
      motivo_fallo_simple: details.failureReason || null,
    });
  } catch (error) {
    console.error("No se pudo registrar verificacion de cancelacion:", error.message);
  }
}

async function finishOperation(operation, state, details, deps) {
  if (operation.status === "cancelada" || operation.status === "cancelacion_fallida") {
    return operation.status;
  }

  operation.status = state;
  await persistFinalState(operation, state, details, deps);

  const message = state === "cancelada"
    ? "Tu cita fue cancelada correctamente en HUN."
    : "No pudimos confirmar la cancelacion en HUN. Inicia el proceso nuevamente o comunicate con la linea telefonica del hospital.";

  try {
    await deps.whatsapp.sendText(operation.to, message);
  } catch (error) {
    console.error("No se pudo enviar resultado de cancelacion por WhatsApp:", error.message);
  }

  operation.cita = null;
  operation.to = null;
  operation.sessionIdHash = null;

  const cleanupDelay = Math.max(0, operation.expiresAt - Date.now());
  const timer = setTimeout(() => operations.delete(operation.cancelOperationId), cleanupDelay);
  timer.unref?.();
  return state;
}

async function runVerification(operation, deps, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS));
  const intervalMs = Math.max(0, Number(options.intervalMs ?? DEFAULT_INTERVAL_MS));
  const initialDelayMs = Math.max(
    0,
    Number(options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS)
  );
  const wait = options.sleep || sleep;
  let lastError = null;

  if (initialDelayMs) await wait(initialDelayMs);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (Date.now() >= operation.expiresAt) {
      return finishOperation(
        operation,
        "cancelacion_fallida",
        {
          retryCount: attempt - 1,
          errorCode: "context_expired",
          errorCategory: "expired_context",
          failureReason: "contexto_temporal_expirado",
        },
        deps
      );
    }

    try {
      const response = await deps.hun.verificarCancelacion(operation.cita);
      const result = classifyVerification(response);

      if (result.status === "success") {
        return finishOperation(
          operation,
          "cancelada",
          { retryCount: attempt - 1 },
          deps
        );
      }
      if (result.status === "failure") {
        return finishOperation(
          operation,
          "cancelacion_fallida",
          {
            retryCount: attempt - 1,
            errorCode: result.code || "hun_rejected_cancellation",
            errorCategory: "hun_business_error",
            failureReason: "hun_no_confirmo_cancelacion",
          },
          deps
        );
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts && intervalMs) await wait(intervalMs);
  }

  return finishOperation(
    operation,
    "cancelacion_fallida",
    {
      retryCount: maxAttempts - 1,
      httpStatus: lastError?.status || null,
      errorCode: lastError?.code || "verification_exhausted",
      errorCategory: lastError?.category || "verification_timeout",
      failureReason: "verificacion_agotada",
    },
    deps
  );
}

function startVerification(cancelOperationId, deps, options = {}) {
  const operation = pruneOperation(cancelOperationId);
  if (!operation || operation.verificationPromise) return false;

  operation.status = "cancelacion_procesando";
  operation.verificationPromise = runVerification(operation, deps, options).catch(
    async (error) => {
      console.error("Verificacion de cancelacion fallo:", error.message);
      return finishOperation(
        operation,
        "cancelacion_fallida",
        {
          errorCode: error.code || "verification_unexpected_error",
          errorCategory: error.category || "backend_error",
          failureReason: "verificacion_error_inesperado",
        },
        deps
      );
    }
  );
  return operation.verificationPromise;
}

module.exports = {
  claimOperation,
  abandonOperation,
  hasOperation,
  startVerification,
  _private: {
    classifyVerification,
    operations,
    reset: () => operations.clear(),
    runVerification,
  },
};
