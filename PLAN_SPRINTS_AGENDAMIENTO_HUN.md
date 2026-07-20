# Plan de trabajo: Agendamiento HUN por WhatsApp

> Generado a partir de: `PLAN_CONTRATO_AGENDAMIENTO_HUN.md`

## Resumen ejecutivo

Se construira un MVP operativo para agendar, confirmar, cancelar y ofrecer citas desde WhatsApp usando WhatsApp Flows y API HUN de pruebas como fuente de verdad. Habra dos Flows separados: uno para autoagendamiento y otro para campanas de demanda inducida. La audiencia de demanda inducida usara referencias `id_anonimo` / `audiencia_ref`; el telefono y contexto se resuelven en memoria contra el API orquestador antes del envio. Supabase se usara solo para guardar estado operativo minimo no sensible. El trabajo se organiza por sprints sin fechas, priorizando primero la base tecnica, despues el flujo central de agendamiento, luego campanas/recordatorios/cancelacion, y finalmente QA, seguridad, despliegue y documentacion contractual.

## Supuestos y lagunas

- Decision aprobada: Supabase no guardara citas, datos clinicos ni datos sensibles; solo se usara para campanas, destinatarios minimos sincronizados, sesiones temporales y eventos tecnicos no sensibles.
- Decision aprobada: la API HUN sera la fuente de verdad para paciente, disponibilidad, cita creada, cita cancelada y estado de cita.
- Decision aprobada: el canal principal sera WhatsApp Cloud API con WhatsApp Flows `data_exchange` cifrado.
- Decision aprobada: todo mensaje entrante debe pasar primero por menu inicial y consentimiento de tratamiento de datos antes de abrir un Flow o consultar HUN.
- Decision parcialmente aprobada: el backend Node/Express actual se mantiene como base, pero debe refactorizarse temprano para eliminar la persistencia actual de datos sensibles en Supabase.
- Decision aprobada: las campanas de demanda inducida usaran un Flow separado del Flow de autoagendamiento.
- Decision aprobada: la lista inicial de campana vive en Supabase solo como `id_anonimo` / `audiencia_ref` y estado operativo; el telefono se resuelve en memoria mediante el API orquestador antes del envio.
- Pendiente operativo: el API orquestador actual no trae `tipo_documento`, `numero_documento`, `eps_codigo` ni especialidad en codigos suficientes para asignar sin pedir identificacion. Por eso el Flow de campana v1 pide identificacion minima y la version ideal de solo escoger fecha/hora queda condicionada a ampliar el contrato del API.
- Pendiente operativo: falta definir proveedor/API de correo. Antes de iniciar la integracion real se debe elevar advertencia y confirmar si HUN entregara SMTP, API institucional o proveedor externo aprobado.
- Decision aprobada: la API HUN consumida es un entorno de pruebas controlado con copia de base de datos; se permite ejecutar POST de asignacion y cancelacion para validar el flujo completo.
- Decision aprobada: los reportes administrativos se dividen en vista medica/operativa y vista IT/auditoria, con campos minimos no sensibles.

## Gates de entrega

- `DEV_READY`: el backend, los Flows y los adaptadores funcionan localmente con mocks/placeholders cuando el API oficial de demanda inducida o el proveedor de correo no esten disponibles. Este gate permite avanzar desarrollo, pero no equivale a cierre contractual.
- `MVP_TEST_READY`: el flujo de agendamiento, confirmacion, cancelacion, trazabilidad y WhatsApp Flow funcionan contra la API HUN de pruebas y el canal WhatsApp configurado, sin persistir datos sensibles en Supabase.
- `CONTRACT_READY`: no quedan proveedores obligatorios simulados. Si el API real de demanda inducida o el proveedor/API de correo no estan disponibles, debe existir aprobacion formal del supervisor que acepte el componente como pendiente documentado.

## Vista general del backlog

| ID | Titulo | Fase | Labels | Depende de |
|----|--------|------|--------|------------|
| SETUP-001 | Configurar entorno local y variables del backend | Sprint 0 - Setup | `chore`, `infra`, `backend` | - |
| SETUP-002 | Crear esquema minimo no sensible de Supabase | Sprint 0 - Setup | `database`, `backend`, `security` | SETUP-001 |
| SETUP-003 | Corregir documentacion base y textos visibles | Sprint 0 - Setup | `docs`, `backend` | SETUP-001 |
| SETUP-004 | Formalizar script de exploracion de API HUN | Sprint 0 - Setup | `chore`, `api`, `testing` | SETUP-001 |
| SETUP-005 | Refactorizar persistencia sensible existente | Sprint 0 - Setup | `backend`, `database`, `security` | SETUP-002 |
| CORE-001 | Fortalecer cliente HUN y normalizacion de datos | Sprint 1 - Core agendamiento | `backend`, `api` | SETUP-004 |
| CORE-002 | Implementar trazabilidad de transiciones del Flow | Sprint 1 - Core agendamiento | `backend`, `database` | SETUP-005 |
| CORE-003 | Endurecer Flow de identificacion y seleccion de especialidad | Sprint 1 - Core agendamiento | `feature`, `backend`, `api` | CORE-001, CORE-002 |
| CORE-004 | Implementar seleccion robusta de cupos autogestionables | Sprint 1 - Core agendamiento | `feature`, `backend`, `api` | CORE-003 |
| CORE-005 | Implementar confirmacion asincrona de cita | Sprint 1 - Core agendamiento | `feature`, `backend`, `api` | CORE-004 |
| CORE-006 | Separar procedimiento, fecha y hora en autoagendamiento | Sprint 1 - Core agendamiento | `feature`, `backend`, `api`, `flow`, `testing` | CORE-005, FLOW-001 |
| CORE-007 | Resolver nombres CUPS cuando HUN omite la descripcion | Sprint 1 - Core agendamiento | `backend`, `api`, `data`, `testing` | CORE-006 |
| FLOW-001 | Validar cifrado y publicacion de WhatsApp Flow | Sprint 2 - Integracion WhatsApp | `feature`, `backend`, `security` | CORE-003 |
| FLOW-002 | Implementar manejo de errores conversacionales | Sprint 2 - Integracion WhatsApp | `feature`, `backend` | FLOW-001, CORE-005 |
| FLOW-003 | Ejecutar prueba end-to-end de Flow con asignacion | Sprint 2 - Integracion WhatsApp | `testing`, `backend`, `api` | FLOW-001, CORE-005 |
| INTAKE-001 | Implementar menu inicial y consentimiento WhatsApp | Sprint 2 - Integracion WhatsApp | `feature`, `backend`, `whatsapp`, `privacy` | FLOW-001, CORE-001 |
| INTAKE-002 | Mejorar identificacion y consulta conversacional | Sprint 2 - Integracion WhatsApp | `feature`, `backend`, `whatsapp`, `ux`, `testing` | INTAKE-001, CORE-001 |
| CAMPAIGN-001 | Modelar campanas y destinatarios | Sprint 3 - Campanas y notificaciones | `feature`, `database`, `backend` | SETUP-005 |
| CAMPAIGN-002 | Implementar adaptador de audiencia de demanda inducida | Sprint 3 - Campanas y notificaciones | `feature`, `backend`, `api` | CAMPAIGN-001 |
| FLOW-004 | Crear Flow separado de demanda inducida | Sprint 3 - Campanas y notificaciones | `feature`, `backend`, `flow` | CAMPAIGN-002, CORE-005, FLOW-001 |
| CAMPAIGN-003 | Implementar envio de ofertas de cita por WhatsApp | Sprint 3 - Campanas y notificaciones | `feature`, `backend`, `api` | CAMPAIGN-002, FLOW-004 |
| NOTIF-001 | Implementar confirmaciones inmediatas y recordatorios desde HUN | Sprint 3 - Campanas y notificaciones | `feature`, `backend` | CORE-005, CAMPAIGN-001 |
| NOTIF-002 | Preparar integracion de correo transaccional | Sprint 3 - Campanas y notificaciones | `feature`, `backend`, `needs-discussion` | NOTIF-001 |
| CANCEL-001 | Implementar flujo de cancelacion de citas | Sprint 4 - Cancelacion y reagendamiento | `feature`, `backend`, `api` | CORE-002, CORE-001, INTAKE-001 |
| CANCEL-002 | Implementar verificacion asincrona de cancelacion | Sprint 4 - Cancelacion y reagendamiento | `feature`, `backend`, `api` | CANCEL-001 |
| RESCH-001 | Evaluar estrategia de reagendamiento | Sprint 4 - Cancelacion y reagendamiento | `needs-discussion`, `blocked` | CANCEL-002, CORE-005 |
| RESCH-002 | Implementar Flow y saga de reagendamiento | Sprint 4 - Cancelacion y reagendamiento | `feature`, `backend`, `api`, `flow` | RESCH-001, CANCEL-002, CORE-005, FLOW-001 |
| RESCH-003 | Separar seleccion de fecha y hora en reagendamiento | Sprint 4 - Cancelacion y reagendamiento | `feature`, `backend`, `flow`, `testing` | RESCH-002 |
| ADMIN-001 | Crear consultas administrativas por perfil | Sprint 5 - Operacion y reportes | `feature`, `backend`, `api` | CORE-002, CAMPAIGN-001, CANCEL-002 |
| ADMIN-002 | Crear exportes por perfil de trazabilidad | Sprint 5 - Operacion y reportes | `feature`, `backend`, `docs` | ADMIN-001 |
| QA-001 | Construir matriz de pruebas funcionales | Sprint 6 - QA y seguridad | `testing`, `docs` | CORE-007, FLOW-004, CAMPAIGN-003, CANCEL-002, RESCH-002, RESCH-003, INTAKE-002, NOTIF-001 |
| QA-002 | Implementar pruebas automatizadas de modulos criticos | Sprint 6 - QA y seguridad | `testing`, `backend` | QA-001 |
| SEC-001 | Revisar proteccion de datos personales y secretos | Sprint 6 - QA y seguridad | `security`, `backend`, `docs` | CORE-002, ADMIN-001 |
| DEPLOY-001 | Preparar despliegue y verificacion de estabilidad | Sprint 7 - Deploy y cierre contractual | `infra`, `backend`, `testing` | QA-002, SEC-001 |
| DOCS-001 | Elaborar documentacion tecnica final | Sprint 7 - Deploy y cierre contractual | `docs` | ADMIN-002, QA-001, SEC-001 |
| DOCS-002 | Elaborar informe final y trabajo futuro | Sprint 7 - Deploy y cierre contractual | `docs` | DOCS-001, DEPLOY-001 |

## Tickets detallados

### Sprint 0 - Setup

## [SETUP-001] Configurar entorno local y variables del backend

**Labels**: `chore`, `infra`, `backend`
**Depends on**: -
**Blocked by**: -

### Descripcion
Preparar el entorno local y la configuracion base para que el backend pueda ejecutarse de forma reproducible. Este ticket asegura que las variables requeridas por Meta, WhatsApp Flow, HUN, API oficial de demanda inducida y Supabase esten documentadas y listas para pruebas locales y despliegue.

### Microsteps
1. Revisar `.env.example` y confirmar que cubre Meta, Flow, HUN, API oficial de demanda inducida y Supabase.
2. Crear checklist local de variables obligatorias, opcionales y pendientes de proveedor/API.
3. Ejecutar `npm install` y confirmar que `package-lock.json` queda consistente.
4. Levantar `npm start` y validar `GET /`.
5. Validar `GET /test-hun` con la API HUN de pruebas.
6. Documentar comandos locales de instalacion, ejecucion y smoke test.

### Criterios de aceptacion
- [ ] El backend inicia localmente con `npm start`.
- [ ] `GET /` responde HTTP 200.
- [ ] `GET /test-hun` responde HTTP 200 cuando hay conectividad a HUN.
- [ ] Todas las variables usadas por el codigo aparecen en `.env.example`.
- [ ] Existe una lista verificable de variables requeridas para local y despliegue.
- [ ] Las variables del API oficial de demanda inducida quedan documentadas aunque el endpoint aun no este disponible.

## [SETUP-002] Crear esquema minimo no sensible de Supabase

**Labels**: `database`, `backend`, `security`
**Depends on**: SETUP-001
**Blocked by**: -

### Descripcion
Crear la estructura minima necesaria para operar campanas, destinatarios, sesiones temporales, notificaciones y eventos tecnicos sin guardar citas ni datos sensibles. Este esquema sirve para trazabilidad operativa y demanda inducida, mientras la API HUN conserva la fuente de verdad de paciente, cita y estado clinico/administrativo. Como excepcion controlada, `flow_sesiones_temporales` puede guardar correo de contacto solo cifrado, con HMAC no reversible y TTL igual o menor a la sesion, para poder enviar confirmaciones transitorias sin crear perfil permanente de paciente.

### Microsteps
1. Definir tabla `campanas` con nombre, especialidad, template, estado y conteos agregados.
2. Definir tabla `campana_destinatarios` con `audiencia_ref` / `id_anonimo`, especialidad, estado de contacto y timestamps; `whatsapp_numero` y `documento_hash` quedan solo como campos legacy/compatibilidad y no son obligatorios para campanas nuevas.
3. Definir tabla `flow_sesiones_temporales` con `session_id` o `flow_token`, estado, especialidad, `slot_token`, correo de contacto cifrado transitorio si aplica, expiracion y timestamps.
4. Definir tabla `eventos_operativos` con `event_id`, `campaign_id`, `recipient_id`, `session_id_hash`, `event_type`, `status`, `source`, `http_status`, `error_code`, `error_category`, `duration_ms`, `retry_count`, `environment`, `backend_version` y timestamp.
5. Definir tabla `notificaciones` con canal, tipo, estado, proveedor, error tecnico y timestamp.
6. Documentar que `flow_sesiones_temporales` nunca almacena medico, fecha, hora, CUPS, consultorio, `agenda_detalle_id` ni payload de agenda.
7. Documentar campos prohibidos: cita, nombre, documento plano, EPS, medico, fecha/hora, CUPS y respuestas completas HUN.
8. Documentar llaves, indices, expiracion de sesiones y restricciones de acceso.
9. Agregar addendum/migracion para `contacto_email_enc`, `contacto_email_hmac` y `contacto_email_expires_at`, sin correo plano.

### Criterios de aceptacion
- [ ] El esquema incluye campanas, destinatarios, sesiones temporales, eventos operativos y notificaciones.
- [ ] Cada tabla tiene clave primaria y timestamps.
- [ ] Ninguna tabla almacena numero de cita, nombre, documento plano, EPS, medico, fecha/hora ni respuesta completa HUN.
- [ ] `flow_sesiones_temporales` solo guarda estado minimo, `session_id` o `flow_token`, `especialidad_codigo`, `slot_token` seleccionado si aplica, correo de contacto cifrado transitorio si aplica, expiracion y timestamps.
- [ ] Si se captura correo para confirmacion, se guarda solo como `contacto_email_enc` y `contacto_email_hmac`, nunca como correo plano, y su TTL no supera `expires_at`.
- [ ] Las relaciones entre campanas, destinatarios, sesiones temporales, notificaciones y eventos estan definidas.
- [ ] El esquema soporta una vista medica/operativa y una vista IT/auditoria sin duplicar datos sensibles.
- [ ] El backend puede leer/escribir solo las tablas minimas definidas.

## [SETUP-003] Corregir documentacion base y textos visibles

**Labels**: `docs`, `backend`
**Depends on**: SETUP-001
**Blocked by**: -

### Descripcion
Corregir textos con mojibake y actualizar README/Flow para reflejar el estado real del proyecto. La documentacion debe servir como soporte tecnico del contrato y evitar mensajes visibles corruptos para pacientes o supervisor.

### Microsteps
1. Revisar README, `flow-agendamiento.json`, `server.js` y `lib/*.js` buscando caracteres corruptos.
2. Corregir textos visibles al usuario en mensajes de WhatsApp y Flow.
3. Actualizar README con arquitectura actual, endpoints y variables.
4. Agregar notas sobre que asignacion/cancelacion estan permitidas en la API HUN de pruebas controlada y que deben revalidarse antes de produccion.
5. Incluir comandos de exploracion y smoke test.

### Criterios de aceptacion
- [ ] No hay mojibake en textos visibles al paciente.
- [ ] README menciona `/flow-endpoint`, `/test-hun` y uso limitado de Supabase.
- [ ] README explica como correr el backend localmente.
- [ ] README indica que asignar/cancelar citas esta permitido en la API HUN de pruebas controlada.

## [SETUP-004] Formalizar script de exploracion de API HUN

**Labels**: `chore`, `api`, `testing`
**Depends on**: SETUP-001
**Blocked by**: -

### Descripcion
Convertir la exploracion viva de la API HUN en una herramienta reutilizable para validar estructura, campos y conectividad. Esto reduce incertidumbre al implementar agendamiento, cancelacion y demanda inducida.

### Microsteps
1. Parametrizar base URL, API key y fechas desde variables o argumentos.
2. Separar consultas de solo lectura de operaciones que modifican citas para poder ejecutar ambas de forma controlada.
3. Guardar resultados resumidos en un archivo de salida ignorado por Git.
4. Validar especialidades, agenda, citas por documento y cita por numero.
5. Documentar que asignacion y cancelacion pueden ejecutarse contra la API HUN de pruebas controlada.

### Criterios de aceptacion
- [ ] El script consulta endpoints de lectura sin modificar datos.
- [ ] El script permite cambiar rango de fechas sin editar codigo.
- [ ] El resultado muestra campos disponibles por endpoint.
- [ ] Las operaciones POST quedan documentadas como permitidas en el entorno HUN de pruebas controlado.

## [SETUP-005] Refactorizar persistencia sensible existente

**Labels**: `backend`, `database`, `security`
**Depends on**: SETUP-002
**Blocked by**: -

**Bloqueo absoluto**: no se puede iniciar trabajo funcional sobre Flow, campanas, notificaciones, cancelacion o reportes hasta que este ticket este cerrado, porque todos esos modulos dependen de que `lib/db.js`, `lib/flowHandler.js`, Supabase y el estado del Flow respeten la minimizacion aprobada.

### Descripcion
Modificar el flujo actual para que Supabase deje de recibir datos sensibles o datos de cita. El backend Node/Express se conserva, pero `lib/db.js` y `lib/flowHandler.js` deben ajustarse antes de ampliar el producto, porque hoy el flujo fue diseÃ±ado para guardar paciente, sesion completa y cita en Supabase.

### Microsteps
1. Auditar llamadas actuales a `guardarPaciente`, `guardarSesion`, `getPaciente`, `getSesion` y `guardarCita`.
2. Eliminar o reemplazar `guardarPaciente`, `getPaciente` y `guardarCita` por funciones que no persistan paciente, documento, EPS ni cita.
3. Reemplazar `guardarSesion` y `getSesion` por funciones de sesion temporal minima con `session_id` o `flow_token`, estado, `especialidad_codigo`, `slot_token` seleccionado si aplica, correo de contacto cifrado transitorio si aplica, expiracion y timestamps.
4. Reemplazar persistencia de paciente por uso en memoria durante la operacion del Flow.
5. Eliminar persistencia de citas, slots completos y respuestas HUN desde Supabase.
6. Reemplazar logs detallados por eventos operativos no sensibles.
7. Actualizar nombres de funciones de `lib/db.js` para que reflejen el nuevo alcance minimo.
8. Verificar que ninguna ruta funcional dependa de `pacientes_whatsapp` o `citas_agendadas`.
9. Implementar cifrado autenticado y HMAC no reversible para `contacto_email_enc` / `contacto_email_hmac`; el correo plano solo puede existir en memoria durante el request o el envio.
10. Limpiar `contacto_email_enc`, `contacto_email_hmac` y `contacto_email_expires_at` al completar, fallar, cancelar o expirar la sesion.
11. Agregar pruebas que fallen si se intenta guardar campos prohibidos: nombre, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita, `agenda_detalle_id`, respuesta HUN completa o correo plano.
12. Agregar prueba estatica/documental que busque referencias a `pacientes_whatsapp`, `citas_agendadas`, `slot_seleccionado` con payload completo y columnas/campos de correo plano fuera de `flow_sesiones_temporales`.

### Criterios de aceptacion
- [ ] Supabase no recibe nombre de paciente, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita ni respuesta HUN completa.
- [ ] `lib/flowHandler.js` usa datos sensibles solo en memoria durante la operacion.
- [ ] Las sesiones temporales tienen expiracion y guardan solo identificadores minimos mas correo de contacto cifrado transitorio cuando aplique.
- [ ] El correo no queda persistido en `pacientes_whatsapp`, `campana_destinatarios`, `notificaciones` ni eventos operativos; solo se permite cifrado temporal en `flow_sesiones_temporales`.
- [ ] La confirmacion de cita se informa por WhatsApp sin persistir la cita en Supabase.
- [ ] Las funciones antiguas de persistencia sensible se eliminan o quedan reemplazadas por equivalentes seguros.
- [ ] Existe una prueba automatizada o estatica que detecta cualquier intento de guardar campos prohibidos.
- [ ] El ticket queda cerrado antes de cualquier trabajo funcional que toque Flow, campanas, notificaciones, cancelacion, reportes, Supabase o estado de Flow.

### Sprint 1 - Core agendamiento

## [CORE-001] Fortalecer cliente HUN y normalizacion de datos

**Labels**: `backend`, `api`
**Depends on**: SETUP-004
**Blocked by**: -

### Descripcion
Mejorar `lib/hun.js` para que abstraiga correctamente la API HUN, normalice espacios de relleno y exponga respuestas consistentes al resto del backend. Este ticket reduce errores por diferencias entre documentacion y respuestas reales.

### Microsteps
1. Centralizar normalizacion de strings y objetos anidados.
2. Crear funciones para especialidades, agenda por especialidad, citas por documento y cita por numero.
3. Agregar funciones para cancelar cita y verificar cancelacion.
4. Normalizar `agenda_detalle_id`, `id_agenda_detalle` y campos equivalentes.
5. Estandarizar errores de timeout, 401 y respuestas vacias.
6. Documentar contratos de entrada/salida de cada funcion.

### Criterios de aceptacion
- [ ] Todas las funciones devuelven strings sin espacios de relleno.
- [ ] Agenda por especialidad devuelve cupos con `agenda_detalle_id` normalizado.
- [ ] Los errores de API se propagan con mensaje y endpoint.
- [ ] Existe funcion para cancelacion y verificacion asincrona.

## [CORE-002] Implementar trazabilidad de transiciones del Flow

**Labels**: `backend`, `database`
**Depends on**: SETUP-005
**Blocked by**: -

### Descripcion
Registrar cada paso relevante del bot para cumplir trazabilidad contractual y permitir consultas diferenciadas para medicos/personal operativo e IT/auditoria. La trazabilidad debe cubrir acciones exitosas, errores y estados operativos sin persistir datos clinicos, detalles de cita ni payloads sensibles.

### Microsteps
1. Agregar funcion `guardarEventoOperativo` en `lib/db.js`.
2. Registrar inicio de Flow, identificacion, seleccion de especialidad, seleccion de slot y confirmacion.
3. Registrar errores de API HUN, Supabase y WhatsApp.
4. Guardar metadatos no sensibles para IT: `event_id`, `session_id_hash`, `event_type`, `source`, `http_status`, `error_code`, `error_category`, `duration_ms`, `retry_count`, `environment` y `backend_version`.
5. Guardar metadatos operativos para medicos: `campaign_id`, `recipient_id`, `especialidad_codigo`, `estado_contacto`, `ultimo_evento`, `resultado_operativo` y `motivo_fallo_simple`.
6. Asociar cada evento con referencias no sensibles, estado y timestamp.
7. Agregar manejo no bloqueante si falla el registro de log.

### Criterios de aceptacion
- [ ] Cada pantalla del Flow genera al menos un evento operativo registrado.
- [ ] Los errores se registran con codigo, categoria, fuente y contexto minimo no sensible.
- [ ] Los eventos permiten alimentar vista medica/operativa y vista IT/auditoria.
- [ ] No se registran tokens ni service role keys.
- [ ] No se registra documento plano, numero de cita, EPS, medico, fecha/hora exacta, CUPS ni respuesta HUN completa.
- [ ] Si Supabase falla, el backend responde sin romper el Flow salvo cuando no pueda validar una sesion temporal requerida.

## [CORE-003] Endurecer Flow de identificacion y seleccion de especialidad

**Labels**: `feature`, `backend`, `api`
**Depends on**: CORE-001, CORE-002
**Blocked by**: -

### Descripcion
Completar las primeras pantallas del Flow para identificar al paciente y poblar especialidades con datos reales. El sistema debe resolver nombre y EPS desde historial cuando sea posible y bloquear avances cuando falten datos criticos.

### Microsteps
1. Validar tipo y numero de documento recibidos desde el Flow.
2. Consultar historial por documento y extraer nombre y EPS normalizados solo en memoria.
3. Aplicar fallback de pacientes de prueba cuando aplique.
4. Guardar solo sesion temporal minima en Supabase, sin nombre, EPS ni documento plano.
5. Cargar especialidades ordenadas y limitadas para el Dropdown.
6. Devolver mensaje de error si no se puede identificar informacion minima.

### Criterios de aceptacion
- [ ] Documento vacio o invalido devuelve error de validacion al Flow.
- [ ] Paciente con historial usa nombre y EPS solo en memoria durante la operacion.
- [ ] Paciente de prueba sin historial usa fallback documentado.
- [ ] La pantalla de especialidad recibe una lista valida de opciones.
- [ ] La transicion queda registrada como evento operativo no sensible.

## [CORE-004] Implementar seleccion robusta de cupos autogestionables

**Labels**: `feature`, `backend`, `api`
**Depends on**: CORE-003
**Blocked by**: -

### Descripcion
Construir la seleccion de cupos a partir de agenda por especialidad, filtrando cupos autogestionables y evitando opciones ambiguas. Cada opcion debe retornar un `slot_token` opaco y firmado; Supabase no debe guardar medico, fecha, hora, CUPS, consultorio, `agenda_detalle_id` ni payload de agenda.

### Microsteps
1. Consultar agenda por especialidad con `cod_especialidad` y `fecha_final`.
2. Aplanar `cups[]` en opciones agendables independientes.
3. Filtrar opciones con `autogestionable = si`.
4. Generar `slot_token` opaco firmado con HMAC usando secreto del backend.
5. Retornar al Flow solo datos visibles necesarios para seleccion y el `slot_token`, sin persistir el slot completo en Supabase.
6. Guardar en `flow_sesiones_temporales` solo `session_id` o `flow_token`, `especialidad_codigo`, `slot_token` seleccionado si aplica, estado y `expires_at`.
7. Limitar la lista a un numero usable para WhatsApp Flow.
8. Devolver error recuperable cuando no existan cupos.

### Criterios de aceptacion
- [ ] Solo se ofrecen cupos autogestionables.
- [ ] Cada opcion retorna un `slot_token` opaco y firmado.
- [ ] Supabase no persiste medico, fecha, hora, CUPS, consultorio, `agenda_detalle_id` ni payload de agenda.
- [ ] Si no hay cupos, el Flow vuelve a especialidad con `error_message`.
- [ ] La lista de slots es estable y ordenada por fecha/hora.

## [CORE-005] Implementar confirmacion asincrona de cita

**Labels**: `feature`, `backend`, `api`
**Depends on**: CORE-004
**Blocked by**: -

### Descripcion
Completar la confirmacion de cita usando el endpoint HUN de asignacion, manteniendo respuesta inmediata para WhatsApp Flow y procesamiento en segundo plano. La confirmacion debe validar el `slot_token` mediante reconsulta HUN y registrar solo eventos no sensibles.

### Microsteps
1. Reconsultar HUN por `cod_especialidad` y `fecha_final` antes de confirmar.
2. Regenerar tokens para la agenda vigente y validar que el `slot_token` seleccionado exista, no este vencido y siga siendo autogestionable.
3. Si el token ya no existe o el cupo cambio, devolver error recuperable: "El cupo ya no esta disponible, selecciona otro horario".
4. Construir resumen de cita con datos frescos de HUN, sin leer candidatos persistidos en Supabase.
5. Validar que paciente, EPS y slot vigente existan antes de asignar.
6. Llamar `/webServiceCita/api/asignar_cita` en segundo plano.
7. Extraer numero de cita desde respuesta SOAP solo en memoria para confirmacion inmediata, sin persistirlo.
8. Guardar solo evento operativo de resultado y estado no sensible, sin numero de cita ni respuesta HUN completa.
9. Enviar mensaje WhatsApp de exito o error al paciente.
10. Registrar estado final no sensible en sesion e interacciones.

### Criterios de aceptacion
- [ ] El Flow responde inmediatamente con pantalla final de procesamiento.
- [ ] Asignacion sin EPS se bloquea con mensaje claro.
- [ ] La asignacion se hace con datos frescos de HUN reconsultados, no con candidatos persistidos.
- [ ] Un slot vencido o no disponible devuelve error recuperable y permite seleccionar otro horario.
- [ ] Respuesta exitosa confirma al paciente por WhatsApp sin persistir la cita en Supabase.
- [ ] El paciente recibe confirmacion por WhatsApp.
- [ ] Los errores de HUN quedan registrados solo con codigo/estado tecnico y sin payload clinico o administrativo sensible.

## [CORE-006] Separar procedimiento, fecha y hora en autoagendamiento

**Labels**: `feature`, `backend`, `api`, `flow`, `testing`
**Depends on**: CORE-005, FLOW-001
**Blocked by**: -

### Descripcion
Modificar exclusivamente el Flow de autoagendamiento para que, despues de elegir especialidad, el paciente seleccione primero el nombre del procedimiento, despues una fecha y finalmente una hora. HUN sigue siendo la fuente de verdad; el codigo CUPS se usa solo internamente para agrupar y filtrar disponibilidad y nunca se muestra al paciente ni se persiste en Supabase.

### Microsteps
1. Publicar `flow-agendamiento.json` con las pantallas `PROCEDIMIENTO` y `FECHA` entre `ESPECIALIDAD` y `SLOTS`.
2. Recorrer todos los `cups[]` autogestionables y futuros de la agenda, agruparlos por codigo CUPS y mostrar unicamente el nombre del procedimiento.
3. Generar `procedure_v1` opaco y firmado, vinculado a sesion, especialidad, procedimiento y expiracion.
4. Reconsultar HUN al seleccionar procedimiento y agrupar todos sus cupos por fecha sin aplicar el recorte global de slots.
5. Generar `date_v1` opaco y firmado y mostrar todas las fechas disponibles con su cantidad de horarios.
6. Reconsultar HUN al seleccionar fecha y mostrar exclusivamente las horas de ese dia para el procedimiento elegido.
7. Conservar `slot_token` y reconsulta HUN antes de mostrar resumen y asignar.
8. Mantener candidatos de procedimiento, fecha y hora solo en memoria con TTL; Supabase conserva exclusivamente sesion minima permitida.
9. Mantener sin cambios el recorrido directo del Flow de campana.
10. Extender pruebas de JSON, tokens, agrupacion, reconsulta, recuperacion de cupos vencidos y persistencia sensible.

### Criterios de aceptacion
- [ ] El paciente ve nombres de procedimientos, nunca codigos CUPS.
- [ ] Procedimientos repetidos con el mismo CUPS aparecen una sola vez.
- [ ] Todas las fechas disponibles para el procedimiento quedan accesibles aunque el primer dia tenga muchos cupos.
- [ ] La pantalla de horas contiene solo cupos del procedimiento y fecha seleccionados.
- [ ] Procedimiento, CUPS, fecha, hora y payload de agenda no se guardan en Supabase ni en eventos operativos.
- [ ] Un procedimiento, fecha o slot vencido genera recuperacion conversacional sin asignar datos obsoletos.
- [ ] Campanas y reagendamiento conservan sus recorridos independientes.
- [ ] La suite automatizada completa finaliza correctamente.

## [CORE-007] Resolver nombres CUPS cuando HUN omite la descripcion

**Labels**: `backend`, `api`, `data`, `testing`
**Depends on**: CORE-006
**Blocked by**: -

### Descripcion
Resolver el nombre visible de cada procedimiento cuando la agenda HUN entrega el codigo CUPS pero omite su descripcion. La resolucion debe usar un catalogo oficial local y versionado, conservar a HUN como fuente prioritaria cuando entregue un nombre valido y evitar opciones genericas que impidan al paciente distinguir procedimientos.

### Microsteps
1. Incorporar el Anexo Tecnico 2 de la Resolucion 2706 de 2025 como catalogo CUPS vigencia 2026, con trazabilidad de fuente y hash.
2. Normalizar codigos CUPS con y sin puntos antes de consultar el catalogo.
3. Resolver nombres con prioridad: `descripcion` HUN, aliases HUN y catalogo oficial local.
4. Exponer `descripcion_fuente` solo en memoria para facilitar diagnostico, sin enviarla al Flow ni persistirla.
5. Omitir procedimientos desconocidos que no tengan nombre resoluble.
6. Registrar solamente el conteo agregado de opciones omitidas.
7. Si no queda ningun procedimiento resoluble, volver a especialidad con un mensaje recuperable.
8. Agregar pruebas para descripcion nula, prioridad HUN, aliases, CUPS desconocido y minimizacion.

### Criterios de aceptacion
- [ ] Los CUPS `890242` y `890342` muestran sus nombres oficiales aunque HUN entregue `descripcion: null`.
- [ ] Una descripcion valida de HUN tiene prioridad sobre el catalogo local.
- [ ] No se muestra `Procedimiento disponible` ni otro nombre generico para opciones diferentes.
- [ ] Un procedimiento desconocido se omite sin exponer su codigo.
- [ ] Si todos los procedimientos son desconocidos, el paciente recibe una recuperacion conversacional.
- [ ] No se persiste CUPS, procedimiento, fuente de descripcion ni payload de agenda.
- [ ] El JSON de Meta no cambia cuando ya consume el `title` dinamico del backend.
- [ ] La suite automatizada completa finaliza correctamente.

### Sprint 2 - Integracion WhatsApp

## [FLOW-001] Validar cifrado y publicacion de WhatsApp Flow

**Labels**: `feature`, `backend`, `security`
**Depends on**: CORE-003
**Blocked by**: -

### Descripcion
Validar que el endpoint `/flow-endpoint` cumple el protocolo cifrado de WhatsApp Flows y que el Flow publicado puede intercambiar datos con el backend. Este ticket desbloquea pruebas reales desde WhatsApp.

### Microsteps
1. Confirmar configuracion de `FLOW_PRIVATE_KEY_B64` y passphrase.
2. Validar respuesta a `ping` de Meta.
3. Probar descifrado de payload y cifrado de respuesta.
4. Configurar URL publica del endpoint en WhatsApp Manager.
5. Publicar o actualizar `flow-agendamiento.json`.
6. Ejecutar prueba manual de cada pantalla hasta navegacion y seleccion, sin ejecutar asignacion real en este ticket.

### Criterios de aceptacion
- [ ] Meta acepta el endpoint del Flow.
- [ ] `ping` responde `status: active`.
- [ ] Las pantallas avanzan mediante `data_exchange`.
- [ ] No se imprimen llaves privadas ni tokens en logs.

## [FLOW-002] Implementar manejo de errores conversacionales

**Labels**: `feature`, `backend`
**Depends on**: FLOW-001, CORE-005
**Blocked by**: -

### Descripcion
Mejorar la experiencia del paciente ante errores de API, datos incompletos, falta de cupos o problemas de asignacion. El objetivo es que el Flow nunca quede en un estado silencioso o incompleto.

### Microsteps
1. Definir mensajes por error: validacion, sin cupos, EPS faltante, API HUN, sesion temporal y WhatsApp.
2. Agregar respuestas recuperables para volver a especialidad o reiniciar proceso.
3. Registrar cada error como evento operativo no sensible.
4. Enviar mensaje de seguimiento cuando falle una asignacion asincrona.
5. Validar que el paciente reciba una accion sugerida en cada error.

### Criterios de aceptacion
- [ ] Cada error conocido produce mensaje visible para el paciente.
- [ ] Falta de cupos permite elegir otra especialidad.
- [ ] Error de asignacion asincrona envia WhatsApp de fallo.
- [ ] Todos los errores quedan registrados con estado y contexto.

## [FLOW-003] Ejecutar prueba end-to-end de Flow con asignacion

**Labels**: `testing`, `backend`, `api`
**Depends on**: FLOW-001, CORE-005
**Blocked by**: -

### Descripcion
Validar el recorrido completo del WhatsApp Flow con asignacion real contra la API HUN de pruebas controlada. Este ticket se separa de `FLOW-001` para que la publicacion, cifrado y navegacion del Flow no dependan de la confirmacion asincrona.

### Microsteps
1. Ejecutar identificacion, seleccion de especialidad, seleccion de slot y confirmacion desde WhatsApp Flow.
2. Confirmar que `CORE-005` reconsulta HUN antes de asignar y no usa candidatos persistidos.
3. Ejecutar asignacion contra la API HUN de pruebas controlada.
4. Verificar que el paciente recibe confirmacion por WhatsApp.
5. Revisar que Supabase solo recibe estados, tokens opacos y eventos no sensibles.
6. Guardar evidencia tecnica de la prueba para QA y cierre contractual.

### Criterios de aceptacion
- [ ] La prueba end-to-end completa una asignacion real en el entorno HUN de pruebas.
- [ ] El Flow no guarda medico, fecha/hora, CUPS, numero de cita ni respuesta HUN completa en Supabase.
- [ ] Los errores recuperables por slot no disponible quedan cubiertos.
- [ ] La evidencia queda disponible para `QA-001` y `DOCS-002`.

## [INTAKE-001] Implementar menu inicial y consentimiento WhatsApp

**Labels**: `feature`, `backend`, `whatsapp`, `privacy`
**Depends on**: FLOW-001, CORE-001
**Blocked by**: -

### Descripcion
Cambiar el punto de entrada del webhook para que los mensajes entrantes no abran directamente el Flow de agendamiento. El paciente primero debe escoger intencion, aceptar o rechazar el consentimiento de tratamiento de datos y solo despues continuar con agendamiento, consulta de citas o modificacion/cancelacion.

### Microsteps
1. Enviar menu inicial con opciones: agendar cita, consultar citas proximas y modificar/cancelar cita.
2. Enviar consentimiento aprobado de tratamiento de datos antes de cualquier consulta HUN o Flow de gestion.
3. Si acepta y eligio agendar, abrir el Flow de autoagendamiento `FLOW_ID`.
4. Si acepta y eligio consultar, pedir identificacion minima por chat y consultar HUN en memoria.
5. Si acepta y eligio modificar/cancelar, consultar citas en memoria y conectar la continuidad con `CANCEL-001`.
6. Si rechaza, enviar mensaje aprobado con linea telefonica `(601) 3904888 atencion al usuario`.
7. Mantener estado de intencion y consentimiento solo en memoria con TTL; no persistirlo en Supabase.
8. Agregar pruebas automatizadas del router de entrada sin llamar WhatsApp ni HUN reales.

### Criterios de aceptacion
- [ ] Un mensaje entrante abre menu inicial, no el Flow directamente.
- [ ] Ninguna accion sensible avanza sin consentimiento aceptado.
- [ ] El rechazo detiene el flujo y dirige a la linea telefonica del hospital.
- [ ] La consulta de citas usa HUN como fuente de verdad y no persiste documento, telefono ni citas.
- [ ] La opcion modificar/cancelar queda como entrada de `CANCEL-001`, sin ejecutar cancelaciones antes de confirmacion.
- [ ] No se registran documentos, telefonos, citas ni payloads HUN completos en logs o Supabase.

## [INTAKE-002] Mejorar identificacion y consulta conversacional

**Labels**: `feature`, `backend`, `whatsapp`, `ux`, `testing`
**Depends on**: INTAKE-001, CORE-001
**Blocked by**: -

### Descripcion
Hacer la consulta de citas mas clara para pacientes: seleccionar primero el tipo de documento por su nombre completo, ingresar despues solo el numero y recibir exclusivamente las citas proximas cuyo estado HUN sea `Reservada`. Mejorar ademas los mensajes de resultado de agendamiento, cancelacion y reagendamiento con jerarquia visual, resaltados y emojis.

### Microsteps
1. Crear una lista interactiva de WhatsApp con CC, CE, PT, TI, RC y PA mostrados con nombres completos.
2. Mantener el tipo elegido solo en la sesion temporal y pedir el numero en un segundo mensaje.
3. Consultar HUN con el codigo seleccionado y el numero normalizado, sin persistirlos.
4. Filtrar la respuesta por fecha proxima y estado normalizado exacto `reservada` antes de construir el mensaje.
5. Formatear cada cita reservada con especialidad, fecha/hora, procedimiento, profesional y estado resaltados.
6. Mejorar los mensajes WhatsApp de menu, consentimiento, consulta, agendamiento, cancelacion y resultado de reagendamiento.
7. Cubrir el payload de lista, el flujo en dos pasos y la exclusion de citas canceladas o atendidas con pruebas automatizadas.
8. Enviar botones `Volver al menu` y `Finalizar` despues del resultado definitivo de cada proceso.
9. Mantener el consentimiento aceptado solo en memoria durante el TTL de la sesion y reutilizarlo al volver al menu.
10. Al finalizar, borrar el estado operativo y la autorizacion efimera para que una conversacion nueva vuelva a solicitar consentimiento.
11. Diferenciar el menu inicial del menu de continuidad para no repetir el saludo de Natalia al volver.

### Criterios de aceptacion
- [ ] El paciente no necesita conocer abreviaturas de documento.
- [ ] Tipo y numero se solicitan en dos mensajes distintos.
- [ ] La consulta muestra solo citas futuras con estado `Reservada`.
- [ ] Las citas `Cancelada`, `Atendida` u otros estados no aparecen en el resultado.
- [ ] Los mensajes usan formato legible, resaltados y emojis sin modificar los Flows publicados en Meta.
- [ ] Documento, telefono y citas permanecen solo en memoria y no llegan a Supabase ni logs.
- [ ] Las pruebas de consulta, cancelacion, reagendamiento y confirmacion continuan pasando.
- [ ] Agendar, consultar, modificar y cancelar ofrecen las mismas acciones al terminar.
- [ ] Volver al menu dentro de la misma sesion no repite el consentimiento.
- [ ] Finalizar elimina el consentimiento y contexto temporal de la conversacion.
- [ ] Ninguna operacion asincrona ofrece cierre antes de recibir su resultado definitivo.
- [ ] Volver al menu usa un mensaje de continuidad y el saludo aparece solo en una conversacion nueva.

### Sprint 3 - Campanas y notificaciones

## [CAMPAIGN-001] Modelar campanas y destinatarios

**Labels**: `feature`, `database`, `backend`
**Depends on**: SETUP-005
**Blocked by**: -

### Descripcion
Definir el modelo operativo para campanas de oferta de citas y demanda inducida. Este modulo permite contactar pacientes, medir respuestas y enlazar el CTA hacia un Flow de campana separado del autoagendamiento. Para demanda inducida, Supabase guarda `audiencia_ref` / `id_anonimo` como referencia operativa principal; el telefono se resuelve en memoria contra el API orquestador antes del envio.

### Microsteps
1. Definir estados de campana: borrador, programada, enviando, activa, cerrada y cancelada.
2. Definir estados de destinatario: pendiente, enviado, entregado, respondido, flow_iniciado, agendado, fallido y excluido.
3. Agregar campos de especialidad, cupos objetivo, origen de datos y responsable.
4. Relacionar destinatarios con `audiencia_ref` / `id_anonimo`, especialidad y campana.
5. Dejar `whatsapp_numero`, `tipo_documento` y `documento_hash` como campos legacy/compatibilidad, no obligatorios para campanas nuevas.
6. Definir reglas de opt-out y exclusion.
7. Agregar migracion incremental para soportar `audiencia_ref` sin guardar telefono, nombre, correo, documento plano, EPS ni payload del orquestador.

### Criterios de aceptacion
- [ ] Las tablas soportan una campana con multiples destinatarios.
- [ ] Cada destinatario tiene estado independiente.
- [ ] El modelo permite asociar resultado `agendado` con una campana sin guardar datos de la cita.
- [ ] Existe campo para excluir destinatarios por opt-out o criterio operativo.
- [ ] El modelo soporta destinatarios de demanda inducida identificados por `audiencia_ref` / `id_anonimo`.
- [ ] `whatsapp_numero` y `documento_hash` no son obligatorios para campanas nuevas basadas en resolver orquestador.
- [ ] Supabase no almacena telefono, nombre, correo, EPS, medico, fecha/hora, servicio ni payload completo del orquestador.

## [CAMPAIGN-002] Implementar adaptador de audiencia de demanda inducida

**Labels**: `feature`, `backend`, `api`
**Depends on**: CAMPAIGN-001
**Blocked by**: -

### Descripcion
Construir el mecanismo para operar audiencia de demanda inducida separando la fuente de referencias y el resolver de contacto. Supabase contiene solo `id_anonimo` / `audiencia_ref`, campana, especialidad y estado operativo. El API orquestador `GET /api/v1/get-appointment/{id_anonimo}` se consulta en memoria para obtener telefono y contexto antes del envio, sin persistir esos datos.

### Microsteps
1. Definir variables de configuracion para la fuente de audiencia y para el resolver orquestador: base URL, endpoint, API key, timeout y formato de `id_anonimo`.
2. Definir contrato minimo de audiencia con `id_anonimo` / `audiencia_ref` y `cod_especialidad_requerida`.
3. Implementar o documentar adaptador/mock para cargar referencias de audiencia sin datos sensibles.
4. Implementar resolver por `id_anonimo` para obtener telefono y contexto solo en memoria antes del envio.
5. Validar `id_anonimo`, especialidad y duplicados por `campaign_id + audiencia_ref`.
6. Crear destinatarios minimos asociados a una campana usando `audiencia_ref` y `especialidad_codigo`.
7. Descartar telefono, nombre, correo, EPS, medico, fecha/hora, servicio y payload completo del orquestador antes de persistir en Supabase.
8. Generar resumen de sincronizacion/resolucion con totales aceptados, rechazados, duplicados y errores no sensibles.
9. Documentar que el contrato actual no permite un Flow que solo muestre fecha/hora porque faltan `tipo_documento`, `numero_documento`, `eps_codigo` y especialidad en codigos HUN suficientes.

### Criterios de aceptacion
- [ ] El ticket documenta las variables requeridas para configurar el API oficial.
- [ ] Si la fuente de audiencia no esta disponible, el adaptador/mock permite cargar referencias `id_anonimo` / `audiencia_ref` sin datos sensibles.
- [ ] Para `CONTRACT_READY`, el API real de demanda inducida queda configurado o existe waiver formal del supervisor.
- [ ] Una lectura valida de audiencia o mock crea/sincroniza destinatarios minimos en Supabase.
- [ ] Un `id_anonimo` valido se puede resolver en memoria para obtener telefono antes del envio sin persistirlo.
- [ ] Registros duplicados no se insertan dos veces.
- [ ] Registros invalidos reportan motivo verificable.
- [ ] Supabase no guarda telefono, nombre, correo, documento plano, EPS, medico, fecha/hora, servicio ni payload completo del orquestador.
- [ ] El resumen de sincronizacion muestra aceptados, rechazados, duplicados y errores.

## [FLOW-004] Crear Flow separado de demanda inducida

**Labels**: `feature`, `backend`, `flow`
**Depends on**: CAMPAIGN-002, CORE-005, FLOW-001
**Blocked by**: Accion externa en Meta para crear/publicar el Flow de demanda inducida y asociarlo a la plantilla de campana.

### Descripcion
Crear un WhatsApp Flow independiente para campanas de demanda inducida. No debe reutilizar `flow-agendamiento.json` ni `FLOW_ID`. En v1, por limitacion del API orquestador, el Flow pide identificacion minima y despues muestra solo slots de la especialidad asociada a la campana. No permite seleccionar especialidad manualmente.

### Microsteps
1. Crear `flow-demanda-inducida.json` con pantallas de identificacion minima, seleccion de slot, confirmacion y final.
2. Excluir pantalla de seleccion de especialidad; la especialidad viene firmada en el contexto de campana.
3. Configurar variables `CAMPAIGN_FLOW_ID`, `CAMPAIGN_FLOW_SCREEN_ID`, `CAMPAIGN_TEMPLATE_NAME` y `CAMPAIGN_TEMPLATE_LANGUAGE`.
4. Implementar en backend la distincion entre Flow de autoagendamiento y Flow de campana mediante `flow_token` firmado o metadata equivalente.
5. Validar expiracion, `campaign_id`, `recipient_id` / `audiencia_ref`, especialidad y estado sin guardar datos sensibles.
6. Reutilizar `slot_token` y reconsulta HUN de `CORE-004/CORE-005` para listar y confirmar cupos.
7. Registrar eventos operativos no sensibles para inicio de Flow de campana, identificacion, slots, confirmacion y errores.
8. Documentar que la version de solo escoger fecha/hora queda bloqueada hasta que el API orquestador entregue documento, EPS/codigo y especialidad requerida en codigos utilizables por HUN.

### Criterios de aceptacion
- [ ] Existe JSON separado para demanda inducida y no se modifica el Flow de autoagendamiento para este caso.
- [ ] El Flow de campana no permite elegir especialidad manualmente.
- [ ] La plantilla de campana abre `CAMPAIGN_FLOW_ID`, no `FLOW_ID`.
- [ ] El backend enruta correctamente autoagendamiento vs campana.
- [ ] El Flow de campana usa `slot_token` + reconsulta HUN y no persiste slots completos.
- [ ] Supabase no guarda telefono, nombre, correo, documento plano, EPS, medico, fecha/hora, numero de cita ni payload del orquestador.
- [ ] Si el API orquestador no trae datos suficientes para omitir identificacion, el Flow v1 pide identificacion minima y lo documenta como limitacion operativa.

## [CAMPAIGN-003] Implementar envio de ofertas de cita por WhatsApp

**Labels**: `feature`, `backend`, `api`
**Depends on**: CAMPAIGN-002, FLOW-004
**Blocked by**: -

### Descripcion
Enviar mensajes de oferta de citas por WhatsApp a destinatarios de campana, enlazando al Flow de demanda inducida. El envio debe resolver telefono en memoria con `audiencia_ref` / `id_anonimo`, actualizar estados operativos y respetar exclusiones.

### Microsteps
1. Definir plantilla de mensaje de oferta con CTA hacia `CAMPAIGN_FLOW_ID`.
2. Seleccionar destinatarios pendientes y no excluidos con `audiencia_ref` / `id_anonimo`.
3. Consultar API orquestador por cada `id_anonimo` antes del envio.
4. Normalizar telefono solo en memoria.
5. Construir `flow_token` firmado con campana, destinatario/referencia, especialidad y expiracion.
6. Enviar mensaje mediante WhatsApp Cloud API.
7. Guardar resultado de envio en `notificaciones` sin telefono, cuerpo completo ni datos del resolver.
8. Actualizar estado del destinatario segun exito o error.
9. Registrar errores de rate limit, token invalido, numero invalido, 403/404/timeout del orquestador o Flow no configurado.

### Criterios de aceptacion
- [ ] Solo se envian mensajes a destinatarios pendientes y no excluidos.
- [ ] Cada envio resuelve el telefono desde `id_anonimo` en memoria y no lo persiste en Supabase.
- [ ] La plantilla abre el Flow de demanda inducida, no el Flow de autoagendamiento.
- [ ] Cada mensaje incluye `flow_token` firmado y con expiracion.
- [ ] Cada envio genera registro en `notificaciones`.
- [ ] El estado del destinatario cambia a enviado o fallido.
- [ ] Los errores de WhatsApp y del orquestador quedan disponibles para reporte como motivos no sensibles.

## [NOTIF-001] Implementar confirmaciones inmediatas y recordatorios desde HUN

**Labels**: `feature`, `backend`
**Depends on**: CORE-005, CAMPAIGN-001
**Blocked by**: -

### Descripcion
Agregar confirmaciones inmediatas y recordatorios calculados desde HUN. La confirmacion de una cita recien agendada se envia inmediatamente tras asignacion exitosa y no requiere guardar la cita en Supabase. Los recordatorios se generan consultando HUN por ventanas de fechas, no desde citas almacenadas localmente.

### Microsteps
1. Definir tipos de notificacion: confirmacion, recordatorio, error y cancelacion.
2. Crear funcion reusable para registrar y enviar notificaciones.
3. Enviar confirmacion inmediata despues de asignacion exitosa de `CORE-005`, usando datos frescos disponibles en memoria y el correo transitorio cifrado de la sesion solo si existe proveedor/API de correo aprobado.
4. Definir `ReminderCandidateProvider` para obtener candidatos de recordatorio desde HUN por ventana de fechas.
5. Definir reglas de ventana de envio, deduplicacion y numero maximo de intentos.
6. Asociar notificaciones con campana, destinatario o sesion temporal, sin asociar datos de cita.
7. Guardar solo eventos de intento de notificacion, canal, tipo, estado, proveedor, error tecnico y timestamp; nunca guardar direccion de correo plano ni cuerpo completo.
8. Si HUN no expone datos suficientes para recordatorios por ventana, dejar advertencia operativa y bloquear recordatorios reales hasta contar con endpoint suficiente.
9. Revisar si ya existe definicion formal de proveedor/API de correo antes de habilitar `NOTIF-002`.
10. Si el proveedor/API de correo sigue indefinido, elevar advertencia y dejar `NOTIF-002` condicionado a definicion operativa.

### Criterios de aceptacion
- [ ] Una cita agendada genera notificacion de confirmacion.
- [ ] Los recordatorios no dependen de citas almacenadas en Supabase.
- [ ] El modelo soporta recordatorios programables mediante consulta HUN por ventana de fechas.
- [ ] Si HUN no tiene endpoint suficiente, queda implementada la interfaz `ReminderCandidateProvider` y los recordatorios reales quedan bloqueados con advertencia operativa.
- [ ] Cada intento queda registrado con estado.
- [ ] Un fallo de WhatsApp no rompe el proceso principal.
- [ ] Antes de pasar a `NOTIF-002`, queda documentado si el proveedor/API de correo esta definido o si debe elevarse advertencia.

## [NOTIF-002] Preparar integracion de correo transaccional

**Labels**: `feature`, `backend`, `needs-discussion`
**Depends on**: NOTIF-001
**Blocked by**: Definicion de proveedor/API de correo si aun no existe aprobacion operativa.

### Descripcion
Preparar la capa de correo para cumplir el alcance de notificaciones complementarias, dejando el proveedor desacoplado mientras HUN define SMTP/API aprobada. Si al iniciar este ticket el proveedor/API sigue sin definirse, se debe elevar la advertencia y limitar el trabajo a interfaz/adaptador placeholder sin envio real.

### Microsteps
1. Definir interfaz de envio de correo con destinatario, asunto, cuerpo y metadata.
2. Crear adaptador placeholder que registre notificaciones sin enviar.
3. Documentar variables esperadas para SMTP/API futura.
4. Asociar correo a `notificaciones` con canal `email` sin almacenar direccion de correo ni cuerpo completo.
5. Definir mensajes base para oferta, recordatorio y confirmacion.
6. Bloquear envio real hasta contar con proveedor/API aprobado y credenciales oficiales.
7. Leer el correo desde `flow_sesiones_temporales.contacto_email_enc`, descifrarlo solo en memoria para el envio y limpiar el dato transitorio al finalizar.

### Criterios de aceptacion
- [ ] Existe interfaz backend para enviar correo.
- [ ] Sin proveedor configurado, el sistema registra pendiente sin fallar.
- [ ] Las variables requeridas del proveedor estan documentadas.
- [ ] Las notificaciones por correo quedan trazables aunque no se envien.
- [ ] `notificaciones` no almacena direccion de correo plano ni contenido sensible del mensaje.
- [ ] No existe envio real de correo sin proveedor/API aprobado.
- [ ] Para `CONTRACT_READY`, el proveedor/API de correo queda definido o existe waiver formal del supervisor para mantener solo placeholder.

### Sprint 4 - Cancelacion y reagendamiento

## [CANCEL-001] Implementar flujo de cancelacion de citas

**Labels**: `feature`, `backend`, `api`
**Depends on**: CORE-002, CORE-001, INTAKE-001
**Blocked by**: -

### Descripcion
Agregar capacidad de cancelar citas usando una rama/Flow separado iniciado por intencion `CANCELAR` desde WhatsApp. La seleccion de cita se hace consultando HUN en tiempo real por documento, mostrando opciones con `cancel_token` opaco y sin persistir numero de cita en Supabase. La cancelacion puede ejecutarse en el entorno controlado actual para validar el flujo completo.

### Microsteps
1. Conectar la opcion `Modificar/cancelar` del menu inicial con la rama/Flow de cancelacion.
2. Consultar citas del paciente por tipo y documento en tiempo real contra HUN.
3. Filtrar citas cancelables segun estado permitido.
4. Presentar opciones de cita con `cancel_token` opaco; el numero de cita solo vive en memoria del proceso o se recupera por reconsulta HUN.
5. Confirmar seleccion antes de llamar API HUN.
6. Validar `cancel_token` por reconsulta HUN o por contexto efimero de servidor con TTL.
7. Enviar POST a `/webServiceCancelarCitaH/cancelar_cita`.
8. Registrar evento de solicitud con estado `cancelacion_procesando` y `cancel_operation_id` no reversible.

### Criterios de aceptacion
- [ ] Solo se listan citas con estado cancelable.
- [ ] La cancelacion se inicia desde una rama/Flow separado por intencion `CANCELAR`.
- [ ] La API de cancelacion no se llama sin confirmacion.
- [ ] La solicitud no persiste numero de cita ni documento plano en Supabase.
- [ ] Supabase solo guarda `cancel_operation_id`, `session_id_hash`, estado, timestamps y `expires_at`.
- [ ] El paciente recibe mensaje de cancelacion en proceso.

## [CANCEL-002] Implementar verificacion asincrona de cancelacion

**Labels**: `feature`, `backend`, `api`
**Depends on**: CANCEL-001
**Blocked by**: -

### Descripcion
Completar el ciclo de cancelacion consultando el endpoint de verificacion dentro del mismo contexto temporal y actualizando solo un estado final no sensible. Esto evita informar exito antes de que HUN confirme el resultado y evita persistir numero de cita en Supabase.

### Microsteps
1. Crear tarea o funcion para consultar `/verificar_cancelacion/{cita}` usando el numero de cita solo desde memoria o reconsulta HUN dentro del TTL.
2. Actualizar estado final no sensible a `cancelada` o `cancelacion_fallida`.
3. Registrar solo resultado agregado, codigo/estado tecnico y `cancel_operation_id`, sin respuesta HUN completa.
4. Enviar mensaje final al paciente.
5. Definir reintentos, timeout de verificacion y expiracion del contexto temporal.
6. Implementar idempotencia con `cancel_operation_id` como hash/correlation id no reversible.
7. No repetir POST si la operacion esta `cancelacion_procesando`, `cancelada` o `cancelacion_fallida`.
8. Si el proceso se reinicia y se pierde el contexto temporal, informar al usuario que debe reiniciar la cancelacion.

### Criterios de aceptacion
- [ ] Una cancelacion en proceso puede verificarse sin persistir numero de cita en Supabase.
- [ ] El estado final persistido es solo agregado/no sensible: `cancelacion_procesando`, `cancelada` o `cancelacion_fallida`.
- [ ] El paciente recibe resultado final por WhatsApp.
- [ ] Fallos de verificacion quedan registrados para seguimiento.
- [ ] La idempotencia evita repetir POST de cancelacion para una operacion en proceso o finalizada.

## [RESCH-001] Evaluar estrategia de reagendamiento

**Labels**: `needs-discussion`, `blocked`
**Depends on**: CANCEL-002, CORE-005
**Blocked by**: Endpoint HUN especifico de reagendamiento o regla operativa aprobada para cancelar + asignar.

### Descripcion
Evaluar si el reagendamiento se implementa con endpoint especifico HUN, con regla operativa aprobada de cancelar + asignar, o si queda como trabajo futuro. Este ticket no promete implementacion por defecto y no bloquea el MVP de agendamiento/cancelacion si no existe endpoint o regla operativa suficiente.

### Microsteps
1. Confirmar si HUN tiene endpoint especifico de reagendamiento.
2. Documentar riesgos de estrategia cancelar + asignar.
3. Elevar decision al supervisor si no hay endpoint especifico.
4. Si no hay endpoint o regla aprobada, documentar reagendamiento como trabajo futuro.
5. Si se aprueba cancelar + asignar, disenar flujo transaccional con advertencia explicita al usuario.
6. En la estrategia cancelar + asignar, no liberar el cupo original hasta confirmar disponibilidad alternativa.
7. Registrar decision tecnica en documentacion final.

### Criterios de aceptacion
- [ ] Existe decision documentada sobre estrategia de reagendamiento.
- [ ] Si no existe endpoint o regla aprobada, queda como requerimiento futuro detallado y no bloquea el MVP de agendamiento/cancelacion.
- [ ] Si se aprueba cancelar + asignar, el flujo evita doble confirmacion ambigua y advierte al usuario antes de afectar su cita original.
- [ ] La decision menciona riesgos y dependencias HUN.

## [RESCH-002] Implementar Flow y saga de reagendamiento

**Labels**: `feature`, `backend`, `api`, `flow`
**Depends on**: RESCH-001, CANCEL-002, CORE-005, FLOW-001
**Blocked by**: -

### Descripcion
Implementar un tercer WhatsApp Flow independiente para modificar una cita existente. El paciente se identifica, selecciona la cita original, recibe solo horarios de la misma especialidad y del mismo procedimiento, confirma la modificacion y activa una saga que asigna y confirma primero la nueva cita, cancela despues la original y solo informa exito cuando HUN confirma ambas operaciones.

### Microsteps
1. Crear y publicar `flow-reagendamiento.json` con pantallas exclusivas de identificacion, cita original, slots, confirmacion y final de procesamiento.
2. Configurar `RESCHEDULE_FLOW_ID` y `RESCHEDULE_FLOW_SCREEN_ID` y enviar este Flow desde la opcion `Modificar/cancelar` despues del consentimiento.
3. Consultar HUN por tipo y numero de documento y listar citas futuras modificables mediante `appointment_token` opaco con TTL.
4. Obtener de la cita seleccionada el codigo de especialidad y `Cod_Pro`; si HUN solo devuelve nombre de especialidad, resolverlo sin ambiguedad contra el catalogo HUN.
5. Consultar agenda por la especialidad original y filtrar cupos autogestionables cuyo codigo de procedimiento coincida exactamente con `Cod_Pro`.
6. Presentar alternativas mediante `slot_token` firmado, sin persistir numero de cita, documento ni datos completos de slots.
7. Reconsultar la cita original y el slot seleccionado antes de ejecutar operaciones modificadoras.
8. Implementar idempotencia con `reschedule_operation_id` no reversible y estados agregados de saga con TTL.
9. Asignar la nueva cita y confirmar su existencia antes de solicitar la cancelacion original.
10. Cancelar la cita original y reutilizar verificacion asincrona con reintentos hasta estado final HUN.
11. Informar exito solo cuando la nueva cita este confirmada y la original cancelada; si falla la cancelacion, informar posible doble reserva y marcar conciliacion manual.
12. Agregar migracion minima de estados agregados no sensibles, pruebas unitarias/integracion y documentacion operativa.

### Criterios de aceptacion
- [ ] Existe un tercer Flow publicado y separado de autoagendamiento y campanas.
- [ ] El paciente solo puede escoger una cita propia consultada en HUN y horarios del mismo procedimiento.
- [ ] La especialidad y procedimiento provienen de la cita original; no pueden seleccionarse manualmente.
- [ ] La cita original permanece activa hasta confirmar la nueva cita.
- [ ] La modificacion solo se informa como exitosa despues de verificar la cancelacion original.
- [ ] Los reintentos o confirmaciones duplicadas no crean mas de una nueva cita ni repiten la cancelacion original.
- [ ] Un fallo despues de asignar la nueva cita queda como revision manual y advierte la posible doble reserva.
- [ ] Supabase no guarda documento plano, numero de cita, medico, fecha/hora, procedimiento ni payload HUN completo.
- [ ] Existen pruebas para cupo perdido, asignacion rechazada, cancelacion fallida, reinicio e idempotencia.

## [RESCH-003] Separar seleccion de fecha y hora en reagendamiento

**Labels**: `feature`, `backend`, `flow`, `testing`
**Depends on**: RESCH-002
**Blocked by**: Publicacion en Meta de `flow-reagendamiento.json` con `FECHA_REAGENDAMIENTO`.

### Descripcion
Corregir el recorte global de cupos del reagendamiento para que el paciente seleccione primero uno de todos los dias disponibles y despues vea unicamente los horarios de ese dia. HUN sigue siendo la fuente de verdad y cada seleccion se valida mediante token opaco y reconsulta, sin persistir fecha, procedimiento ni slots en Supabase.

### Microsteps
1. Publicar `FECHA_REAGENDAMIENTO` con `Dropdown` de fechas y mantener un `routing_model` aciclico compatible con Meta.
2. Reemplazar el limite global de slots por agrupacion completa de cupos equivalentes por fecha.
3. Generar `resdate_v1` firmado y ligado a sesion, especialidad, procedimiento, fecha y expiracion.
4. Reconsultar HUN al elegir fecha y mostrar solo sus horarios.
5. Permitir regresar con la navegacion nativa para seleccionar otro dia y reemplazar el contexto temporal anterior.
6. Reconsultar HUN al elegir hora y antes de confirmar la saga.
7. Manejar fecha agotada, horario perdido y ausencia total de cupos sin modificar la cita original.
8. Probar multiples fechas, mas de veinte cupos en el primer dia, cambio de fecha y minimizacion de Supabase.

### Criterios de aceptacion
- [ ] La lista de fechas no depende de un recorte global de horarios.
- [ ] Un primer dia con mas de veinte cupos no oculta fechas posteriores.
- [ ] El paciente ve exclusivamente los horarios de la fecha seleccionada y puede regresar para cambiarla.
- [ ] Los tokens de fecha y slot son opacos, firmados y se validan por reconsulta HUN.
- [ ] El `routing_model` no contiene ciclos rechazados por Meta.
- [ ] Supabase no recibe fecha, hora, procedimiento, medico, documento, numero de cita ni payload HUN.
- [ ] La saga de asignar, confirmar y cancelar conserva idempotencia y manejo de cupo perdido.

### Sprint 5 - Operacion y reportes

## [ADMIN-001] Crear consultas administrativas por perfil

**Labels**: `feature`, `backend`, `api`
**Depends on**: CORE-002, CAMPAIGN-001, CANCEL-002
**Blocked by**: -

### Descripcion
Exponer consultas separadas por perfil para medicos/personal operativo e IT/auditoria. La vista medica debe priorizar avance de campanas y resultados operativos; la vista IT debe priorizar diagnostico tecnico, errores, fuentes y tiempos de respuesta. La consulta de detalle de citas debe hacerse contra HUN, no contra Supabase.

### Microsteps
1. Crear consulta medica/operativa con campana, especialidad, estado de contacto, ultimo evento, resultado operativo y motivo simple de fallo.
2. Crear consulta agregada para medicos con conteos por campana/especialidad y tasas de enviados, respondidos, Flow iniciado y agendados.
3. Crear consulta IT/auditoria con `event_id`, `correlation_id` o `session_id_hash`, `source`, `status`, `http_status`, `error_code`, `error_category`, `duration_ms`, `retry_count`, `environment`, `backend_version` y endpoint logico.
4. Crear endpoint o procedimiento para consultar estado de cita en HUN cuando exista un numero suministrado por usuario autorizado, sin persistir esa consulta en Supabase.
5. Agregar paginacion, limites de respuesta y filtros por campana, estado, fuente, fecha y especialidad.
6. Proteger endpoints con token administrativo configurable y documentar parametros/respuestas.

### Criterios de aceptacion
- [ ] Los endpoints administrativos requieren token.
- [ ] Las respuestas tienen paginacion o limite.
- [ ] Existe una vista medica/operativa sin logs tecnicos ni detalles de cita.
- [ ] Existe una vista IT/auditoria sin datos clinicos ni payloads sensibles.
- [ ] Se puede consultar trazabilidad por campana, estado, destinatario, fuente y referencias anonimizadas.
- [ ] No se exponen secretos ni payloads completos sensibles.
- [ ] No se exponen documento plano, numero de cita, EPS, medico, fecha/hora exacta, CUPS ni respuesta HUN completa.

## [ADMIN-002] Crear exportes por perfil de trazabilidad

**Labels**: `feature`, `backend`, `docs`
**Depends on**: ADMIN-001
**Blocked by**: -

### Descripcion
Permitir exportar informacion separada para informes medico-operativos y para soporte IT/auditoria. Los exportes deben servir como evidencia contractual sin incluir datos sensibles, detalles de cita ni payloads HUN completos.

### Microsteps
1. Definir exporte medico/operativo con campana, especialidad, estado de contacto, ultimo evento, resultado operativo, motivo simple y agregados.
2. Definir exporte IT/auditoria con evento, correlacion, fuente, estado tecnico, `http_status`, `error_code`, categoria, duracion, reintentos, ambiente y version.
3. Definir exporte de resultados agregados de agendamiento/cancelacion sin numero de cita ni datos clinicos.
4. Implementar salida CSV o JSON segun endpoint y perfil.
5. Omitir o enmascarar datos sensibles cuando aplique.
6. Documentar ejemplos de uso y restricciones de cada exporte.

### Criterios de aceptacion
- [ ] Existe exporte medico/operativo.
- [ ] Existe exporte IT/auditoria.
- [ ] Existe exporte de resultados agregados de agendamiento/cancelacion.
- [ ] Los exportes no incluyen tokens, credenciales, documento plano, numero de cita, EPS, medico, fecha/hora exacta, CUPS ni respuesta HUN completa.
- [ ] Los exportes pueden usarse como soporte de informe.

### Sprint 6 - QA y seguridad

## [QA-001] Construir matriz de pruebas funcionales

**Labels**: `testing`, `docs`
**Depends on**: CORE-007, FLOW-004, CAMPAIGN-003, CANCEL-002, RESCH-002, RESCH-003, INTAKE-002, NOTIF-001
**Blocked by**: -

### Descripcion
Crear la matriz de pruebas que demuestre cumplimiento funcional del contrato: agendamiento, confirmacion, cancelacion, demanda inducida, notificaciones y estabilidad. La matriz debe incluir pruebas de lectura y pruebas modificadoras contra la API HUN de pruebas controlada.

### Microsteps
1. Listar casos de prueba por modulo y endpoint, separando autoagendamiento y demanda inducida.
2. Marcar casos que crean/cancelan citas como permitidos en el entorno HUN de pruebas y revalidables antes de produccion.
3. Definir datos de prueba autorizados.
4. Definir resultado esperado y evidencia por caso.
5. Clasificar cada caso por gate: `DEV_READY`, `MVP_TEST_READY` o `CONTRACT_READY`.
6. Crear plantilla de reporte de ejecucion.

### Criterios de aceptacion
- [ ] La matriz cubre agendamiento, confirmacion, cancelacion, campanas, recordatorios y logs.
- [ ] La matriz cubre dos Flows separados: autoagendamiento y demanda inducida.
- [ ] La matriz valida que campanas no permitan seleccion manual de especialidad.
- [ ] Los casos destructivos o modificadores estan claramente marcados.
- [ ] Cada caso tiene resultado esperado verificable.
- [ ] La matriz incluye columna de evidencia.
- [ ] La matriz distingue pruebas con mocks/placeholders de pruebas requeridas para cierre contractual.

## [QA-002] Implementar pruebas automatizadas de modulos criticos

**Labels**: `testing`, `backend`
**Depends on**: QA-001
**Blocked by**: -

### Descripcion
Agregar pruebas automatizadas para logica critica sin depender de operaciones reales de asignacion o cancelacion. Esto mejora estabilidad y permite refactorizar con menor riesgo.

### Microsteps
1. Configurar runner de pruebas para Node.
2. Crear pruebas unitarias para normalizacion HUN.
3. Crear pruebas para armado de payload de asignacion.
4. Crear pruebas para extraccion de numero de cita.
5. Crear pruebas para transiciones de estado del Flow con mocks.
6. Agregar script `test` en `package.json`.

### Criterios de aceptacion
- [ ] `npm test` ejecuta pruebas automatizadas.
- [ ] Hay pruebas de normalizacion de strings HUN.
- [ ] Hay pruebas del payload de asignacion.
- [ ] Hay pruebas de errores sin EPS y sin slot.
- [ ] Las pruebas automatizadas unitarias no crean ni cancelan citas; las pruebas funcionales/integracion si pueden hacerlo contra la API HUN de pruebas controlada.

## [SEC-001] Revisar proteccion de datos personales y secretos

**Labels**: `security`, `backend`, `docs`
**Depends on**: CORE-002, ADMIN-001
**Blocked by**: -

### Descripcion
Revisar que el sistema cumpla principios de confidencialidad, Ley 1581 y manejo seguro de datos sensibles. Este ticket cubre minimizacion de Supabase, logging seguro, separacion de vistas por perfil, secretos, service role key y acceso administrativo.

### Microsteps
1. Auditar logs para evitar tokens, llaves privadas y service role key.
2. Verificar que Supabase no almacene citas, nombre, documento plano, EPS, medico, fecha/hora, CUPS ni respuestas completas HUN.
3. Verificar que la vista medica/operativa no exponga logs tecnicos ni detalles de cita.
4. Verificar que la vista IT/auditoria no exponga datos clinicos ni payloads sensibles.
5. Enmascarar o limitar datos en endpoints administrativos.
6. Documentar politica de retencion minima para logs operativos.
7. Validar que `.env` siga ignorado por Git.
8. Agregar checklist de seguridad para despliegue.

### Criterios de aceptacion
- [ ] No se registran secretos en consola ni base de datos.
- [ ] Los endpoints administrativos estan protegidos.
- [ ] Los exportes minimizan datos sensibles y no incluyen detalles de citas.
- [ ] La vista medica/operativa y la vista IT/auditoria tienen campos diferenciados y documentados.
- [ ] La documentacion incluye checklist de Ley 1581/confidencialidad.

### Sprint 7 - Deploy y cierre contractual

## [DEPLOY-001] Preparar despliegue y verificacion de estabilidad

**Labels**: `infra`, `backend`, `testing`
**Depends on**: QA-002, SEC-001
**Blocked by**: -

### Descripcion
Preparar el despliegue del backend y validar estabilidad basica en ambiente publico. El despliegue debe poder responder webhook, Flow endpoint y conectividad HUN.

### Microsteps
1. Configurar variables de entorno en plataforma de despliegue.
2. Validar `GET /` y `GET /test-hun` en URL publica.
3. Configurar callback URL de webhook Meta.
4. Configurar endpoint del WhatsApp Flow.
5. Revisar logs de arranque y errores.
6. Documentar version desplegada y comandos de soporte.

### Criterios de aceptacion
- [ ] La URL publica responde health check.
- [ ] La URL publica confirma conectividad HUN.
- [ ] Meta verifica webhook con `VERIFY_TOKEN`.
- [ ] WhatsApp Flow puede llamar el endpoint publico.
- [ ] Existe evidencia de estabilidad basica del despliegue.

## [DOCS-001] Elaborar documentacion tecnica final

**Labels**: `docs`
**Depends on**: ADMIN-002, QA-001, SEC-001
**Blocked by**: -

### Descripcion
Crear la documentacion tecnica requerida por el contrato: arquitectura, flujo conversacional, reglas de negocio, endpoints, variables, tablas, diccionario de estados/respuestas y modelo de trazabilidad por perfil.

### Microsteps
1. Documentar arquitectura backend, Meta, HUN y Supabase minimizado.
2. Incluir diagrama de flujo conversacional.
3. Documentar endpoints propios y endpoints HUN consumidos.
4. Documentar esquema de base de datos.
5. Documentar diccionario de estados de sesion, campana y destinatario.
6. Documentar campos de vista medica/operativa y vista IT/auditoria.
7. Documentar reglas de negocio y manejo de errores.
8. Incluir frase contractual: "El sistema ofrece trazabilidad operativa y tecnica suficiente para seguimiento, auditoria y soporte, sin persistir datos clinicos ni detalles de cita fuera de la API HUN".

### Criterios de aceptacion
- [ ] El documento incluye arquitectura y diagrama de flujo.
- [ ] El documento incluye reglas de negocio verificables.
- [ ] El documento incluye diccionario de estados/respuestas.
- [ ] El documento incluye modelo de trazabilidad separado para medicos/personal operativo e IT/auditoria.
- [ ] El documento cubre variables y dependencias externas.

## [DOCS-002] Elaborar informe final y trabajo futuro

**Labels**: `docs`
**Depends on**: DOCS-001, DEPLOY-001
**Blocked by**: -

### Descripcion
Preparar el cierre contractual con informe final de pruebas y documento de trabajo futuro. Este ticket consolida evidencias, limitaciones, riesgos y requerimientos de siguientes fases, y debe dejar claro si alguna dependencia externa obligatoria queda cubierta por evidencia real o por waiver formal del supervisor.

### Microsteps
1. Consolidar resultados de matriz de pruebas.
2. Resumir evidencia de agendamiento, confirmacion, cancelacion, campanas, Flow de demanda inducida y notificaciones.
3. Documentar limitaciones tecnicas y operativas encontradas.
4. Listar requerimientos funcionales futuros.
5. Listar requerimientos no funcionales futuros.
6. Adjuntar evidencia de API real de demanda inducida/orquestador configurada o waiver formal si queda pendiente.
7. Adjuntar evidencia de proveedor/API de correo definido o waiver formal si queda solo interfaz placeholder.
8. Adjuntar evidencia de dos Flow IDs separados en Meta y de plantilla de campana aprobada.
9. Documentar que la version de campana sin identificacion queda pendiente hasta ampliacion del API orquestador, si aplica.
10. Clasificar el cierre alcanzado como `DEV_READY`, `MVP_TEST_READY` o `CONTRACT_READY`.
11. Preparar version final para revision del supervisor.

### Criterios de aceptacion
- [ ] El informe final cubre todos los modulos contractuales.
- [ ] Las pruebas modificadoras quedan ejecutadas o documentadas contra la API HUN de pruebas controlada.
- [ ] Las dependencias externas obligatorias tienen evidencia real o waiver formal documentado.
- [ ] El informe incluye evidencia de `FLOW_ID` de autoagendamiento, `CAMPAIGN_FLOW_ID` de demanda inducida y plantilla de campana aprobada.
- [ ] Si la campana v1 pide identificacion minima por limitacion del API, queda documentado como restriccion aprobada y trabajo futuro.
- [ ] El informe no declara `CONTRACT_READY` si quedan mocks/placeholders obligatorios sin aprobacion formal.
- [ ] El trabajo futuro incluye adjuntos/autorizaciones, portal administrativo, analitica y hardening.
- [ ] El documento esta listo para entregar al supervisor.

## Orden de ejecucion sugerido

1. Ejecutar en paralelo SETUP-001, SETUP-003 y SETUP-004.
2. Ejecutar SETUP-002 despues de SETUP-001.
3. Ejecutar SETUP-005 inmediatamente despues de SETUP-002; este ticket bloquea cualquier trabajo funcional que toque `lib/db.js`, `lib/flowHandler.js`, Supabase, Flow state, notificaciones o eventos operativos.
4. Ejecutar CORE-001 y CORE-002 en paralelo cuando SETUP-005 y SETUP-004 esten listos.
5. Ejecutar CORE-003, CORE-004 y CORE-005 en secuencia; ejecutar CORE-006 despues de publicar las nuevas pantallas de autoagendamiento en Meta y CORE-007 despues de CORE-006.
6. Ejecutar FLOW-001 cuando CORE-003 este listo; FLOW-002 despues de FLOW-001 y CORE-005; ejecutar FLOW-003 solo despues de FLOW-001 y CORE-005 para probar asignacion real.
7. Ejecutar CAMPAIGN-001 solo despues de SETUP-005; luego CAMPAIGN-002, FLOW-004 y CAMPAIGN-003. CAMPAIGN-003 no debe enviar plantillas que abran el Flow de autoagendamiento; debe esperar a que `CAMPAIGN_FLOW_ID` este creado/publicado. Si el API real de demanda inducida/orquestador no esta disponible, CAMPAIGN-002 debe avanzar con el adaptador/mock contractual, sin declarar `CONTRACT_READY` salvo waiver formal.
8. Ejecutar NOTIF-001 despues de CORE-005 y CAMPAIGN-001; al cerrar NOTIF-001 se debe elevar advertencia si el proveedor/API de correo no esta definido. NOTIF-002 solo puede hacer envio real cuando exista proveedor/API aprobado; si no, se limita a interfaz/adaptador placeholder.
9. Ejecutar CANCEL-001 y CANCEL-002 despues de estabilizar el cliente HUN y trazabilidad.
10. Ejecutar RESCH-001 despues de CANCEL-002 y CORE-005. Si se aprueba la estrategia, ejecutar RESCH-002 con un tercer Flow publicado y RESCH-003 para separar fecha/hora antes de cerrar la matriz funcional.
11. Ejecutar ADMIN-001 y ADMIN-002 cuando existan datos de eventos operativos, campanas y cancelaciones verificadas contra HUN.
12. Ejecutar QA-001 cuando CORE-007, FLOW-004, CAMPAIGN-003, CANCEL-002, RESCH-002, RESCH-003, INTAKE-002 y NOTIF-001 esten implementados; QA-002 despues de definir la matriz.
13. Ejecutar SEC-001 antes de cualquier despliegue operativo.
14. Ejecutar DEPLOY-001 despues de QA-002 y SEC-001.
15. Ejecutar DOCS-001 y DOCS-002 al cierre, usando evidencia de QA, seguridad, despliegue y operacion.

## Cobertura de requerimientos

- Canal WhatsApp con backend: SETUP-001, FLOW-001, DEPLOY-001.
- WhatsApp Flow de autoagendamiento: CORE-003, CORE-004, CORE-005, CORE-006, CORE-007, FLOW-002, FLOW-003.
- WhatsApp Flow de demanda inducida: CAMPAIGN-002, FLOW-004, CAMPAIGN-003.
- API HUN de especialidades, agenda, historial y asignacion: SETUP-004, CORE-001, CORE-005.
- Campana de oferta de citas: CAMPAIGN-001, CAMPAIGN-002, FLOW-004, CAMPAIGN-003.
- Recordatorios y confirmaciones: NOTIF-001, NOTIF-002.
- Cancelacion: CANCEL-001, CANCEL-002.
- Reagendamiento: RESCH-001, RESCH-002, RESCH-003, QA-001, DOCS-002.
- Trazabilidad administrativa por perfil: CORE-002, ADMIN-001, ADMIN-002.
- Pruebas funcionales y estabilidad: QA-001, QA-002, DEPLOY-001.
- Seguridad, confidencialidad y datos personales: SEC-001.
- Refactorizacion obligatoria de persistencia sensible existente: SETUP-005.
- Documentacion contractual: SETUP-003, DOCS-001, DOCS-002.
