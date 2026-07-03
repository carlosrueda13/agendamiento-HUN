# Project Status - Agendamiento HUN por WhatsApp

Ultima actualizacion: 2026-07-03 17:18
Fase activa: Sprint 2 - Integracion WhatsApp

## Resumen de avance

| Fase | Total | Completados | En progreso | Bloqueados | Pendientes |
|------|-------|-------------|-------------|------------|------------|
| Sprint 0 - Setup | 5 | 5 | 0 | 0 | 0 |
| Sprint 1 - Core agendamiento | 5 | 5 | 0 | 0 | 0 |
| Sprint 2 - Integracion WhatsApp | 3 | 2 | 1 | 0 | 0 |
| Sprint 3 - Campanas y notificaciones | 5 | 0 | 0 | 0 | 5 |
| Sprint 4 - Cancelacion y reagendamiento | 3 | 0 | 0 | 0 | 3 |
| Sprint 5 - Operacion y reportes | 2 | 0 | 0 | 0 | 2 |
| Sprint 6 - QA y seguridad | 3 | 0 | 0 | 0 | 3 |
| Sprint 7 - Deploy y cierre contractual | 3 | 0 | 0 | 0 | 3 |
| **TOTAL** | **29** | **12** | **1** | **0** | **16** |

Avance global: 12 / 29 tickets completados (41.4%)

## Estado actual

**Proximo ticket recomendado:** Ejecutar accion externa de FLOW-003: configurar variables temporales en Render y probar el Flow real desde WhatsApp.
**Tickets en progreso:** FLOW-003
**Tickets bloqueados:** ver lista de dependencias abajo

### Tickets bloqueados por dependencias no resueltas

| Ticket | Bloqueado por |
|--------|---------------|
| CAMPAIGN-002 | CAMPAIGN-001 |
| CAMPAIGN-003 | CAMPAIGN-002, FLOW-001 |
| NOTIF-001 | CORE-005, CAMPAIGN-001 |
| NOTIF-002 | NOTIF-001 |
| CANCEL-002 | CANCEL-001 |
| RESCH-001 | CANCEL-002, CORE-005 |
| ADMIN-001 | CAMPAIGN-001, CANCEL-002 |
| ADMIN-002 | ADMIN-001 |
| QA-001 | CORE-005, CAMPAIGN-003, CANCEL-002, NOTIF-001 |
| QA-002 | QA-001 |
| SEC-001 | ADMIN-001 |
| DEPLOY-001 | QA-002, SEC-001 |
| DOCS-001 | ADMIN-002, QA-001, SEC-001 |
| DOCS-002 | DOCS-001, DEPLOY-001 |

## Sprint 0 - Setup

---

### SETUP-001 - Configurar entorno local y variables del backend

**Estado:** `done`
**Labels:** `chore`, `infra`, `backend`
**Depende de:** -
**Desbloquea:** SETUP-002, SETUP-003, SETUP-004

**Microsteps:**
- [x] Revisar `.env.example` y confirmar que cubre Meta, Flow, HUN, API oficial de demanda inducida y Supabase.
- [x] Crear checklist local de variables obligatorias, opcionales y pendientes de proveedor/API.
- [x] Ejecutar `npm install` y confirmar que `package-lock.json` queda consistente.
- [x] Levantar `npm start` y validar `GET /`.
- [x] Validar `GET /test-hun` con la API HUN de pruebas.
- [x] Documentar comandos locales de instalacion, ejecucion y smoke test.

**Criterios de aceptacion:**
- [x] El backend inicia localmente con `npm start`.
- [x] `GET /` responde HTTP 200.
- [x] `GET /test-hun` responde HTTP 200 cuando hay conectividad a HUN.
- [x] Todas las variables usadas por el codigo aparecen en `.env.example`.
- [x] Existe una lista verificable de variables requeridas para local y despliegue.
- [x] Las variables del API oficial de demanda inducida quedan documentadas aunque el endpoint aun no este disponible.

**Evidencia:** `.env.example`, `SETUP_LOCAL_CHECKLIST.md`; `npm install` exitoso sin vulnerabilidades; `GET /` HTTP 200 con `Backend WhatsApp Flow activo`; `GET /test-hun` HTTP 200 con `alcanzable: true`, `status_hun: 200`, `especialidades_recibidas: 180`; se agrego `FLOW_SESSION_PII_KEY_B64` para cifrado/HMAC del correo transitorio que implementara SETUP-005.
**Notas:** El servidor local se detuvo despues del smoke test. Supabase queda deshabilitado sin credenciales reales; esto es aceptable para SETUP-001 y la refactorizacion de persistencia sigue en SETUP-005. La variable `FLOW_SESSION_PII_KEY_B64` queda documentada sin valor real y no debe compartirse con Meta.

---

### SETUP-002 - Crear esquema minimo no sensible de Supabase

**Estado:** `done`
**Labels:** `database`, `backend`, `security`
**Depende de:** SETUP-001
**Desbloquea:** SETUP-005

**Microsteps:**
- [x] Definir tabla `campanas` con nombre, especialidad, template, estado y conteos agregados.
- [x] Definir tabla `campana_destinatarios` con WhatsApp, tipo de documento, `documento_hash`, especialidad, estado de contacto y timestamps.
- [x] Definir tabla `flow_sesiones_temporales` con `session_id` o `flow_token`, estado, especialidad, `slot_token`, correo de contacto cifrado transitorio si aplica, expiracion y timestamps.
- [x] Definir tabla `eventos_operativos` con `event_id`, `campaign_id`, `recipient_id`, `session_id_hash`, `event_type`, `status`, `source`, `http_status`, `error_code`, `error_category`, `duration_ms`, `retry_count`, `environment`, `backend_version` y timestamp.
- [x] Definir tabla `notificaciones` con canal, tipo, estado, proveedor, error tecnico y timestamp.
- [x] Documentar que `flow_sesiones_temporales` nunca almacena medico, fecha, hora, CUPS, consultorio, `agenda_detalle_id` ni payload de agenda.
- [x] Documentar campos prohibidos: cita, nombre, documento plano, EPS, medico, fecha/hora, CUPS y respuestas completas HUN.
- [x] Documentar llaves, indices, expiracion de sesiones y restricciones de acceso.
- [x] Agregar addendum/migracion para `contacto_email_enc`, `contacto_email_hmac` y `contacto_email_expires_at`, sin correo plano.

**Criterios de aceptacion:**
- [x] El esquema incluye campanas, destinatarios, sesiones temporales, eventos operativos y notificaciones.
- [x] Cada tabla tiene clave primaria y timestamps.
- [x] Ninguna tabla almacena numero de cita, nombre, documento plano, EPS, medico, fecha/hora ni respuesta completa HUN.
- [x] `flow_sesiones_temporales` solo guarda estado minimo, `session_id` o `flow_token`, `especialidad_codigo`, `slot_token` seleccionado si aplica, correo de contacto cifrado transitorio si aplica, expiracion y timestamps.
- [x] Si se captura correo para confirmacion, se guarda solo como `contacto_email_enc` y `contacto_email_hmac`, nunca como correo plano, y su TTL no supera `expires_at`.
- [x] Las relaciones entre campanas, destinatarios, sesiones temporales, notificaciones y eventos estan definidas.
- [x] El esquema soporta una vista medica/operativa y una vista IT/auditoria sin duplicar datos sensibles.
- [x] El backend puede leer/escribir solo las tablas minimas definidas.

**Evidencia:** `supabase/001_minimal_operational_schema.sql`, `supabase/002_flow_session_contact_email.sql`, `SUPABASE_MINIMO.md`; usuario confirmo que el query inicial y el addendum de correo transitorio se ejecutaron exitosamente en Supabase.
**Notas:** Listo para aprobacion. La adaptacion de `lib/db.js` para dejar de usar tablas antiguas corresponde a SETUP-005. El correo queda permitido solo como contacto cifrado temporal en `flow_sesiones_temporales`, no en `pacientes_whatsapp`, `campana_destinatarios`, `notificaciones` ni eventos.

---

### SETUP-003 - Corregir documentacion base y textos visibles

**Estado:** `done`
**Labels:** `docs`, `backend`
**Depende de:** SETUP-001
**Desbloquea:** 

**Microsteps:**
- [x] Revisar README, `flow-agendamiento.json`, `server.js` y `lib/*.js` buscando caracteres corruptos.
- [x] Corregir textos visibles al usuario en mensajes de WhatsApp y Flow.
- [x] Actualizar README con arquitectura actual, endpoints y variables.
- [x] Agregar notas sobre que asignacion/cancelacion estan permitidas en la API HUN de pruebas controlada y que deben revalidarse antes de produccion.
- [x] Incluir comandos de exploracion y smoke test.

**Criterios de aceptacion:**
- [x] No hay mojibake en textos visibles al paciente.
- [x] README menciona `/flow-endpoint`, `/test-hun` y uso limitado de Supabase.
- [x] README explica como correr el backend localmente.
- [x] README indica que asignar/cancelar citas esta permitido en la API HUN de pruebas controlada.

**Evidencia:** `README.md`, `flow-agendamiento.json`, `server.js`, `lib/db.js`, `lib/flowCrypto.js`, `lib/flowHandler.js`, `lib/hun.js`, `lib/whatsapp.js`; busqueda `rg` sin mojibake en archivos objetivo; `node --check` exitoso para JS modificados; parseo JSON exitoso; `GET /` HTTP 200; sincronizacion manual contra `origin/main` commit `d917c94` para `flow-agendamiento.json`, `lib/flowHandler.js` y revision de `lib/db.js`.
**Notas:** Aprobado por el usuario el 2026-06-30. La persistencia sensible actual en `lib/db.js` y `lib/flowHandler.js` se conserva para no mezclar alcance; se corrige en SETUP-005. Se incorporaron del `main` remoto el campo `correo` en el Flow, la visualizacion de slots con `RadioButtonsGroup`, la descripcion de tipo de consulta y el medico completo. El correo se implementara en SETUP-005 como contacto cifrado temporal de `flow_sesiones_temporales`; no debe guardarse en `pacientes_whatsapp`.

---

### SETUP-004 - Formalizar script de exploracion de API HUN

**Estado:** `done`
**Labels:** `chore`, `api`, `testing`
**Depende de:** SETUP-001
**Desbloquea:** CORE-001

**Microsteps:**
- [x] Parametrizar base URL, API key y fechas desde variables o argumentos.
- [x] Separar consultas de solo lectura de operaciones que modifican citas para poder ejecutar ambas de forma controlada.
- [x] Guardar resultados resumidos en un archivo de salida ignorado por Git.
- [x] Validar especialidades, agenda, citas por documento y cita por numero.
- [x] Documentar que asignacion y cancelacion pueden ejecutarse contra la API HUN de pruebas controlada.

**Criterios de aceptacion:**
- [x] El script consulta endpoints de lectura sin modificar datos.
- [x] El script permite cambiar rango de fechas sin editar codigo.
- [x] El resultado muestra campos disponibles por endpoint.
- [x] Las operaciones POST quedan documentadas como permitidas en el entorno HUN de pruebas controlado.

**Evidencia:** `explorar-api-hun.js`, `.gitignore`, `README.md`; `node --check explorar-api-hun.js` exitoso; `node explorar-api-hun.js --help` exitoso; ejecucion de solo lectura contra API HUN de pruebas exitosa 7/7; `node explorar-api-hun.js --cancel-cita 1534700` bloquea POST sin doble confirmacion; reporte redactado en `resultados-api-hun.resumen.json` ignorado por Git; `git diff --check` sin errores.
**Notas:** Aprobado por el usuario el 2026-06-30. El script no ejecuta POST por defecto; requiere `--allow-mutations` y `--confirm-hun-test` mas payload o numero de cita. El reporte guarda estructura/campos y redacta documento y numero de cita.

---

### SETUP-005 - Refactorizar persistencia sensible existente

**Estado:** `done`
**Labels:** `backend`, `database`, `security`
**Depende de:** SETUP-002
**Desbloquea:** CORE-002, CAMPAIGN-001

**Microsteps:**
- [x] Auditar llamadas actuales a `guardarPaciente`, `guardarSesion`, `getPaciente`, `getSesion` y `guardarCita`.
- [x] Eliminar o reemplazar `guardarPaciente`, `getPaciente` y `guardarCita` por funciones que no persistan paciente, documento, EPS ni cita.
- [x] Reemplazar `guardarSesion` y `getSesion` por funciones de sesion temporal minima con `session_id` o `flow_token`, estado, `especialidad_codigo`, `slot_token` seleccionado si aplica, correo de contacto cifrado transitorio si aplica, expiracion y timestamps.
- [x] Reemplazar persistencia de paciente por uso en memoria durante la operacion del Flow.
- [x] Eliminar persistencia de citas, slots completos y respuestas HUN desde Supabase.
- [x] Reemplazar logs detallados por eventos operativos no sensibles.
- [x] Actualizar nombres de funciones de `lib/db.js` para que reflejen el nuevo alcance minimo.
- [x] Verificar que ninguna ruta funcional dependa de `pacientes_whatsapp` o `citas_agendadas`.
- [x] Implementar cifrado autenticado y HMAC no reversible para `contacto_email_enc` / `contacto_email_hmac`; el correo plano solo puede existir en memoria durante el request o el envio.
- [x] Limpiar `contacto_email_enc`, `contacto_email_hmac` y `contacto_email_expires_at` al completar, fallar, cancelar o expirar la sesion.
- [x] Agregar pruebas que fallen si se intenta guardar campos prohibidos: nombre, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita, `agenda_detalle_id`, respuesta HUN completa o correo plano.
- [x] Agregar prueba estatica/documental que busque referencias a `pacientes_whatsapp`, `citas_agendadas`, `slot_seleccionado` con payload completo y columnas/campos de correo plano fuera de `flow_sesiones_temporales`.

**Criterios de aceptacion:**
- [x] Supabase no recibe nombre de paciente, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita ni respuesta HUN completa.
- [x] `lib/flowHandler.js` usa datos sensibles solo en memoria durante la operacion.
- [x] Las sesiones temporales tienen expiracion y guardan solo identificadores minimos mas correo de contacto cifrado transitorio cuando aplique.
- [x] El correo no queda persistido en `pacientes_whatsapp`, `campana_destinatarios`, `notificaciones` ni eventos operativos; solo se permite cifrado temporal en `flow_sesiones_temporales`.
- [x] La confirmacion de cita se informa por WhatsApp sin persistir la cita en Supabase.
- [x] Las funciones antiguas de persistencia sensible se eliminan o quedan reemplazadas por equivalentes seguros.
- [x] Existe una prueba automatizada o estatica que detecta cualquier intento de guardar campos prohibidos.
- [x] El ticket queda cerrado antes de cualquier trabajo funcional que toque Flow, campanas, notificaciones, cancelacion, reportes, Supabase o estado de Flow.

**Evidencia:** `lib/db.js`, `lib/flowHandler.js`, `server.js`, `lib/whatsapp.js`, `scripts/check-sensitive-persistence.js`, `package.json`; `npm.cmd test` exitoso; `node --check` exitoso para archivos JS modificados; prueba de cifrado/HMAC con correo ficticio exitosa; `GET /` HTTP 200 con servidor local; busqueda runtime sin referencias a `pacientes_whatsapp`, `citas_agendadas`, `slot_seleccionado` ni funciones antiguas salvo en la prueba estatica; `git diff --check` sin errores.
**Notas:** Aprobado por el usuario el 2026-07-01. Los datos sensibles de paciente, EPS y slot completo viven solo en memoria del proceso durante el Flow; si el proceso se reinicia, el paciente debe reiniciar el agendamiento. `flow_sesiones_temporales` guarda estado minimo, `slot_token` opaco y correo cifrado/HMAC cuando aplica; al completar o fallar se limpian `slot_token` y columnas de correo.

---

## Sprint 1 - Core agendamiento

---

### CORE-001 - Fortalecer cliente HUN y normalizacion de datos

**Estado:** `done`
**Labels:** `backend`, `api`
**Depende de:** SETUP-004
**Desbloquea:** CORE-003, CANCEL-001

**Microsteps:**
- [x] Centralizar normalizacion de strings y objetos anidados.
- [x] Crear funciones para especialidades, agenda por especialidad, citas por documento y cita por numero.
- [x] Agregar funciones para cancelar cita y verificar cancelacion.
- [x] Normalizar `agenda_detalle_id`, `id_agenda_detalle` y campos equivalentes.
- [x] Estandarizar errores de timeout, 401 y respuestas vacias.
- [x] Documentar contratos de entrada/salida de cada funcion.

**Criterios de aceptacion:**
- [x] Todas las funciones devuelven strings sin espacios de relleno.
- [x] Agenda por especialidad devuelve cupos con `agenda_detalle_id` normalizado.
- [x] Los errores de API se propagan con mensaje y endpoint.
- [x] Existe funcion para cancelacion y verificacion asincrona.

**Evidencia:** `lib/hun.js`, `scripts/check-hun-client.js`, `package.json`; `npm.cmd test` exitoso; `node --check lib/hun.js` exitoso; `node --check scripts/check-hun-client.js` exitoso; smoke de solo lectura contra HUN exitoso con `especialidades 180`, `agenda 0` y `cita_numero 1`.
**Notas:** Aprobado por el usuario el 2026-07-01. `lib/hun.js` conserva los nombres existentes usados por `flowHandler` y agrega `consultarCitaNumero`, `cancelarCita` y `verificarCancelacion`. La respuesta HUN HTTP 200 con `{ codigo: 204, message: "No se encontraron registros..." }` se normaliza como lista vacia para agenda/citas, no como error. Los errores `timeout`, `401`, respuesta vacia y forma inesperada se propagan como `HunApiError` con `method`, `endpoint`, `status`, `code` y `category`; el endpoint de verificacion de cancelacion redacta el numero de cita en errores.

---

### CORE-002 - Implementar trazabilidad de transiciones del Flow

**Estado:** `done`
**Labels:** `backend`, `database`
**Depende de:** SETUP-005
**Desbloquea:** CORE-003, CANCEL-001, ADMIN-001, SEC-001

**Microsteps:**
- [x] Agregar funcion `guardarEventoOperativo` en `lib/db.js`.
- [x] Registrar inicio de Flow, identificacion, seleccion de especialidad, seleccion de slot y confirmacion.
- [x] Registrar errores de API HUN, Supabase y WhatsApp.
- [x] Guardar metadatos no sensibles para IT: `event_id`, `session_id_hash`, `event_type`, `source`, `http_status`, `error_code`, `error_category`, `duration_ms`, `retry_count`, `environment` y `backend_version`.
- [x] Guardar metadatos operativos para medicos: `campaign_id`, `recipient_id`, `especialidad_codigo`, `estado_contacto`, `ultimo_evento`, `resultado_operativo` y `motivo_fallo_simple`.
- [x] Asociar cada evento con referencias no sensibles, estado y timestamp.
- [x] Agregar manejo no bloqueante si falla el registro de log.

**Criterios de aceptacion:**
- [x] Cada pantalla del Flow genera al menos un evento operativo registrado.
- [x] Los errores se registran con codigo, categoria, fuente y contexto minimo no sensible.
- [x] Los eventos permiten alimentar vista medica/operativa y vista IT/auditoria.
- [x] No se registran tokens ni service role keys.
- [x] No se registra documento plano, numero de cita, EPS, medico, fecha/hora exacta, CUPS ni respuesta HUN completa.
- [x] Si Supabase falla, el backend responde sin romper el Flow salvo cuando no pueda validar una sesion temporal requerida.

**Evidencia:** `lib/db.js`, `lib/flowHandler.js`, `scripts/check-flow-events.js`, `scripts/check-sensitive-persistence.js`, `package.json`; `npm.cmd test` exitoso; `node --check lib/db.js` exitoso; `node --check lib/flowHandler.js` exitoso; `node -e "require('./lib/flowHandler')"` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-01. `guardarEventoOperativo` queda como nombre contractual y `registrarEventoOperativo` se conserva por compatibilidad. Los eventos usan `session_id_hash`, fuente, estado, endpoint logico, especialidad y codigos/categorias de error; no guardan documento, EPS, nombre, numero de cita, medico, fecha/hora, CUPS, `agenda_detalle_id` ni payload HUN. El registro de eventos captura errores de Supabase internamente y no interrumpe el Flow.

---

### CORE-003 - Endurecer Flow de identificacion y seleccion de especialidad

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CORE-001, CORE-002
**Desbloquea:** CORE-004, FLOW-001

**Microsteps:**
- [x] Validar tipo y numero de documento recibidos desde el Flow.
- [x] Consultar historial por documento y extraer nombre y EPS normalizados solo en memoria.
- [x] Aplicar fallback de pacientes de prueba cuando aplique.
- [x] Guardar solo sesion temporal minima en Supabase, sin nombre, EPS ni documento plano.
- [x] Cargar especialidades ordenadas y limitadas para el Dropdown.
- [x] Devolver mensaje de error si no se puede identificar informacion minima.

**Criterios de aceptacion:**
- [x] Documento vacio o invalido devuelve error de validacion al Flow.
- [x] Paciente con historial usa nombre y EPS solo en memoria durante la operacion.
- [x] Paciente de prueba sin historial usa fallback documentado.
- [x] La pantalla de especialidad recibe una lista valida de opciones.
- [x] La transicion queda registrada como evento operativo no sensible.

**Evidencia:** `lib/flowHandler.js`, `scripts/check-flow-identification.js`, `package.json`; `npm.cmd test` exitoso; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-identification.js` exitoso; `git diff --check` sin errores.
**Notas:** Aprobado por el usuario el 2026-07-02. El Flow valida tipo y numero de documento antes de consultar HUN; si no detecta EPS/contrato desde historial o fallback de paciente de prueba, devuelve error recuperable en `IDENTIFICACION`. Nombre, documento y EPS permanecen solo en memoria; Supabase recibe solo sesion temporal minima y eventos operativos no sensibles.

---

### CORE-004 - Implementar seleccion robusta de cupos autogestionables

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CORE-003
**Desbloquea:** CORE-005

**Microsteps:**
- [x] Consultar agenda por especialidad con `cod_especialidad` y `fecha_final`.
- [x] Aplanar `cups[]` en opciones agendables independientes.
- [x] Filtrar opciones con `autogestionable = si`.
- [x] Generar `slot_token` opaco firmado con HMAC usando secreto del backend.
- [x] Retornar al Flow solo datos visibles necesarios para seleccion y el `slot_token`, sin persistir el slot completo en Supabase.
- [x] Guardar en `flow_sesiones_temporales` solo `session_id` o `flow_token`, `especialidad_codigo`, `slot_token` seleccionado si aplica, estado y `expires_at`.
- [x] Limitar la lista a un numero usable para WhatsApp Flow.
- [x] Devolver error recuperable cuando no existan cupos.

**Criterios de aceptacion:**
- [x] Solo se ofrecen cupos autogestionables.
- [x] Cada opcion retorna un `slot_token` opaco y firmado.
- [x] Supabase no persiste medico, fecha, hora, CUPS, consultorio, `agenda_detalle_id` ni payload de agenda.
- [x] Si no hay cupos, el Flow vuelve a especialidad con `error_message`.
- [x] La lista de slots es estable y ordenada por fecha/hora.

**Evidencia:** `lib/flowHandler.js`, `scripts/check-flow-slots.js`, `package.json`, `.env.example`, `README.md`, `SETUP_LOCAL_CHECKLIST.md`; `npm.cmd test` exitoso; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-slots.js` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-02. Los slots se construyen desde `cups[]`, se filtran por `autogestionable = si`, se ordenan por fecha/hora y se limitan con `FLOW_MAX_SLOTS` o 20 por defecto. El `slot_token` es deterministico y firmado con HMAC para poder regenerarlo por reconsulta HUN en CORE-005; Supabase solo recibe estado minimo y el `slot_token` seleccionado.

---

### CORE-005 - Implementar confirmacion asincrona de cita

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CORE-004
**Desbloquea:** FLOW-002, FLOW-003, NOTIF-001, RESCH-001, QA-001

**Microsteps:**
- [x] Reconsultar HUN por `cod_especialidad` y `fecha_final` antes de confirmar.
- [x] Regenerar tokens para la agenda vigente y validar que el `slot_token` seleccionado exista, no este vencido y siga siendo autogestionable.
- [x] Si el token ya no existe o el cupo cambio, devolver error recuperable: "El cupo ya no esta disponible, selecciona otro horario".
- [x] Construir resumen de cita con datos frescos de HUN, sin leer candidatos persistidos en Supabase.
- [x] Validar que paciente, EPS y slot vigente existan antes de asignar.
- [x] Llamar `/webServiceCita/api/asignar_cita` en segundo plano.
- [x] Extraer numero de cita desde respuesta SOAP solo en memoria para confirmacion inmediata, sin persistirlo.
- [x] Guardar solo evento operativo de resultado y estado no sensible, sin numero de cita ni respuesta HUN completa.
- [x] Enviar mensaje WhatsApp de exito o error al paciente.
- [x] Registrar estado final no sensible en sesion e interacciones.

**Criterios de aceptacion:**
- [x] El Flow responde inmediatamente con pantalla final de procesamiento.
- [x] Asignacion sin EPS se bloquea con mensaje claro.
- [x] La asignacion se hace con datos frescos de HUN reconsultados, no con candidatos persistidos.
- [x] Un slot vencido o no disponible devuelve error recuperable y permite seleccionar otro horario.
- [x] Respuesta exitosa confirma al paciente por WhatsApp sin persistir la cita en Supabase.
- [x] El paciente recibe confirmacion por WhatsApp.
- [x] Los errores de HUN quedan registrados solo con codigo/estado tecnico y sin payload clinico o administrativo sensible.

**Evidencia:** `lib/flowHandler.js`, `scripts/check-flow-confirmation.js`, `package.json`; `npm.cmd test` exitoso; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-confirmation.js` exitoso; busqueda sin mojibake en `lib/flowHandler.js`, `flow-agendamiento.json` y `README.md`.
**Notas:** Aprobado por el usuario el 2026-07-02. La seleccion y confirmacion reconsultan HUN, regeneran tokens de la agenda vigente y solo usan el slot si sigue disponible/autogestionable. Si el cupo vence, el Flow devuelve error recuperable y no ejecuta asignacion. La asignacion asincrona usa el slot fresco guardado en memoria inmediatamente antes de procesar; Supabase conserva solo estado minimo, `slot_token`, resultado agregado y errores tecnicos no sensibles.

---

## Sprint 2 - Integracion WhatsApp

---

### FLOW-001 - Validar cifrado y publicacion de WhatsApp Flow

**Estado:** `done`
**Labels:** `feature`, `backend`, `security`
**Depende de:** CORE-003
**Desbloquea:** FLOW-002, FLOW-003, CAMPAIGN-003

**Microsteps:**
- [x] Confirmar configuracion de `FLOW_PRIVATE_KEY_B64` y passphrase.
- [x] Validar respuesta a `ping` de Meta.
- [x] Probar descifrado de payload y cifrado de respuesta.
- [x] Configurar URL publica del endpoint en WhatsApp Manager.
- [x] Publicar o actualizar `flow-agendamiento.json`.
- [x] Ejecutar prueba manual de cada pantalla hasta navegacion y seleccion, sin ejecutar asignacion real en este ticket.

**Criterios de aceptacion:**
- [x] Meta acepta el endpoint del Flow.
- [x] `ping` responde `status: active`.
- [x] Las pantallas avanzan mediante `data_exchange`.
- [x] No se imprimen llaves privadas ni tokens en logs.

**Evidencia:** Confirmacion del usuario: URL publica `https://agendamiento-hun.onrender.com/`, Flow JSON publicado y llaves Meta/Render coinciden; smoke test publico `GET /` HTTP 200, `GET /test-hun` HTTP 200 y `POST /flow-endpoint` con payload invalido HTTP 421 esperado; `scripts/check-flow-crypto.js`; `node --check scripts/check-flow-crypto.js` exitoso; `npm.cmd test` exitoso con simulacion cifrada de `ping` y roundtrip de respuesta cifrada.
**Notas:** Aprobado externamente por el usuario el 2026-07-02. La prueba automatizada genera llaves efimeras, simula RSA-OAEP-SHA256 + AES-GCM, verifica `ping` con `status: active`, valida el IV invertido de respuesta y comprueba que `flow-agendamiento.json` no tenga mojibake real. FLOW-001 no ejecuta asignacion real; esa prueba end-to-end queda en FLOW-003.

---

### FLOW-002 - Implementar manejo de errores conversacionales

**Estado:** `done`
**Labels:** `feature`, `backend`
**Depende de:** FLOW-001, CORE-005
**Desbloquea:** 

**Microsteps:**
- [x] Definir mensajes por error: validacion, sin cupos, EPS faltante, API HUN, sesion temporal y WhatsApp.
- [x] Agregar respuestas recuperables para volver a especialidad o reiniciar proceso.
- [x] Registrar cada error como evento operativo no sensible.
- [x] Enviar mensaje de seguimiento cuando falle una asignacion asincrona.
- [x] Validar que el paciente reciba una accion sugerida en cada error.

**Criterios de aceptacion:**
- [x] Cada error conocido produce mensaje visible para el paciente.
- [x] Falta de cupos permite elegir otra especialidad.
- [x] Error de asignacion asincrona envia WhatsApp de fallo.
- [x] Todos los errores quedan registrados con estado y contexto.

**Evidencia:** `lib/flowHandler.js`, `scripts/check-flow-errors.js`, `package.json`; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-errors.js` exitoso; `npm.cmd test` exitoso.
**Notas:** Listo para aprobacion. Los errores de validacion, falta de cupos, EPS faltante, sesion vencida, HUN no disponible y asignacion asincrona fallida devuelven mensajes accionables al paciente. Los fallos de disponibilidad HUN durante `data_exchange` vuelven a `ESPECIALIDAD` con opciones recuperables cuando se pueden obtener. La asignacion asincrona fallida envia WhatsApp de seguimiento y registra evento operativo no sensible; no se persisten datos de cita ni payloads HUN.

---

### FLOW-003 - Ejecutar prueba end-to-end de Flow con asignacion

**Estado:** `in_progress`
**Labels:** `testing`, `backend`, `api`
**Depende de:** FLOW-001, CORE-005
**Desbloquea:** 

**Microsteps:**
- [ ] Ejecutar identificacion, seleccion de especialidad, seleccion de slot y confirmacion desde WhatsApp Flow.
- [ ] Confirmar que `CORE-005` reconsulta HUN antes de asignar y no usa candidatos persistidos.
- [ ] Ejecutar asignacion contra la API HUN de pruebas controlada.
- [ ] Verificar que el paciente recibe confirmacion por WhatsApp.
- [ ] Revisar que Supabase solo recibe estados, tokens opacos y eventos no sensibles.
- [ ] Guardar evidencia tecnica de la prueba para QA y cierre contractual.

**Criterios de aceptacion:**
- [ ] La prueba end-to-end completa una asignacion real en el entorno HUN de pruebas.
- [ ] El Flow no guarda medico, fecha/hora, CUPS, numero de cita ni respuesta HUN completa en Supabase.
- [ ] Los errores recuperables por slot no disponible quedan cubiertos.
- [ ] La evidencia queda disponible para `QA-001` y `DOCS-002`.

**Evidencia:** `FLOW_003_E2E_RUNBOOK.md`; `lib/flowHandler.js`; `scripts/check-flow-e2e-waiver.js`; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-e2e-waiver.js` exitoso; `npm.cmd test` exitoso. Consulta HUN de pruebas del 2026-07-03 con ventana hasta `2027-07-03`: `PSIQUIATRIA` (`codigo_especialidad = 590`) devolvio 509 CUPS, 26 pasados o invalidos y 483 futuros, todos con `autogestionable = no`.
**Notas:** En progreso por waiver temporal aprobado por el usuario el 2026-07-03. Se corrigio el filtro para no ofrecer slots con fecha/hora pasada y se agrego log tecnico sanitizado de rechazo HUN (`detalle={...}`) sin payload completo ni datos sensibles. El backend permite cupos no autogestionables solo si `FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE=true`, solo para documentos incluidos en `FLOW_E2E_TEST_DOCUMENTS`, y cancela automaticamente la cita creada si `FLOW_E2E_CANCEL_AFTER_ASSIGN=true`. Pendiente ejecutar prueba real desde WhatsApp en Render y luego desactivar variables temporales. Esta evidencia no reemplaza la validacion contractual normal con cupos `autogestionable = si`.

---

## Sprint 3 - Campanas y notificaciones

---

### CAMPAIGN-001 - Modelar campanas y destinatarios

**Estado:** `pending`
**Labels:** `feature`, `database`, `backend`
**Depende de:** SETUP-005
**Desbloquea:** CAMPAIGN-002, NOTIF-001, ADMIN-001

**Microsteps:**
- [ ] Definir estados de campana: borrador, programada, enviando, activa, cerrada y cancelada.
- [ ] Definir estados de destinatario: pendiente, enviado, entregado, respondido, flow_iniciado, agendado, fallido y excluido.
- [ ] Agregar campos de especialidad, cupos objetivo, origen de datos y responsable.
- [ ] Relacionar destinatarios con WhatsApp, `documento_hash`, especialidad y campana.
- [ ] Definir reglas de opt-out y exclusion.

**Criterios de aceptacion:**
- [ ] Las tablas soportan una campana con multiples destinatarios.
- [ ] Cada destinatario tiene estado independiente.
- [ ] El modelo permite asociar resultado `agendado` con una campana sin guardar datos de la cita.
- [ ] Existe campo para excluir destinatarios por opt-out o criterio operativo.

**Evidencia:** 
**Notas:** 

---

### CAMPAIGN-002 - Implementar adaptador de audiencia de demanda inducida

**Estado:** `pending`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CAMPAIGN-001
**Desbloquea:** CAMPAIGN-003

**Microsteps:**
- [ ] Definir variables de configuracion requeridas para el API: base URL, autenticacion, endpoint, filtros, paginacion y timeout.
- [ ] Definir contrato real o provisional de respuesta con `nombre_paciente`, `tipo_documento`, `numero_documento`, `cod_especialidad_requerida` y `numero_telefonico`.
- [ ] Implementar adaptador del API oficial y adaptador/mock con el mismo contrato si el API aun no esta disponible.
- [ ] Validar campos obligatorios, formato de telefono, especialidad y duplicados.
- [ ] Crear destinatarios minimos asociados a una campana usando `documento_hash` y `especialidad_codigo`.
- [ ] Descartar `nombre_paciente` y `numero_documento` plano antes de persistir en Supabase.
- [ ] Generar resumen de sincronizacion con totales aceptados, rechazados, duplicados y errores del API.

**Criterios de aceptacion:**
- [ ] El ticket documenta las variables requeridas para configurar el API oficial.
- [ ] Si el API no esta disponible, el adaptador/mock permite ejecutar el flujo con los cinco campos acordados.
- [ ] Para `CONTRACT_READY`, el API real de demanda inducida queda configurado o existe waiver formal del supervisor.
- [ ] Una lectura valida del API o mock crea/sincroniza destinatarios minimos en Supabase.
- [ ] Registros duplicados no se insertan dos veces.
- [ ] Registros invalidos reportan motivo verificable.
- [ ] Supabase no guarda `nombre_paciente` ni `numero_documento` plano.
- [ ] El resumen de sincronizacion muestra aceptados, rechazados, duplicados y errores.

**Evidencia:** 
**Notas:** 

---

### CAMPAIGN-003 - Implementar envio de ofertas de cita por WhatsApp

**Estado:** `pending`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CAMPAIGN-002, FLOW-001
**Desbloquea:** QA-001

**Microsteps:**
- [ ] Definir plantilla de mensaje de oferta y CTA hacia Flow.
- [ ] Seleccionar destinatarios pendientes y no excluidos.
- [ ] Enviar mensaje mediante WhatsApp Cloud API.
- [ ] Guardar resultado de envio en `notificaciones`.
- [ ] Actualizar estado del destinatario segun exito o error.
- [ ] Registrar errores de rate limit, token invalido o numero invalido.

**Criterios de aceptacion:**
- [ ] Solo se envian mensajes a destinatarios pendientes y no excluidos.
- [ ] Cada envio genera registro en `notificaciones`.
- [ ] El estado del destinatario cambia a enviado o fallido.
- [ ] Los errores de WhatsApp quedan disponibles para reporte.

**Evidencia:** 
**Notas:** 

---

### NOTIF-001 - Implementar confirmaciones inmediatas y recordatorios desde HUN

**Estado:** `pending`
**Labels:** `feature`, `backend`
**Depende de:** CORE-005, CAMPAIGN-001
**Desbloquea:** NOTIF-002, QA-001

**Microsteps:**
- [ ] Definir tipos de notificacion: confirmacion, recordatorio, error y cancelacion.
- [ ] Crear funcion reusable para registrar y enviar notificaciones.
- [ ] Enviar confirmacion inmediata despues de asignacion exitosa de `CORE-005`, usando datos frescos disponibles en memoria y el correo transitorio cifrado de la sesion solo si existe proveedor/API de correo aprobado.
- [ ] Definir `ReminderCandidateProvider` para obtener candidatos de recordatorio desde HUN por ventana de fechas.
- [ ] Definir reglas de ventana de envio, deduplicacion y numero maximo de intentos.
- [ ] Asociar notificaciones con campana, destinatario o sesion temporal, sin asociar datos de cita.
- [ ] Guardar solo eventos de intento de notificacion, canal, tipo, estado, proveedor, error tecnico y timestamp; nunca guardar direccion de correo plano ni cuerpo completo.
- [ ] Si HUN no expone datos suficientes para recordatorios por ventana, dejar advertencia operativa y bloquear recordatorios reales hasta contar con endpoint suficiente.
- [ ] Revisar si ya existe definicion formal de proveedor/API de correo antes de habilitar `NOTIF-002`.
- [ ] Si el proveedor/API de correo sigue indefinido, elevar advertencia y dejar `NOTIF-002` condicionado a definicion operativa.

**Criterios de aceptacion:**
- [ ] Una cita agendada genera notificacion de confirmacion.
- [ ] Los recordatorios no dependen de citas almacenadas en Supabase.
- [ ] El modelo soporta recordatorios programables mediante consulta HUN por ventana de fechas.
- [ ] Si HUN no tiene endpoint suficiente, queda implementada la interfaz `ReminderCandidateProvider` y los recordatorios reales quedan bloqueados con advertencia operativa.
- [ ] Cada intento queda registrado con estado.
- [ ] Un fallo de WhatsApp no rompe el proceso principal.
- [ ] Antes de pasar a `NOTIF-002`, queda documentado si el proveedor/API de correo esta definido o si debe elevarse advertencia.

**Evidencia:** 
**Notas:** 

---

### NOTIF-002 - Preparar integracion de correo transaccional

**Estado:** `pending`
**Labels:** `feature`, `backend`, `needs-discussion`
**Depende de:** NOTIF-001
**Desbloquea:** 

**Microsteps:**
- [ ] Definir interfaz de envio de correo con destinatario, asunto, cuerpo y metadata.
- [ ] Crear adaptador placeholder que registre notificaciones sin enviar.
- [ ] Documentar variables esperadas para SMTP/API futura.
- [ ] Asociar correo a `notificaciones` con canal `email` sin almacenar direccion de correo ni cuerpo completo.
- [ ] Definir mensajes base para oferta, recordatorio y confirmacion.
- [ ] Bloquear envio real hasta contar con proveedor/API aprobado y credenciales oficiales.
- [ ] Leer el correo desde `flow_sesiones_temporales.contacto_email_enc`, descifrarlo solo en memoria para el envio y limpiar el dato transitorio al finalizar.

**Criterios de aceptacion:**
- [ ] Existe interfaz backend para enviar correo.
- [ ] Sin proveedor configurado, el sistema registra pendiente sin fallar.
- [ ] Las variables requeridas del proveedor estan documentadas.
- [ ] Las notificaciones por correo quedan trazables aunque no se envien.
- [ ] `notificaciones` no almacena direccion de correo plano ni contenido sensible del mensaje.
- [ ] No existe envio real de correo sin proveedor/API aprobado.
- [ ] Para `CONTRACT_READY`, el proveedor/API de correo queda definido o existe waiver formal del supervisor para mantener solo placeholder.

**Evidencia:** 
**Notas:** 

---

## Sprint 4 - Cancelacion y reagendamiento

---

### CANCEL-001 - Implementar flujo de cancelacion de citas

**Estado:** `pending`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CORE-002, CORE-001
**Desbloquea:** CANCEL-002

**Microsteps:**
- [ ] Configurar rama/Flow de cancelacion para intencion `CANCELAR`.
- [ ] Consultar citas del paciente por tipo y documento en tiempo real contra HUN.
- [ ] Filtrar citas cancelables segun estado permitido.
- [ ] Presentar opciones de cita con `cancel_token` opaco; el numero de cita solo vive en memoria del proceso o se recupera por reconsulta HUN.
- [ ] Confirmar seleccion antes de llamar API HUN.
- [ ] Validar `cancel_token` por reconsulta HUN o por contexto efimero de servidor con TTL.
- [ ] Enviar POST a `/webServiceCancelarCitaH/cancelar_cita`.
- [ ] Registrar evento de solicitud con estado `cancelacion_procesando` y `cancel_operation_id` no reversible.

**Criterios de aceptacion:**
- [ ] Solo se listan citas con estado cancelable.
- [ ] La cancelacion se inicia desde una rama/Flow separado por intencion `CANCELAR`.
- [ ] La API de cancelacion no se llama sin confirmacion.
- [ ] La solicitud no persiste numero de cita ni documento plano en Supabase.
- [ ] Supabase solo guarda `cancel_operation_id`, `session_id_hash`, estado, timestamps y `expires_at`.
- [ ] El paciente recibe mensaje de cancelacion en proceso.

**Evidencia:** 
**Notas:** 

---

### CANCEL-002 - Implementar verificacion asincrona de cancelacion

**Estado:** `pending`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CANCEL-001
**Desbloquea:** RESCH-001, ADMIN-001, QA-001

**Microsteps:**
- [ ] Crear tarea o funcion para consultar `/verificar_cancelacion/{cita}` usando el numero de cita solo desde memoria o reconsulta HUN dentro del TTL.
- [ ] Actualizar estado final no sensible a `cancelada` o `cancelacion_fallida`.
- [ ] Registrar solo resultado agregado, codigo/estado tecnico y `cancel_operation_id`, sin respuesta HUN completa.
- [ ] Enviar mensaje final al paciente.
- [ ] Definir reintentos, timeout de verificacion y expiracion del contexto temporal.
- [ ] Implementar idempotencia con `cancel_operation_id` como hash/correlation id no reversible.
- [ ] No repetir POST si la operacion esta `cancelacion_procesando`, `cancelada` o `cancelacion_fallida`.
- [ ] Si el proceso se reinicia y se pierde el contexto temporal, informar al usuario que debe reiniciar la cancelacion.

**Criterios de aceptacion:**
- [ ] Una cancelacion en proceso puede verificarse sin persistir numero de cita en Supabase.
- [ ] El estado final persistido es solo agregado/no sensible: `cancelacion_procesando`, `cancelada` o `cancelacion_fallida`.
- [ ] El paciente recibe resultado final por WhatsApp.
- [ ] Fallos de verificacion quedan registrados para seguimiento.
- [ ] La idempotencia evita repetir POST de cancelacion para una operacion en proceso o finalizada.

**Evidencia:** 
**Notas:** 

---

### RESCH-001 - Evaluar estrategia de reagendamiento

**Estado:** `pending`
**Labels:** `needs-discussion`, `blocked`
**Depende de:** CANCEL-002, CORE-005
**Desbloquea:** 

**Microsteps:**
- [ ] Confirmar si HUN tiene endpoint especifico de reagendamiento.
- [ ] Documentar riesgos de estrategia cancelar + asignar.
- [ ] Elevar decision al supervisor si no hay endpoint especifico.
- [ ] Si no hay endpoint o regla aprobada, documentar reagendamiento como trabajo futuro.
- [ ] Si se aprueba cancelar + asignar, disenar flujo transaccional con advertencia explicita al usuario.
- [ ] En la estrategia cancelar + asignar, no liberar el cupo original hasta confirmar disponibilidad alternativa.
- [ ] Registrar decision tecnica en documentacion final.

**Criterios de aceptacion:**
- [ ] Existe decision documentada sobre estrategia de reagendamiento.
- [ ] Si no existe endpoint o regla aprobada, queda como requerimiento futuro detallado y no bloquea el MVP de agendamiento/cancelacion.
- [ ] Si se aprueba cancelar + asignar, el flujo evita doble confirmacion ambigua y advierte al usuario antes de afectar su cita original.
- [ ] La decision menciona riesgos y dependencias HUN.

**Evidencia:** 
**Notas:** 

---

## Sprint 5 - Operacion y reportes

---

### ADMIN-001 - Crear consultas administrativas por perfil

**Estado:** `pending`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CORE-002, CAMPAIGN-001, CANCEL-002
**Desbloquea:** ADMIN-002, SEC-001

**Microsteps:**
- [ ] Crear consulta medica/operativa con campana, especialidad, estado de contacto, ultimo evento, resultado operativo y motivo simple de fallo.
- [ ] Crear consulta agregada para medicos con conteos por campana/especialidad y tasas de enviados, respondidos, Flow iniciado y agendados.
- [ ] Crear consulta IT/auditoria con `event_id`, `correlation_id` o `session_id_hash`, `source`, `status`, `http_status`, `error_code`, `error_category`, `duration_ms`, `retry_count`, `environment`, `backend_version` y endpoint logico.
- [ ] Crear endpoint o procedimiento para consultar estado de cita en HUN cuando exista un numero suministrado por usuario autorizado, sin persistir esa consulta en Supabase.
- [ ] Agregar paginacion, limites de respuesta y filtros por campana, estado, fuente, fecha y especialidad.
- [ ] Proteger endpoints con token administrativo configurable y documentar parametros/respuestas.

**Criterios de aceptacion:**
- [ ] Los endpoints administrativos requieren token.
- [ ] Las respuestas tienen paginacion o limite.
- [ ] Existe una vista medica/operativa sin logs tecnicos ni detalles de cita.
- [ ] Existe una vista IT/auditoria sin datos clinicos ni payloads sensibles.
- [ ] Se puede consultar trazabilidad por campana, estado, destinatario, fuente y referencias anonimizadas.
- [ ] No se exponen secretos ni payloads completos sensibles.
- [ ] No se exponen documento plano, numero de cita, EPS, medico, fecha/hora exacta, CUPS ni respuesta HUN completa.

**Evidencia:** 
**Notas:** 

---

### ADMIN-002 - Crear exportes por perfil de trazabilidad

**Estado:** `pending`
**Labels:** `feature`, `backend`, `docs`
**Depende de:** ADMIN-001
**Desbloquea:** DOCS-001

**Microsteps:**
- [ ] Definir exporte medico/operativo con campana, especialidad, estado de contacto, ultimo evento, resultado operativo, motivo simple y agregados.
- [ ] Definir exporte IT/auditoria con evento, correlacion, fuente, estado tecnico, `http_status`, `error_code`, categoria, duracion, reintentos, ambiente y version.
- [ ] Definir exporte de resultados agregados de agendamiento/cancelacion sin numero de cita ni datos clinicos.
- [ ] Implementar salida CSV o JSON segun endpoint y perfil.
- [ ] Omitir o enmascarar datos sensibles cuando aplique.
- [ ] Documentar ejemplos de uso y restricciones de cada exporte.

**Criterios de aceptacion:**
- [ ] Existe exporte medico/operativo.
- [ ] Existe exporte IT/auditoria.
- [ ] Existe exporte de resultados agregados de agendamiento/cancelacion.
- [ ] Los exportes no incluyen tokens, credenciales, documento plano, numero de cita, EPS, medico, fecha/hora exacta, CUPS ni respuesta HUN completa.
- [ ] Los exportes pueden usarse como soporte de informe.

**Evidencia:** 
**Notas:** 

---

## Sprint 6 - QA y seguridad

---

### QA-001 - Construir matriz de pruebas funcionales

**Estado:** `pending`
**Labels:** `testing`, `docs`
**Depende de:** CORE-005, CAMPAIGN-003, CANCEL-002, NOTIF-001
**Desbloquea:** QA-002, DOCS-001

**Microsteps:**
- [ ] Listar casos de prueba por modulo y endpoint.
- [ ] Marcar casos que crean/cancelan citas como permitidos en el entorno HUN de pruebas y revalidables antes de produccion.
- [ ] Definir datos de prueba autorizados.
- [ ] Definir resultado esperado y evidencia por caso.
- [ ] Clasificar cada caso por gate: `DEV_READY`, `MVP_TEST_READY` o `CONTRACT_READY`.
- [ ] Crear plantilla de reporte de ejecucion.

**Criterios de aceptacion:**
- [ ] La matriz cubre agendamiento, confirmacion, cancelacion, campanas, recordatorios y logs.
- [ ] Los casos destructivos o modificadores estan claramente marcados.
- [ ] Cada caso tiene resultado esperado verificable.
- [ ] La matriz incluye columna de evidencia.
- [ ] La matriz distingue pruebas con mocks/placeholders de pruebas requeridas para cierre contractual.

**Evidencia:** 
**Notas:** 

---

### QA-002 - Implementar pruebas automatizadas de modulos criticos

**Estado:** `pending`
**Labels:** `testing`, `backend`
**Depende de:** QA-001
**Desbloquea:** DEPLOY-001

**Microsteps:**
- [ ] Configurar runner de pruebas para Node.
- [ ] Crear pruebas unitarias para normalizacion HUN.
- [ ] Crear pruebas para armado de payload de asignacion.
- [ ] Crear pruebas para extraccion de numero de cita.
- [ ] Crear pruebas para transiciones de estado del Flow con mocks.
- [ ] Agregar script `test` en `package.json`.

**Criterios de aceptacion:**
- [ ] `npm test` ejecuta pruebas automatizadas.
- [ ] Hay pruebas de normalizacion de strings HUN.
- [ ] Hay pruebas del payload de asignacion.
- [ ] Hay pruebas de errores sin EPS y sin slot.
- [ ] Las pruebas automatizadas unitarias no crean ni cancelan citas; las pruebas funcionales/integracion si pueden hacerlo contra la API HUN de pruebas controlada.

**Evidencia:** 
**Notas:** 

---

### SEC-001 - Revisar proteccion de datos personales y secretos

**Estado:** `pending`
**Labels:** `security`, `backend`, `docs`
**Depende de:** CORE-002, ADMIN-001
**Desbloquea:** DEPLOY-001, DOCS-001

**Microsteps:**
- [ ] Auditar logs para evitar tokens, llaves privadas y service role key.
- [ ] Verificar que Supabase no almacene citas, nombre, documento plano, EPS, medico, fecha/hora, CUPS ni respuestas completas HUN.
- [ ] Verificar que la vista medica/operativa no exponga logs tecnicos ni detalles de cita.
- [ ] Verificar que la vista IT/auditoria no exponga datos clinicos ni payloads sensibles.
- [ ] Enmascarar o limitar datos en endpoints administrativos.
- [ ] Documentar politica de retencion minima para logs operativos.
- [ ] Validar que `.env` siga ignorado por Git.
- [ ] Agregar checklist de seguridad para despliegue.

**Criterios de aceptacion:**
- [ ] No se registran secretos en consola ni base de datos.
- [ ] Los endpoints administrativos estan protegidos.
- [ ] Los exportes minimizan datos sensibles y no incluyen detalles de citas.
- [ ] La vista medica/operativa y la vista IT/auditoria tienen campos diferenciados y documentados.
- [ ] La documentacion incluye checklist de Ley 1581/confidencialidad.

**Evidencia:** 
**Notas:** 

---

## Sprint 7 - Deploy y cierre contractual

---

### DEPLOY-001 - Preparar despliegue y verificacion de estabilidad

**Estado:** `pending`
**Labels:** `infra`, `backend`, `testing`
**Depende de:** QA-002, SEC-001
**Desbloquea:** DOCS-002

**Microsteps:**
- [ ] Configurar variables de entorno en plataforma de despliegue.
- [ ] Validar `GET /` y `GET /test-hun` en URL publica.
- [ ] Configurar callback URL de webhook Meta.
- [ ] Configurar endpoint del WhatsApp Flow.
- [ ] Revisar logs de arranque y errores.
- [ ] Documentar version desplegada y comandos de soporte.

**Criterios de aceptacion:**
- [ ] La URL publica responde health check.
- [ ] La URL publica confirma conectividad HUN.
- [ ] Meta verifica webhook con `VERIFY_TOKEN`.
- [ ] WhatsApp Flow puede llamar el endpoint publico.
- [ ] Existe evidencia de estabilidad basica del despliegue.

**Evidencia:** 
**Notas:** 

---

### DOCS-001 - Elaborar documentacion tecnica final

**Estado:** `pending`
**Labels:** `docs`
**Depende de:** ADMIN-002, QA-001, SEC-001
**Desbloquea:** DOCS-002

**Microsteps:**
- [ ] Documentar arquitectura backend, Meta, HUN y Supabase minimizado.
- [ ] Incluir diagrama de flujo conversacional.
- [ ] Documentar endpoints propios y endpoints HUN consumidos.
- [ ] Documentar esquema de base de datos.
- [ ] Documentar diccionario de estados de sesion, campana y destinatario.
- [ ] Documentar campos de vista medica/operativa y vista IT/auditoria.
- [ ] Documentar reglas de negocio y manejo de errores.
- [ ] Incluir frase contractual: "El sistema ofrece trazabilidad operativa y tecnica suficiente para seguimiento, auditoria y soporte, sin persistir datos clinicos ni detalles de cita fuera de la API HUN".

**Criterios de aceptacion:**
- [ ] El documento incluye arquitectura y diagrama de flujo.
- [ ] El documento incluye reglas de negocio verificables.
- [ ] El documento incluye diccionario de estados/respuestas.
- [ ] El documento incluye modelo de trazabilidad separado para medicos/personal operativo e IT/auditoria.
- [ ] El documento cubre variables y dependencias externas.

**Evidencia:** 
**Notas:** 

---

### DOCS-002 - Elaborar informe final y trabajo futuro

**Estado:** `pending`
**Labels:** `docs`
**Depende de:** DOCS-001, DEPLOY-001
**Desbloquea:** 

**Microsteps:**
- [ ] Consolidar resultados de matriz de pruebas.
- [ ] Resumir evidencia de agendamiento, confirmacion, cancelacion, campanas y notificaciones.
- [ ] Documentar limitaciones tecnicas y operativas encontradas.
- [ ] Listar requerimientos funcionales futuros.
- [ ] Listar requerimientos no funcionales futuros.
- [ ] Adjuntar evidencia de API real de demanda inducida configurada o waiver formal si queda pendiente.
- [ ] Adjuntar evidencia de proveedor/API de correo definido o waiver formal si queda solo interfaz placeholder.
- [ ] Clasificar el cierre alcanzado como `DEV_READY`, `MVP_TEST_READY` o `CONTRACT_READY`.
- [ ] Preparar version final para revision del supervisor.

**Criterios de aceptacion:**
- [ ] El informe final cubre todos los modulos contractuales.
- [ ] Las pruebas modificadoras quedan ejecutadas o documentadas contra la API HUN de pruebas controlada.
- [ ] Las dependencias externas obligatorias tienen evidencia real o waiver formal documentado.
- [ ] El informe no declara `CONTRACT_READY` si quedan mocks/placeholders obligatorios sin aprobacion formal.
- [ ] El trabajo futuro incluye adjuntos/autorizaciones, portal administrativo, analitica y hardening.
- [ ] El documento esta listo para entregar al supervisor.

**Evidencia:** 
**Notas:** 

---

<!-- INSTRUCCIONES PARA EL AGENTE

# Reglas de actualizacion para el agente

Estas reglas deben estar en el AGENTS.md o system prompt del proyecto para que Claude Code
las siga durante el desarrollo. Tambien se incluyen como comentario al final de STATUS.md.

---

## Al iniciar una sesion

1. Lee `.project-tracking/STATUS.md` completo
2. Identifica el proximo ticket recomendado en la seccion "Estado actual"
3. Verifica que sus dependencias esten en `done` antes de proceder
4. Si hay tickets en `in_progress` de una sesion anterior, evalua su estado real antes de continuar

## Al iniciar un ticket

1. Cambia su estado a `in_progress` en STATUS.md
2. Actualiza "Tickets en progreso" en la seccion Estado actual
3. Actualiza "Proximo ticket recomendado" con el siguiente segun dependencias
4. Eliminalo de la tabla de bloqueados si aparecia alli

## Al completar un microstep

1. Marca el microstep como `- [x]` en el bloque del ticket en STATUS.md

## Al terminar la implementacion de un ticket

1. Cambia su estado a `ready_for_review`
2. Llena el campo `**Evidencia:**` con los archivos creados o modificados relevantes
3. Agrega notas si encontraste algo relevante
4. Actualiza la tabla de resumen de avance
5. Espera confirmacion del usuario antes de marcarlo como `done` y antes de iniciar el siguiente ticket

## Cuando el usuario aprueba un ticket

1. Cambia su estado a `done`
2. Marca todos los criterios de aceptacion como `- [x]` si no lo estan
3. Eliminalo de la tabla de bloqueados si aparecia alli
4. Actualiza la tabla de resumen y el porcentaje global
5. Actualiza "Proximo ticket recomendado"

## Cuando el usuario rechaza un ticket o pide correcciones

1. El estado vuelve a `in_progress`
2. Agrega en `**Notas:**` que criterios de aceptacion fallaron y que hay que corregir
3. No avances al siguiente ticket hasta que este quede en `done`

## Si encuentras un problema bloqueante

1. Cambia el estado del ticket a `blocked`
2. Describe el problema en `**Notas:**`
3. Si la situacion requiere una decision arquitectonica, agregala a DECISIONS.md con el formato de la skill project-tracker
4. Informa al usuario antes de continuar

## Regla general de actualizacion de STATUS.md

Actualiza `Ultima actualizacion:` en el encabezado cada vez que modifiques el archivo.
El formato es `YYYY-MM-DD HH:MM` en hora local del proyecto.

-->

