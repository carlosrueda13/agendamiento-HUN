const ACTIONS = {
  RETURN_TO_MENU: "CONVERSATION_RETURN_MENU",
  CLOSE: "CONVERSATION_CLOSE",
};

const COMPLETION_BUTTONS = [
  { id: ACTIONS.RETURN_TO_MENU, title: "Volver al menu" },
  { id: ACTIONS.CLOSE, title: "Finalizar" },
];

function parseLifecycleAction({ interactiveId = "" } = {}) {
  if (interactiveId === ACTIONS.RETURN_TO_MENU) return ACTIONS.RETURN_TO_MENU;
  if (interactiveId === ACTIONS.CLOSE) return ACTIONS.CLOSE;
  return null;
}

async function sendCompletionActions(to, whatsapp) {
  if (!to || !whatsapp?.sendInteractiveButtons) return false;

  const result = await whatsapp.sendInteractiveButtons({
    to,
    body: "¿Deseas realizar otra gestión o finalizar la conversación?",
    footer: "Hospital Universitario Nacional",
    buttons: COMPLETION_BUTTONS,
  });
  return result !== false;
}

function buildClosedMessage() {
  return [
    "🔒 *Conversación finalizada de forma segura.*",
    "",
    "El contexto temporal y la autorización de esta sesión fueron eliminados.",
    "Cuando necesites otra gestión, escríbenos nuevamente para comenzar.",
  ].join("\n");
}

module.exports = {
  ACTIONS,
  COMPLETION_BUTTONS,
  buildClosedMessage,
  parseLifecycleAction,
  sendCompletionActions,
};
