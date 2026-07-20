const assert = require("assert");

const verifier = require("../lib/cancellationVerifier");

function operation(id) {
  return {
    cancelOperationId: id.repeat(64),
    cita: "111111",
    to: "573001112233",
    sessionIdHash: "a".repeat(64),
    expiresAt: Date.now() + 60000,
  };
}

function createDeps(responses) {
  const finalStates = [];
  const events = [];
  const messages = [];
  const completionActions = [];
  let calls = 0;

  return {
    deps: {
      hun: {
        verificarCancelacion: async () => {
          const response = responses[Math.min(calls, responses.length - 1)];
          calls += 1;
          if (response instanceof Error) throw response;
          return response;
        },
      },
      db: {
        finalizarOperacionCancelacion: async (id, estado, extra) => {
          finalStates.push({ id, estado, extra });
        },
        guardarEventoOperativo: async (event) => events.push(event),
      },
      whatsapp: {
        sendText: async (to, message) => messages.push({ to, message }),
        sendInteractiveButtons: async (payload) => {
          completionActions.push(payload);
          return true;
        },
      },
    },
    finalStates,
    events,
    messages,
    completionActions,
    calls: () => calls,
  };
}

async function assertSuccessfulVerification() {
  verifier._private.reset();
  const item = operation("a");
  const context = createDeps([
    { estado: "procesando" },
    { resultado: { CodigoRespuesta: 1, Mensaje: "La cita fue cancelada correctamente" } },
  ]);

  assert.strictEqual(verifier.claimOperation(item), true);
  assert.strictEqual(verifier.claimOperation(item), false, "No debe reclamar dos veces.");
  await verifier.startVerification(item.cancelOperationId, context.deps, {
    maxAttempts: 3,
    initialDelayMs: 0,
    intervalMs: 0,
  });

  assert.strictEqual(context.calls(), 2);
  assert.strictEqual(context.finalStates[0].estado, "cancelada");
  assert.strictEqual(context.events[0].status, "cancelada");
  assert(/cancelada correctamente/i.test(context.messages[0].message));
  assert.strictEqual(context.completionActions.length, 1);
  assert.strictEqual(context.completionActions[0].buttons.length, 2);
  assert(!JSON.stringify(context.finalStates).includes("111111"));
  assert(!JSON.stringify(context.events).includes("111111"));
  const retained = verifier._private.operations.get(item.cancelOperationId);
  assert.strictEqual(retained.cita, null, "Debe limpiar la cita de memoria al finalizar.");
  assert.strictEqual(retained.to, null, "Debe limpiar el destinatario de memoria al finalizar.");
}

async function assertFailedVerification() {
  verifier._private.reset();
  const item = operation("b");
  const context = createDeps([
    { resultado: { CodigoRespuesta: 0, Mensaje: "No fue posible cancelar" } },
  ]);

  assert.strictEqual(verifier.claimOperation(item), true);
  await verifier.startVerification(item.cancelOperationId, context.deps, {
    maxAttempts: 2,
    initialDelayMs: 0,
    intervalMs: 0,
  });

  assert.strictEqual(context.calls(), 1);
  assert.strictEqual(context.finalStates[0].estado, "cancelacion_fallida");
  assert.strictEqual(context.events[0].status, "cancelacion_fallida");
  assert(/No pudimos confirmar/i.test(context.messages[0].message));
  assert.strictEqual(context.completionActions.length, 1);
}

function assertResponseClassification() {
  const classify = verifier._private.classifyVerification;
  assert.strictEqual(classify({ estado: "procesando" }).status, "pending");
  assert.strictEqual(
    classify({ resultado: { CodigoRespuesta: "1", Mensaje: "OK" } }).status,
    "success"
  );
  assert.strictEqual(
    classify({ resultado: { CodigoRespuesta: "0", Mensaje: "Error" } }).status,
    "failure"
  );
}

async function main() {
  assertResponseClassification();
  await assertSuccessfulVerification();
  await assertFailedVerification();
  verifier._private.reset();
  console.log("Cancellation verifier checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
