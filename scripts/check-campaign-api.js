const { runCampaignApiChecks } = require("./check-campaign-admin-api");

const VERIFIED_CASES = [
  "API key ausente responde 401",
  "API key incorrecta responde 401",
  "API key no configurada responde 503",
  "creacion valida responde 201",
  "creacion invalida responde 422",
  "creacion idempotente responde 200 con el mismo campaign_id",
  "carga valida filtra PII y deduplica destinatarios",
  "lote de 501 destinatarios responde 422",
  "campana cancelada rechaza nuevos destinatarios con 409",
  "lanzamiento asincrono responde 202 y respeta limite",
  "doble lanzamiento responde 409",
  "lanzamiento sin pendientes responde 200",
  "fallo del sender restaura estado y libera lock",
  "consulta devuelve contadores y 404 para id inexistente",
  "cancelacion es idempotente y bloquea lanzamientos posteriores",
];

async function main() {
  await runCampaignApiChecks();
  VERIFIED_CASES.forEach((name) => console.log(`OK ${name}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
