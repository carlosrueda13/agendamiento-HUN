# Plan de trabajo: API de campanas para el panel administrativo del hospital

> Generado a partir de: `INSTRUCTIVO_PANEL_CAMPANAS.md` (contrato v1) y analisis del codigo existente.

## Resumen ejecutivo

Se va a exponer en el backend de Render (Node/Express, `server.js`) una API REST autenticada por `x-api-key` para que el panel administrativo del hospital cree campanas, cargue destinatarios anonimos y las lance con un boton, sin intervencion manual. El enfoque es una capa HTTP delgada (`lib/campaignAdminApi.js`) que reutiliza la logica ya probada de `lib/db.js`, `lib/demandaInducida.js` y `lib/campaignSender.js`, mas el cierre de dos brechas de estado del destinatario (`flow_iniciado`, `agendado`) para que los contadores del panel sean veraces.

## Contexto obligatorio para el desarrollador (leer antes de cualquier ticket)

- **Contrato a implementar:** `INSTRUCTIVO_PANEL_CAMPANAS.md` en la raiz del repo. Es la fuente de verdad de rutas, bodies, respuestas y codigos HTTP. Ante duda entre este plan y el instructivo, gana el instructivo.
- **Regla de minimizacion:** Supabase y los logs NUNCA reciben datos personales (nombre, telefono, correo, documento plano, EPS, fecha/hora de cita, payloads completos). Los endpoints nuevos solo manejan `id_anonimo`/`audiencia_ref` y codigos de especialidad. Ver `CAMPAIGN_MODEL.md`.
- **Piezas existentes a reutilizar (no reescribir):**
  - `lib/db.js`: `crearCampana(campana)`, `actualizarEstadoCampana(campaignId, estado)`, `guardarDestinatarioCampana(destinatario)`, `listarDestinatariosPendientesCampana(campaignId, limit)`, `actualizarEstadoDestinatario(recipientId, estado, extra)`. Constantes `CAMPANA_ESTADOS` y `DESTINATARIO_ESTADOS` (no exportadas hoy). Todas las funciones devuelven `null`/`[]` y loguean si Supabase no esta configurado o falla.
  - `lib/demandaInducida.js`: `sincronizarAudienciaCampana({ campaignId, records, dbClient })` devuelve `{ total, aceptados, guardados, rechazados, duplicados, errores, detalles_rechazados }`. Ya normaliza, valida campos obligatorios y deduplica por `campaign_id + audiencia_ref`.
  - `lib/campaignSender.js`: `enviarOfertasCampania({ campaignId, limit, env })` procesa secuencialmente los pendientes y devuelve `{ campaign_id, total, enviados, fallidos, results }`. `createCampaignSender(deps)` permite inyectar dependencias para tests.
  - `server.js`: Express con `app.use(express.json())` ya montado. Registrar el router nuevo antes de `app.listen`.
- **Patron de tests del repo:** scripts `scripts/check-*.js` ejecutables con `node`, sin framework. Usan `assert` de Node y dependencias inyectadas (mocks manuales); imprimen `OK <descripcion>` por caso y terminan con exit code 1 si algo falla. Ver `scripts/check-campaign-send.js` como referencia de estilo.
- **Estilo de textos:** los documentos y strings del repo se escriben en espanol sin tildes ni enie (ASCII), por ejemplo `campana`. Mantener esa convencion.
- **Formato de error uniforme de la API nueva:** `{ "error": "codigo_corto", "detalle": "descripcion legible" }`, sin datos de pacientes.

## ⚠️ Supuestos y lagunas

- **Instancia unica en Render:** el lock anti doble-lanzamiento de PANEL-006 es en memoria; asume una sola instancia del servicio. Si Render escala a varias instancias, migrar el lock a Supabase (fase 2). Dejarlo anotado en `DECISIONS.md`.
- **API key unica:** una sola llave (`PANEL_CAMPAIGN_API_KEY`) para todo el panel; no hay scopes ni multiusuario en v1.
- **Estado `programada`:** existe en `CAMPANA_ESTADOS` pero ningun endpoint v1 lo asigna; queda reservado para lanzamientos programados (fase 2).
- **Sin ventana horaria ni rate limiting** en el backend v1; el panel controla cuando lanzar.
- **Webhook de "campana terminada" hacia el panel:** fuera de alcance v1 (el panel hace polling).
- Laguna: el valor real de `HUN_ORQUESTADOR_API_*` en el ambiente de Render debe estar configurado para que el lanzamiento no falle con `orquestador_no_disponible`. Confirmar con el hospital antes de la certificacion conjunta.

## Vista general del backlog

| ID | Titulo | Fase | Labels | Depende de |
|----|--------|------|--------|------------|
| PANEL-001 | Crear migracion de referencia_externa en campanas | 0 – Setup | `database`, `chore` | — |
| PANEL-002 | Agregar helpers de consulta de campanas y contadores en db.js | 0 – Setup | `backend`, `database` | PANEL-001 |
| PANEL-003 | Crear router /api/campanas con autenticacion por API key | 1 – Core | `backend`, `api`, `auth`, `security` | — |
| PANEL-004 | Implementar POST /api/campanas (crear campana idempotente) | 1 – Core | `backend`, `api`, `feature` | PANEL-002, PANEL-003 |
| PANEL-005 | Implementar POST /api/campanas/:id/destinatarios (carga por lotes) | 1 – Core | `backend`, `api`, `feature` | PANEL-002, PANEL-003 |
| PANEL-006 | Implementar POST /api/campanas/:id/lanzar con envio en segundo plano | 1 – Core | `backend`, `api`, `feature` | PANEL-002, PANEL-003 |
| PANEL-007 | Implementar GET /api/campanas/:id (estado y contadores) | 1 – Core | `backend`, `api`, `feature` | PANEL-002, PANEL-003 |
| PANEL-008 | Implementar POST /api/campanas/:id/cancelar | 1 – Core | `backend`, `api`, `feature` | PANEL-002, PANEL-003 |
| PANEL-009 | Actualizar estado del destinatario desde el Flow (flow_iniciado, agendado) | 2 – Integridad de estados | `backend`, `feature` | — |
| PANEL-010 | Crear script de verificacion check-campaign-api.js | 3 – QA | `testing` | PANEL-004..008 |
| PANEL-011 | Actualizar documentacion y tracking del proyecto | 3 – QA | `docs`, `chore` | PANEL-001..010 |

## Tickets detallados

### Fase 0 – Setup

---

## [PANEL-001] Crear migracion de referencia_externa en campanas

**Labels**: `database`, `chore`

### Descripcion
El panel del hospital enviara su propio id de campana como llave de idempotencia (`referencia_externa` en el contrato, seccion 5.1 del instructivo). Hay que agregar esa columna a la tabla `campanas` de Supabase con unicidad, siguiendo el patron de las migraciones incrementales existentes (`supabase/003_campaign_responsable.sql` es el ejemplo mas parecido: un `alter table` corto con comentario).

### Microsteps
1. Crear `supabase/008_campaign_external_ref.sql`.
2. Agregar `alter table public.campanas add column if not exists referencia_externa text;`.
3. Agregar un indice unico parcial: `create unique index if not exists idx_campanas_referencia_externa on public.campanas(referencia_externa) where referencia_externa is not null;` (parcial para permitir multiples campanas sin referencia, como las creadas manualmente hasta hoy).
4. Encabezar el archivo con un comentario SQL que explique el proposito (idempotencia de creacion desde el panel administrativo) y que no incorpora datos personales, siguiendo el estilo de las migraciones previas.
5. Mencionar la migracion en la seccion Supabase de `README.md` junto a las migraciones 004/006/007 ya listadas (una linea).

### Criterios de aceptacion
- [ ] El archivo `supabase/008_campaign_external_ref.sql` existe y es idempotente (usa `if not exists` en columna e indice).
- [ ] Dos campanas con `referencia_externa = null` pueden coexistir; dos con el mismo valor no nulo violan el indice.
- [ ] `README.md` menciona la migracion 008 como requisito para usar el API del panel.

---

## [PANEL-002] Agregar helpers de consulta de campanas y contadores en db.js

**Labels**: `backend`, `database`
**Depends on**: [PANEL-001]

### Descripcion
Los endpoints del panel necesitan leer campanas (por id y por `referencia_externa`) y calcular contadores de destinatarios por estado, cosas que `lib/db.js` hoy no ofrece (solo tiene create/update). Agregar helpers de solo lectura siguiendo el patron existente del modulo: funciones async que devuelven `null`/valores vacios si `supabase` no esta configurado, y loguean `console.error("Supabase <funcion>:", error.message)` ante error.

### Microsteps
1. En `lib/db.js`, crear `obtenerCampana(campaignId)`: select de `campanas` por `id` con columnas `id, nombre, especialidad_codigo, estado, responsable, cupos_objetivo, origen_datos, referencia_externa, created_at`; usar `.maybeSingle()` y devolver el registro o `null`.
2. Crear `obtenerCampanaPorReferenciaExterna(referenciaExterna)`: mismo select filtrando por `referencia_externa`; devolver `null` si el argumento viene vacio (usar el helper interno `cleanText`).
3. Crear `contarDestinatariosCampana(campaignId)`: select de `campana_destinatarios` filtrando por `campaign_id`, trayendo solo `estado_contacto` y `motivo_exclusion`, y agregar en JS un objeto `{ total, pendientes, enviados, fallidos, flow_iniciados, agendados, no_interesados, excluidos }` mas `fallos_por_motivo` (mapa `motivo_exclusion -> conteo` solo de los registros con `estado_contacto = "fallido"`). Los estados `entregado`, `leido` y `respondido` existen en `DESTINATARIO_ESTADOS` pero no se reportan por separado en v1: sumarlos dentro de `enviados`.
4. Crear `campanaAdmiteDestinatarios(estado)` y `campanaAdmiteLanzamiento(estado)` como helpers puros exportados (o exportar `CAMPANA_ESTADOS` y decidir en el router; elegir una sola via y ser consistente). Reglas: admite destinatarios si el estado NO es `cerrada` ni `cancelada`; admite lanzamiento si el estado es `borrador`, `programada` o `activa`.
5. Extender `buildCampanaRecord` para aceptar y limpiar `referencia_externa` (usar `cleanText`; opcional).
6. Exportar las funciones nuevas en el `module.exports` del modulo y tambien bajo `_private` las que sean puras, siguiendo el patron ya usado (`buildCampanaRecord` esta en `_private`).

### Criterios de aceptacion
- [ ] `obtenerCampana` devuelve `null` para un id inexistente y el registro completo para uno existente.
- [ ] `obtenerCampanaPorReferenciaExterna(null)` y `("")` devuelven `null` sin consultar Supabase.
- [ ] `contarDestinatariosCampana` devuelve todos los contadores en cero (y `fallos_por_motivo` vacio) para una campana sin destinatarios, sin lanzar excepcion.
- [ ] Con Supabase no configurado (`supabase = null`), todas las funciones nuevas devuelven `null` o contadores vacios sin lanzar excepcion.
- [ ] `crearCampana` persiste `referencia_externa` cuando se le pasa.

### Fase 1 – Core

---

## [PANEL-003] Crear router /api/campanas con autenticacion por API key

**Labels**: `backend`, `api`, `auth`, `security`

### Descripcion
Crear el modulo `lib/campaignAdminApi.js` que exporta un `express.Router()` con el middleware de autenticacion y la estructura base de rutas, y montarlo en `server.js`. Este ticket entrega el esqueleto: autenticacion, manejo uniforme de errores y rutas que responden `501 { error: "no_implementado" }` hasta que los tickets PANEL-004..008 las completen. Asi los demas tickets pueden desarrollarse en paralelo sobre una base comun.

### Microsteps
1. Crear `lib/campaignAdminApi.js` exportando `function createCampaignAdminRouter(deps = {})` que devuelve un `express.Router()`; aceptar `deps` (`dbClient`, `sender`, `demanda`, `env`) con defaults a los modulos reales, siguiendo el patron de inyeccion de `createCampaignSender` en `lib/campaignSender.js`.
2. Implementar middleware de autenticacion: leer `env.PANEL_CAMPAIGN_API_KEY`; si la variable no esta configurada, responder `503 { error: "panel_api_no_configurada", detalle: ... }` (el servicio no debe quedar abierto por omision); si el header `x-api-key` falta o no coincide, responder `401 { error: "no_autorizado", detalle: "x-api-key invalida o ausente" }`. Comparar con `crypto.timingSafeEqual` sobre buffers de igual longitud (si difieren en longitud, rechazar sin comparar).
3. Definir las cinco rutas del contrato (`POST /`, `POST /:campaignId/destinatarios`, `POST /:campaignId/lanzar`, `GET /:campaignId`, `POST /:campaignId/cancelar`) respondiendo `501` como placeholder.
4. Agregar un manejador de errores del router (middleware de 4 argumentos) que loguee `console.error("campaignAdminApi:", error.message)` sin datos de pacientes y responda `500 { error: "error_interno", detalle: "error inesperado" }`.
5. En `server.js`, importar el modulo y montar `app.use("/api/campanas", createCampaignAdminRouter())` antes de `app.listen`, con un comentario corto en el estilo de los existentes ("// 5. API administrativa de campanas para el panel del hospital.").
6. Nunca loguear la API key ni el header recibido.

### Criterios de aceptacion
- [ ] Cualquier llamada a `/api/campanas/*` sin header `x-api-key` devuelve `401` con el formato de error uniforme.
- [ ] Con `PANEL_CAMPAIGN_API_KEY` sin configurar, toda llamada devuelve `503` (nunca procesa).
- [ ] Con la llave correcta, las cinco rutas responden (aunque sea `501`).
- [ ] La comparacion de llave usa `crypto.timingSafeEqual`.
- [ ] `GET /` y `POST /webhook` y `/flow-endpoint` existentes siguen funcionando (el router nuevo no intercepta otras rutas).

---

## [PANEL-004] Implementar POST /api/campanas (crear campana idempotente)

**Labels**: `backend`, `api`, `feature`
**Depends on**: [PANEL-002], [PANEL-003]

### Descripcion
Implementar la creacion de campanas segun la seccion 5.1 del instructivo: valida el body, aplica idempotencia por `referencia_externa` y crea la campana en estado `borrador` usando `db.crearCampana`. La respuesta distingue `201` (creada) de `200` (ya existia con esa referencia).

### Microsteps
1. En la ruta `POST /` del router, validar el body: `nombre` obligatorio (string no vacio tras trim); `cupos_objetivo` opcional pero, si viene, entero `>= 0`; `referencia_externa`, `especialidad_codigo`, `responsable`, `origen_datos` opcionales (strings). Ante violacion responder `422 { error: "validacion", detalle: "<campo y problema>" }`.
2. Si viene `referencia_externa`, consultar `db.obtenerCampanaPorReferenciaExterna`; si existe, responder `200 { campaign_id, referencia_externa, estado }` con los datos del registro existente, sin crear nada.
3. Llamar `db.crearCampana` con `{ nombre, especialidad_codigo, responsable, cupos_objetivo, origen_datos, referencia_externa, estado: "borrador" }`.
4. Si `crearCampana` devuelve `null` (Supabase caido o no configurado), responder `503 { error: "persistencia_no_disponible", detalle: ... }`.
5. Manejar la carrera de idempotencia: si el insert falla por unicidad de `referencia_externa` (dos llamadas simultaneas), reconsultar por referencia y responder `200` con la existente.
6. Responder `201 { campaign_id, referencia_externa, estado: "borrador" }`.

### Criterios de aceptacion
- [ ] Body sin `nombre` devuelve `422`; `cupos_objetivo: -1` o `"abc"` devuelve `422`.
- [ ] Primera llamada con `referencia_externa` nueva devuelve `201` con `campaign_id` (uuid) y `estado: "borrador"`.
- [ ] Segunda llamada identica devuelve `200` con el MISMO `campaign_id` y no crea una segunda fila.
- [ ] Llamada sin `referencia_externa` crea siempre una campana nueva (`201`).
- [ ] La respuesta nunca incluye campos no documentados en el instructivo.

---

## [PANEL-005] Implementar POST /api/campanas/:id/destinatarios (carga por lotes)

**Labels**: `backend`, `api`, `feature`
**Depends on**: [PANEL-002], [PANEL-003]

### Descripcion
Implementar la carga de destinatarios segun la seccion 5.2 del instructivo. La logica de normalizacion, validacion por registro y deduplicacion ya existe en `demanda.sincronizarAudienciaCampana`; este endpoint valida el sobre (campana existente, estado que admite carga, lote <= 500) y traduce el resumen al contrato. Los registros solo traen `id_anonimo` (o alias `audiencia_ref`) y `cod_especialidad_requerida`; cualquier otro campo se descarta sin persistirse.

### Microsteps
1. En la ruta `POST /:campaignId/destinatarios`, consultar `db.obtenerCampana(campaignId)`; si no existe responder `404 { error: "campana_no_encontrada", detalle: ... }`.
2. Si el estado de la campana es `cerrada` o `cancelada`, responder `409 { error: "estado_no_admite_destinatarios", detalle: "estado actual: <estado>" }`.
3. Validar el body: `destinatarios` debe ser un arreglo no vacio con maximo 500 elementos; si no, `422` (mensajes distintos para "falta el arreglo", "arreglo vacio" y "mas de 500").
4. Mapear cada elemento a `{ id_anonimo, cod_especialidad_requerida }` tomando los alias que `normalizeAudienceRecord` ya acepta, descartando explicitamente cualquier otra propiedad del objeto recibido (proteccion contra PII accidental).
5. Llamar `demanda.sincronizarAudienciaCampana({ campaignId, records })` y responder `200` con `{ campaign_id, total, aceptados, guardados, duplicados, rechazados, errores, detalles_rechazados }` tal cual devuelve el resumen (los `detalles_rechazados` ya tienen `{ index, motivo, campos }`).
6. Si `errores > 0` y `guardados === 0` con Supabase caido, responder `503 { error: "persistencia_no_disponible" }` en lugar de `200` (distinguir "todo fallo por infraestructura" de "algunos registros invalidos").

### Criterios de aceptacion
- [ ] Cargar el mismo lote dos veces produce `duplicados` en la segunda llamada y no duplica filas en `campana_destinatarios`.
- [ ] Un registro sin `cod_especialidad_requerida` aparece en `detalles_rechazados` con su `index` y no aborta el resto del lote.
- [ ] Lote de 501 elementos devuelve `422` sin procesar ninguno.
- [ ] `campaign_id` inexistente devuelve `404`; campana `cancelada` devuelve `409`.
- [ ] Un registro que incluya campos extra (por ejemplo `nombre` o `telefono`) se procesa usando solo los dos campos permitidos y ningun campo extra llega a Supabase.

---

## [PANEL-006] Implementar POST /api/campanas/:id/lanzar con envio en segundo plano

**Labels**: `backend`, `api`, `feature`
**Depends on**: [PANEL-002], [PANEL-003]

### Descripcion
Implementar el lanzamiento segun la seccion 5.3 del instructivo: valida estado, cuenta pendientes, marca la campana `enviando`, responde `202` de inmediato y ejecuta `sender.enviarOfertasCampania` en segundo plano (el envio es secuencial y puede tardar minutos; una respuesta sincrona se cortaria en Render). Un lock en memoria por campana impide lanzamientos concurrentes. Al terminar, la campana pasa a `activa`.

### Microsteps
1. Crear en `lib/campaignAdminApi.js` un `Map` a nivel de modulo (`lanzamientosEnCurso`) con `campaignId -> true` como lock; documentar con un comentario que asume instancia unica de Render.
2. En la ruta `POST /:campaignId/lanzar`: consultar la campana (`404` si no existe); si el estado no es `borrador`, `programada` ni `activa`, responder `409 { error: "estado_no_admite_lanzamiento", detalle: "estado actual: <estado>" }`; si el lock esta tomado, responder `409 { error: "lanzamiento_en_curso" }`.
3. Validar `limite` del body: opcional, entero entre 1 y 500, default 500; si es invalido responder `422`.
4. Contar elegibles con `db.listarDestinatariosPendientesCampana(campaignId, limite)`; si la lista esta vacia, responder `200 { campaign_id, estado: <estado actual>, destinatarios_a_procesar: 0 }` sin cambiar estado ni tomar lock.
5. Tomar el lock, llamar `db.actualizarEstadoCampana(campaignId, "enviando")` y responder `202 { campaign_id, estado: "enviando", destinatarios_a_procesar: <n> }`.
6. Ejecutar el envio despues de responder (funcion async lanzada sin `await`, por ejemplo via `setImmediate`): `sender.enviarOfertasCampania({ campaignId, limit: limite })`; envolver TODO en try/catch/finally.
7. En el `finally`: liberar el lock y llamar `db.actualizarEstadoCampana(campaignId, "activa")` (tambien si el envio fallo a mitad: los destinatarios ya quedaron marcados individualmente `enviado`/`fallido` por `campaignSender`, y el estado `activa` permite relanzar los pendientes restantes). En el `catch`: loguear `console.error` con el mensaje del error, sin telefonos ni payloads.
8. Registrar un evento operativo agregado al terminar el bloque via `db.guardarEventoOperativo` con `event_type: "campaign_launch"`, `campaign_id`, `status: "exitosa"|"fallida"` y `resultado_operativo` con los totales (`enviados`/`fallidos` numericos), sin datos personales.

### Criterios de aceptacion
- [ ] `POST lanzar` responde `202` en menos de 2 segundos aun con muchos destinatarios (el envio no bloquea la respuesta).
- [ ] Segunda llamada a `lanzar` mientras el envio corre devuelve `409 { error: "lanzamiento_en_curso" }`.
- [ ] Al terminar el envio, la campana queda en estado `activa` y el lock liberado (una tercera llamada ya no da `409` por lock).
- [ ] Lanzar una campana sin pendientes devuelve `200` con `destinatarios_a_procesar: 0` y NO la deja en `enviando`.
- [ ] Si `enviarOfertasCampania` lanza una excepcion, la campana igual termina en `activa`, el lock queda liberado y el proceso Node no muere (sin unhandled rejection).
- [ ] Relanzar una campana `activa` solo procesa destinatarios en `pendiente` (comportamiento ya garantizado por `listarDestinatariosPendientesCampana`; verificarlo en el check).
- [ ] Campana `cancelada` o `cerrada` devuelve `409`.

---

## [PANEL-007] Implementar GET /api/campanas/:id (estado y contadores)

**Labels**: `backend`, `api`, `feature`
**Depends on**: [PANEL-002], [PANEL-003]

### Descripcion
Implementar la consulta de estado segun la seccion 5.4 del instructivo. Es el endpoint de polling del panel: devuelve los datos operativos de la campana, los contadores de destinatarios por estado y los fallos agrupados por motivo. Solo lectura, sin efectos.

### Microsteps
1. En la ruta `GET /:campaignId`, consultar `db.obtenerCampana`; `404` si no existe.
2. Llamar `db.contarDestinatariosCampana(campaignId)`.
3. Armar la respuesta exactamente con la forma del instructivo: `{ campaign_id, referencia_externa, nombre, estado, contadores: { total, pendientes, enviados, fallidos, flow_iniciados, agendados, no_interesados, excluidos }, fallos_por_motivo, actualizado_en }` donde `actualizado_en` es `new Date().toISOString()` (momento de la consulta).
4. Verificar que la respuesta no incluya nada mas del registro (ni `mensaje_template_id` ni otros internos): construir el objeto a mano, no hacer spread del row.
5. Si `contarDestinatariosCampana` devuelve `null` por Supabase caido, responder `503 { error: "persistencia_no_disponible" }`.

### Criterios de aceptacion
- [ ] Campana recien creada sin destinatarios devuelve todos los contadores en `0` y `fallos_por_motivo: {}`.
- [ ] Tras un lanzamiento con fallos, `fallos_por_motivo` refleja los `motivo_exclusion` de los destinatarios `fallido` (por ejemplo `{ "telefono_invalido": 2 }`).
- [ ] `campaign_id` inexistente devuelve `404`.
- [ ] La respuesta contiene exactamente las claves documentadas en el instructivo, sin extras.

---

## [PANEL-008] Implementar POST /api/campanas/:id/cancelar

**Labels**: `backend`, `api`, `feature`
**Depends on**: [PANEL-002], [PANEL-003]

### Descripcion
Implementar la cancelacion segun la seccion 5.5 del instructivo: marca la campana `cancelada` para que sus pendientes dejen de ser elegibles. No revierte envios ya hechos ni toca citas. Los destinatarios `pendiente` quedan protegidos porque `lanzar` valida el estado de la campana antes de enviar; no es necesario mutarlos uno a uno.

### Microsteps
1. En la ruta `POST /:campaignId/cancelar`, consultar la campana; `404` si no existe.
2. Si ya esta `cancelada`, responder `200 { campaign_id, estado: "cancelada" }` (idempotente).
3. Si esta `cerrada`, responder `409 { error: "estado_no_admite_cancelacion" }`.
4. Si hay un lanzamiento en curso (lock de PANEL-006 tomado), responder `409 { error: "lanzamiento_en_curso", detalle: "esperar a que el envio termine antes de cancelar" }`.
5. Llamar `db.actualizarEstadoCampana(campaignId, "cancelada")` y responder `200 { campaign_id, estado: "cancelada" }`.
6. Registrar evento operativo `event_type: "campaign_cancel"` con `campaign_id` y `status: "exitosa"`.

### Criterios de aceptacion
- [ ] Cancelar una campana `borrador` o `activa` la deja en `cancelada` y responde `200`.
- [ ] Cancelar dos veces responde `200` ambas veces sin error.
- [ ] Tras cancelar, `POST lanzar` sobre esa campana devuelve `409` y `POST destinatarios` devuelve `409`.
- [ ] Cancelar durante un lanzamiento en curso devuelve `409` sin cambiar el estado.

### Fase 2 – Integridad de estados

---

## [PANEL-009] Actualizar estado del destinatario desde el Flow (flow_iniciado, agendado)

**Labels**: `backend`, `feature`

### Descripcion
Hoy el ciclo de vida del destinatario se corta en `enviado`: cuando el paciente abre el Flow o agenda la cita, solo se registran eventos operativos, pero `campana_destinatarios.estado_contacto` no cambia. Con el panel haciendo polling de contadores, esos estados deben reflejarse en la tabla o `flow_iniciados` y `agendados` quedaran siempre en cero. Los dos puntos de enganche ya tienen el `recipient_id` disponible.

### Microsteps
1. En `lib/flowHandler.js`, funcion `pasoIdentificacionCampania` (aprox. linea 1336): despues de guardar la sesion y el evento exitoso (el evento ya lleva `estado_contacto: "flow_iniciado"`), llamar `db.actualizarEstadoDestinatario(campaignContext.recipient_id, "flow_iniciado")` cuando `campaignContext.recipient_id` exista. Envolver en try/catch: un fallo de este update NO debe romper el Flow del paciente (loguear y continuar).
2. En `lib/flowHandler.js`, funcion `asignarYConfirmar` (aprox. linea 1830): en la rama exitosa (despues de `db.finalizarSesionTemporal(flowToken, "completado", ...)`), si `session.recipient_id` existe, llamar `db.actualizarEstadoDestinatario(session.recipient_id, "agendado")` con el mismo criterio de try/catch no bloqueante.
3. Verificar que en la sesion runtime creada por `pasoIdentificacionCampania` el campo `recipient_id` ya se guarda (linea aprox. 1399: si) y que `asignarYConfirmar` recibe esa `session` — no persistir nada nuevo.
4. No tocar el recorrido de autoagendamiento ni el de reagendamiento: ambos updates deben ejecutarse solo cuando hay contexto de campana (`recipient_id` presente).
5. Extender `scripts/check-flow-campaign.js` (o el check existente que cubra `pasoIdentificacionCampania`) con un caso que verifique la llamada a `actualizarEstadoDestinatario` con `"flow_iniciado"`, usando el patron de mocks del propio script.

### Criterios de aceptacion
- [ ] Al completar la pantalla IDENTIFICACION del Flow de campana, el destinatario pasa a `estado_contacto = "flow_iniciado"` en Supabase.
- [ ] Al crearse la cita en HUN desde el Flow de campana, el destinatario pasa a `estado_contacto = "agendado"`.
- [ ] Si el update a Supabase falla, el paciente igual recibe sus pantallas y su confirmacion (el Flow no se rompe).
- [ ] Un agendamiento por autoagendamiento normal (sin campana) no llama `actualizarEstadoDestinatario`.
- [ ] `node scripts/check-flow-campaign.js` pasa con el caso nuevo.

### Fase 3 – QA y documentacion

---

## [PANEL-010] Crear script de verificacion check-campaign-api.js

**Labels**: `testing`
**Depends on**: [PANEL-004], [PANEL-005], [PANEL-006], [PANEL-007], [PANEL-008]

### Descripcion
Crear `scripts/check-campaign-api.js` siguiendo el patron de los `check-*.js` existentes (asserts de Node, mocks inyectados, `OK <caso>` por consola, exit 1 ante fallo). Debe ejercitar el router completo sin red ni Supabase reales, usando `createCampaignAdminRouter(deps)` con `dbClient`, `sender` y `demanda` falsos, y peticiones simuladas (puede montarse el router en una app Express efimera y llamarse con `http` local, o invocar los handlers con req/res falsos; elegir lo que ya haga otro check del repo si existe precedente).

### Microsteps
1. Construir mocks: `dbClient` en memoria (mapa de campanas y destinatarios con las funciones usadas por el router), `sender` que registra llamadas y devuelve un resumen fijo, `demanda.sincronizarAudienciaCampana` real (es pura respecto a `dbClient` inyectado) o falsa.
2. Casos de autenticacion: sin header -> 401; llave incorrecta -> 401; sin `PANEL_CAMPAIGN_API_KEY` en env -> 503.
3. Casos de creacion: `201` con body valido; `422` sin nombre; idempotencia por `referencia_externa` (`200` con mismo id).
4. Casos de destinatarios: lote valido con resumen correcto; lote de 501 -> `422`; campana cancelada -> `409`; registro con PII extra no llega al `dbClient` (inspeccionar lo guardado).
5. Casos de lanzamiento: `202` inmediato y llamada al `sender` con el `campaignId` y `limit` correctos; doble lanzamiento -> `409`; sin pendientes -> `200` con `destinatarios_a_procesar: 0`; excepcion del `sender` -> campana termina `activa` y lock liberado (usar un sender que rechaza y esperar el drain con `await new Promise(setImmediate)` o similar).
6. Casos de consulta y cancelacion: `GET` con contadores del mock; `404` por id inexistente; cancelar idempotente; lanzar tras cancelar -> `409`.
7. Registrar el script en la seccion de smoke tests del `README.md` si los demas checks estan listados alli (verificar convencion).

### Criterios de aceptacion
- [ ] `node scripts/check-campaign-api.js` termina con exit code 0 e imprime un `OK` por caso.
- [ ] Ningun caso hace llamadas de red reales ni requiere `.env` con secretos (el env se inyecta en el test).
- [ ] Cubre como minimo: 401, 503 por llave ausente, 201/200 idempotente, 422 por lote grande, 409 por doble lanzamiento, drenaje del envio en segundo plano y liberacion del lock ante excepcion.

---

## [PANEL-011] Actualizar documentacion y tracking del proyecto

**Labels**: `docs`, `chore`
**Depends on**: [PANEL-001]..[PANEL-010]

### Descripcion
Cerrar la fase dejando la documentacion del repo consistente con la nueva API, siguiendo las reglas de `AGENTS.md` y el estilo ASCII sin tildes de los documentos existentes. Sin esto el proyecto queda con endpoints no documentados y el tracking desactualizado.

### Microsteps
1. `README.md`: agregar las rutas nuevas a la tabla de endpoints, `PANEL_CAMPAIGN_API_KEY` a la seccion de variables de entorno, y una subseccion corta "API del panel de campanas" que remita a `INSTRUCTIVO_PANEL_CAMPANAS.md`.
2. `.env.example`: agregar `PANEL_CAMPAIGN_API_KEY=` con comentario de que es la llave compartida con el panel del hospital.
3. `.project-tracking/STATUS.md`: registrar los tickets PANEL-001..011 con su estado y evidencia (comando de check ejecutado), siguiendo el formato de los tickets existentes.
4. `.project-tracking/DECISIONS.md`: registrar tres decisiones: (a) lanzamiento asincrono con polling en lugar de webhook, (b) lock en memoria valido solo con instancia unica de Render y su plan de migracion, (c) idempotencia por `referencia_externa`.
5. Revisar que `INSTRUCTIVO_PANEL_CAMPANAS.md` siga coincidiendo con lo implementado (codigos HTTP, formas de respuesta); si hubo desviaciones durante el desarrollo, corregir el instructivo y anotarlas.

### Criterios de aceptacion
- [ ] `README.md` documenta los 5 endpoints y la variable `PANEL_CAMPAIGN_API_KEY`.
- [ ] `.env.example` incluye la variable nueva sin valor real.
- [ ] `STATUS.md` refleja los tickets PANEL con evidencia verificable.
- [ ] `DECISIONS.md` registra las tres decisiones tecnicas.
- [ ] No hay discrepancias entre el instructivo y la implementacion final.

## Orden de ejecucion sugerido

1. **PANEL-001** (migracion) y **PANEL-003** (router base) — en paralelo, no dependen entre si.
2. **PANEL-002** (helpers db) — tras PANEL-001.
3. **PANEL-004, PANEL-005, PANEL-007, PANEL-008** — en paralelo entre si, tras PANEL-002 y PANEL-003 (cada endpoint es independiente sobre el esqueleto comun).
4. **PANEL-006** (lanzar) — puede ir en paralelo con el grupo anterior, pero conviene hacerlo despues de PANEL-004/005 para poder probarlo end-to-end con campanas y destinatarios reales de prueba.
5. **PANEL-009** (estados desde el Flow) — independiente de todo lo anterior; puede ejecutarse en cualquier momento, incluso en paralelo con la fase 1.
6. **PANEL-010** (check integral) — al cerrar los endpoints.
7. **PANEL-011** (documentacion y tracking) — ultimo.

Ruta critica: PANEL-001 -> PANEL-002 -> PANEL-006 -> PANEL-010 -> PANEL-011.
