# Project Status - Agendamiento HUN por WhatsApp

Ultima actualizacion: 2026-07-19
Fase activa: Sprint 5 - Operacion y reportes

## Resumen de avance

| Fase | Total | Completados | En progreso | Bloqueados | Pendientes |
|------|-------|-------------|-------------|------------|------------|
| Sprint 0 - Setup | 5 | 5 | 0 | 0 | 0 |
| Sprint 1 - Core agendamiento | 7 | 7 | 0 | 0 | 0 |
| Sprint 2 - Integracion WhatsApp | 5 | 5 | 0 | 0 | 0 |
| Sprint 3 - Campanas y notificaciones | 6 | 6 | 0 | 0 | 0 |
| Sprint 4 - Cancelacion y reagendamiento | 5 | 5 | 0 | 0 | 0 |
| Sprint 5 - Operacion y reportes | 2 | 0 | 0 | 0 | 2 |
| Sprint 6 - QA y seguridad | 3 | 0 | 0 | 0 | 3 |
| Sprint 7 - Deploy y cierre contractual | 3 | 0 | 0 | 0 | 3 |
| Sprint 8 - API de campanas para panel del hospital | 11 | 11 | 0 | 0 | 0 |
| **TOTAL** | **47** | **39** | **0** | **0** | **8** |

Avance global: 39 / 47 tickets completados (83.0%)

## Estado actual

**Proximo ticket recomendado:** ADMIN-001 - Crear consultas administrativas por perfil.
**Tickets en progreso:** -
**Tickets bloqueados:** -

### Tickets bloqueados por dependencias no resueltas

| Ticket | Bloqueado por |
|--------|---------------|
| ADMIN-002 | ADMIN-001 |
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
- [x] Definir tabla `campana_destinatarios` con referencia operativa de audiencia, especialidad, estado de contacto y timestamps; `whatsapp_numero`, tipo de documento y `documento_hash` quedan como compatibilidad/legacy y no como fuente principal de campanas nuevas.
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
**Desbloquea:** CORE-006, FLOW-002, FLOW-003, NOTIF-001, RESCH-001

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

### CORE-006 - Separar procedimiento, fecha y hora en autoagendamiento

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`, `flow`, `testing`
**Depende de:** CORE-005, FLOW-001
**Desbloquea:** CORE-007

**Microsteps:**
- [x] Publicar `flow-agendamiento.json` con `PROCEDIMIENTO` y `FECHA` entre especialidad y horarios.
- [x] Recolectar procedimientos futuros y autogestionables desde todos los `cups[]` de la agenda y deduplicarlos internamente por CUPS.
- [x] Mostrar solamente el nombre del procedimiento, sin exponer el codigo CUPS.
- [x] Generar tokens opacos firmados `procedure_v1` y `date_v1` vinculados a sesion y expiracion.
- [x] Reconsultar HUN al seleccionar procedimiento y agrupar toda la disponibilidad por fecha sin recorte global.
- [x] Reconsultar HUN al seleccionar fecha y mostrar solo las horas de ese dia y procedimiento.
- [x] Reconsultar HUN al seleccionar y confirmar el `slot_token`.
- [x] Mantener procedimientos, fechas y slots solo en memoria con TTL.
- [x] Conservar sin cambios el recorrido directo de campanas.
- [x] Extender pruebas de Flow, errores, confirmacion y waiver E2E.

**Criterios de aceptacion:**
- [x] El Flow publicado sigue `IDENTIFICACION -> ESPECIALIDAD -> PROCEDIMIENTO -> FECHA -> SLOTS -> CONFIRMAR -> FINAL`.
- [x] El paciente ve nombres de procedimientos y nunca codigos CUPS.
- [x] Procedimientos repetidos con el mismo CUPS aparecen una sola vez.
- [x] Todas las fechas disponibles quedan accesibles aunque el primer dia supere `FLOW_MAX_SLOTS`.
- [x] La pantalla de horas contiene solo opciones del procedimiento y fecha seleccionados.
- [x] Procedimiento, CUPS, fecha, hora y agenda no se guardan en Supabase ni eventos operativos.
- [x] Cupos vencidos o errores HUN generan recuperacion conversacional sin asignar datos obsoletos.
- [x] Campanas y reagendamiento conservan sus Flows independientes.
- [x] La suite automatizada completa finaliza correctamente.

**Evidencia:** `flow-agendamiento.json`, `lib/flowHandler.js`, `scripts/check-flow-slots.js`, `scripts/check-flow-confirmation.js`, `scripts/check-flow-errors.js`, `scripts/check-flow-e2e-waiver.js`, `README.md`, `.project-tracking/DECISIONS.md`; JSON publicado en Meta y confirmado por el usuario el 2026-07-19; `node --check lib/flowHandler.js` exitoso; `npm.cmd test` completo exitoso.
**Notas:** Aprobado por el usuario el 2026-07-19. La identidad del procedimiento se conserva solo en memoria y dentro de tokens HMAC opacos. Supabase recibe exclusivamente el estado coarse `eligiendo_slot`, especialidad, token de slot cuando aplica y expiracion. El Flow de campana continua de identificacion a `SLOTS` para no alterar la oferta dirigida.

---

### CORE-007 - Resolver nombres CUPS cuando HUN omite la descripcion

**Estado:** `done`
**Labels:** `backend`, `api`, `data`, `testing`
**Depende de:** CORE-006
**Desbloquea:** QA-001

**Microsteps:**
- [x] Verificar la respuesta real de agenda HUN para dermatologia y confirmar `descripcion: null` en los CUPS `890242` y `890342`.
- [x] Incorporar el catalogo oficial CUPS vigencia 2026 desde la Resolucion 2706 de 2025.
- [x] Implementar un resolver con prioridad `descripcion HUN -> alias HUN -> catalogo CUPS`.
- [x] Normalizar `codigo`, `descripcion` y `descripcion_fuente` en memoria desde `lib/hun.js`.
- [x] Eliminar el fallback visible `Procedimiento disponible`.
- [x] Omitir opciones cuyo nombre no pueda resolverse y registrar solo conteos agregados.
- [x] Devolver un error recuperable si ninguna opcion tiene nombre resoluble.
- [x] Agregar pruebas del catalogo, aliases, prioridad HUN, codigos desconocidos y persistencia minima.
- [x] Validar en WhatsApp que dermatologia muestra los nombres reales de ambos procedimientos.

**Criterios de aceptacion:**
- [x] `890242` se muestra como `CONSULTA DE PRIMERA VEZ POR ESPECIALISTA EN DERMATOLOGIA`, conservando la tilde del catalogo oficial.
- [x] `890342` se muestra como `CONSULTA DE CONTROL O DE SEGUIMIENTO POR ESPECIALISTA EN DERMATOLOGIA`, conservando la tilde del catalogo oficial.
- [x] Una descripcion valida entregada por HUN tiene prioridad sobre el catalogo.
- [x] Los aliases documentados de descripcion se reconocen antes del catalogo.
- [x] Un CUPS desconocido no genera una opcion generica o ambigua.
- [x] El codigo CUPS, el nombre resuelto y su fuente no se persisten en Supabase ni eventos.
- [x] `flow-agendamiento.json` no requiere cambios ni nueva publicacion en Meta.
- [x] La suite automatizada completa finaliza correctamente.
- [x] La prueba real del Flow confirma el nombre visible correcto.

**Evidencia:** `data/cups-2026.json`, `lib/cupsCatalog.js`, `lib/hun.js`, `lib/flowHandler.js`, `scripts/check-cups-catalog.js`, `scripts/check-hun-client.js`, `scripts/check-flow-slots.js`, `package.json`; consulta HUN de solo lectura para especialidad `200`; anexo oficial de la Resolucion 2706 de 2025; `node --check` exitoso; `npm.cmd test` completo exitoso.
**Notas:** Aprobado por el usuario el 2026-07-19. El catalogo contiene 9459 procedimientos oficiales de seis caracteres y registra URL, hoja fuente y SHA-256 del archivo oficial. `descripcion_fuente` existe solo en los objetos de agenda en memoria. No se modifico el JSON publicado en Meta porque la pantalla ya consume `title` dinamico.

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

**Estado:** `done`
**Labels:** `testing`, `backend`, `api`
**Depende de:** FLOW-001, CORE-005
**Desbloquea:** 

**Microsteps:**
- [x] Ejecutar identificacion, seleccion de especialidad, seleccion de slot y confirmacion desde WhatsApp Flow.
- [x] Confirmar que `CORE-005` reconsulta HUN antes de asignar y no usa candidatos persistidos.
- [x] Ejecutar intento de asignacion contra la API HUN de pruebas controlada.
- [x] Verificar que el paciente recibe mensaje de seguimiento por WhatsApp ante resultado HUN.
- [x] Revisar que Supabase solo recibe estados, tokens opacos y eventos no sensibles.
- [x] Guardar evidencia tecnica de la prueba para QA y cierre contractual.

**Criterios de aceptacion:**
- [x] La prueba end-to-end ejecuta el flujo real hasta confirmacion y POST de asignacion contra HUN de pruebas; el cierre se acepta por aprobacion del usuario aunque HUN rechace cupos no autogestionables por reglas de portafolio/procedimiento.
- [x] El Flow no guarda medico, fecha/hora, CUPS, numero de cita ni respuesta HUN completa en Supabase.
- [x] Los errores recuperables por slot no disponible quedan cubiertos.
- [x] La evidencia queda disponible para `QA-001` y `DOCS-002`.

**Evidencia:** `FLOW_003_E2E_RUNBOOK.md`; `lib/flowHandler.js`; `scripts/check-flow-e2e-waiver.js`; Render deploy live `92b1cc6`; logs Render del 2026-07-04/2026-07-05; eventos Supabase no sensibles; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-e2e-waiver.js` exitoso; `npm.cmd test` exitoso. Consulta HUN de pruebas para `PSIQUIATRIA` (`codigo_especialidad = 590`) mostro cupos futuros, pero todos `autogestionable = no`.
**Notas:** Aprobado por el usuario el 2026-07-04. Se corrigio el filtro para no ofrecer slots con fecha/hora pasada y se agrego log tecnico sanitizado de rechazo HUN (`detalle={...}`) sin payload completo ni datos sensibles. La prueba real mostro que el backend llega hasta HUN y maneja el rechazo; HUN rechazo un cupo no autogestionable porque el procedimiento no estaba incluido o estaba inactivo en el portafolio 189. Consultas posteriores confirmaron que `590` tenia cupos crudos en HUN, pero ninguno autogestionable, por lo que el mensaje de sin cupos en modo normal es correcto. Esta aprobacion no reemplaza la validacion contractual normal con cupos `autogestionable = si`.

---

### INTAKE-001 - Implementar menu inicial y consentimiento WhatsApp

**Estado:** `done`
**Labels:** `feature`, `backend`, `whatsapp`, `privacy`
**Depende de:** FLOW-001, CORE-001
**Desbloquea:** CANCEL-001, QA-001

**Microsteps:**
- [x] Cambiar `POST /webhook` para que no envie el Flow de agendamiento en cualquier mensaje entrante.
- [x] Enviar menu inicial con opciones: agendar cita, consultar citas proximas y modificar/cancelar cita.
- [x] Enviar consentimiento de tratamiento de datos aprobado antes de ejecutar acciones que consulten o gestionen citas.
- [x] Soportar botones `Acepto` y `Rechazo`, y texto escrito `acepto` / `rechazo` como respaldo.
- [x] Si el paciente acepta y eligio agendar, enviar el Flow de autoagendamiento `FLOW_ID`.
- [x] Si el paciente acepta y eligio consultar, pedir identificacion minima por chat y consultar HUN en memoria.
- [x] Si el paciente acepta modificar/cancelar, consultar citas en memoria y avisar que la confirmacion de modificacion/cancelacion queda para `CANCEL-001`.
- [x] Si el paciente rechaza, enviar mensaje aprobado con linea telefonica `(601) 3904888 atencion al usuario`.
- [x] Mantener estado de menu, accion y consentimiento solo en memoria con TTL, sin Supabase.
- [x] Agregar prueba automatizada del router de entrada sin llamar WhatsApp ni HUN reales.

**Criterios de aceptacion:**
- [x] Un mensaje entrante abre menu inicial, no el Flow directamente.
- [x] Ninguna accion sensible avanza sin consentimiento aceptado.
- [x] El rechazo detiene el flujo y dirige a la linea telefonica del hospital.
- [x] La consulta de citas usa HUN como fuente de verdad y no persiste documento, telefono ni citas.
- [x] La opcion modificar/cancelar queda enrutada como entrada conversacional para `CANCEL-001`, sin ejecutar cancelaciones todavia.
- [x] No se registran documentos, telefonos, citas ni payloads HUN completos en logs o Supabase.

**Evidencia:** `lib/inboundRouter.js`, `lib/whatsapp.js`, `server.js`, `scripts/check-inbound-router.js`, `package.json`; `node --check server.js` exitoso; `node --check lib/whatsapp.js` exitoso; `node --check lib/inboundRouter.js` exitoso; `node --check scripts/check-inbound-router.js` exitoso; `node scripts/check-inbound-router.js` exitoso; `npm.cmd test` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-08. Texto de consentimiento aprobado por el usuario y linea telefonica configurada en codigo como `(601) 3904888 atencion al usuario`. El consentimiento no se persiste; solo se usa para la sesion efimera de WhatsApp. Para produccion, HUN debe confirmar que el texto aprobado corresponde a su politica institucional vigente. Ajuste 2026-07-12: el saludo del menu inicial quedo actualizado a "Hola. Soy *Natalia*, asistente de citas..." y fue versionado en `main` con el commit `be4ce3c`.

---

### INTAKE-002 - Mejorar identificacion y consulta conversacional

**Estado:** `done`
**Labels:** `feature`, `backend`, `whatsapp`, `ux`, `testing`
**Depende de:** INTAKE-001, CORE-001
**Desbloquea:** QA-001

**Microsteps:**
- [x] Mostrar los seis tipos de documento por nombre completo en una lista interactiva de WhatsApp.
- [x] Separar la captura en tipo de documento y numero de documento.
- [x] Mantener la identificacion unicamente en la sesion temporal en memoria.
- [x] Filtrar las citas proximas por estado HUN exacto `Reservada`.
- [x] Excluir del mensaje citas canceladas, atendidas y cualquier otro estado.
- [x] Mejorar con resaltados y emojis los mensajes conversacionales y confirmaciones asincronas.
- [x] Agregar pruebas del payload de lista, recorrido en dos pasos y filtro por estado.
- [x] Enviar acciones `Volver al menu` y `Finalizar` despues del resultado definitivo de agendar, consultar, modificar o cancelar.
- [x] Conservar el consentimiento solo en memoria durante el TTL de la sesion para no solicitarlo en cada gestion.
- [x] Revocar consentimiento y limpiar estado operativo al finalizar la conversacion.
- [x] Mantener pendiente cualquier operacion asincrona hasta su resultado antes de ofrecer acciones de cierre.
- [x] Usar un mensaje de continuidad al volver al menu, sin repetir el saludo inicial de Natalia.

**Criterios de aceptacion:**
- [x] El paciente puede elegir Cedula de ciudadania, Cedula de extranjeria, Permiso temporal, Tarjeta de identidad, Registro civil o Pasaporte sin conocer su abreviatura.
- [x] El numero se solicita en un segundo mensaje y se envia a HUN junto con el codigo elegido.
- [x] La respuesta de consulta contiene exclusivamente citas futuras `Reservada`.
- [x] Los mensajes son mas legibles y no requieren modificar ningun Flow publicado en Meta.
- [x] No se persisten documento, telefono, citas ni payloads HUN.
- [x] Las pruebas especificas de entrada, cancelacion, reagendamiento y confirmacion son exitosas.
- [x] Volver al menu durante la misma sesion no repite el consentimiento.
- [x] Finalizar elimina la autorizacion efimera y una conversacion posterior vuelve a solicitarla.
- [x] Los cuatro procesos ofrecen las mismas acciones solo despues de su resultado final.
- [x] El saludo inicial aparece solo al comenzar una conversacion nueva.

**Evidencia:** implementacion en `lib/conversationLifecycle.js`, `lib/inboundRouter.js`, `lib/whatsapp.js`, `lib/flowHandler.js`, `lib/cancellationVerifier.js` y `lib/rescheduleHandler.js`; pruebas en `scripts/check-conversation-lifecycle.js`, `scripts/check-inbound-router.js`, `scripts/check-cancellation-verifier.js`, `scripts/check-reschedule-flow.js` y `scripts/check-flow-confirmation.js`; documentacion en `README.md` y `PLAN_SPRINTS_AGENDAMIENTO_HUN.md`; `npm.cmd test` completo exitoso el 2026-07-19.
**Notas:** Aprobado por el usuario el 2026-07-19, incluida la correccion visual que reemplaza el saludo repetido por un mensaje de continuidad al volver al menu. No requiere publicar JSON ni configurar acciones en Meta porque usa mensajes interactivos estandar de WhatsApp Cloud API. El consentimiento vive en un mapa de memoria separado del contexto de cada gestion, vence con `INBOUND_SESSION_TTL_MINUTES` y se elimina explicitamente al finalizar.

---

## Sprint 3 - Campanas y notificaciones

---

### CAMPAIGN-001 - Modelar campanas y destinatarios

**Estado:** `done`
**Labels:** `feature`, `database`, `backend`
**Depende de:** SETUP-005
**Desbloquea:** CAMPAIGN-002, NOTIF-001, ADMIN-001

**Microsteps:**
- [x] Definir estados de campana: borrador, programada, enviando, activa, cerrada y cancelada.
- [x] Definir estados de destinatario: pendiente, enviado, entregado, respondido, flow_iniciado, agendado, fallido y excluido.
- [x] Agregar campos de especialidad, cupos objetivo, origen de datos y responsable.
- [x] Relacionar destinatarios con `audiencia_ref` / `id_anonimo`, especialidad y campana para demanda inducida.
- [x] Dejar WhatsApp, tipo de documento y `documento_hash` como campos legacy/compatibilidad, no obligatorios para campanas nuevas.
- [x] Definir reglas de opt-out y exclusion.
- [x] Ajustar el modelo para campanas multi-especialidad: `campanas.especialidad_codigo` es opcional y la especialidad obligatoria vive en `campana_destinatarios.especialidad_codigo`.

**Criterios de aceptacion:**
- [x] Las tablas soportan una campana con multiples destinatarios.
- [x] Cada destinatario tiene estado independiente.
- [x] El modelo permite asociar resultado `agendado` con una campana sin guardar datos de la cita.
- [x] Existe campo para excluir destinatarios por opt-out o criterio operativo.
- [x] El modelo soporta destinatarios por `audiencia_ref` / `id_anonimo`.
- [x] Una misma campana puede contener destinatarios de multiples especialidades y reportarse por `campaign_id + especialidad_codigo + estado_contacto`.
- [x] Supabase no guarda telefono resuelto, nombre, correo, EPS, medico, fecha/hora, servicio ni payload completo del orquestador.

**Evidencia:** `CAMPAIGN_MODEL.md`; `lib/db.js`; `scripts/check-campaign-model.js`; `supabase/001_minimal_operational_schema.sql`; `supabase/003_campaign_responsable.sql`; `supabase/004_campaign_audiencia_ref.sql`; `supabase/005_campaign_multispecialty.sql`; Supabase verificado con columna `campanas.responsable`; migracion `campaign_audiencia_ref` aplicada en Supabase proyecto `agendamiento-HUN` (`aqbtcpkgvxiktpegwmdi`); verificado `audiencia_ref` como `text`, `whatsapp_numero` y `documento_hash` como nullable, e indices `idx_destinatarios_audiencia_ref` y `ux_destinatarios_campaign_audiencia_ref`; usuario confirmo aplicacion de `supabase/005_campaign_multispecialty.sql` en Supabase real el 2026-07-08; `node --check lib/db.js` exitoso; `node --check scripts/check-campaign-model.js` exitoso; `npm.cmd test` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-04. Ajustado el 2026-07-06 por cambio de arquitectura: demanda inducida usa `audiencia_ref` / `id_anonimo` como referencia operativa principal y resuelve telefono/contexto en memoria contra API orquestador. `responsable` es opcional y representa responsable operativo de la campana, no datos del paciente. Ajustado el 2026-07-08 por decision multi-especialidad: una campana puede agrupar cohortes como PQRS de una EPS y cada destinatario define su propia especialidad; `campanas.especialidad_codigo` queda como campo opcional/legacy de campanas de una sola especialidad. La migracion `supabase/004_campaign_audiencia_ref.sql` ya fue aplicada y verificada en Supabase real el 2026-07-06. La migracion `supabase/005_campaign_multispecialty.sql` fue aplicada por el usuario en Supabase real el 2026-07-08. Los constructores de `lib/db.js` deben seguir descartando campos no permitidos como nombre, telefono resuelto, correo, EPS, medico, fecha/hora, servicio, documento plano y payload del orquestador.

---

### CAMPAIGN-002 - Implementar adaptador de audiencia de demanda inducida

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CAMPAIGN-001
**Desbloquea:** CAMPAIGN-003

**Microsteps:**
- [x] Definir variables de configuracion requeridas para fuente de audiencia y resolver orquestador: base URL, autenticacion, endpoint, API key y timeout.
- [x] Definir contrato de audiencia con `id_anonimo` / `audiencia_ref` y `cod_especialidad_requerida`.
- [x] Documentar adaptador/mock para cargar referencias de audiencia sin datos sensibles si la fuente oficial no esta disponible.
- [x] Documentar resolver por `id_anonimo` para obtener telefono/contexto solo en memoria antes del envio.
- [x] Validar `id_anonimo`, especialidad y duplicados por campana/referencia.
- [x] Crear destinatarios minimos asociados a una campana usando `audiencia_ref` y `especialidad_codigo`.
- [x] Descartar telefono, nombre, correo, EPS, medico, fecha/hora, servicio y payload completo del orquestador antes de persistir en Supabase.
- [x] Generar resumen de sincronizacion/resolucion con totales aceptados, rechazados, duplicados y errores no sensibles.

**Criterios de aceptacion:**
- [x] El ticket documenta las variables requeridas para configurar el API oficial.
- [x] Si la fuente de audiencia no esta disponible, el adaptador/mock permite cargar referencias `id_anonimo` / `audiencia_ref`.
- [x] Para `CONTRACT_READY`, el API real de demanda inducida queda configurado o existe waiver formal del supervisor.
- [x] Una lectura valida del API o mock crea/sincroniza destinatarios minimos en Supabase.
- [x] El contrato actual del resolver queda documentado como uso en memoria para obtener telefono/contexto antes del envio.
- [x] Registros duplicados no se insertan dos veces.
- [x] Registros invalidos reportan motivo verificable.
- [x] Supabase no guarda telefono, nombre, correo, documento plano, EPS, medico, fecha/hora, servicio ni payload completo del orquestador.
- [x] El resumen de sincronizacion muestra aceptados, rechazados, duplicados y errores.

**Evidencia:** `lib/demandaInducida.js`; `lib/db.js`; `scripts/check-campaign-audience.js`; `DEMANDA_INDUCIDA_API.md`; `.env.example`; `README.md`; `package.json`; `node --check lib/demandaInducida.js` exitoso; `node --check scripts/check-campaign-audience.js` exitoso; `npm.cmd test` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-06. Ajustado el 2026-07-06 por nuevo API orquestador: la fuente de campaña en Supabase debe ser `id_anonimo` / `audiencia_ref`; el telefono y contexto se resuelven justo antes del envio y solo en memoria. El contrato actual del orquestador no trae `tipo_documento`, `numero_documento`, `eps_codigo` ni especialidad en codigos HUN suficientes para omitir identificacion, por lo que el Flow de campana v1 debe pedir identificacion minima. `CONTRACT_READY` sigue condicionado a API real configurada o waiver formal del supervisor.

---

### FLOW-004 - Crear Flow separado de demanda inducida

**Estado:** `done`
**Labels:** `feature`, `backend`, `flow`
**Depende de:** CAMPAIGN-002, CORE-005, FLOW-001
**Desbloquea:** CAMPAIGN-003, QA-001

**Microsteps:**
- [x] Crear `flow-demanda-inducida.json` con pantallas de identificacion minima, seleccion de slot, confirmacion y final.
- [x] Excluir pantalla de seleccion de especialidad; la especialidad viene firmada en el contexto de campana.
- [x] Configurar variables `CAMPAIGN_FLOW_ID`, `CAMPAIGN_FLOW_SCREEN_ID`, `CAMPAIGN_TEMPLATE_NAME` y `CAMPAIGN_TEMPLATE_LANGUAGE`.
- [x] Implementar distincion backend entre Flow de autoagendamiento y Flow de campana mediante `flow_token` firmado o metadata equivalente.
- [x] Validar expiracion, campana, destinatario o `audiencia_ref`, especialidad y estado sin guardar datos sensibles.
- [x] Reutilizar `slot_token` y reconsulta HUN de `CORE-004/CORE-005` para listar y confirmar cupos.
- [x] Registrar eventos operativos no sensibles para inicio de Flow de campana, identificacion, slots, confirmacion y errores.
- [x] Documentar que la version de solo escoger fecha/hora queda bloqueada hasta que el API orquestador entregue documento, EPS/codigo y especialidad requerida en codigos utilizables por HUN.

**Criterios de aceptacion:**
- [x] Existe JSON separado para demanda inducida y no se modifica el Flow de autoagendamiento para este caso.
- [x] El Flow de campana no permite elegir especialidad manualmente.
- [x] La plantilla de campana abre `CAMPAIGN_FLOW_ID`, no `FLOW_ID`.
- [x] El backend enruta correctamente autoagendamiento vs campana.
- [x] El Flow de campana usa `slot_token` + reconsulta HUN y no persiste slots completos.
- [x] Supabase no guarda telefono, nombre, correo, documento plano, EPS, medico, fecha/hora, numero de cita ni payload del orquestador.
- [x] Si el API orquestador no trae datos suficientes para omitir identificacion, el Flow v1 pide identificacion minima y lo documenta como limitacion operativa.

**Evidencia:** `flow-demanda-inducida.json`; `lib/flowHandler.js`; `scripts/check-flow-campaign.js`; `.env.example`; `README.md`; `AGENTS.md`; Flow Meta publicado por usuario con `CAMPAIGN_FLOW_ID=2195324014654953`, template `hun_oferta_cita_flow`, idioma Espanol Colombia; parseo JSON exitoso con `node -e`; pantallas verificadas como `IDENTIFICACION > SLOTS > CONFIRMAR > FINAL`; busqueda sin coincidencias para pantalla `ESPECIALIDAD` ni campo `correo`; `node --check lib/flowHandler.js` exitoso; `node --check scripts/check-flow-campaign.js` exitoso; `npm.cmd test` exitoso; prueba real de campana en Render confirmo intercambio `IDENTIFICACION > SLOTS > CONFIRMAR`, cierre de Flow ignorado por webhook general y asignacion HUN exitosa.
**Notas:** Aprobado por el usuario el 2026-07-06. El backend distingue campana por `flow_token` firmado `campaign_v1`, valida expiracion/campana/destinatario o `audiencia_ref`/especialidad, pide identificacion minima por limitacion actual del API orquestador y salta directo a `SLOTS`. El envio de plantilla y resolucion de telefono se implementa en CAMPAIGN-003 usando `CAMPAIGN_FLOW_ID=2195324014654953`, `CAMPAIGN_TEMPLATE_NAME=hun_oferta_cita_flow` y `CAMPAIGN_TEMPLATE_LANGUAGE=es_CO`. Ajuste 2026-07-12: el webhook general ignora respuestas `nfm_reply` de cierre de Flow para evitar reiniciar el menu despues de una asignacion por campana.

---

### CAMPAIGN-003 - Implementar envio de ofertas de cita por WhatsApp

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CAMPAIGN-002, FLOW-004
**Desbloquea:** QA-001

**Microsteps:**
- [x] Definir plantilla de mensaje de oferta y CTA hacia Flow.
- [x] Seleccionar destinatarios pendientes y no excluidos con `audiencia_ref` / `id_anonimo`.
- [x] Consultar API orquestador por cada `id_anonimo` antes del envio.
- [x] Normalizar telefono solo en memoria.
- [x] Construir `flow_token` firmado con campana, destinatario/referencia, especialidad y expiracion; la especialidad del orquestador prima sobre la de Supabase.
- [x] Enviar mensaje mediante WhatsApp Cloud API usando `CAMPAIGN_FLOW_ID`.
- [x] Guardar resultado de envio en `notificaciones` sin telefono, cuerpo completo ni datos del resolver.
- [x] Actualizar estado del destinatario segun exito o error.
- [x] Registrar errores de rate limit, token invalido, numero invalido, 403/404/timeout del orquestador o Flow no configurado.

**Criterios de aceptacion:**
- [x] Solo se envian mensajes a destinatarios pendientes y no excluidos.
- [x] Cada envio resuelve el telefono desde `id_anonimo` en memoria y no lo persiste en Supabase.
- [x] La plantilla abre el Flow de demanda inducida, no el Flow de autoagendamiento.
- [x] Cada mensaje incluye `flow_token` firmado y con expiracion.
- [x] Cada envio genera registro en `notificaciones`.
- [x] El estado del destinatario cambia a enviado o fallido.
- [x] Los errores de WhatsApp y del orquestador quedan disponibles para reporte como motivos no sensibles.

**Evidencia:** `lib/campaignSender.js`; `lib/demandaInducida.js`; `lib/whatsapp.js`; `lib/db.js`; `scripts/check-campaign-send.js`; `scripts/send-campaign-offers.js`; `scripts/check-campaign-audience.js`; `.env.example`; `README.md`; `DEMANDA_INDUCIDA_API.md`; `package.json`; `node --check` exitoso para archivos JS modificados; `npm.cmd test` exitoso; `git diff --check` sin errores; plantilla/Flow externo publicado por usuario con `CAMPAIGN_FLOW_ID=2195324014654953`, `CAMPAIGN_TEMPLATE_NAME=hun_oferta_cita_flow`, idioma `es_CO`; commits en `main`: `fa9b4aa`, `5ade3b5`, `db9841e`.
**Notas:** Aprobado por el usuario el 2026-07-06. El envio selecciona destinatarios pendientes con `audiencia_ref`, resuelve telefono en memoria contra el orquestador, firma `flow_token` de campana y envia la plantilla de WhatsApp con boton Flow. Supabase guarda solo notificacion, estado de destinatario y evento operativo no sensible; no persiste telefono, nombre, correo, documento plano, EPS, medico, fecha/hora, numero de cita ni payload del orquestador/Meta. Se corrigio el adaptador de audiencia para que campanas nuevas sincronicen `id_anonimo` / `audiencia_ref` y especialidad, no telefono ni documento. Ajustes 2026-07-09/2026-07-12: si el orquestador devuelve especialidad, esta prima sobre `campana_destinatarios.especialidad_codigo`; la especialidad de Supabase queda como respaldo operativo. La confirmacion WhatsApp de campana se envia al telefono resuelto desde el orquestador mediante el token cifrado del Flow, no al telefono de sesion del webhook. El `flow_token` de campana usa formato `campaign_v1.<payload>.<firma>` para evitar colisiones con `_` en base64url.

---

### NOTIF-001 - Implementar confirmaciones inmediatas y recordatorios desde HUN

**Estado:** `done`
**Labels:** `feature`, `backend`
**Depende de:** CORE-005, CAMPAIGN-001
**Desbloquea:** NOTIF-002, QA-001

**Microsteps:**
- [x] Definir tipos de notificacion: confirmacion, recordatorio, error y cancelacion.
- [x] Crear funcion reusable para registrar y enviar notificaciones.
- [x] Enviar confirmacion inmediata despues de asignacion exitosa de `CORE-005`, usando datos frescos disponibles en memoria y el correo transitorio cifrado de la sesion solo si existe proveedor/API de correo aprobado.
- [x] Definir `ReminderCandidateProvider` para obtener candidatos de recordatorio desde HUN por ventana de fechas.
- [x] Definir reglas de ventana de envio, deduplicacion y numero maximo de intentos.
- [x] Asociar notificaciones con campana, destinatario o sesion temporal, sin asociar datos de cita.
- [x] Guardar solo eventos de intento de notificacion, canal, tipo, estado, proveedor, error tecnico y timestamp; nunca guardar direccion de correo plano ni cuerpo completo.
- [x] Si HUN no expone datos suficientes para recordatorios por ventana, dejar advertencia operativa y bloquear recordatorios reales hasta contar con endpoint suficiente.
- [x] Revisar si ya existe definicion formal de proveedor/API de correo antes de habilitar `NOTIF-002`.
- [x] Si el proveedor/API de correo sigue indefinido, elevar advertencia y dejar `NOTIF-002` condicionado a definicion operativa.

**Criterios de aceptacion:**
- [x] Una cita agendada genera notificacion de confirmacion.
- [x] Los recordatorios no dependen de citas almacenadas en Supabase.
- [x] El modelo soporta recordatorios programables mediante consulta HUN por ventana de fechas.
- [x] Si HUN no tiene endpoint suficiente, queda implementada la interfaz `ReminderCandidateProvider` y los recordatorios reales quedan bloqueados con advertencia operativa.
- [x] Cada intento queda registrado con estado.
- [x] Un fallo de WhatsApp no rompe el proceso principal.
- [x] Antes de pasar a `NOTIF-002`, queda documentado si el proveedor/API de correo esta definido o si debe elevarse advertencia.

**Evidencia:** `lib/notifications.js`; `lib/reminders.js`; `lib/flowHandler.js`; `scripts/check-notifications.js`; `NOTIFICACIONES_HUN.md`; `package.json`; `node --check` exitoso para archivos JS modificados; `npm.cmd test` exitoso; `git diff --check` sin errores; commits en `main`: `1e70600`, `328d70f`.
**Notas:** Aprobado por el usuario el 2026-07-07. La confirmacion de cita exitosa se envia por WhatsApp y ahora tambien registra intento en `notificaciones` con `session_id_hash`, canal, tipo, estado y proveedor, sin cuerpo del mensaje ni datos de cita. Los recordatorios reales quedan bloqueados operativamente hasta que HUN entregue un endpoint suficiente para consultar candidatos por ventana; mientras tanto queda implementada la interfaz `HunReminderCandidateProvider` y reglas de ventana/reintentos. EmailJS existe como adaptador condicionado por variables, pero el alcance completo de correo queda en `NOTIF-002`. Ajuste 2026-07-12: la confirmacion de agendamiento consulta HUN por numero de cita para mostrar `Procedimiento` real cuando HUN lo entrega; no se persiste procedimiento, numero de cita ni payload completo. En prueba real, correo de confirmacion fue enviado y WhatsApp quedo aceptado por Meta/registrado como enviado; queda como observacion de QA validar entrega final por estado webhook de Meta o auditoria no sensible.

---

### NOTIF-002 - Preparar integracion de correo transaccional

**Estado:** `done`
**Labels:** `feature`, `backend`
**Depende de:** NOTIF-001
**Desbloquea:** 

**Microsteps:**
- [x] Definir interfaz de envio de correo con destinatario, asunto/cuerpo via template y metadata minima.
- [x] Mantener adaptador EmailJS condicionado por variables; sin variables configuradas no envia ni rompe el flujo.
- [x] Documentar variables esperadas para EmailJS.
- [x] Asociar confirmaciones con `notificaciones` por WhatsApp y mantener correo fuera de `notificaciones` para no guardar direccion ni cuerpo.
- [x] Usar template de confirmacion existente para cita agendada.
- [x] Bloquear envio real cuando faltan variables EmailJS.
- [x] Leer el correo desde `flow_sesiones_temporales.contacto_email_enc` en autoagendamiento o desde el orquestador en campanas, descifrarlo/usarlo solo en memoria y limpiar el dato transitorio al finalizar.
- [x] Cifrar el correo del orquestador dentro del `flow_token` firmado de campana para que no viaje en claro.

**Criterios de aceptacion:**
- [x] Existe interfaz backend para enviar correo.
- [x] Sin proveedor configurado, el sistema omite el envio sin fallar.
- [x] Las variables requeridas del proveedor estan documentadas.
- [x] La confirmacion por correo puede enviarse para autoagendamiento y campanas si hay correo valido y EmailJS configurado.
- [x] `notificaciones` no almacena direccion de correo plano ni contenido sensible del mensaje.
- [x] No existe envio real de correo sin proveedor/API aprobado/configurado.
- [x] Para `CONTRACT_READY`, el proveedor/API de correo queda definido o existe waiver formal del supervisor para mantener solo confirmacion por WhatsApp.

**Evidencia:** `lib/email.js`; `lib/demandaInducida.js`; `lib/campaignSender.js`; `lib/flowHandler.js`; `scripts/check-campaign-send.js`; `scripts/check-flow-campaign.js`; `NOTIFICACIONES_HUN.md`; `DEMANDA_INDUCIDA_API.md`; `node --check` exitoso para archivos JS modificados; `node scripts/check-campaign-send.js` exitoso; `node scripts/check-flow-campaign.js` exitoso; `npm.cmd test` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-09 para campanas: el correo puede leerse desde el orquestador junto con el telefono. El backend normaliza el correo del resolver, lo cifra dentro del `flow_token` de campana y lo recupera al iniciar el Flow para usarlo como contacto transitorio de confirmacion. El correo no queda en `campana_destinatarios`, `notificaciones` ni eventos operativos. Los recordatorios reales por correo siguen condicionados a contar con candidatos HUN por ventana y reglas operativas finales.

---

## Sprint 4 - Cancelacion y reagendamiento

---

### CANCEL-001 - Implementar flujo de cancelacion de citas

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CORE-002, CORE-001, INTAKE-001
**Desbloquea:** CANCEL-002

**Microsteps:**
- [x] Conectar la opcion `Modificar/cancelar` del menu inicial con la rama/Flow de cancelacion.
- [x] Consultar citas del paciente por tipo y documento en tiempo real contra HUN.
- [x] Filtrar citas cancelables segun estado permitido.
- [x] Presentar opciones de cita con `cancel_token` opaco; el numero de cita solo vive en memoria del proceso o se recupera por reconsulta HUN.
- [x] Confirmar seleccion antes de llamar API HUN.
- [x] Validar `cancel_token` por reconsulta HUN o por contexto efimero de servidor con TTL.
- [x] Enviar POST a `/webServiceCancelarCitaH/cancelar_cita`.
- [x] Registrar evento de solicitud con estado `cancelacion_procesando` y `cancel_operation_id` no reversible.

**Criterios de aceptacion:**
- [x] Solo se listan citas con estado cancelable.
- [x] La cancelacion se inicia desde una rama/Flow separado por intencion `CANCELAR`.
- [x] La API de cancelacion no se llama sin confirmacion.
- [x] La solicitud no persiste numero de cita ni documento plano en Supabase.
- [x] Supabase solo guarda `cancel_operation_id`, `session_id_hash`, estado, timestamps y `expires_at`.
- [x] El paciente recibe mensaje de cancelacion en proceso.

**Evidencia:** `lib/inboundRouter.js`, `lib/hun.js`, `lib/db.js`, `lib/flowHandler.js`, `explorar-api-hun.js`, `scripts/check-inbound-router.js`, `scripts/check-hun-client.js`, `README.md`; `node --check` exitoso para archivos JS modificados; `node scripts/check-inbound-router.js` exitoso; `node scripts/check-hun-client.js` exitoso; `npm.cmd test` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-14. Implementado como rama conversacional de WhatsApp iniciada por la intencion `Modificar/cancelar`, sin Flow nuevo en Meta. El backend pide consentimiento, solicita identificacion minima, consulta HUN en tiempo real, lista hasta tres citas futuras con estado cancelable, genera `cancel_token` opaco en memoria con TTL y exige confirmacion explicita antes de llamar `hun.cancelarCita`. El numero de cita y documento solo viven en memoria durante la sesion. Supabase recibe `cancel_operation_id` no reversible en `flow_sesiones_temporales.flow_token` con estado `cancelacion_procesando` y `expires_at`, mas evento operativo no sensible con `session_id_hash`; no guarda numero de cita, documento plano, medico, fecha/hora ni payload HUN. La verificacion asincronica y estado final quedan para `CANCEL-002`. Ajuste 2026-07-14: se corrigio el normalizador para soportar campos reales de HUN como `Cita_Fecha` y `ESTADO`, y fechas RFC como `Fri, 17 Jul 2026 00:00:00 GMT`, evitando descartar citas reservadas como no cancelables. Segundo ajuste 2026-07-14: el contrato documental de HUN exige `cita`, `tipo_documento` y `documento` en el POST; el cliente enviaba solo `cita`. Se corrigio el payload conservando tipo/documento exclusivamente en memoria durante la sesion y se agregaron pruebas del contrato y diagnostico sanitizado.

---

### CANCEL-002 - Implementar verificacion asincrona de cancelacion

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`
**Depende de:** CANCEL-001
**Desbloquea:** RESCH-001, ADMIN-001, QA-001

**Microsteps:**
- [x] Crear tarea o funcion para consultar `/verificar_cancelacion/{cita}` usando el numero de cita solo desde memoria o reconsulta HUN dentro del TTL.
- [x] Actualizar estado final no sensible a `cancelada` o `cancelacion_fallida`.
- [x] Registrar solo resultado agregado, codigo/estado tecnico y `cancel_operation_id`, sin respuesta HUN completa.
- [x] Enviar mensaje final al paciente.
- [x] Definir reintentos, timeout de verificacion y expiracion del contexto temporal.
- [x] Implementar idempotencia con `cancel_operation_id` como hash/correlation id no reversible.
- [x] No repetir POST si la operacion esta `cancelacion_procesando`, `cancelada` o `cancelacion_fallida`.
- [x] Si el proceso se reinicia y se pierde el contexto temporal, informar al usuario que debe reiniciar la cancelacion.

**Criterios de aceptacion:**
- [x] Una cancelacion en proceso puede verificarse sin persistir numero de cita en Supabase.
- [x] El estado final persistido es solo agregado/no sensible: `cancelacion_procesando`, `cancelada` o `cancelacion_fallida`.
- [x] El paciente recibe resultado final por WhatsApp.
- [x] Fallos de verificacion quedan registrados para seguimiento.
- [x] La idempotencia evita repetir POST de cancelacion para una operacion en proceso o finalizada.

**Evidencia:** `lib/cancellationVerifier.js`, `lib/inboundRouter.js`, `lib/db.js`, `scripts/check-cancellation-verifier.js`, `scripts/check-inbound-router.js`, `supabase/006_cancel_operation_failure_state.sql`, `.env.example`, `SETUP_LOCAL_CHECKLIST.md`, `README.md`, `package.json`; migracion remota `cancel_operation_failure_state` aplicada y restriccion verificada en Supabase; `node --check` exitoso; pruebas especificas de verificacion e inbound exitosas; `npm.cmd test` exitoso; consulta de solo lectura al endpoint HUN real con respuesta clasificada sin exponer payload.
**Notas:** Aprobado por el usuario el 2026-07-14. Implementado con registro efimero en memoria, POST idempotente por `cancel_operation_id`, verificacion en segundo plano con espera inicial, seis intentos por defecto e intervalo configurable. El numero de cita y destinatario solo viven en memoria; Supabase conserva estados agregados, HMAC no reversible del destinatario en eventos y metadatos tecnicos sanitizados. Al confirmar HUN se envia resultado final por WhatsApp. Si Render reinicia y se pierde el numero de cita, el siguiente mensaje del usuario detecta la operacion pendiente por HMAC, la cierra como `cancelacion_fallida` e indica reiniciar el proceso. La migracion agrega el estado agregado `cancelacion_fallida` sin incorporar datos de cita ni datos personales. Los asesores de Supabase mantienen hallazgos previos sobre vistas `security_definer` y funcion publica, pendientes de `SEC-001`; la migracion de este ticket no agrego hallazgos nuevos.

---

### RESCH-001 - Evaluar estrategia de reagendamiento

**Estado:** `done`
**Labels:** `needs-discussion`, `blocked`
**Depende de:** CANCEL-002, CORE-005
**Desbloquea:** 

**Microsteps:**
- [x] Confirmar si HUN tiene endpoint especifico de reagendamiento.
- [x] Documentar riesgos de estrategia cancelar + asignar.
- [x] Elevar decision al supervisor si no hay endpoint especifico.
- [x] Si no hay endpoint o regla aprobada, documentar reagendamiento como trabajo futuro.
- [x] Si se aprueba cancelar + asignar, disenar flujo transaccional con advertencia explicita al usuario.
- [x] En la estrategia cancelar + asignar, no liberar el cupo original hasta confirmar disponibilidad alternativa.
- [x] Registrar decision tecnica en documentacion final.

**Criterios de aceptacion:**
- [x] Existe decision documentada sobre estrategia de reagendamiento.
- [x] Si no existe endpoint o regla aprobada, queda como requerimiento futuro detallado y no bloquea el MVP de agendamiento/cancelacion.
- [x] Si se aprueba cancelar + asignar, el flujo evita doble confirmacion ambigua y advierte al usuario antes de afectar su cita original.
- [x] La decision menciona riesgos y dependencias HUN.

**Evidencia:** `DOCUMENTACION_CONSUMO_APIS-1.pdf` revisado el 2026-07-14; el documento enumera especialidades, citas por documento/numero, fecha por medico, disponibilidad por medico, agenda, asignacion, cancelacion y verificacion de cancelacion, sin endpoint especifico de reagendamiento. Contraste con `lib/hun.js` y `README.md`, que exponen el mismo contrato sin operacion de reagendamiento. Estrategia, estados parciales, advertencia al paciente, minimizacion y recuperacion documentados en `RESCH_001_ESTRATEGIA_REAGENDAMIENTO.md`; decision registrada en `.project-tracking/DECISIONS.md`.
**Notas:** Aprobado por el usuario el 2026-07-14. La estrategia definida es `asignar nueva cita -> confirmar nueva cita -> solicitar cancelacion original -> verificar cancelacion`. La cita original no se libera antes de confirmar la nueva. El flujo no informa modificacion exitosa hasta confirmar la cancelacion original. Si esta falla, se informa posible doble reserva y se exige conciliacion manual; no existe rollback atomico entre endpoints HUN. Este ticket evalua y disena la estrategia; la implementacion funcional requiere un ticket posterior con cambios conversacionales, estados agregados, migracion minima y pruebas E2E.

---

### RESCH-002 - Implementar Flow y saga de reagendamiento

**Estado:** `done`
**Labels:** `feature`, `backend`, `api`, `flow`
**Depende de:** RESCH-001, CANCEL-002, CORE-005, FLOW-001
**Desbloquea:** RESCH-003

**Microsteps:**
- [x] Crear y publicar `flow-reagendamiento.json` con pantallas exclusivas de identificacion, cita original, slots, confirmacion y final de procesamiento.
- [x] Configurar `RESCHEDULE_FLOW_ID` y `RESCHEDULE_FLOW_SCREEN_ID` y enviar este Flow desde la opcion `Modificar/cancelar` despues del consentimiento.
- [x] Consultar HUN por tipo y numero de documento y listar citas futuras modificables mediante `appointment_token` opaco con TTL.
- [x] Obtener de la cita seleccionada el codigo de especialidad y `Cod_Pro`; si HUN solo devuelve nombre de especialidad, resolverlo sin ambiguedad contra el catalogo HUN.
- [x] Consultar agenda por la especialidad original y filtrar cupos autogestionables cuyo codigo de procedimiento coincida exactamente con `Cod_Pro`.
- [x] Presentar alternativas mediante `slot_token` firmado, sin persistir numero de cita, documento ni datos completos de slots.
- [x] Reconsultar la cita original y el slot seleccionado antes de ejecutar operaciones modificadoras.
- [x] Implementar idempotencia con `reschedule_operation_id` no reversible y estados agregados de saga con TTL.
- [x] Asignar la nueva cita y confirmar su existencia antes de solicitar la cancelacion original.
- [x] Cancelar la cita original y reutilizar verificacion asincrona con reintentos hasta estado final HUN.
- [x] Informar exito solo cuando la nueva cita este confirmada y la original cancelada; si falla la cancelacion, informar posible doble reserva y marcar conciliacion manual.
- [x] Agregar migracion minima de estados agregados no sensibles, pruebas unitarias/integracion y documentacion operativa.

**Criterios de aceptacion:**
- [x] Existe un tercer Flow publicado y separado de autoagendamiento y campanas.
- [x] El paciente solo puede escoger una cita propia consultada en HUN y horarios del mismo procedimiento.
- [x] La especialidad y procedimiento provienen de la cita original; no pueden seleccionarse manualmente.
- [x] La cita original permanece activa hasta confirmar la nueva cita.
- [x] La modificacion solo se informa como exitosa despues de verificar la cancelacion original.
- [x] Los reintentos o confirmaciones duplicadas no crean mas de una nueva cita ni repiten la cancelacion original.
- [x] Un fallo despues de asignar la nueva cita queda como revision manual y advierte la posible doble reserva.
- [x] Supabase no guarda documento plano, numero de cita, medico, fecha/hora, procedimiento ni payload HUN completo.
- [x] Existen pruebas para cupo perdido, asignacion rechazada, cancelacion fallida, reinicio e idempotencia.

**Evidencia:** Flow Meta `1055273933723521`, `flow-reagendamiento.json` publicado y health check exitoso, confirmados por el usuario el 2026-07-14. Implementacion en `lib/rescheduleHandler.js`, `lib/inboundRouter.js`, `lib/flowHandler.js`, `server.js`, `lib/db.js`, `supabase/007_reschedule_operation_states.sql`, `.env.example`, `README.md`, `SETUP_LOCAL_CHECKLIST.md` y `scripts/check-reschedule-flow.js`. Verificaciones ejecutadas: `node --check` para JS modificados, `node scripts/check-reschedule-flow.js`, `node scripts/check-inbound-router.js`, `node scripts/check-sensitive-persistence.js` y `npm.cmd test`. Correccion visual del 2026-07-19: nueva version de `flow-reagendamiento.json` publicada en Meta y confirmada por el usuario; `node --check lib/rescheduleHandler.js`, `node --check scripts/check-reschedule-flow.js`, `node scripts/check-reschedule-flow.js`, `npm.cmd test` y `git diff --check` exitosos.
**Notas:** Aprobado por el usuario el 2026-07-14. Variables `RESCHEDULE_FLOW_ID` y `RESCHEDULE_FLOW_SCREEN_ID` configuradas en Render antes de iniciar cambios dependientes. La saga aprobada asigna/confirma primero la nueva cita y cancela/verifica despues la original. El proceso usa tokens opacos con TTL, idempotencia no reversible, estados agregados no sensibles y revision manual si falla la cancelacion despues de crear la nueva cita. Ajuste 2026-07-19: se corrigio la referencia dinamica de procedimiento para que `TextBody.text` sea completamente dinamico; el backend entrega el rotulo `Procedimiento: ...` y reutiliza nombre/codigo de la cita original cuando la agenda no trae descripcion. Las pruebas ahora rechazan propiedades que mezclen texto estatico con `${data.*}` o `${form.*}`.

---

### RESCH-003 - Separar seleccion de fecha y hora en reagendamiento

**Estado:** `done`
**Labels:** `feature`, `backend`, `flow`, `testing`
**Depende de:** RESCH-002
**Desbloquea:** QA-001

**Microsteps:**
- [x] Publicar `flow-reagendamiento.json` con `FECHA_REAGENDAMIENTO`, Dropdown de fechas y modelo de rutas aciclico.
- [x] Eliminar el recorte global que ocultaba fechas posteriores.
- [x] Agrupar todos los cupos equivalentes por fecha y generar `resdate_v1` firmado.
- [x] Reconsultar HUN al seleccionar fecha y mostrar solo los horarios de ese dia.
- [x] Permitir cambiar de fecha mediante la navegacion nativa de regreso del Flow.
- [x] Reconsultar HUN al seleccionar hora y antes de confirmar la modificacion.
- [x] Mantener fecha, hora, procedimiento y candidatos exclusivamente en memoria temporal.
- [x] Agregar pruebas con mas de veinte cupos en el primer dia y disponibilidad en fechas posteriores.

**Criterios de aceptacion:**
- [x] Todas las fechas con cupos equivalentes dentro de la ventana HUN aparecen en el Dropdown.
- [x] Un dia con mas de veinte horarios no oculta dias posteriores.
- [x] La pantalla de horas contiene exclusivamente cupos de la fecha seleccionada.
- [x] El usuario puede regresar y consultar otra fecha dentro de la misma sesion.
- [x] Fecha y slot se validan mediante tokens opacos y reconsulta HUN.
- [x] El `routing_model` es aciclico y fue aceptado por Meta.
- [x] Supabase no guarda fecha, hora, procedimiento, medico, documento, numero de cita ni slots completos.
- [x] La saga e idempotencia de RESCH-002 permanecen cubiertas por pruebas.

**Evidencia:** `flow-reagendamiento.json` corregido, aprobado y publicado en Meta por el usuario el 2026-07-19; implementacion en `lib/rescheduleHandler.js`; pruebas en `scripts/check-reschedule-flow.js`; documentacion en `README.md`, `PLAN_SPRINTS_AGENDAMIENTO_HUN.md` y `.project-tracking/DECISIONS.md`; `node --check` exitoso; prueba especifica de reagendamiento exitosa; `npm.cmd test` completo exitoso; `git diff --check` sin errores. Correccion operativa del 2026-07-19: `expires_at` se convierte a ISO antes de persistir el estado temporal y la prueba de regresion valida todas las escrituras de sesion.
**Notas:** Meta rechazo inicialmente las autorutas de fecha y horarios por ciclo en `routing_model`. El plan se ajusto a rutas aciclicas: el cambio de fecha usa la flecha nativa y cada dia muestra todos sus horarios en una sola pantalla. En Render se detecto que el estado temporal enviaba milisegundos crudos a una columna `timestamptz`; la operacion continuaba en memoria, pero la persistencia fallaba. El valor ahora se normaliza igual que las operaciones de saga. Aprobado por el usuario el 2026-07-19.

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
**Depende de:** CORE-007, FLOW-004, CAMPAIGN-003, CANCEL-002, RESCH-002, RESCH-003, INTAKE-002, NOTIF-001
**Desbloquea:** QA-002, DOCS-001

**Microsteps:**
- [ ] Listar casos de prueba por modulo y endpoint, separando autoagendamiento y demanda inducida.
- [ ] Marcar casos que crean/cancelan citas como permitidos en el entorno HUN de pruebas y revalidables antes de produccion.
- [ ] Definir datos de prueba autorizados.
- [ ] Definir resultado esperado y evidencia por caso.
- [ ] Clasificar cada caso por gate: `DEV_READY`, `MVP_TEST_READY` o `CONTRACT_READY`.
- [ ] Crear plantilla de reporte de ejecucion.

**Criterios de aceptacion:**
- [ ] La matriz cubre agendamiento, confirmacion, cancelacion, campanas, recordatorios y logs.
- [ ] La matriz cubre dos Flows separados: autoagendamiento y demanda inducida.
- [ ] La matriz valida que campanas no permitan seleccion manual de especialidad.
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
- [ ] Resumir evidencia de agendamiento, confirmacion, cancelacion, campanas, Flow de demanda inducida y notificaciones.
- [ ] Documentar limitaciones tecnicas y operativas encontradas.
- [ ] Listar requerimientos funcionales futuros.
- [ ] Listar requerimientos no funcionales futuros.
- [ ] Adjuntar evidencia de API real de demanda inducida/orquestador configurada o waiver formal si queda pendiente.
- [ ] Adjuntar evidencia de proveedor/API de correo definido o waiver formal si queda solo interfaz placeholder.
- [ ] Adjuntar evidencia de dos Flow IDs separados en Meta y de plantilla de campana aprobada.
- [ ] Documentar que la version de campana sin identificacion queda pendiente hasta ampliacion del API orquestador, si aplica.
- [ ] Clasificar el cierre alcanzado como `DEV_READY`, `MVP_TEST_READY` o `CONTRACT_READY`.
- [ ] Preparar version final para revision del supervisor.

**Criterios de aceptacion:**
- [ ] El informe final cubre todos los modulos contractuales.
- [ ] Las pruebas modificadoras quedan ejecutadas o documentadas contra la API HUN de pruebas controlada.
- [ ] Las dependencias externas obligatorias tienen evidencia real o waiver formal documentado.
- [ ] El informe incluye evidencia de `FLOW_ID` de autoagendamiento, `CAMPAIGN_FLOW_ID` de demanda inducida y plantilla de campana aprobada.
- [ ] Si la campana v1 pide identificacion minima por limitacion del API, queda documentado como restriccion aprobada y trabajo futuro.
- [ ] El informe no declara `CONTRACT_READY` si quedan mocks/placeholders obligatorios sin aprobacion formal.
- [ ] El trabajo futuro incluye adjuntos/autorizaciones, portal administrativo, analitica y hardening.
- [ ] El documento esta listo para entregar al supervisor.

**Evidencia:**
**Notas:**

---

## Sprint 8 - API de campanas para panel del hospital

Plan fuente: `PLAN_PANEL_CAMPANAS_API.md`. Contrato a implementar: `INSTRUCTIVO_PANEL_CAMPANAS.md` (ante duda, gana el instructivo). Leer la seccion "Contexto obligatorio para el desarrollador" del plan antes de iniciar cualquier ticket de este sprint.

---

### PANEL-001 - Crear migracion de referencia_externa en campanas

**Estado:** `done`
**Labels:** `database`, `chore`
**Depende de:** -
**Desbloquea:** PANEL-002, PANEL-011

**Microsteps:**
- [x] Crear `supabase/008_campaign_external_ref.sql`.
- [x] Agregar `alter table public.campanas add column if not exists referencia_externa text;`.
- [x] Agregar un indice unico parcial: `create unique index if not exists idx_campanas_referencia_externa on public.campanas(referencia_externa) where referencia_externa is not null;` (parcial para permitir multiples campanas sin referencia, como las creadas manualmente hasta hoy).
- [x] Encabezar el archivo con un comentario SQL que explique el proposito (idempotencia de creacion desde el panel administrativo) y que no incorpora datos personales, siguiendo el estilo de las migraciones previas.
- [x] Mencionar la migracion en la seccion Supabase de `README.md` junto a las migraciones 004/006/007 ya listadas (una linea).

**Criterios de aceptacion:**
- [x] El archivo `supabase/008_campaign_external_ref.sql` existe y es idempotente (usa `if not exists` en columna e indice).
- [x] Dos campanas con `referencia_externa = null` pueden coexistir; dos con el mismo valor no nulo violan el indice.
- [x] `README.md` menciona la migracion 008 como requisito para usar el API del panel.

**Evidencia:** `supabase/008_campaign_external_ref.sql` y seccion Supabase de `README.md`. Migracion remota `campaign_external_ref` aplicada al proyecto Supabase activo `agendamiento-HUN`. Prueba transaccional remota confirmo columna `text` nullable, coexistencia de dos referencias nulas, rechazo por unicidad de una referencia no nula duplicada y rollback de todos los registros de prueba. `npm.cmd test` completo exitoso.
**Notas:** Aprobado por el usuario el 2026-07-14. La CLI local de Supabase no esta instalada; el archivo se creo con el nombre exacto aprobado por el plan y la migracion se aplico mediante el conector Supabase. Los asesores no reportaron hallazgos nuevos asociados a PANEL-001; permanecen observaciones preexistentes para SEC-001 sobre vistas `security definer`, `search_path`, funcion privilegiada y ausencia de politicas RLS.

---

### PANEL-002 - Agregar helpers de consulta de campanas y contadores en db.js

**Estado:** `done`
**Labels:** `backend`, `database`
**Depende de:** PANEL-001
**Desbloquea:** PANEL-004, PANEL-005, PANEL-006, PANEL-007, PANEL-008, PANEL-011

**Microsteps:**
- [x] En `lib/db.js`, crear `obtenerCampana(campaignId)`: select de `campanas` por `id` con columnas `id, nombre, especialidad_codigo, estado, responsable, cupos_objetivo, origen_datos, referencia_externa, created_at`; usar `.maybeSingle()` y devolver el registro o `null`.
- [x] Crear `obtenerCampanaPorReferenciaExterna(referenciaExterna)`: mismo select filtrando por `referencia_externa`; devolver `null` si el argumento viene vacio (usar el helper interno `cleanText`).
- [x] Crear `contarDestinatariosCampana(campaignId)`: select de `campana_destinatarios` filtrando por `campaign_id`, trayendo solo `estado_contacto` y `motivo_exclusion`, y agregar en JS un objeto `{ total, pendientes, enviados, fallidos, flow_iniciados, agendados, no_interesados, excluidos }` mas `fallos_por_motivo` (mapa `motivo_exclusion -> conteo` solo de los registros con `estado_contacto = "fallido"`). Los estados `entregado`, `leido` y `respondido` existen en `DESTINATARIO_ESTADOS` pero no se reportan por separado en v1: sumarlos dentro de `enviados`.
- [x] Crear `campanaAdmiteDestinatarios(estado)` y `campanaAdmiteLanzamiento(estado)` como helpers puros exportados (o exportar `CAMPANA_ESTADOS` y decidir en el router; elegir una sola via y ser consistente). Reglas: admite destinatarios si el estado NO es `cerrada` ni `cancelada`; admite lanzamiento si el estado es `borrador`, `programada` o `activa`.
- [x] Extender `buildCampanaRecord` para aceptar y limpiar `referencia_externa` (usar `cleanText`; opcional).
- [x] Exportar las funciones nuevas en el `module.exports` del modulo y tambien bajo `_private` las que sean puras, siguiendo el patron ya usado (`buildCampanaRecord` esta en `_private`).

**Criterios de aceptacion:**
- [x] `obtenerCampana` devuelve `null` para un id inexistente y el registro completo para uno existente.
- [x] `obtenerCampanaPorReferenciaExterna(null)` y `("")` devuelven `null` sin consultar Supabase.
- [x] `contarDestinatariosCampana` devuelve todos los contadores en cero (y `fallos_por_motivo` vacio) para una campana sin destinatarios, sin lanzar excepcion.
- [x] Con Supabase no configurado (`supabase = null`), todas las funciones nuevas devuelven `null` o contadores vacios sin lanzar excepcion.
- [x] `crearCampana` persiste `referencia_externa` cuando se le pasa.

**Evidencia:** `lib/db.js`, `scripts/check-campaign-db.js`, `scripts/check-campaign-model.js`, `package.json`; `node --check` exitoso para `lib/db.js` y el check nuevo; `node scripts/check-campaign-db.js` exitoso; `npm.cmd test` completo exitoso. Consulta remota de solo lectura al proyecto Supabase `agendamiento-HUN` confirmo las nueve columnas seleccionadas de `campanas` y estados agregables existentes en `campana_destinatarios`.
**Notas:** Aprobado por el usuario el 2026-07-14. Los helpers aceptan un cliente opcional solo para pruebas, conservando el cliente Supabase real por defecto. Sin configuracion devuelven valores seguros; un error real al contar devuelve `null` para permitir que PANEL-007 distinga indisponibilidad de una campana sin destinatarios. Solo se consultan columnas operativas permitidas y no se incorporan datos personales ni detalles de cita. Ajuste post-revision (2026-07-14 22:06): `contarDestinatariosCampana` ahora devuelve `{ contadores, fallos_por_motivo }` como claves hermanas, calzando exactamente con la respuesta del GET del contrato (INSTRUCTIVO_PANEL_CAMPANAS.md seccion 5.4); asi PANEL-007 arma la respuesta con spread directo sin riesgo de anidar `fallos_por_motivo` dentro de `contadores`. `scripts/check-campaign-db.js` actualizado a la nueva forma; `npm.cmd test` completo exitoso tras el ajuste.

---

### PANEL-003 - Crear router /api/campanas con autenticacion por API key

**Estado:** `done`
**Labels:** `backend`, `api`, `auth`, `security`
**Depende de:** -
**Desbloquea:** PANEL-004, PANEL-005, PANEL-006, PANEL-007, PANEL-008, PANEL-011

**Microsteps:**
- [x] Crear `lib/campaignAdminApi.js` exportando `function createCampaignAdminRouter(deps = {})` que devuelve un `express.Router()`; aceptar `deps` (`dbClient`, `sender`, `demanda`, `env`) con defaults a los modulos reales, siguiendo el patron de inyeccion de `createCampaignSender` en `lib/campaignSender.js`.
- [x] Implementar middleware de autenticacion: leer `env.PANEL_CAMPAIGN_API_KEY`; si la variable no esta configurada, responder `503 { error: "panel_api_no_configurada", detalle: ... }` (el servicio no debe quedar abierto por omision); si el header `x-api-key` falta o no coincide, responder `401 { error: "no_autorizado", detalle: "x-api-key invalida o ausente" }`. Comparar con `crypto.timingSafeEqual` sobre buffers de igual longitud (si difieren en longitud, rechazar sin comparar).
- [x] Definir las cinco rutas del contrato (`POST /`, `POST /:campaignId/destinatarios`, `POST /:campaignId/lanzar`, `GET /:campaignId`, `POST /:campaignId/cancelar`) respondiendo `501` como placeholder.
- [x] Agregar un manejador de errores del router (middleware de 4 argumentos) que loguee `console.error("campaignAdminApi:", error.message)` sin datos de pacientes y responda `500 { error: "error_interno", detalle: "error inesperado" }`.
- [x] En `server.js`, importar el modulo y montar `app.use("/api/campanas", createCampaignAdminRouter())` antes de `app.listen`, con un comentario corto en el estilo de los existentes ("// 5. API administrativa de campanas para el panel del hospital.").
- [x] Nunca loguear la API key ni el header recibido.

**Criterios de aceptacion:**
- [x] Cualquier llamada a `/api/campanas/*` sin header `x-api-key` devuelve `401` con el formato de error uniforme.
- [x] Con `PANEL_CAMPAIGN_API_KEY` sin configurar, toda llamada devuelve `503` (nunca procesa).
- [x] Con la llave correcta, las cinco rutas responden (aunque sea `501`).
- [x] La comparacion de llave usa `crypto.timingSafeEqual`.
- [x] `GET /` y `POST /webhook` y `/flow-endpoint` existentes siguen funcionando (el router nuevo no intercepta otras rutas).

**Evidencia:** `lib/campaignAdminApi.js`, `server.js`, `scripts/check-campaign-admin-api.js`, `package.json`; `node --check` exitoso para router, check y servidor; `node scripts/check-campaign-admin-api.js` exitoso con servidor HTTP efimero; `npm.cmd test` completo exitoso. El check cubre API no configurada `503`, llave ausente o invalida `401`, las cinco rutas autenticadas `501` y aislamiento de `/`, `/webhook` y `/flow-endpoint`.
**Notas:** Aprobado por el usuario el 2026-07-14. La API queda cerrada por defecto mientras `PANEL_CAMPAIGN_API_KEY` no este configurada. La llave y el header nunca se imprimen. En este ticket no se configura una llave real ni en local ni en Render; los endpoints funcionales se implementan desde PANEL-004 y la variable se documenta formalmente en PANEL-011. Ajuste post-revision (2026-07-14 22:06): se agrego `asyncHandler` (Express 4 no encamina promesas rechazadas de handlers async al middleware de error; sin el wrapper el request queda colgado) y se extrajo `errorHandler` como funcion nombrada exportada en `_private`. Regla obligatoria: toda ruta real de PANEL-004..008 se registra envuelta en `asyncHandler`. `scripts/check-campaign-admin-api.js` gano un caso que verifica 500 `error_interno` ante un handler async que lanza; `npm.cmd test` completo exitoso tras el ajuste.

---

### PANEL-004 - Implementar POST /api/campanas (crear campana idempotente)

**Estado:** `done`
**Labels:** `backend`, `api`, `feature`
**Depende de:** PANEL-002, PANEL-003
**Desbloquea:** PANEL-010, PANEL-011

**Microsteps:**
- [x] En la ruta `POST /` del router, validar el body: `nombre` obligatorio (string no vacio tras trim); `cupos_objetivo` opcional pero, si viene, entero `>= 0`; `referencia_externa`, `especialidad_codigo`, `responsable`, `origen_datos` opcionales (strings). Ante violacion responder `422 { error: "validacion", detalle: "<campo y problema>" }`.
- [x] Si viene `referencia_externa`, consultar `db.obtenerCampanaPorReferenciaExterna`; si existe, responder `200 { campaign_id, referencia_externa, estado }` con los datos del registro existente, sin crear nada.
- [x] Llamar `db.crearCampana` con `{ nombre, especialidad_codigo, responsable, cupos_objetivo, origen_datos, referencia_externa, estado: "borrador" }`.
- [x] Si `crearCampana` devuelve `null` (Supabase caido o no configurado), responder `503 { error: "persistencia_no_disponible", detalle: ... }`.
- [x] Manejar la carrera de idempotencia: si el insert falla por unicidad de `referencia_externa` (dos llamadas simultaneas), reconsultar por referencia y responder `200` con la existente.
- [x] Responder `201 { campaign_id, referencia_externa, estado: "borrador" }`.

**Criterios de aceptacion:**
- [x] Body sin `nombre` devuelve `422`; `cupos_objetivo: -1` o `"abc"` devuelve `422`.
- [x] Primera llamada con `referencia_externa` nueva devuelve `201` con `campaign_id` (uuid) y `estado: "borrador"`.
- [x] Segunda llamada identica devuelve `200` con el MISMO `campaign_id` y no crea una segunda fila.
- [x] Llamada sin `referencia_externa` crea siempre una campana nueva (`201`).
- [x] La respuesta nunca incluye campos no documentados en el instructivo.

**Evidencia:** `lib/campaignAdminApi.js`, `scripts/check-campaign-admin-api.js`; `node --check` exitoso para ambos archivos; `node scripts/check-campaign-admin-api.js` exitoso; `npm.cmd test` completo exitoso. El check HTTP verifica `201` de creacion, `200` idempotente con el mismo UUID, dos creaciones distintas sin referencia, validaciones `422`, persistencia no disponible `503`, reconsulta de carrera por indice unico, respuesta con exactamente tres claves y descarte de un campo extra `telefono` antes de llamar a persistencia.
**Notas:** Aprobado por el usuario el 2026-07-14. Se respeto la correccion post-revision de PANEL-003: el handler real esta registrado con `asyncHandler` y conserva `errorHandler`. La carrera se resuelve reconsultando por `referencia_externa` cuando `crearCampana` no retorna un id; si tampoco existe una campana ganadora, responde `503`. No se crearon filas remotas de prueba ni se configuro una API key real.

---

### PANEL-005 - Implementar POST /api/campanas/:id/destinatarios (carga por lotes)

**Estado:** `done`
**Labels:** `backend`, `api`, `feature`
**Depende de:** PANEL-002, PANEL-003
**Desbloquea:** PANEL-010, PANEL-011

**Microsteps:**
- [x] En la ruta `POST /:campaignId/destinatarios`, consultar `db.obtenerCampana(campaignId)`; si no existe responder `404 { error: "campana_no_encontrada", detalle: ... }`.
- [x] Si el estado de la campana es `cerrada` o `cancelada`, responder `409 { error: "estado_no_admite_destinatarios", detalle: "estado actual: <estado>" }`.
- [x] Validar el body: `destinatarios` debe ser un arreglo no vacio con maximo 500 elementos; si no, `422` (mensajes distintos para "falta el arreglo", "arreglo vacio" y "mas de 500").
- [x] Mapear cada elemento a `{ id_anonimo, cod_especialidad_requerida }` tomando los alias que `normalizeAudienceRecord` ya acepta, descartando explicitamente cualquier otra propiedad del objeto recibido (proteccion contra PII accidental).
- [x] Llamar `demanda.sincronizarAudienciaCampana({ campaignId, records })` y responder `200` con `{ campaign_id, total, aceptados, guardados, duplicados, rechazados, errores, detalles_rechazados }` tal cual devuelve el resumen (los `detalles_rechazados` ya tienen `{ index, motivo, campos }`).
- [x] Si `errores > 0` y `guardados === 0` con Supabase caido, responder `503 { error: "persistencia_no_disponible" }` en lugar de `200` (distinguir "todo fallo por infraestructura" de "algunos registros invalidos").

**Criterios de aceptacion:**
- [x] Cargar el mismo lote dos veces produce `duplicados` en la segunda llamada y no duplica filas en `campana_destinatarios`.
- [x] Un registro sin `cod_especialidad_requerida` aparece en `detalles_rechazados` con su `index` y no aborta el resto del lote.
- [x] Lote de 501 elementos devuelve `422` sin procesar ninguno.
- [x] `campaign_id` inexistente devuelve `404`; campana `cancelada` devuelve `409`.
- [x] Un registro que incluya campos extra (por ejemplo `nombre` o `telefono`) se procesa usando solo los dos campos permitidos y ningun campo extra llega a Supabase.

**Evidencia:** `lib/campaignAdminApi.js`, `lib/demandaInducida.js`, `lib/db.js`, `scripts/check-campaign-admin-api.js`, `scripts/check-campaign-db.js`; `node --check` exitoso para archivos modificados; checks focalizados `check-campaign-db`, `check-campaign-audience` y `check-campaign-admin-api` exitosos; `npm.cmd test` completo exitoso. El check HTTP cubre lote mixto valido/invalido, aliases, descarte de nombre/telefono/correo, segunda carga reportada como duplicada, tres validaciones `422` distintas, `404`, `409` y fallo total de persistencia `503`.
**Notas:** Aprobado por el usuario el 2026-07-14. La ruta real conserva el `asyncHandler` obligatorio. `guardarDestinatarioCampana` devuelve metadata interna `duplicate` y no actualiza una fila existente, evitando que una recarga restablezca a `pendiente` un destinatario ya avanzado. `sincronizarAudienciaCampana` deduplica por `audiencia_ref` dentro de la campana y trata un retorno nulo de persistencia como error operativo. No se hicieron llamadas remotas ni se crearon filas de prueba en Supabase. Ajustes post-revision (2026-07-14 23:19): (a) el `503 persistencia_no_disponible` del lote exige ahora `duplicados === 0` ademas de `guardados === 0`, para no reportar caida total cuando una recarga de duplicados sufre un unico error transitorio; (b) `detalles_rechazados` se sanitiza con `buildRejectionDetail` y expone solo `index`, `motivo`, `campos` y `error_code`, sin el flag interno `ok` (contrato seccion 5.2). `scripts/check-campaign-admin-api.js` gano el caso duplicados+error transitorio -> 200; `npm.cmd test` completo exitoso tras el ajuste. La semantica de deduplicacion por `campaign_id + id_anonimo` quedo registrada como decision formal en DECISIONS.md (2026-07-14), incluyendo el punto de coordinacion pendiente con el hospital sobre `id_anonimo` por necesidad de cita.

---

### PANEL-006 - Implementar POST /api/campanas/:id/lanzar con envio en segundo plano

**Estado:** `done`
**Labels:** `backend`, `api`, `feature`
**Depende de:** PANEL-002, PANEL-003
**Desbloquea:** PANEL-010, PANEL-011

**Microsteps:**
- [x] Crear en `lib/campaignAdminApi.js` un `Map` a nivel de modulo (`lanzamientosEnCurso`) con `campaignId -> true` como lock; documentar con un comentario que asume instancia unica de Render.
- [x] En la ruta `POST /:campaignId/lanzar`: consultar la campana (`404` si no existe); si el estado no es `borrador`, `programada` ni `activa`, responder `409 { error: "estado_no_admite_lanzamiento", detalle: "estado actual: <estado>" }`; si el lock esta tomado, responder `409 { error: "lanzamiento_en_curso" }`.
- [x] Validar `limite` del body: opcional, entero entre 1 y 500, default 500; si es invalido responder `422`.
- [x] Validar la configuracion efectiva de Flow, plantilla, orquestador, WhatsApp y secreto de token antes de aceptar un envio real; responder `503 { error: "envio_no_configurado" }` sin tomar lock ni invocar el sender si falta algun requisito.
- [x] Contar elegibles con `db.listarDestinatariosPendientesCampana(campaignId, limite)`; si la lista esta vacia, responder `200 { campaign_id, estado: <estado actual>, destinatarios_a_procesar: 0 }` sin cambiar estado ni tomar lock.
- [x] Tomar el lock, llamar `db.actualizarEstadoCampana(campaignId, "enviando")` y responder `202 { campaign_id, estado: "enviando", destinatarios_a_procesar: <n> }`.
- [x] Ejecutar el envio despues de responder (funcion async lanzada sin `await`, por ejemplo via `setImmediate`): `sender.enviarOfertasCampania({ campaignId, limit: limite })`; envolver TODO en try/catch/finally.
- [x] En el `finally`: liberar el lock y llamar `db.actualizarEstadoCampana(campaignId, "activa")` (tambien si el envio fallo a mitad: los destinatarios ya quedaron marcados individualmente `enviado`/`fallido` por `campaignSender`, y el estado `activa` permite relanzar los pendientes restantes). En el `catch`: loguear `console.error` con el mensaje del error, sin telefonos ni payloads.
- [x] Registrar un evento operativo agregado al terminar el bloque via `db.guardarEventoOperativo` con `event_type: "campaign_launch"`, `campaign_id`, `status: "exitosa"|"fallida"` y `resultado_operativo` con los totales (`enviados`/`fallidos` numericos), sin datos personales.

**Criterios de aceptacion:**
- [x] `POST lanzar` responde `202` en menos de 2 segundos aun con muchos destinatarios (el envio no bloquea la respuesta).
- [x] Segunda llamada a `lanzar` mientras el envio corre devuelve `409 { error: "lanzamiento_en_curso" }`.
- [x] Al terminar el envio, la campana queda en estado `activa` y el lock liberado (una tercera llamada ya no da `409` por lock).
- [x] Lanzar una campana sin pendientes devuelve `200` con `destinatarios_a_procesar: 0` y NO la deja en `enviando`.
- [x] Si `enviarOfertasCampania` lanza una excepcion, la campana igual termina en `activa`, el lock queda liberado y el proceso Node no muere (sin unhandled rejection).
- [x] Relanzar una campana `activa` solo procesa destinatarios en `pendiente` (comportamiento ya garantizado por `listarDestinatariosPendientesCampana`; verificarlo en el check).
- [x] Campana `cancelada` o `cerrada` devuelve `409`.
- [x] Configuracion de envio incompleta devuelve `503` sin ejecutar el sender; fallo al persistir `enviando` devuelve `503` y libera el lock.

**Evidencia:** `lib/campaignAdminApi.js`, `scripts/check-campaign-admin-api.js`; `node --check` exitoso; check HTTP focalizado exitoso; `npm.cmd test` completo exitoso en dos ejecuciones. La prueba valida `202` inmediato, limite default/explicito e invalidos, doble lanzamiento `409`, transicion `enviando -> activa`, relanzamiento de pendientes, cero pendientes `200`, recuperacion tras excepcion sin unhandled rejection, estados cerrada/cancelada, configuracion faltante `503`, persistencia inicial fallida `503`, evento agregado y ausencia de PII/resultados individuales.
**Notas:** Aprobado por el usuario el 2026-07-14. El lock es un `Map` compartido por los routers del proceso y sigue la decision vigente de instancia unica en Render; PANEL-008 reutilizara el mismo lock. El resultado agregado se persiste como JSON textual con solo contadores numericos porque `eventos_operativos.resultado_operativo` es columna `text`. Los codigos de error se limitan a identificadores tecnicos seguros. No se enviaron mensajes reales, no se lanzaron campanas y no se hicieron cambios en Meta, Render ni Supabase.

---

### PANEL-007 - Implementar GET /api/campanas/:id (estado y contadores)

**Estado:** `done`
**Labels:** `backend`, `api`, `feature`
**Depende de:** PANEL-002, PANEL-003
**Desbloquea:** PANEL-010, PANEL-011

**Microsteps:**
- [x] En la ruta `GET /:campaignId`, consultar `db.obtenerCampana`; `404` si no existe.
- [x] Llamar `db.contarDestinatariosCampana(campaignId)`.
- [x] Armar la respuesta exactamente con la forma del instructivo: `{ campaign_id, referencia_externa, nombre, estado, contadores: { total, pendientes, enviados, fallidos, flow_iniciados, agendados, no_interesados, excluidos }, fallos_por_motivo, actualizado_en }` donde `actualizado_en` es `new Date().toISOString()` (momento de la consulta).
- [x] Verificar que la respuesta no incluya nada mas del registro (ni `mensaje_template_id` ni otros internos): construir el objeto a mano, no hacer spread del row.
- [x] Si `contarDestinatariosCampana` devuelve `null` por Supabase caido, responder `503 { error: "persistencia_no_disponible" }`.

**Criterios de aceptacion:**
- [x] Campana recien creada sin destinatarios devuelve todos los contadores en `0` y `fallos_por_motivo: {}`.
- [x] Tras un lanzamiento con fallos, `fallos_por_motivo` refleja los `motivo_exclusion` de los destinatarios `fallido` (por ejemplo `{ "telefono_invalido": 2 }`).
- [x] `campaign_id` inexistente devuelve `404`.
- [x] La respuesta contiene exactamente las claves documentadas en el instructivo, sin extras.

**Evidencia:** `lib/campaignAdminApi.js`, `scripts/check-campaign-admin-api.js`; `node --check` exitoso; check HTTP focalizado exitoso antes y despues de la auditoria de campos internos; `npm.cmd test` completo exitoso. Las pruebas cubren campana vacia con ceros, timestamp ISO, fallos agrupados `{ telefono_invalido: 2 }`, `404`, conteo indisponible `503` y descarte de columnas/campos internos tanto del registro de campana como del resumen de conteo.
**Notas:** Aprobado por el usuario el 2026-07-14. Se respeto la nota previa: la respuesta consume la correccion post-revision de PANEL-002 con `{ contadores, fallos_por_motivo }` como claves hermanas y la ruta usa `asyncHandler`. Para cumplir la prohibicion de extras, en lugar de propagar el objeto completo se construyen manualmente las ocho claves superiores y los ocho contadores; los valores no enteros o negativos se normalizan a cero. El endpoint es de solo lectura y no se hicieron consultas remotas, escrituras en Supabase ni cambios en Meta o Render.

---

### PANEL-008 - Implementar POST /api/campanas/:id/cancelar

**Estado:** `done`
**Labels:** `backend`, `api`, `feature`
**Depende de:** PANEL-002, PANEL-003
**Desbloquea:** PANEL-010, PANEL-011

**Microsteps:**
- [x] En la ruta `POST /:campaignId/cancelar`, consultar la campana; `404` si no existe.
- [x] Si ya esta `cancelada`, responder `200 { campaign_id, estado: "cancelada" }` (idempotente).
- [x] Si esta `cerrada`, responder `409 { error: "estado_no_admite_cancelacion" }`.
- [x] Si hay un lanzamiento en curso (lock de PANEL-006 tomado), responder `409 { error: "lanzamiento_en_curso", detalle: "esperar a que el envio termine antes de cancelar" }`.
- [x] Llamar `db.actualizarEstadoCampana(campaignId, "cancelada")` y responder `200 { campaign_id, estado: "cancelada" }`.
- [x] Registrar evento operativo `event_type: "campaign_cancel"` con `campaign_id` y `status: "exitosa"`.

**Criterios de aceptacion:**
- [x] Cancelar una campana `borrador` o `activa` la deja en `cancelada` y responde `200`.
- [x] Cancelar dos veces responde `200` ambas veces sin error.
- [x] Tras cancelar, `POST lanzar` sobre esa campana devuelve `409` y `POST destinatarios` devuelve `409`.
- [x] Cancelar durante un lanzamiento en curso devuelve `409` sin cambiar el estado.

**Evidencia:** `lib/campaignAdminApi.js`, `scripts/check-campaign-admin-api.js`; `node --check` exitoso para ambos archivos; check HTTP focalizado exitoso; `npm.cmd test` completo exitoso. Las pruebas cubren cancelacion de campanas `borrador` y `activa`, respuesta idempotente sin segunda escritura/evento, campana cerrada `409`, ID inexistente `404`, cancelacion durante lanzamiento `409` sin cambio de estado, bloqueo posterior de lanzamiento y carga de destinatarios, preservacion de destinatarios, persistencia fallida `503`, liberacion del lock y fallo no bloqueante del evento operativo.
**Notas:** Aprobado por el usuario el 2026-07-14. La ruta usa `asyncHandler` y reutiliza el lock compartido de PANEL-006; ademas reserva ese lock durante la escritura de cancelacion para impedir que un lanzamiento se interponga entre la validacion y el cambio de estado. La cancelacion solo actualiza `campanas.estado`: no muta destinatarios, no retira mensajes enviados y no toca citas HUN. El evento `campaign_cancel` contiene solo identificadores y estado operativos; si su escritura falla despues de cancelar, el panel conserva la respuesta `200`. No se hicieron llamadas remotas ni cambios en Supabase, Meta o Render. Ajuste post-revision (2026-07-14 23:19): el `409 estado_no_admite_cancelacion` incluye ahora `detalle`, cumpliendo el formato uniforme de error del contrato (seccion 9); check actualizado y `npm.cmd test` completo exitoso.

---

### PANEL-009 - Actualizar estado del destinatario desde el Flow (flow_iniciado, agendado)

**Estado:** `done`
**Labels:** `backend`, `feature`
**Depende de:** -
**Desbloquea:** PANEL-011

**Microsteps:**
- [x] En `lib/flowHandler.js`, funcion `pasoIdentificacionCampania` (aprox. linea 1336): despues de guardar la sesion y el evento exitoso (el evento ya lleva `estado_contacto: "flow_iniciado"`), llamar `db.actualizarEstadoDestinatario(campaignContext.recipient_id, "flow_iniciado")` cuando `campaignContext.recipient_id` exista. Envolver en try/catch: un fallo de este update NO debe romper el Flow del paciente (loguear y continuar).
- [x] En `lib/flowHandler.js`, funcion `asignarYConfirmar` (aprox. linea 1830): en la rama exitosa (despues de `db.finalizarSesionTemporal(flowToken, "completado", ...)`), si `session.recipient_id` existe, llamar `db.actualizarEstadoDestinatario(session.recipient_id, "agendado")` con el mismo criterio de try/catch no bloqueante.
- [x] Verificar que en la sesion runtime creada por `pasoIdentificacionCampania` el campo `recipient_id` ya se guarda (linea aprox. 1399: si) y que `asignarYConfirmar` recibe esa `session` — no persistir nada nuevo.
- [x] No tocar el recorrido de autoagendamiento ni el de reagendamiento: ambos updates deben ejecutarse solo cuando hay contexto de campana (`recipient_id` presente).
- [x] Extender `scripts/check-flow-campaign.js` (o el check existente que cubra `pasoIdentificacionCampania`) con un caso que verifique la llamada a `actualizarEstadoDestinatario` con `"flow_iniciado"`, usando el patron de mocks del propio script.

**Criterios de aceptacion:**
- [x] Al completar la pantalla IDENTIFICACION del Flow de campana, el destinatario pasa a `estado_contacto = "flow_iniciado"` en Supabase.
- [x] Al crearse la cita en HUN desde el Flow de campana, el destinatario pasa a `estado_contacto = "agendado"`.
- [x] Si el update a Supabase falla, el paciente igual recibe sus pantallas y su confirmacion (el Flow no se rompe).
- [x] Un agendamiento por autoagendamiento normal (sin campana) no llama `actualizarEstadoDestinatario`.
- [x] `node scripts/check-flow-campaign.js` pasa con el caso nuevo.

**Evidencia:** `lib/flowHandler.js`, `scripts/check-flow-campaign.js`, `scripts/check-flow-confirmation.js`; `node --check` exitoso para los tres archivos; checks focalizados de Flow de campana y confirmacion exitosos; `npm.cmd test` completo exitoso. Las pruebas verifican transiciones `flow_iniciado` y `agendado` con el `recipient_id` correcto, continuidad completa hasta confirmacion WhatsApp cuando Supabase devuelve `null` o lanza excepcion, y cero llamadas a `actualizarEstadoDestinatario` desde autoagendamiento.
**Notas:** Aprobado por el usuario el 2026-07-14. Se agrego un helper no bloqueante que solo actua cuando la sesion runtime contiene `recipient_id`; registra un mensaje tecnico sin identificadores ni datos del paciente si la actualizacion no se confirma. `flow_iniciado` se actualiza despues del evento exitoso de identificacion y `agendado` despues de que HUN crea la cita y la sesion temporal se finaliza. No se agregaron columnas ni persistencia nueva: `recipient_id` ya formaba parte del contexto runtime de campana. Autoagendamiento y reagendamiento conservan su recorrido porque no tienen ese contexto. No se hicieron escrituras remotas ni cambios en Supabase, Meta o Render.

---

### PANEL-010 - Crear script de verificacion check-campaign-api.js

**Estado:** `done`
**Labels:** `testing`
**Depende de:** PANEL-004, PANEL-005, PANEL-006, PANEL-007, PANEL-008
**Desbloquea:** PANEL-011

**Microsteps:**
- [x] Construir mocks: `dbClient` en memoria (mapa de campanas y destinatarios con las funciones usadas por el router), `sender` que registra llamadas y devuelve un resumen fijo, `demanda.sincronizarAudienciaCampana` real (es pura respecto a `dbClient` inyectado) o falsa.
- [x] Casos de autenticacion: sin header -> 401; llave incorrecta -> 401; sin `PANEL_CAMPAIGN_API_KEY` en env -> 503.
- [x] Casos de creacion: `201` con body valido; `422` sin nombre; idempotencia por `referencia_externa` (`200` con mismo id).
- [x] Casos de destinatarios: lote valido con resumen correcto; lote de 501 -> `422`; campana cancelada -> `409`; registro con PII extra no llega al `dbClient` (inspeccionar lo guardado).
- [x] Casos de lanzamiento: `202` inmediato y llamada al `sender` con el `campaignId` y `limit` correctos; doble lanzamiento -> `409`; sin pendientes -> `200` con `destinatarios_a_procesar: 0`; excepcion del `sender` -> campana termina `activa` y lock liberado (usar un sender que rechaza y esperar el drain con `await new Promise(setImmediate)` o similar).
- [x] Casos de consulta y cancelacion: `GET` con contadores del mock; `404` por id inexistente; cancelar idempotente; lanzar tras cancelar -> `409`.
- [x] Registrar el script en la seccion de smoke tests del `README.md` si los demas checks estan listados alli (verificar convencion).

**Criterios de aceptacion:**
- [x] `node scripts/check-campaign-api.js` termina con exit code 0 e imprime un `OK` por caso.
- [x] Ningun caso hace llamadas de red reales ni requiere `.env` con secretos (el env se inyecta en el test).
- [x] Cubre como minimo: 401, 503 por llave ausente, 201/200 idempotente, 422 por lote grande, 409 por doble lanzamiento, drenaje del envio en segundo plano y liberacion del lock ante excepcion.

**Evidencia:** `scripts/check-campaign-api.js`, `scripts/check-campaign-admin-api.js`, `package.json`, `README.md`; `node --check` exitoso para ambos scripts; `node scripts/check-campaign-api.js` exitoso con 15 escenarios `OK`; comando historico `node scripts/check-campaign-admin-api.js` exitoso; `npm.cmd test` completo exitoso usando la nueva entrada canonica. La cobertura incluye autenticacion `401/503`, creacion `201/200/422`, carga y filtrado de PII, lote de 501, estados cancelados, lanzamiento asincrono/doble/vacio, recuperacion del sender, consulta/404 y cancelacion idempotente.
**Notas:** Aprobado por el usuario el 2026-07-14. `check-campaign-api.js` reutiliza el runner y los mocks exhaustivos existentes en `check-campaign-admin-api.js`, que ahora exporta `runCampaignApiChecks` y conserva ejecucion directa para compatibilidad. Esto evita duplicar mas de mil lineas de fixtures y assertions. El check levanta servidores efimeros solo en `127.0.0.1`, inyecta API key y dependencias falsas, y no consulta HUN, Meta, Supabase, Render ni variables secretas de `.env`. README registra el comando en Smoke tests y `npm test` ejecuta la entrada nueva. No se realizaron operaciones remotas.

---

### PANEL-011 - Actualizar documentacion y tracking del proyecto

**Estado:** `done`
**Labels:** `docs`, `chore`
**Depende de:** PANEL-001, PANEL-002, PANEL-003, PANEL-004, PANEL-005, PANEL-006, PANEL-007, PANEL-008, PANEL-009, PANEL-010
**Desbloquea:**

**Microsteps:**
- [x] `README.md`: agregar las rutas nuevas a la tabla de endpoints, `PANEL_CAMPAIGN_API_KEY` a la seccion de variables de entorno, y una subseccion corta "API del panel de campanas" que remita a `INSTRUCTIVO_PANEL_CAMPANAS.md`.
- [x] `.env.example`: agregar `PANEL_CAMPAIGN_API_KEY=` con comentario de que es la llave compartida con el panel del hospital.
- [x] `.project-tracking/STATUS.md`: registrar los tickets PANEL-001..011 con su estado y evidencia (comando de check ejecutado), siguiendo el formato de los tickets existentes.
- [x] `.project-tracking/DECISIONS.md`: registrar tres decisiones: (a) lanzamiento asincrono con polling en lugar de webhook, (b) lock en memoria valido solo con instancia unica de Render y su plan de migracion, (c) idempotencia por `referencia_externa`.
- [x] Revisar que `INSTRUCTIVO_PANEL_CAMPANAS.md` siga coincidiendo con lo implementado (codigos HTTP, formas de respuesta); si hubo desviaciones durante el desarrollo, corregir el instructivo y anotarlas.

**Criterios de aceptacion:**
- [x] `README.md` documenta los 5 endpoints y la variable `PANEL_CAMPAIGN_API_KEY`.
- [x] `.env.example` incluye la variable nueva sin valor real.
- [x] `STATUS.md` refleja los tickets PANEL con evidencia verificable.
- [x] `DECISIONS.md` registra las tres decisiones tecnicas.
- [x] No hay discrepancias entre el instructivo y la implementacion final.

**Evidencia:** `README.md`, `.env.example`, `INSTRUCTIVO_PANEL_CAMPANAS.md`, `AGENTS.md`, `.project-tracking/DECISIONS.md`, `.project-tracking/STATUS.md`; verificacion documental automatizada exitosa para las cinco rutas, variable vacia y tres decisiones; `node scripts/check-campaign-api.js` exitoso con 15 escenarios `OK`; `npm.cmd test` completo exitoso; `git -c safe.directory=C:/Users/carlo/Desktop/agendamiento-HUN diff --check` exitoso.
**Notas:** Aprobado por el usuario el 2026-07-14. Las tres decisiones tecnicas ya estaban registradas en `DECISIONS.md` y se verificaron vigentes tras la implementacion, sin crear entradas duplicadas. Se corrigio el instructivo para documentar con precision autenticacion, errores de persistencia, idempotencia de cancelacion y codigos `404`, `409`, `422` y `503` por ruta. README y AGENTS reflejan la API administrativa y la persistencia ya minimizada. No se agregaron secretos ni se hicieron llamadas remotas o cambios en Supabase, Meta o Render. `ADMIN-001` no fue iniciado.

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
