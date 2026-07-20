const catalog = require("../data/cups-2026.json");

const DESCRIPTION_FIELDS = [
  "descripcion",
  "descripcion_cups",
  "nombre_procedimiento",
  "procedimiento",
];

function clean(value) {
  return typeof value === "string" ? value.trim() : value;
}

function keyToken(key) {
  return String(key || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getField(row, candidates) {
  if (!row || typeof row !== "object") return null;

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, candidate)) {
      const value = clean(row[candidate]);
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  for (const candidate of candidates) {
    const wanted = keyToken(candidate);
    const match = Object.keys(row).find((key) => keyToken(key) === wanted);
    const value = match ? clean(row[match]) : null;
    if (value !== null && value !== undefined && value !== "") return value;
  }

  return null;
}

function normalizeCupsCode(value) {
  return String(clean(value) || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getCupsDescription(code) {
  return catalog.procedures[normalizeCupsCode(code)] || null;
}

function resolveProcedureDescription(cup) {
  const code = normalizeCupsCode(
    getField(cup, ["codigo", "codigo_cups", "cod_pro", "cups"])
  );
  const hunDescription = clean(getField(cup, DESCRIPTION_FIELDS));

  if (hunDescription) {
    return { code, description: String(hunDescription), source: "hun" };
  }

  const catalogDescription = getCupsDescription(code);
  if (catalogDescription) {
    return {
      code,
      description: catalogDescription,
      source: "catalogo_cups",
    };
  }

  return { code, description: null, source: null };
}

module.exports = {
  catalogMetadata: catalog.metadata,
  getCupsDescription,
  normalizeCupsCode,
  resolveProcedureDescription,
};
