const assert = require("assert");

const db = require("../lib/db");

const CAMPANA_COLUMNS = [
  "id",
  "nombre",
  "especialidad_codigo",
  "estado",
  "responsable",
  "cupos_objetivo",
  "origen_datos",
  "referencia_externa",
  "created_at",
].join(",");

function createSelectClient({ rowsByTable = {}, singleByFilter = {}, errors = {} } = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      const state = { table, columns: null, filter: null };
      calls.push(state);

      const query = {
        select(columns) {
          state.columns = columns;
          return query;
        },
        eq(column, value) {
          state.filter = { column, value };
          return query;
        },
        maybeSingle() {
          const key = `${state.table}:${state.filter?.column}:${state.filter?.value}`;
          return Promise.resolve({
            data: singleByFilter[key] || null,
            error: errors[state.table] || null,
          });
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: rowsByTable[state.table] || [],
            error: errors[state.table] || null,
          }).then(resolve, reject);
        },
      };

      return query;
    },
  };
}

function createInsertClient() {
  const calls = [];

  return {
    calls,
    from(table) {
      const state = { table, record: null, columns: null };
      calls.push(state);

      return {
        insert(record) {
          state.record = record;
          return {
            select(columns) {
              state.columns = columns;
              return {
                single() {
                  return Promise.resolve({
                    data: { id: "00000000-0000-0000-0000-000000000009" },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}

function createRecipientClient() {
  const rows = [];
  let sequence = 1;

  return {
    rows,
    from(table) {
      assert.strictEqual(table, "campana_destinatarios");
      const filters = {};
      let insertedRecord = null;
      const query = {
        select() {
          return query;
        },
        eq(column, value) {
          filters[column] = value;
          return query;
        },
        maybeSingle() {
          const data =
            rows.find((row) =>
              Object.entries(filters).every(([column, value]) => row[column] === value)
            ) || null;
          return Promise.resolve({ data, error: null });
        },
        insert(record) {
          insertedRecord = record;
          return query;
        },
        single() {
          const data = { id: `recipient-${sequence}`, ...insertedRecord };
          sequence += 1;
          rows.push(data);
          return Promise.resolve({ data: { id: data.id }, error: null });
        },
      };
      return query;
    },
  };
}

(async () => {
  const campaignId = "00000000-0000-0000-0000-000000000001";
  const campana = {
    id: campaignId,
    nombre: "Campana panel",
    especialidad_codigo: null,
    estado: "borrador",
    responsable: "Consulta externa",
    cupos_objetivo: 20,
    origen_datos: "panel_hospital",
    referencia_externa: " panel-2026-001 ",
    created_at: "2026-07-14T20:00:00.000Z",
  };
  const client = createSelectClient({
    singleByFilter: {
      [`campanas:id:${campaignId}`]: campana,
      "campanas:referencia_externa:panel-2026-001": campana,
    },
    rowsByTable: {
      campana_destinatarios: [
        { estado_contacto: "pendiente", motivo_exclusion: null },
        { estado_contacto: "enviado", motivo_exclusion: null },
        { estado_contacto: "entregado", motivo_exclusion: null },
        { estado_contacto: "leido", motivo_exclusion: null },
        { estado_contacto: "respondido", motivo_exclusion: null },
        { estado_contacto: "flow_iniciado", motivo_exclusion: null },
        { estado_contacto: "agendado", motivo_exclusion: null },
        { estado_contacto: "no_interesado", motivo_exclusion: null },
        { estado_contacto: "excluido", motivo_exclusion: "opt_out" },
        { estado_contacto: "fallido", motivo_exclusion: "telefono_invalido" },
        { estado_contacto: "fallido", motivo_exclusion: "telefono_invalido" },
        { estado_contacto: "fallido", motivo_exclusion: "timeout" },
      ],
    },
  });

  assert.deepStrictEqual(await db.obtenerCampana(campaignId, client), campana);
  assert.strictEqual(await db.obtenerCampana("inexistente", client), null);
  assert.deepStrictEqual(
    await db.obtenerCampanaPorReferenciaExterna(" panel-2026-001 ", client),
    campana
  );
  assert.strictEqual(client.calls[0].columns, CAMPANA_COLUMNS);
  assert.strictEqual(client.calls[1].columns, CAMPANA_COLUMNS);
  assert.strictEqual(client.calls[2].columns, CAMPANA_COLUMNS);

  const callsBeforeEmptyReference = client.calls.length;
  assert.strictEqual(await db.obtenerCampanaPorReferenciaExterna(null, client), null);
  assert.strictEqual(await db.obtenerCampanaPorReferenciaExterna("  ", client), null);
  assert.strictEqual(client.calls.length, callsBeforeEmptyReference);

  assert.deepStrictEqual(await db.contarDestinatariosCampana(campaignId, client), {
    contadores: {
      total: 12,
      pendientes: 1,
      enviados: 4,
      fallidos: 3,
      flow_iniciados: 1,
      agendados: 1,
      no_interesados: 1,
      excluidos: 1,
    },
    fallos_por_motivo: { telefono_invalido: 2, timeout: 1 },
  });
  assert.strictEqual(
    client.calls.at(-1).columns,
    "estado_contacto,motivo_exclusion"
  );

  const emptyClient = createSelectClient();
  assert.deepStrictEqual(
    await db.contarDestinatariosCampana(campaignId, emptyClient),
    db._private.crearContadoresCampanaVacios()
  );

  assert.strictEqual(await db.obtenerCampana(campaignId, null), null);
  assert.strictEqual(
    await db.obtenerCampanaPorReferenciaExterna("panel-2026-001", null),
    null
  );
  assert.deepStrictEqual(
    await db.contarDestinatariosCampana(campaignId, null),
    db._private.crearContadoresCampanaVacios()
  );

  const insertClient = createInsertClient();
  assert.deepStrictEqual(
    await db.crearCampana(
      {
        nombre: "Campana creada desde panel",
        referencia_externa: " panel-creacion-001 ",
      },
      insertClient
    ),
    { id: "00000000-0000-0000-0000-000000000009" }
  );
  assert.strictEqual(insertClient.calls[0].table, "campanas");
  assert.strictEqual(
    insertClient.calls[0].record.referencia_externa,
    "panel-creacion-001"
  );
  assert.strictEqual(insertClient.calls[0].columns, "id");

  const recipientClient = createRecipientClient();
  const firstRecipient = await db.guardarDestinatarioCampana(
    {
      campaign_id: campaignId,
      audiencia_ref: "HUN-3040",
      especialidad_codigo: "590",
    },
    recipientClient
  );
  assert.deepStrictEqual(firstRecipient, { id: "recipient-1", duplicate: false });
  assert.strictEqual(recipientClient.rows.length, 1);

  const repeatedRecipient = await db.guardarDestinatarioCampana(
    {
      campaign_id: campaignId,
      audiencia_ref: "HUN-3040",
      especialidad_codigo: "312",
    },
    recipientClient
  );
  assert.deepStrictEqual(repeatedRecipient, { id: "recipient-1", duplicate: true });
  assert.strictEqual(recipientClient.rows.length, 1);
  assert.strictEqual(recipientClient.rows[0].especialidad_codigo, "590");
  assert.strictEqual(recipientClient.rows[0].estado_contacto, "pendiente");

  const failedClient = createSelectClient({
    errors: { campanas: { message: "consulta no disponible" } },
  });
  assert.strictEqual(await db.obtenerCampana(campaignId, failedClient), null);

  assert.strictEqual(db.campanaAdmiteDestinatarios("borrador"), true);
  assert.strictEqual(db.campanaAdmiteDestinatarios("enviando"), true);
  assert.strictEqual(db.campanaAdmiteDestinatarios("cerrada"), false);
  assert.strictEqual(db.campanaAdmiteDestinatarios("cancelada"), false);
  assert.strictEqual(db.campanaAdmiteDestinatarios(""), false);

  ["borrador", "programada", "activa"].forEach((estado) => {
    assert.strictEqual(db.campanaAdmiteLanzamiento(estado), true);
  });
  ["enviando", "cerrada", "cancelada", null].forEach((estado) => {
    assert.strictEqual(db.campanaAdmiteLanzamiento(estado), false);
  });

  console.log("Campaign database helper checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
