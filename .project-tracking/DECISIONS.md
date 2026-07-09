# Decisiones tecnicas - Agendamiento HUN por WhatsApp

Registro de decisiones que afectan la arquitectura, el stack o el comportamiento del sistema.
Solo se registran aqui decisiones que no estaban resueltas en el documento tecnico original
o que surgen durante el desarrollo.

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

<!-- Las entradas se agregan aqui durante el desarrollo con este formato:

## [YYYY-MM-DD] Titulo breve de la decision

**Ticket relacionado:** ID del ticket
**Decision:** que se decidio hacer
**Motivo:** por que se tomo esta decision
**Alternativas descartadas:** que otras opciones se consideraron y por que no se eligieron
**Impacto:** que otros tickets o componentes se ven afectados

-->
