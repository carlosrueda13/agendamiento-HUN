# SETUP-001 - Checklist local

## Objetivo

Dejar documentada la configuracion minima para ejecutar el backend localmente y validar conectividad basica con HUN sin incluir secretos reales.

## Variables requeridas

### Meta / WhatsApp

- `VERIFY_TOKEN`: token de verificacion configurado en Meta.
- `WHATSAPP_TOKEN`: token de acceso de WhatsApp Cloud API.
- `PHONE_NUMBER_ID`: identificador del numero de WhatsApp Cloud API.
- `GRAPH_API_VERSION`: version de Graph API. Valor por defecto documentado: `v23.0`.
- `INBOUND_SESSION_TTL_MINUTES`: duracion en minutos del menu y consentimiento efimero en memoria. Opcional, default `30`; al vencer se solicita consentimiento nuevamente.

### WhatsApp Flow

- `FLOW_ID`: identificador del Flow creado en WhatsApp Manager.
- `FLOW_SCREEN_ID`: pantalla inicial del Flow. Valor esperado para este repo: `IDENTIFICACION`.
- `RESCHEDULE_FLOW_ID`: identificador del Flow separado de modificacion de citas.
- `RESCHEDULE_FLOW_SCREEN_ID`: pantalla inicial del Flow de modificacion. Valor esperado: `IDENTIFICACION_REAGENDAMIENTO`.
- `FLOW_PRIVATE_KEY_B64`: llave privada PEM codificada en base64 para `data_exchange`.
- `FLOW_KEY_PASSPHRASE`: passphrase de la llave privada, si aplica.
- `FLOW_SESSION_PII_KEY_B64`: llave backend de 32 bytes en base64 para cifrar correo de contacto transitorio de la sesion del Flow. Se usa desde `SETUP-005`; no debe compartirse con Meta ni guardarse en documentos versionados con valor real.
- `FLOW_SLOT_TOKEN_SECRET_B64`: llave backend opcional de 32 bytes en base64 para firmar `slot_token`; si no se define, se deriva desde `FLOW_SESSION_PII_KEY_B64`.
- `FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE`: solo para waiver temporal de `FLOW-003`; debe quedar `false` o vacia fuera de la prueba controlada.
- `FLOW_E2E_CANCEL_AFTER_ASSIGN`: solo para waiver temporal de `FLOW-003`; si esta activo cancela la cita creada al finalizar la prueba.
- `FLOW_E2E_TEST_DOCUMENTS`: documentos de prueba autorizados para el waiver temporal, separados por coma. No usar documentos reales.

### API HUN

- `HUN_API_BASE`: base URL de la API HUN de pruebas.
- `HUN_API_KEY`: API key de HUN.
- `CANCEL_VERIFY_MAX_ATTEMPTS`: intentos de verificacion asincronica de cancelacion. Opcional, default `6`.
- `CANCEL_VERIFY_INTERVAL_MS`: intervalo entre verificaciones HUN. Opcional, default `2000`.
- `CANCEL_VERIFY_INITIAL_DELAY_MS`: espera inicial antes de verificar. Opcional, default `1500`.

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

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key solo para backend.

Supabase no debe guardar citas, datos clinicos ni datos sensibles. La refactorizacion completa de persistencia corresponde a `SETUP-005`.

### Servidor local

- `PORT`: opcional para ejecucion local. No configurarlo manualmente en Render.

## Comandos locales

Instalar dependencias:

```bash
npm install
```

Ejecutar servidor:

```bash
npm start
```

Alternativa equivalente:

```bash
npm run dev
```

Validar health check:

```bash
curl http://localhost:3000/
```

Validar conectividad HUN:

```bash
curl http://localhost:3000/test-hun
```

Exploracion manual de API HUN:

```bash
node explorar-api-hun.js
```

## Smoke test esperado

- `GET /` debe responder HTTP 200.
- `GET /test-hun` debe responder HTTP 200 cuando hay conectividad a la API HUN de pruebas.
- El servidor debe iniciar con `npm start` sin requerir variables reales para el health check.

## Pendientes fuera de SETUP-001

- Corregir README y textos con mojibake en `SETUP-003`.
- Parametrizar `explorar-api-hun.js` en `SETUP-004`.
- Eliminar persistencia sensible actual en `SETUP-005`.
- Implementar uso real de `FLOW_SESSION_PII_KEY_B64` para `contacto_email_enc` y `contacto_email_hmac` en `SETUP-005`.
