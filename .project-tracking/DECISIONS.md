# Decisiones tecnicas - Agendamiento HUN por WhatsApp

Registro de decisiones que afectan la arquitectura, el stack o el comportamiento del sistema.
Solo se registran aqui decisiones que no estaban resueltas en el documento tecnico original
o que surgen durante el desarrollo.

---

## [2026-07-19] Resolver descripciones CUPS con catalogo oficial local

**Ticket relacionado:** CORE-007
**Decision:** Cuando la agenda HUN omita el nombre del procedimiento, el backend resolvera el codigo contra un catalogo local generado desde el Anexo Tecnico 2 de la Resolucion 2706 de 2025, vigencia 2026. La prioridad sera `descripcion HUN -> alias HUN -> catalogo CUPS`. Un codigo desconocido se omitira y nunca se mostrara con un texto generico.
**Motivo:** La respuesta real de agenda para dermatologia entrega `890242` y `890342` con `descripcion: null`, aunque el contrato documentado anuncia ese campo. El endpoint alternativo de disponibilidad tampoco aporta el nombre. Mostrar `Procedimiento disponible` crea opciones indistinguibles y puede llevar al paciente a escoger un servicio equivocado.
**Alternativas descartadas:** Depender de otro endpoint HUN en cada interaccion; descartado porque el endpoint disponible tambien omite la descripcion y agregaria latencia. Mostrar el codigo CUPS; descartado por experiencia de usuario y por la decision de no exponerlo. Mantener el fallback generico; descartado por ambiguedad.
**Impacto:** `lib/cupsCatalog.js` centraliza la resolucion; `lib/hun.js` normaliza los procedimientos; `lib/flowHandler.js` omite opciones desconocidas y registra solo conteos agregados. El catalogo es una dependencia versionada que debe actualizarse cuando cambie la vigencia CUPS. No cambia `flow-agendamiento.json` ni la politica de minimizacion.

---

## [2026-07-19] Mostrar procedimiento, fecha y hora por etapas en autoagendamiento

**Ticket relacionado:** CORE-006
**Decision:** El autoagendamiento sigue la ruta `IDENTIFICACION -> ESPECIALIDAD -> PROCEDIMIENTO -> FECHA -> SLOTS -> CONFIRMAR -> FINAL`. El paciente ve solamente el nombre del procedimiento. El codigo CUPS se usa internamente para deduplicar procedimientos, firmar la seleccion y filtrar la agenda, pero no se muestra ni se persiste. Cada seleccion se valida mediante token opaco firmado y reconsulta HUN.
**Motivo:** Una especialidad puede publicar varios procedimientos y concentrar numerosos horarios en un mismo dia. Seleccionar primero el procedimiento y despues separar fecha/hora evita ambiguedad y permite acceder a toda la disponibilidad sin saturar una pantalla.
**Alternativas descartadas:** Mostrar codigo CUPS; descartado porque no aporta valor al paciente. Mantener una lista global de horarios; descartado porque oculta fechas posteriores. Persistir la seleccion completa en Supabase; descartado por minimizacion de datos.
**Impacto:** `flow-agendamiento.json` incorpora `PROCEDIMIENTO` y `FECHA`; `lib/flowHandler.js` genera tokens `procedure_v1` y `date_v1`, reconsulta HUN en cada etapa y mantiene la disponibilidad solo en memoria. El Flow de campana conserva su recorrido directo y el Flow de reagendamiento no cambia.

---

## [2026-07-19] Separar fecha y hora sin ciclos en el Flow de reagendamiento

**Ticket relacionado:** RESCH-003
**Decision:** El reagendamiento muestra primero un `Dropdown` con todos los dias que tienen cupos equivalentes y despues los horarios del dia elegido. No se recorta la disponibilidad antes de agrupar por fecha. Como Meta exige un `routing_model` aciclico, el cambio de fecha usa la navegacion nativa de regreso y los horarios de cada dia se muestran en una sola pantalla, sin autorutas ni paginacion ciclica.
**Motivo:** El recorte global de horarios ocultaba fechas posteriores cuando el primer dia concentraba muchos cupos. Declarar autorutas para paginar fue rechazado por el validador de Meta por formar ciclos.
**Alternativas descartadas:** Mantener una lista global limitada; descartado porque oculta dias disponibles. Declarar `FECHA_REAGENDAMIENTO -> FECHA_REAGENDAMIENTO` o `SLOTS_REAGENDAMIENTO -> SLOTS_REAGENDAMIENTO`; descartado porque Meta no permite ciclos en el modelo de rutas. Crear un numero fijo de pantallas de paginacion; descartado porque introduce un limite artificial y complica el regreso a otra fecha.
**Impacto:** `flow-reagendamiento.json` incorpora `FECHA_REAGENDAMIENTO`; `lib/rescheduleHandler.js` genera `resdate_v1`, reconsulta HUN al elegir fecha y hora y mantiene los candidatos solo en memoria. Supabase conserva exclusivamente estados agregados y tokens opacos permitidos.

---

## [2026-07-14] Usar un tercer Flow para modificar citas existentes

**Ticket relacionado:** RESCH-002
**Decision:** La modificacion de citas usa `flow-reagendamiento.json` y `RESCHEDULE_FLOW_ID`, separados de autoagendamiento y demanda inducida. El paciente se identifica, selecciona una cita HUN existente y recibe solo slots autogestionables cuyo codigo de procedimiento coincide exactamente con `Cod_Pro` de la cita original.
**Motivo:** El reagendamiento tiene estado, riesgos y operaciones diferentes a crear una cita nueva. Separarlo evita que el paciente cambie manualmente especialidad/procedimiento y permite aplicar la saga aprobada sin contaminar los otros Flows.
**Alternativas descartadas:** Reutilizar el Flow de autoagendamiento; descartado porque permite elegir especialidad y no conserva referencia a la cita original. Implementar todo por mensajes conversacionales; descartado porque la seleccion de cita y horario requiere un formulario consistente y el proyecto eligio WhatsApp Flows para procesos de agendamiento.
**Impacto:** `server.js` debe enviar el tercer Flow despues del consentimiento y la seleccion `Modificar cita`; `lib/flowHandler.js` debe enrutar pantallas exclusivas; HUN sigue siendo fuente de verdad y Supabase solo guarda estados agregados e IDs no reversibles. Flow Meta publicado con ID `1055273933723521`.

---

## [2026-07-14] Reagendar mediante asignacion confirmada y cancelacion posterior

**Ticket relacionado:** RESCH-001
**Decision:** Como HUN no expone endpoint especifico de reagendamiento, la modificacion se disenara como una saga: asignar y confirmar primero la nueva cita, solicitar despues la cancelacion de la cita original, verificar esa cancelacion y confirmar la modificacion al paciente solo cuando ambas operaciones esten cerradas exitosamente.
**Motivo:** Mantener la cita original hasta confirmar el horario alternativo evita que el paciente pierda su reserva por un fallo o una carrera al asignar el nuevo cupo.
**Alternativas descartadas:** Cancelar primero y asignar despues; descartado porque puede dejar al paciente sin ninguna cita. Informar exito al confirmar solo la nueva cita; descartado porque la original podria continuar activa. Tratar ambas llamadas como transaccion atomica; descartado porque HUN no ofrece endpoint conjunto, reserva temporal ni rollback.
**Impacto:** La implementacion debe reutilizar `slot_token`, reconsulta HUN, idempotencia y verificacion asincronica. Una cancelacion original fallida puede producir doble reserva temporal y exige mensaje explicito y conciliacion manual. Supabase solo conservara estado agregado no sensible; los numeros de cita y datos del paciente permaneceran en memoria con TTL.

---

## [2026-06-27] Usar API HUN como fuente de verdad

**Ticket relacionado:** -
**Decision:** La API HUN sera la fuente de verdad para paciente, disponibilidad, cita creada, cita cancelada y estado de cita.
**Motivo:** Los documentos establecen que Supabase no sera repositorio clinico ni de citas y que HUN conserva el estado oficial.
**Alternativas descartadas:** Persistir citas o estados clinicos en Supabase; descartado por minimizacion y confidencialidad.
**Impacto:** Afecta CORE-001, CORE-003, CORE-004, CORE-005, CANCEL-001, CANCEL-002, NOTIF-001, ADMIN-001 y SEC-001.

---

## [2026-06-27] Minimizar Supabase a estado operativo no sensible

**Ticket relacionado:** SETUP-002, SETUP-005
**Decision:** Supabase solo guardara campanas, destinatarios minimos, sesiones temporales, notificaciones y eventos tecnicos no sensibles.
**Motivo:** El contrato exige confidencialidad y los documentos prohiben guardar nombre, documento plano, EPS, medico, fecha/hora, CUPS, numero de cita y payloads HUN completos.
**Alternativas descartadas:** Usar Supabase como base de pacientes, citas o historial; descartado por riesgo de datos sensibles y contradiccion con la arquitectura aprobada.
**Impacto:** Bloquea el trabajo funcional hasta cerrar SETUP-005 y afecta todos los tickets que tocan Supabase o Flow state.

---

## [2026-06-27] Usar WhatsApp Cloud API con WhatsApp Flows data_exchange

**Ticket relacionado:** FLOW-001
**Decision:** El canal principal sera WhatsApp Cloud API con WhatsApp Flows y endpoint data_exchange cifrado.
**Motivo:** Es el canal conversacional aprobado en el plan y permite que el paciente complete identificacion, seleccion y confirmacion desde WhatsApp.
**Alternativas descartadas:** Implementar solo mensajes conversacionales sin Flow; descartado porque el plan eligio Flows para el agendamiento.
**Impacto:** Afecta SETUP-001, FLOW-001, FLOW-002, FLOW-003, CORE-003, CORE-004 y CORE-005.

---

## [2026-06-27] Mantener Node Express como base tecnica con refactor temprano

**Ticket relacionado:** SETUP-005
**Decision:** El backend Node/Express actual se conserva, pero debe refactorizarse temprano para eliminar persistencia sensible en Supabase.
**Motivo:** Los documentos identifican que la base actual ya contiene integracion Meta, HUN, Flow y Supabase, pero requiere corregir almacenamiento sensible antes de ampliar funcionalidad.
**Alternativas descartadas:** Reescribir el backend desde cero; no esta definido en los documentos y no fue elegido como ruta del plan.
**Impacto:** Afecta lib/db.js, lib/flowHandler.js, CORE-002, CORE-003, campanas, notificaciones, cancelacion y reportes.

---

## [2026-06-27] Leer audiencia de demanda inducida desde API oficial HUN

**Ticket relacionado:** CAMPAIGN-002
**Decision:** La fuente oficial para audiencia de campanas sera un API oficial del hospital; si no esta disponible, se usara adaptador/mock contractual con los campos acordados.
**Motivo:** El usuario aprobo que Supabase no sea fuente de datos sensibles y que solo se persistan destinatarios minimos para contactar la campana.
**Alternativas descartadas:** Cargar y persistir pacientes completos en Supabase; descartado por minimizacion.
**Impacto:** Afecta CAMPAIGN-001, CAMPAIGN-002, CAMPAIGN-003 y DOCS-002.

---

## [2026-07-06] Separar Flow de demanda inducida y resolver contacto por id_anonimo

**Ticket relacionado:** CAMPAIGN-001, CAMPAIGN-002, FLOW-004, CAMPAIGN-003
**Decision:** El autoagendamiento y las campanas de demanda inducida usaran Flows separados. Para campanas, Supabase guarda solo `audiencia_ref` / `id_anonimo`, especialidad y estado operativo; el telefono y contexto se resuelven en memoria contra el API orquestador antes del envio. El Flow de campana v1 pedira identificacion minima porque el resolver actual no entrega documento, EPS/codigo ni especialidad en codigos HUN suficientes para asignar sin pedir identificacion.
**Motivo:** La campana debe abrir una experiencia mas corta y controlada por la especialidad objetivo, sin exponer seleccion manual de especialidad ni guardar datos sensibles en Supabase.
**Alternativas descartadas:** Reutilizar el Flow de autoagendamiento para campanas; descartado porque obliga a pedir especialidad y mezcla dos recorridos. Persistir telefono/contexto del orquestador en Supabase; descartado por minimizacion. Mapear textos de servicio/EPS a codigos para omitir identificacion; descartado por fragilidad hasta que el API entregue codigos oficiales.
**Impacto:** Afecta CAMPAIGN-001, CAMPAIGN-002, FLOW-004, CAMPAIGN-003, QA-001, DOCS-001 y DOCS-002. `CAMPAIGN-003` queda bloqueado hasta cerrar `FLOW-004`.

---

## [2026-07-08] Permitir campanas multi-especialidad por destinatario

**Ticket relacionado:** CAMPAIGN-001, CAMPAIGN-002, CAMPAIGN-003, ADMIN-001
**Decision:** `campanas.especialidad_codigo` deja de ser obligatorio. Una campana puede representar una cohorte operativa amplia, como PQRS de una EPS, y cada destinatario debe traer su propia `especialidad_codigo` en `campana_destinatarios`.
**Motivo:** Las campanas reales pueden agrupar pacientes de muchas especialidades. Obligar una especialidad global en la campana impide operar cohortes como "PQRS Sanitas" y distorsiona la trazabilidad.
**Alternativas descartadas:** Crear una campana separada por especialidad; descartado porque fragmenta una misma cohorte operativa y dificulta medir conversion global. Permitir que el paciente elija especialidad en el Flow de campana; descartado porque la campana debe dirigir a la especialidad requerida por el caso.
**Impacto:** El envio de campana debe firmar el `flow_token` con la especialidad del destinatario. Los reportes deben calcular conversion global por campana y desglose por `campana_destinatarios.especialidad_codigo`.

---

## [2026-07-08] Exigir menu inicial y consentimiento antes de acciones sensibles

**Ticket relacionado:** INTAKE-001, CANCEL-001, QA-001
**Decision:** Todo mensaje entrante por WhatsApp abre primero un menu con opciones de agendar, consultar citas proximas o modificar/cancelar. Antes de consultar HUN o abrir un Flow de gestion de citas, el paciente debe aceptar el consentimiento aprobado de tratamiento de datos. Si rechaza, el bot no continua y lo dirige a la linea `(601) 3904888 atencion al usuario`.
**Motivo:** El canal debe separar intencion, consentimiento y ejecucion para no consultar ni gestionar datos de salud sin autorizacion explicita dentro de la conversacion.
**Alternativas descartadas:** Enviar el Flow de agendamiento ante cualquier mensaje entrante; descartado porque no diferencia la intencion del paciente ni pide consentimiento previo. Persistir el consentimiento en Supabase; descartado por minimizacion mientras no exista requerimiento formal de auditoria legal.
**Impacto:** Afecta `server.js`, `lib/inboundRouter.js`, `lib/whatsapp.js`, `CANCEL-001`, `QA-001` y las pruebas de webhook. El estado de menu/consentimiento es efimero en memoria con TTL y no guarda telefono, documento ni citas en Supabase.

---

## [2026-06-27] Condicionar correo transaccional a proveedor aprobado

**Ticket relacionado:** NOTIF-002
**Decision:** No se implementara envio real de correo hasta que HUN defina SMTP, API institucional o proveedor externo aprobado; mientras tanto solo se permite interfaz/adaptador placeholder.
**Motivo:** El proveedor de correo sigue pendiente en los documentos y no debe bloquear el flujo principal de WhatsApp.
**Alternativas descartadas:** Asumir un proveedor sin aprobacion; descartado por falta de definicion operativa y credenciales oficiales.
**Impacto:** Afecta NOTIF-001, NOTIF-002, QA-001 y DOCS-002.

---

## [2026-06-30] Permitir correo solo como contacto cifrado transitorio

**Ticket relacionado:** SETUP-002, SETUP-005, NOTIF-001, NOTIF-002
**Decision:** El Flow puede capturar correo para confirmacion, pero Supabase solo puede guardarlo en `flow_sesiones_temporales` como `contacto_email_enc`, `contacto_email_hmac` y `contacto_email_expires_at`; nunca como correo plano ni como perfil permanente de paciente.
**Motivo:** El correo es necesario para confirmaciones, pero debe mantenerse la minimizacion aprobada y evitar datos personales permanentes fuera de HUN.
**Alternativas descartadas:** Guardar `correo` en `pacientes_whatsapp`, `campana_destinatarios` o `notificaciones`; descartado porque ampliaria persistencia personal y mezclaria datos de contacto con trazabilidad operativa.
**Impacto:** SETUP-005 debe cifrar/descifrar el correo solo en memoria, limpiar el dato al cerrar la sesion y agregar pruebas contra correo plano. NOTIF-002 debe usar el correo descifrado solo al enviar y no registrar direccion ni cuerpo completo en `notificaciones`.

---

## [2026-07-09] Usar correo del orquestador para confirmacion de campanas

**Ticket relacionado:** NOTIF-002, CAMPAIGN-003, FLOW-004
**Decision:** Si el API orquestador devuelve `correo`, el backend lo usara para confirmacion transaccional de citas creadas desde Flow de campana. El correo se normaliza, se cifra dentro del `flow_token` firmado de campana y se recupera solo al iniciar la sesion para enviarlo por el proveedor configurado.
**Motivo:** Las campanas no piden correo en el Flow, pero el orquestador ya resuelve contacto junto con telefono. Usar ese correo evita pedir un dato adicional al paciente y mantiene la minimizacion aprobada.
**Alternativas descartadas:** Guardar correo en `campana_destinatarios`, `notificaciones` o eventos; descartado porque ampliaria persistencia personal. Enviar correo plano dentro del `flow_token`; descartado porque el token no debe exponer datos personales legibles.
**Impacto:** Afecta `lib/demandaInducida.js`, `lib/campaignSender.js`, `lib/flowHandler.js`, `NOTIF-002` y pruebas de campana. El correo no queda en Supabase salvo cifrado transitorio de sesion cuando aplica.

---

## [2026-07-09] Priorizar especialidad del orquestador en campanas

**Ticket relacionado:** CAMPAIGN-003, FLOW-004
**Decision:** Para enviar campanas, si el orquestador devuelve `cod_especialidad_requerida` / `especialidad_codigo`, esa especialidad prima sobre `campana_destinatarios.especialidad_codigo`. La especialidad en Supabase queda como respaldo operativo cuando el orquestador no la entrega.
**Motivo:** La especialidad pertenece al paciente/destinatario resuelto por el orquestador, no a la campana global. Evita duplicar o desactualizar la especialidad en Supabase.
**Alternativas descartadas:** Usar siempre la especialidad guardada en Supabase; descartado porque puede contradecir el dato fresco del orquestador. Obligar especialidad global en `campanas`; descartado por campanas multi-especialidad.
**Impacto:** Afecta `lib/campaignSender.js`, pruebas de envio de campana y la operacion de carga de destinatarios. Si no hay especialidad ni en orquestador ni en Supabase, el destinatario falla con `especialidad_faltante`.

---

## [2026-06-27] Separar reportes por perfil medico operativo e IT auditoria

**Ticket relacionado:** ADMIN-001
**Decision:** La trazabilidad administrativa tendra una vista medica/operativa y una vista IT/auditoria con campos minimos no sensibles.
**Motivo:** Los documentos recomiendan separar necesidades clinico-operativas de diagnostico tecnico para minimizar exposicion de datos.
**Alternativas descartadas:** Una vista unica con todos los datos; descartada por exceso de exposicion y baja claridad operativa.
**Impacto:** Afecta CORE-002, ADMIN-001, ADMIN-002, SEC-001 y DOCS-001.

---

## [2026-06-27] Distinguir gates DEV_READY MVP_TEST_READY y CONTRACT_READY

**Ticket relacionado:** QA-001, DOCS-002
**Decision:** El plan distingue desarrollo con mocks/placeholders, MVP probado contra HUN/WhatsApp y cierre contractual sin simulaciones obligatorias salvo waiver formal.
**Motivo:** Evita declarar cumplimiento contractual cuando todavia dependan componentes obligatorios de mocks o placeholders.
**Alternativas descartadas:** Tratar el funcionamiento con mocks como cierre contractual; descartado por riesgo de incumplimiento.
**Impacto:** Afecta CAMPAIGN-002, NOTIF-002, QA-001, DEPLOY-001 y DOCS-002.

---

## [2026-07-14] Exponer API REST autenticada con lanzamiento asincrono para el panel del hospital

**Ticket relacionado:** PANEL-003, PANEL-006, PANEL-007
**Decision:** El panel administrativo del hospital creara y lanzara campanas contra endpoints REST del backend (`/api/campanas/*`) autenticados con header `x-api-key` (`PANEL_CAMPAIGN_API_KEY`). El lanzamiento responde `202` de inmediato y ejecuta el envio en segundo plano; el panel consulta avance por polling de `GET /api/campanas/{id}` con estado y contadores. El contrato completo esta en `INSTRUCTIVO_PANEL_CAMPANAS.md`.
**Motivo:** El envio de ofertas es secuencial contra WhatsApp (minutos para cientos de destinatarios) y una respuesta sincrona se cortaria en Render. La API key servidor-a-servidor replica el patron ya usado con el orquestador y es suficiente para un unico consumidor confiable.
**Alternativas descartadas:** Webhook de "campana terminada" hacia el panel; pospuesto a fase 2 para no acoplar el MVP a un endpoint del hospital. Acceso directo del panel a Supabase; descartado porque expone la service role key y rompe la frontera de minimizacion. Respuesta sincrona del lanzamiento; descartada por timeouts de plataforma.
**Impacto:** Afecta `server.js`, `lib/campaignAdminApi.js` (nuevo), `lib/campaignSender.js`, PANEL-003..008, PANEL-010, QA-001 y DOCS-001. Reemplaza el lanzamiento manual por `scripts/send-campaign-offers.js`, que queda como herramienta de contingencia.

---

## [2026-07-14] Usar lock en memoria para lanzamientos, valido solo con instancia unica

**Ticket relacionado:** PANEL-006, PANEL-008
**Decision:** El bloqueo anti doble-lanzamiento por campana sera un `Map` en memoria del proceso Node. Mientras el lock este tomado, `lanzar` y `cancelar` responden `409 lanzamiento_en_curso`.
**Motivo:** Render corre una sola instancia del servicio en el plan actual; un lock en memoria es suficiente y evita introducir infraestructura de coordinacion para el MVP.
**Alternativas descartadas:** Lock persistido en Supabase con estado `enviando` como semaforo; descartado en v1 porque un crash del proceso dejaria la campana bloqueada sin proceso que la libere, y exigiria logica de expiracion. Colas externas (Redis/worker); descartadas por sobredimensionadas para el volumen actual.
**Impacto:** Si el servicio escala a mas de una instancia, el lock deja de proteger y debe migrarse a un semaforo persistente con TTL (registrado como limitacion en el plan `PLAN_PANEL_CAMPANAS_API.md`). Un reinicio del proceso durante un envio deja la campana en `enviando` hasta intervencion; el relanzamiento posterior solo procesa pendientes, por lo que no hay riesgo de doble contacto.

---

## [2026-07-14] Idempotencia de creacion de campanas por referencia_externa

**Ticket relacionado:** PANEL-001, PANEL-004
**Decision:** La tabla `campanas` gana la columna `referencia_externa` (unica cuando no es nula, migracion `supabase/008_campaign_external_ref.sql`). El panel envia su propio id de campana en ese campo; si `POST /api/campanas` recibe una referencia ya registrada, devuelve `200` con la campana existente en lugar de crear un duplicado.
**Motivo:** El panel puede reintentar la creacion por timeouts o arranque en frio de Render; sin llave de idempotencia cada reintento crearia una campana duplicada con destinatarios repartidos.
**Alternativas descartadas:** Header `Idempotency-Key` generico con tabla de deduplicacion; descartado por complejidad frente a una referencia de negocio que el panel ya posee. Deduplicar por `nombre`; descartado porque los nombres operativos pueden repetirse legitimamente entre cohortes.
**Impacto:** Afecta `supabase/008_campaign_external_ref.sql`, `lib/db.js` (`buildCampanaRecord`, `obtenerCampanaPorReferenciaExterna`) y el contrato de `POST /api/campanas`. Las campanas creadas manualmente (sin referencia) siguen funcionando con `referencia_externa = null`.

---

## [2026-07-14] Deduplicar destinatarios de campana por campaign_id + id_anonimo

**Ticket relacionado:** PANEL-005 (ajusta el comportamiento original de CAMPAIGN-002)
**Decision:** Un destinatario de campana es unico por `campaign_id + id_anonimo`. Al cargar un lote, un `id_anonimo` ya existente en la campana se reporta como `duplicado` y no modifica la fila existente (ni especialidad ni `estado_contacto`). La deduplicacion en memoria de `sincronizarAudienciaCampana` usa `audiencia_ref` como llave unica, alineada con el indice `ux_destinatarios_campaign_audiencia_ref` de la migracion 004 y con el contrato del panel (INSTRUCTIVO_PANEL_CAMPANAS.md seccion 5.2).
**Motivo:** La deduplicacion previa por `id_anonimo:especialidad` solo existia en el filtro en memoria del lote: la base de datos siempre tuvo unicidad por `(campaign_id, audiencia_ref)` (migracion 004), y el segundo registro con otra especialidad hacia UPDATE silencioso de la fila existente, sobrescribiendo la especialidad y regresando `estado_contacto` a `pendiente`, lo que habilitaba re-contactos de pacientes ya atendidos. Ademas, `id_anonimo` referencia una necesidad de cita del orquestador (`get-appointment/{id_anonimo}` devuelve fecha, servicio y especialidad), no un paciente: un paciente con dos necesidades de especialidades distintas llega como dos `id_anonimo` distintos, por lo que el caso multi-especialidad no requiere filas duplicadas.
**Alternativas descartadas:** Permitir dos filas por paciente con unicidad `(campaign_id, audiencia_ref, especialidad_codigo)`; descartado porque exige migracion, cambio del contrato seccion 5.2 y del indice unico que el hospital ya replico, y aun asi no lograria el objetivo: al enviar, la especialidad del orquestador prima sobre la de Supabase (decision 2026-07-09), asi que ambas filas producirian dos mensajes ofreciendo la misma especialidad y hasta dos citas si el paciente abre ambos Flows. Mantener el UPDATE de la fila existente en recargas; descartado por el reset de `estado_contacto` a `pendiente` (re-contacto) y por reportar como `guardado` lo que el contrato define como `duplicado`.
**Impacto:** Afecta `lib/demandaInducida.js` (`source_key = audiencia_ref`), `lib/db.js` (`guardarDestinatarioCampana` devuelve `{ id, duplicate }` y no actualiza filas existentes), PANEL-005 y los checks de campana. Una recarga de lote no actualiza la especialidad de respaldo en Supabase; el dato fresco lo aporta el orquestador al enviar. Queda pendiente de coordinacion (agenda seccion 11 del instructivo): confirmar con el hospital que su orquestador emite un `id_anonimo` por necesidad de cita, no por paciente — es la suposicion que sostiene el caso multi-especialidad.

---

<!-- Las entradas se agregan aqui durante el desarrollo con este formato:

## [YYYY-MM-DD] Titulo breve de la decision

**Ticket relacionado:** ID del ticket
**Decision:** que se decidio hacer
**Motivo:** por que se tomo esta decision
**Alternativas descartadas:** que otras opciones se consideraron y por que no se eligieron
**Impacto:** que otros tickets o componentes se ven afectados

-->
