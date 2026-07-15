# Agendamiento HUN por WhatsApp

Backend Node/Express para pruebas del canal de agendamiento HUN con WhatsApp Cloud API, WhatsApp Flows `data_exchange`, API HUN de pruebas y Supabase minimo operativo.

El proyecto permite:

- Recibir mensajes entrantes de WhatsApp por webhook.
- Enviar Flows separados de autoagendamiento, demanda inducida o modificacion de citas, segun el contexto.
- Procesar pantallas del Flow desde `/flow-endpoint`.
- Consultar especialidades, agenda e historial contra la API HUN de pruebas.
- Confirmar citas contra HUN en segundo plano.
- Registrar solo estado operativo minimo no sensible en Supabase, segun el plan del proyecto.

## Estado del proyecto

Este repositorio esta en fase de MVP y se trabaja por tickets desde `.project-tracking/STATUS.md`.

Reglas vigentes:

- La API HUN es la fuente de verdad para paciente, disponibilidad, cita creada, cita cancelada y estado de cita.
- Supabase no debe guardar citas, datos clinicos, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita ni respuestas HUN completas.
- La persistencia sensible original fue eliminada en `SETUP-005`; Supabase conserva solo estado operativo minimo y contacto cifrado transitorio cuando aplica.
- La asignacion y cancelacion de citas estan permitidas solo en la API HUN de pruebas controlada. Antes de usar un ambiente productivo o no controlado, se debe revalidar la regla operativa.

## Stack

- Node.js
- Express
- Axios
- dotenv
- `@supabase/supabase-js`
- WhatsApp Cloud API
- WhatsApp Flows `data_exchange`

## Estructura

```text
.
|-- server.js
|-- flow-agendamiento.json
|-- explorar-api-hun.js
|-- lib/
|   |-- db.js
|   |-- demandaInducida.js
|   |-- flowCrypto.js
|   |-- flowHandler.js
|   |-- hun.js
|   `-- whatsapp.js
|-- supabase/
|   `-- 001_minimal_operational_schema.sql
|-- .project-tracking/
|   |-- STATUS.md
|   `-- DECISIONS.md
|-- AGENTS.md
|-- SETUP_LOCAL_CHECKLIST.md
|-- SUPABASE_MINIMO.md
|-- DEMANDA_INDUCIDA_API.md
|-- package.json
`-- .env.example
```

## Endpoints del backend

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/` | Health check. Responde `Backend WhatsApp Flow activo`. |
| GET | `/test-hun` | Smoke test de conectividad con especialidades HUN. |
| GET | `/webhook` | Verificacion de webhook de Meta con `hub.challenge`. |
| POST | `/webhook` | Recibe mensajes entrantes, muestra menu inicial, solicita consentimiento y enruta a Flow o consulta HUN. |
| POST | `/flow-endpoint` | Endpoint cifrado de WhatsApp Flow `data_exchange`. |
| POST | `/api/campanas` | Crea una campana de forma idempotente mediante `referencia_externa`. |
| POST | `/api/campanas/{campaign_id}/destinatarios` | Carga hasta 500 referencias anonimas por lote. |
| POST | `/api/campanas/{campaign_id}/lanzar` | Inicia el envio en segundo plano y responde `202`. |
| GET | `/api/campanas/{campaign_id}` | Consulta estado, contadores y fallos agregados. |
| POST | `/api/campanas/{campaign_id}/cancelar` | Cancela la campana de forma idempotente. |

### API del panel de campanas

El contrato servidor-a-servidor para crear, cargar, lanzar, consultar y cancelar
campanas esta en [INSTRUCTIVO_PANEL_CAMPANAS.md](INSTRUCTIVO_PANEL_CAMPANAS.md).
Las cinco rutas requieren el header `x-api-key`; la llave compartida nunca debe
exponerse en el navegador ni enviarse junto con datos personales de pacientes.

## Variables de entorno

Copiar `.env.example` a `.env` para pruebas locales y completar valores reales solo en `.env`.

### Meta / WhatsApp

- `VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `PHONE_NUMBER_ID`
- `GRAPH_API_VERSION`

### WhatsApp Flow

- `FLOW_ID`
- `FLOW_SCREEN_ID`
- `RESCHEDULE_FLOW_ID`
- `RESCHEDULE_FLOW_SCREEN_ID`
- `CAMPAIGN_FLOW_ID`
- `CAMPAIGN_FLOW_SCREEN_ID`
- `CAMPAIGN_TEMPLATE_NAME`
- `CAMPAIGN_TEMPLATE_LANGUAGE`
- `CAMPAIGN_FLOW_TOKEN_SECRET_B64` opcional; si no se define, el backend deriva la firma de tokens de campana desde `FLOW_SLOT_TOKEN_SECRET_B64` o `FLOW_SESSION_PII_KEY_B64`.
- `FLOW_PRIVATE_KEY_B64`
- `FLOW_KEY_PASSPHRASE`
- `FLOW_SESSION_PII_KEY_B64`
- `FLOW_SLOT_TOKEN_SECRET_B64` opcional; si no se define, el backend deriva la firma de slots desde `FLOW_SESSION_PII_KEY_B64`.
- `FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE`, `FLOW_E2E_CANCEL_AFTER_ASSIGN` y `FLOW_E2E_TEST_DOCUMENTS` son solo para el waiver temporal de `FLOW-003`; deben quedar desactivadas fuera de esa prueba controlada.

### HUN

- `HUN_API_BASE`
- `HUN_API_KEY`
- `CANCEL_VERIFY_MAX_ATTEMPTS`, `CANCEL_VERIFY_INTERVAL_MS` y `CANCEL_VERIFY_INITIAL_DELAY_MS` son opcionales y controlan la verificacion asincronica de cancelaciones.

`FLOW_ID` corresponde al autoagendamiento, `CAMPAIGN_FLOW_ID` a demanda inducida y `RESCHEDULE_FLOW_ID` a modificacion de citas. Cada recorrido usa un JSON de Flow separado.

### API oficial de demanda inducida

Estas variables quedan documentadas aunque el endpoint real aun no este disponible:

- `HUN_DEMANDA_API_BASE`
- `HUN_DEMANDA_API_AUTH_TYPE`
- `HUN_DEMANDA_API_TOKEN`
- `HUN_DEMANDA_API_ENDPOINT`
- `HUN_DEMANDA_API_TIMEOUT_MS`
- `HUN_ORQUESTADOR_API_BASE`
- `HUN_ORQUESTADOR_API_KEY`
- `HUN_ORQUESTADOR_API_ENDPOINT`

El adaptador de audiencia esta documentado en `DEMANDA_INDUCIDA_API.md`. La campana debe guardar solo `id_anonimo` / `audiencia_ref` en Supabase; el telefono y contexto se consultan en memoria contra el orquestador justo antes de enviar WhatsApp. Si las APIs reales no estan configuradas, el backend puede usar un mock contractual para desarrollo; eso no equivale a `CONTRACT_READY` sin API real o waiver formal.

### Panel administrativo de campanas

- `PANEL_CAMPAIGN_API_KEY`: llave compartida servidor-a-servidor que protege las cinco rutas `/api/campanas`; es obligatoria para habilitar el API.

### EmailJS

Estas variables son opcionales hasta que el proveedor de correo quede aprobado y configurado:

- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_PRIVATE_KEY`

### Supabase minimo operativo

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Servidor local

- `PORT` es opcional para local. No configurarlo manualmente en Render; Render lo inyecta automaticamente.

## Ejecutar localmente

```bash
npm install
cp .env.example .env
npm start
```

En Windows PowerShell, si `cp` no aplica:

```powershell
Copy-Item .env.example .env
npm.cmd start
```

El servidor queda disponible en:

```text
http://localhost:3000
```

## Smoke tests

Health check:

```bash
curl http://localhost:3000/
```

Conectividad HUN:

```bash
curl http://localhost:3000/test-hun
```

Contrato HTTP del API administrativo de campanas, con servidor y dependencias
simulados localmente:

```bash
node scripts/check-campaign-api.js
```

Exploracion manual de la API HUN:

```bash
node explorar-api-hun.js
```

El script de exploracion es de solo lectura por defecto, acepta parametros por CLI/env y guarda un resumen tecnico redactado en `resultados-api-hun.resumen.json`, ignorado por Git:

```bash
node explorar-api-hun.js --especialidad 21 --dias 30 --tipo CC --documento 41531776
```

Las operaciones modificadoras contra HUN de pruebas requieren confirmacion explicita:

```bash
node explorar-api-hun.js --allow-mutations --confirm-hun-test --assign-payload payload.json
node explorar-api-hun.js --allow-mutations --confirm-hun-test --cancel-cita 1534700 --tipo CC --documento 41531776
```

No ejecutar esas banderas contra ambientes no controlados.

Envio manual de ofertas de demanda inducida:

```bash
node scripts/send-campaign-offers.js <campaign_id> [limit]
```

Este comando usa `CAMPAIGN_FLOW_ID=2195324014654953`, `CAMPAIGN_TEMPLATE_NAME=hun_oferta_cita_flow`, el resolver `HUN_ORQUESTADOR_*` y WhatsApp Cloud API. La salida es un resumen agregado; no imprime telefono, nombre, correo ni payloads del orquestador.

## API HUN de pruebas

Base URL documentada:

```text
http://190.109.10.204
```

Endpoints usados por el MVP:

- `GET /webServiceEspecialidad/especialidades`
- `GET /webServiceCitaDocumento/consultar_citas_documento`
- `GET /webServiceCitaNumero/consultar_citas_numero`
- `GET /webServiceFechaMedico/consultar`
- `GET /webServiceDisponibilidadMedico/consultar`
- `GET /webServiceAgenda/agenda`
- `POST /webServiceCita/api/asignar_cita`
- `POST /webServiceCancelarCitaH/cancelar_cita`
- `GET /webServiceCancelarCitaH/verificar_cancelacion/{cita}`

La API HUN actual es una copia/base de pruebas controlada. En este entorno se pueden ejecutar asignaciones y cancelaciones para validar el flujo completo. Esta autorizacion no se traslada automaticamente a produccion.

## Supabase

El esquema minimo esta en:

```text
supabase/001_minimal_operational_schema.sql
```

Tablas esperadas:

- `campanas`
- `campana_destinatarios`
- `flow_sesiones_temporales`
- `eventos_operativos`
- `notificaciones`

Vistas esperadas:

- `vista_medica_operativa`
- `vista_it_auditoria`

Supabase debe usarse solo para trazabilidad operativa, campanas, destinatarios minimos, sesiones temporales y notificaciones no sensibles.

Para campanas de demanda inducida, ejecutar tambien las migraciones incrementales aprobadas, incluida `supabase/004_campaign_audiencia_ref.sql`, antes de usar destinatarios por `id_anonimo` en Supabase real. Para la verificacion final de cancelaciones, aplicar `supabase/006_cancel_operation_failure_state.sql`. Para la saga de modificacion, aplicar `supabase/007_reschedule_operation_states.sql`. Antes de usar el API del panel, aplicar `supabase/008_campaign_external_ref.sql` para habilitar la idempotencia por `referencia_externa`. Estas migraciones agregan solo estados operativos y no incorporan datos personales ni detalles de cita.

## Flujo WhatsApp

1. `POST /webhook` recibe un mensaje entrante o dispara una campana aprobada.
2. Para mensajes entrantes, el backend envia menu inicial y consentimiento de tratamiento de datos.
3. Si el paciente acepta y elige agendar, el backend envia el Flow de autoagendamiento con `FLOW_ID`.
4. Si el paciente acepta y elige consultar, el backend pide identificacion minima y consulta citas HUN solo en memoria.
5. Si el paciente acepta modificar/cancelar, el backend pregunta si desea modificar o cancelar.
6. Cancelar conserva la rama conversacional: consulta HUN, usa `cancel_token`, exige confirmacion y verifica asincronicamente el resultado.
7. Modificar abre `flow-reagendamiento.json`: consulta las citas del paciente, obtiene especialidad y `Cod_Pro` de la cita original y ofrece solo slots autogestionables con el mismo procedimiento.
8. La saga de modificacion asigna y confirma primero la nueva cita; solo despues cancela y verifica la original. Si la segunda operacion falla, informa posible doble reserva y marca revision manual.
9. En Flows, Meta llama `POST /flow-endpoint` con payload cifrado.
10. `lib/flowCrypto.js` descifra la solicitud y `lib/flowHandler.js` enruta cada Flow consultando HUN.
11. El backend responde a Meta con respuesta cifrada y la confirmacion final se envia por WhatsApp cuando HUN cierra la operacion.

## Documentacion de trabajo

- `AGENTS.md`: reglas para agentes de codigo.
- `.project-tracking/STATUS.md`: estado de tickets y evidencia.
- `.project-tracking/DECISIONS.md`: decisiones tecnicas vigentes.
- `PLAN_CONTRATO_AGENDAMIENTO_HUN.md`: plan contractual.
- `PLAN_SPRINTS_AGENDAMIENTO_HUN.md`: backlog por sprints y tickets.

## Notas de seguridad

- No commitear `.env`.
- No imprimir tokens ni llaves privadas.
- No guardar payloads HUN completos.
- No guardar datos sensibles en Supabase.
- No declarar `CONTRACT_READY` si hay mocks/placeholders obligatorios sin waiver formal.
