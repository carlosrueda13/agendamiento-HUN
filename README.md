# Agendamiento HUN por WhatsApp

Backend Node/Express para pruebas del canal de agendamiento HUN con WhatsApp Cloud API, WhatsApp Flows `data_exchange`, API HUN de pruebas y Supabase minimo operativo.

El proyecto permite:

- Recibir mensajes entrantes de WhatsApp por webhook.
- Enviar un WhatsApp Flow de agendamiento.
- Procesar pantallas del Flow desde `/flow-endpoint`.
- Consultar especialidades, agenda e historial contra la API HUN de pruebas.
- Confirmar citas contra HUN en segundo plano.
- Registrar solo estado operativo minimo no sensible en Supabase, segun el plan del proyecto.

## Estado del proyecto

Este repositorio esta en fase de MVP y se trabaja por tickets desde `.project-tracking/STATUS.md`.

Reglas vigentes:

- La API HUN es la fuente de verdad para paciente, disponibilidad, cita creada, cita cancelada y estado de cita.
- Supabase no debe guardar citas, datos clinicos, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita ni respuestas HUN completas.
- La persistencia sensible existente en `lib/db.js` y `lib/flowHandler.js` se corrige en `SETUP-005`.
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
|-- package.json
`-- .env.example
```

## Endpoints del backend

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/` | Health check. Responde `Backend WhatsApp Flow activo`. |
| GET | `/test-hun` | Smoke test de conectividad con especialidades HUN. |
| GET | `/webhook` | Verificacion de webhook de Meta con `hub.challenge`. |
| POST | `/webhook` | Recibe mensajes entrantes y envia el Flow al usuario. |
| POST | `/flow-endpoint` | Endpoint cifrado de WhatsApp Flow `data_exchange`. |

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
- `FLOW_PRIVATE_KEY_B64`
- `FLOW_KEY_PASSPHRASE`
- `FLOW_SESSION_PII_KEY_B64`
- `FLOW_SLOT_TOKEN_SECRET_B64` opcional; si no se define, el backend deriva la firma de slots desde `FLOW_SESSION_PII_KEY_B64`.
- `FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE`, `FLOW_E2E_CANCEL_AFTER_ASSIGN` y `FLOW_E2E_TEST_DOCUMENTS` son solo para el waiver temporal de `FLOW-003`; deben quedar desactivadas fuera de esa prueba controlada.

### HUN

- `HUN_API_BASE`
- `HUN_API_KEY`

### API oficial de demanda inducida

Estas variables quedan documentadas aunque el endpoint real aun no este disponible:

- `HUN_DEMANDA_API_BASE`
- `HUN_DEMANDA_API_AUTH_TYPE`
- `HUN_DEMANDA_API_TOKEN`
- `HUN_DEMANDA_API_ENDPOINT`
- `HUN_DEMANDA_API_TIMEOUT_MS`

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
node explorar-api-hun.js --allow-mutations --confirm-hun-test --cancel-cita 1534700
```

No ejecutar esas banderas contra ambientes no controlados.

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

## Flujo WhatsApp

1. `POST /webhook` recibe un mensaje entrante.
2. El backend envia el WhatsApp Flow configurado en Meta.
3. Meta llama `POST /flow-endpoint` con payload cifrado.
4. `lib/flowCrypto.js` descifra la solicitud.
5. `lib/flowHandler.js` procesa cada pantalla y consulta HUN.
6. El backend responde a Meta con respuesta cifrada.
7. La confirmacion final se envia por WhatsApp cuando HUN responde.

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
