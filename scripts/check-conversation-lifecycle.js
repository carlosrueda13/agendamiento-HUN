const assert = require("assert");

const lifecycle = require("../lib/conversationLifecycle");
const { _private: whatsappPrivate } = require("../lib/whatsapp");

async function main() {
  const sent = [];
  const whatsapp = {
    sendInteractiveButtons: async (payload) => {
      sent.push(payload);
      return true;
    },
  };

  assert.strictEqual(
    lifecycle.parseLifecycleAction({
      interactiveId: lifecycle.ACTIONS.RETURN_TO_MENU,
    }),
    lifecycle.ACTIONS.RETURN_TO_MENU
  );
  assert.strictEqual(
    lifecycle.parseLifecycleAction({ interactiveId: lifecycle.ACTIONS.CLOSE }),
    lifecycle.ACTIONS.CLOSE
  );
  assert.strictEqual(lifecycle.parseLifecycleAction({ text: "finalizar" }), null);

  assert.strictEqual(
    await lifecycle.sendCompletionActions("573001112233", whatsapp),
    true
  );
  assert.deepStrictEqual(
    sent[0].buttons.map((button) => button.id),
    [lifecycle.ACTIONS.RETURN_TO_MENU, lifecycle.ACTIONS.CLOSE]
  );

  const payload = whatsappPrivate.buildInteractiveButtonsPayload(sent[0]);
  assert.strictEqual(payload.interactive.type, "button");
  assert.strictEqual(payload.interactive.action.buttons.length, 2);
  assert(/finalizada de forma segura/i.test(lifecycle.buildClosedMessage()));

  console.log("Conversation lifecycle checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
