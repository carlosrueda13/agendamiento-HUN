# AGENTS.md - Agendamiento HUN por WhatsApp

## Contexto del Proyecto

Backend Node/Express para agendar, confirmar, cancelar y ofrecer citas HUN desde WhatsApp Cloud API usando WhatsApp Flows `data_exchange` cifrado. La API HUN de pruebas es la fuente de verdad para pacientes, disponibilidad, asignacion, cancelacion y estado de cita. Supabase solo puede guardar estado operativo minimo no sensible para campanas, destinatarios, sesiones temporales, notificaciones y eventos tecnicos.

Hay tres Flows separados: autoagendamiento usa `flow-agendamiento.json` y `FLOW_ID`; campanas de demanda inducida usan `flow-demanda-inducida.json` y `CAMPAIGN_FLOW_ID`; modificacion de citas usa `flow-reagendamiento.json` y `RESCHEDULE_FLOW_ID`. No mezclar sus pantallas ni estados.

Antes de implementar cualquier cambio, leer `.project-tracking/STATUS.md` y trabajar solo el proximo ticket recomendado o el ticket que el usuario indique. No iniciar el siguiente ticket hasta que el usuario apruebe el actual como `done`.

## Arquitectura y Estructura

Stack actual: Node.js CommonJS, Express, Axios, dotenv y `@supabase/supabase-js`.

Archivos principales:

- `server.js`: health check `/`, `GET/POST /webhook`, `POST /flow-endpoint`, enrutamiento de mensajes entrantes.
- `lib/inboundRouter.js`: menu inicial, consentimiento, ruteo a agendamiento, consulta de citas y entrada futura a cancelacion.
- `flow-agendamiento.json`: pantallas `IDENTIFICACION`, `ESPECIALIDAD`, `SLOTS`, `CONFIRMAR`, `FINAL`.
- `flow-demanda-inducida.json`: Flow separado de campana; debe pedir identificacion minima en v1 y no permitir seleccion manual de especialidad.
- `lib/hun.js`: cliente HUN para especialidades, agenda, citas por documento y asignacion.
- `lib/flowHandler.js`: orquestacion del Flow y confirmacion asincrona.
- `lib/flowCrypto.js`: descifrado/cifrado requerido por WhatsApp Flows.
- `lib/whatsapp.js`: envio de mensajes WhatsApp.
- `lib/campaignAdminApi.js`: API REST autenticada para crear, cargar, lanzar, consultar y cancelar campanas desde el panel del hospital.
- `lib/db.js`: capa Supabase ya minimizada; solo admite sesiones temporales y estado operativo no sensible.
- `explorar-api-hun.js`: exploracion controlada de endpoints HUN.
- `.project-tracking/STATUS.md`: fuente de verdad operativa de tickets, dependencias, microsteps y criterios.
- `.project-tracking/DECISIONS.md`: decisiones tecnicas vigentes.

Decisiones vigentes que no se deben romper:

- HUN es fuente de verdad de paciente, cupos, cita creada, cancelacion y estado.
- Supabase no guarda citas, datos clinicos, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita ni payloads HUN completos.
- Los slots se manejan con `slot_token` opaco firmado y reconsulta HUN, no con candidatos completos persistidos.
- La cancelacion usa `cancel_token`, contexto temporal con TTL e idempotencia, no numero de cita persistido.
- Recordatorios reales deben derivarse de consultas HUN por ventana; si HUN no expone endpoint suficiente, dejar `ReminderCandidateProvider` y bloqueo operativo.
- Campanas de demanda inducida guardan solo `audiencia_ref` / `id_anonimo`, especialidad y estado operativo; telefono y contexto se resuelven en memoria contra el API orquestador antes de enviar WhatsApp.
- El Flow de campana v1 pide identificacion minima porque el API orquestador actual no entrega documento, EPS/codigo ni especialidad en codigos HUN suficientes para asignar sin identificar al paciente.
- `RESCH-001` es condicional/bloqueado hasta endpoint HUN de reagendamiento o regla operativa aprobada.
- `DEV_READY`, `MVP_TEST_READY` y `CONTRACT_READY` son gates distintos; mocks/placeholders no equivalen a cierre contractual sin waiver formal.

## Convenciones de Codigo

- Mantener CommonJS (`require`, `module.exports`) salvo decision explicita en `DECISIONS.md`.
- Usar `async/await` y propagar errores con contexto tecnico no sensible.
- Normalizar respuestas HUN con `trim`; la API devuelve strings con espacios de relleno.
- No loguear tokens, llaves privadas, service role key, documentos, EPS, numeros de cita ni payloads completos.
- Las funciones de Supabase deben nombrar claramente su alcance minimo: sesiones temporales, eventos operativos, destinatarios, campanas o notificaciones.
- Si un cambio altera arquitectura, proveedores externos, persistencia o flujo contractual, registrar decision en `.project-tracking/DECISIONS.md`.
- Al tocar tickets, actualizar `.project-tracking/STATUS.md`: estado, microsteps, evidencia, notas y `Ultima actualizacion`.
- Si un ticket requiere input o accion del usuario fuera del repo, hacerlo primero antes de implementar el resto del ticket. Ejemplos: pegar codigo/configuracion en Meta, crear o instalar algo en Meta, configurar un Flow, entregar un JSON nuevo de `flow-agendamiento.json`, registrar una URL publica, aprobar una credencial o confirmar un proveedor. En esos casos, entregar primero el artefacto o instruccion exacta, esperar confirmacion del usuario de que quedo aplicado correctamente y solo despues continuar con cambios dependientes en el repo.

## Comandos

```bash
npm install
npm start
npm run dev
node explorar-api-hun.js
```

Verificaciones manuales actuales:

```bash
curl http://localhost:3000/
curl http://localhost:3000/test-hun
```

Git en este checkout puede requerir:

```bash
git -c safe.directory=C:/Users/carlo/Desktop/agendamiento-HUN status --short
```

TODO: agregar scripts `test`, `lint` y `build` cuando los tickets de QA/configuracion los definan. No inventar comandos inexistentes.

## Zonas Prohibidas

- No modificar `.env`, no imprimir secretos y no copiar credenciales a documentos versionados.
- No commitear `node_modules/`, logs locales, resultados completos de exploracion ni archivos con payloads HUN sensibles.
- No persistir en Supabase: numero de cita, nombre, documento plano, EPS, medico, fecha/hora exacta, CUPS/procedimiento, historia de citas, adjuntos, ordenes, autorizaciones, datos clinicos o respuestas HUN completas.
- No ampliar funcionalidad de Flow, campanas, notificaciones, cancelacion o reportes antes de cerrar `SETUP-005`.
- No usar tablas antiguas/propuestas como `pacientes_whatsapp` o `citas_agendadas` para nuevas funcionalidades.
- No ejecutar operaciones modificadoras contra ambientes no controlados. Los POST de asignacion/cancelacion solo estan aprobados en la API HUN de pruebas controlada.
- No declarar `CONTRACT_READY` si demanda inducida o correo siguen con mocks/placeholders sin waiver formal del supervisor.
- No cambiar `flow-agendamiento.json` sin validar compatibilidad con el backend y WhatsApp Flow `data_exchange`.
- No dejar un ticket como completo si depende de una accion externa del usuario que no haya sido ejecutada y confirmada primero.
- No hacer `git reset --hard`, `git checkout --` ni borrar archivos del usuario sin aprobacion explicita.

## Contexto Adicional

Variables esperadas, sin valores reales: `VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `GRAPH_API_VERSION`, `PANEL_CAMPAIGN_API_KEY`, `FLOW_ID`, `FLOW_SCREEN_ID`, `RESCHEDULE_FLOW_ID`, `RESCHEDULE_FLOW_SCREEN_ID`, `CAMPAIGN_FLOW_ID`, `CAMPAIGN_FLOW_SCREEN_ID`, `CAMPAIGN_TEMPLATE_NAME`, `CAMPAIGN_TEMPLATE_LANGUAGE`, `CAMPAIGN_FLOW_TOKEN_SECRET_B64`, `FLOW_PRIVATE_KEY_B64`, `FLOW_KEY_PASSPHRASE`, `FLOW_SESSION_PII_KEY_B64`, `FLOW_SLOT_TOKEN_SECRET_B64`, `HUN_API_BASE`, `HUN_API_KEY`, `HUN_DEMANDA_API_BASE`, `HUN_DEMANDA_API_AUTH_TYPE`, `HUN_DEMANDA_API_TOKEN`, `HUN_DEMANDA_API_ENDPOINT`, `HUN_DEMANDA_API_TIMEOUT_MS`, `HUN_ORQUESTADOR_API_BASE`, `HUN_ORQUESTADOR_API_KEY`, `HUN_ORQUESTADOR_API_ENDPOINT`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Endpoints HUN relevantes: especialidades, citas por documento, cita por numero, agenda por especialidad, asignar cita, cancelar cita y verificar cancelacion. Consultar `PLAN_CONTRATO_AGENDAMIENTO_HUN.md` para el detalle contractual y `PLAN_SPRINTS_AGENDAMIENTO_HUN.md` para el alcance por tickets.

El README actual puede estar desactualizado frente al plan, especialmente sobre Supabase y HUN. Cuando haya conflicto, seguir `.project-tracking/STATUS.md`, `.project-tracking/DECISIONS.md` y los planes aprobados; corregir README en `SETUP-003`.

Informacion pendiente que requiere confirmacion antes de implementacion real: configuracion final de variables de campana en Render cuando se implemente CAMPAIGN-003, posible ampliacion del API orquestador para omitir identificacion en campanas, proveedor/API de correo, reglas de opt-out/consentimiento, criterio final de produccion para POST HUN y estrategia final de reagendamiento.
