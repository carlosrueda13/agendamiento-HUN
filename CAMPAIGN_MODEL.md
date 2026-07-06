# Modelo de campanas y destinatarios

## Alcance

`CAMPAIGN-001` define el modelo operativo minimo para campanas de oferta de citas y demanda inducida. Supabase conserva solo estado no sensible; HUN sigue siendo la fuente de verdad para pacientes, agenda, cita creada, cancelacion y estado.

Actualizacion aprobada: las campanas de demanda inducida usan un Flow separado del autoagendamiento. Para estas campanas, Supabase guarda `audiencia_ref` / `id_anonimo` como referencia operativa principal. El telefono y el contexto del paciente se resuelven en memoria contra el API orquestador justo antes del envio, sin persistir esos datos.

## Campanas

Tabla: `campanas`

Campos operativos:

- `nombre`: identificador visible de la campana.
- `especialidad_codigo`: especialidad objetivo.
- `mensaje_template_id`: plantilla de WhatsApp asociada.
- `campaign_flow_id`: Flow de demanda inducida asociado, distinto del Flow de autoagendamiento.
- `estado`: ciclo operativo de la campana.
- `origen_datos`: fuente de audiencia, por ejemplo API oficial HUN o mock contractual.
- `responsable`: equipo o persona responsable de operar la campana.
- `cupos_objetivo`: meta operativa agregada.
- conteos agregados: destinatarios, enviados, respondidos, flows iniciados, agendados y fallidos.

Estados permitidos:

- `borrador`
- `programada`
- `enviando`
- `activa`
- `cerrada`
- `cancelada`

## Destinatarios

Tabla: `campana_destinatarios`

Campos minimos:

- `campaign_id`
- `audiencia_ref` / `id_anonimo`
- `especialidad_codigo`
- `estado_contacto`
- `opt_out`
- `motivo_exclusion`

Campos legacy o transitorios:

- `whatsapp_numero`: no debe ser obligatorio para campanas nuevas; si se usa por compatibilidad, no debe convertirse en perfil permanente.
- `tipo_documento` y `documento_hash`: no deben ser obligatorios para campanas nuevas. En la version actual del Flow de campana, el documento puede pedirse dentro del Flow por limitacion del API orquestador, pero no se persiste como documento plano.

Estados permitidos:

- `pendiente`
- `enviado`
- `entregado`
- `leido`
- `respondido`
- `flow_iniciado`
- `agendado`
- `no_interesado`
- `fallido`
- `excluido`

## Reglas de minimizacion

No se guarda en campanas ni destinatarios:

- nombre del paciente
- telefono resuelto por el orquestador
- correo
- numero de documento plano
- EPS
- medico
- fecha u hora de cita
- CUPS o procedimiento
- numero de cita
- payload completo HUN
- payload completo del orquestador

El resultado `agendado` se guarda solo como estado operativo del destinatario o evento agregado. La cita real y sus detalles viven en HUN.

## Flows separados

- Autoagendamiento usa `flow-agendamiento.json` y `FLOW_ID`.
- Demanda inducida usa un JSON separado, por ejemplo `flow-demanda-inducida.json`, y `CAMPAIGN_FLOW_ID`.
- El Flow de demanda inducida no permite seleccionar especialidad manualmente; la especialidad viene de la campana.
- Mientras el API orquestador no entregue documento, EPS/codigo y especialidad en codigos HUN suficientes para asignar, el Flow de campana v1 debe pedir identificacion minima y despues mostrar solo fecha/hora disponible.

## Opt-out y exclusion

- Si `opt_out = true`, el destinatario queda en `estado_contacto = excluido`.
- `motivo_exclusion` debe indicar `opt_out` o un motivo operativo simple.
- Los tickets de envio no deben contactar destinatarios con `opt_out = true` o `estado_contacto = excluido`.
- Las exclusiones no borran trazabilidad agregada, pero impiden nuevos intentos de contacto.
