# Backend WhatsApp Flow (Agendamiento HUN)

Backend mínimo para **pruebas** de WhatsApp Cloud API + WhatsApp Flows.

Cuando el backend recibe un mensaje entrante de WhatsApp por webhook, responde
automáticamente enviando un **WhatsApp Flow** al mismo número que escribió.

> ⚠️ Este backend es únicamente para pruebas. No incluye base de datos, login,
> usuarios, lógica médica, conexión a APIs externas ni cifrado avanzado.

## Stack

- Node.js
- Express
- Axios
- dotenv
- Sin base de datos
- Sin autenticación propia

## Estructura

```
.
├── package.json
├── server.js
├── .env.example
├── README.md
└── .gitignore
```

## Endpoints

| Método | Ruta        | Descripción                                                        |
| ------ | ----------- | ------------------------------------------------------------------ |
| GET    | `/`         | Health check. Responde `Backend WhatsApp Flow activo`.             |
| GET    | `/webhook`  | Verificación del webhook con Meta (`hub.challenge`).               |
| POST   | `/webhook`  | Recibe mensajes entrantes y envía el Flow al usuario.             |

## Variables de entorno

Copia `.env.example` a `.env` para pruebas locales y rellena los valores:

| Variable            | Descripción                                                  |
| ------------------- | ------------------------------------------------------------ |
| `VERIFY_TOKEN`      | Token de verificación que defines tú y configuras en Meta.   |
| `WHATSAPP_TOKEN`    | Token de acceso de la app de WhatsApp Cloud API (Meta).      |
| `PHONE_NUMBER_ID`   | ID del número de WhatsApp Cloud API.                         |
| `FLOW_ID`           | ID del Flow creado en WhatsApp Manager.                      |
| `FLOW_SCREEN_ID`    | ID técnico de la pantalla inicial del Flow.                  |
| `GRAPH_API_VERSION` | Versión de la Graph API (por ejemplo `v23.0`).               |

> **No configures `PORT` manualmente en producción.** Render asigna
> `process.env.PORT` automáticamente. El servidor usa `process.env.PORT || 3000`,
> donde `3000` solo es respaldo para pruebas locales.

## Ejecutar localmente

```bash
npm install
cp .env.example .env   # edita los valores
npm start
```

El servidor quedará disponible en `http://localhost:3000`.

## Desplegar en Render

### 1. Crear el repositorio en GitHub

```bash
git init
git add .
git commit -m "Backend WhatsApp Flow"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 2. Crear un Web Service en Render

1. Entra a [Render](https://render.com) y crea una cuenta o inicia sesión.
2. Haz clic en **New +** → **Web Service**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio.
4. Configura:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. En la sección **Environment**, agrega las variables de entorno:
   - `VERIFY_TOKEN`
   - `WHATSAPP_TOKEN`
   - `PHONE_NUMBER_ID`
   - `FLOW_ID`
   - `FLOW_SCREEN_ID`
   - `GRAPH_API_VERSION`
6. Crea el servicio y espera a que el deploy termine.

> No agregues la variable `PORT`: Render la define automáticamente.

### 3. Configurar el webhook en Meta Developers

1. En [Meta for Developers](https://developers.facebook.com/) entra a tu app de
   WhatsApp → **Configuración del Webhook**.
2. Usa la URL pública de Render como **Callback URL**:
   ```
   https://NOMBRE-DEL-SERVICIO.onrender.com/webhook
   ```
3. En **Verify token** escribe el mismo valor que pusiste en `VERIFY_TOKEN`.
4. Pulsa **Verificar y guardar**. Meta hará un `GET /webhook` y el backend
   responderá el `hub.challenge`.
5. Suscríbete al campo **messages** del webhook.

### 4. Probar

1. Envía un mensaje de WhatsApp al número de prueba de tu app.
2. El backend detectará el mensaje entrante y responderá automáticamente
   enviando el **Flow** al mismo número.

## Notas

- El `POST /webhook` siempre responde `200` con `{ "status": "ok" }` para evitar
  reintentos de Meta.
- Los eventos de `status`, `delivery` o `read` se ignoran.
- Los errores de envío se imprimen en consola (incluido `error.response.data`)
  sin detener el servidor.
