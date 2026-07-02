# FLOW-001 - Configuracion externa requerida

Antes de continuar con validaciones de codigo para `FLOW-001`, confirmar estos pasos fuera del repo.

## 1. Render / backend publico

Confirmar la URL publica del backend. Debe responder:

```text
GET https://TU_BACKEND_PUBLICO/
GET https://TU_BACKEND_PUBLICO/test-hun
POST https://TU_BACKEND_PUBLICO/flow-endpoint
```

En Render deben existir las variables requeridas por el Flow:

```text
VERIFY_TOKEN
WHATSAPP_TOKEN
PHONE_NUMBER_ID
GRAPH_API_VERSION
FLOW_ID
FLOW_SCREEN_ID
FLOW_PRIVATE_KEY_B64
FLOW_KEY_PASSPHRASE
FLOW_SESSION_PII_KEY_B64
FLOW_SLOT_TOKEN_SECRET_B64
HUN_API_BASE
HUN_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`FLOW_SESSION_PII_KEY_B64` y `FLOW_SLOT_TOKEN_SECRET_B64` deben conservar el `=` final si lo tienen.

## 2. WhatsApp Manager / Flow

En Meta, configurar el endpoint del Flow como:

```text
https://TU_BACKEND_PUBLICO/flow-endpoint
```

Actualizar/publicar el Flow usando el archivo del repo:

```text
flow-agendamiento.json
```

No cambiar el JSON directamente en Meta sin traer el cambio de vuelta al repo.

## 3. Llaves de cifrado

Confirmar que la llave publica cargada en Meta corresponde a la llave privada configurada en Render como:

```text
FLOW_PRIVATE_KEY_B64
FLOW_KEY_PASSPHRASE
```

## 4. Confirmacion requerida para continuar

Responder en el chat con:

```text
FLOW-001 externo listo
URL publica: https://TU_BACKEND_PUBLICO
Flow JSON publicado: si
Llaves Meta/Render coinciden: si
```

Con esa confirmacion se puede continuar con validacion de `ping`, cifrado/descifrado y navegacion del Flow.
