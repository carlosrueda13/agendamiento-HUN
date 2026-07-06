require("dotenv").config();

const { enviarOfertasCampania } = require("../lib/campaignSender");

function parseArgs(argv) {
  const [campaignId, limitArg] = argv;
  const limit = limitArg ? Number(limitArg) : 100;
  if (!campaignId) {
    throw new Error("Uso: node scripts/send-campaign-offers.js <campaign_id> [limit]");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("limit debe ser un entero entre 1 y 500.");
  }
  return { campaignId, limit };
}

(async () => {
  const { campaignId, limit } = parseArgs(process.argv.slice(2));
  const summary = await enviarOfertasCampania({ campaignId, limit });
  console.log(
    JSON.stringify(
      {
        campaign_id: summary.campaign_id,
        total: summary.total,
        enviados: summary.enviados,
        fallidos: summary.fallidos,
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error("No se pudo enviar la campana:", error.message);
  process.exit(1);
});
