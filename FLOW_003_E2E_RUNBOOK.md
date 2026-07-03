# FLOW-003 - Prueba end-to-end con asignacion real

## Estado actual

FLOW-003 no puede cerrarse hasta que la API HUN de pruebas exponga al menos un cupo con `cups[].autogestionable = si` y `agenda_detalle_id` presente.

Validacion del 2026-07-03:

- Se consultaron especialidades HUN contra la API de pruebas.
- Se amplio la ventana de agenda hasta `2027-07-03`.
- Solo se encontro agenda no vacia en `PSIQUIATRIA` (`codigo_especialidad = 590`).
- Los CUPS encontrados tienen `autogestionable = no`.
- Revalidacion posterior encontro `509` CUPS para `PSIQUIATRIA`: `26` pasados o invalidos y `483` futuros, con rango `2026-07-01` a `2026-08-27`.
- Se corrigio el backend para no ofrecer slots con fecha/hora pasada y para imprimir un resumen tecnico sanitizado cuando HUN rechaza una asignacion.
- El backend no debe ofrecer ni asignar cupos no autogestionables por requisito de CORE-004/CORE-005.

## Waiver temporal aprobado

El usuario aprobo una excepcion temporal solo para continuar `FLOW-003` en el entorno HUN de pruebas mientras no existan cupos autogestionables.

Variables requeridas en Render durante la prueba:

```text
FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE=true
FLOW_E2E_CANCEL_AFTER_ASSIGN=true
FLOW_E2E_TEST_DOCUMENTS=41531776
```

Condiciones del waiver:

- Solo aplica si `FLOW_E2E_ALLOW_NON_AUTOGESTIONABLE=true`.
- Solo aplica para documentos incluidos en `FLOW_E2E_TEST_DOCUMENTS`.
- La cita creada debe cancelarse automaticamente con `FLOW_E2E_CANCEL_AFTER_ASSIGN=true`.
- Al terminar la prueba, desactivar o eliminar las tres variables temporales.
- Esta evidencia no reemplaza la validacion contractual normal con cupos `autogestionable = si`.

## Precondicion externa requerida

Solicitar al responsable del ambiente HUN de pruebas una de estas opciones:

1. Habilitar al menos un cupo autogestionable en cualquier especialidad expuesta por `/webServiceAgenda/agenda`.
2. Confirmar una especialidad/codigo ya existente que tenga cupos con `cups[].autogestionable = si`.
3. Si HUN cambia la regla operativa, entregar aprobacion formal para probar con cupos no autogestionables. Esta opcion requiere ajustar el plan y no debe aplicarse sin aprobacion expresa.

## Recorrido manual con waiver temporal

1. Desde WhatsApp, enviar un mensaje al numero conectado a la app HUN para iniciar el Flow.
2. En `IDENTIFICACION`, usar un paciente de prueba permitido:
   - Tipo: `CC`
   - Documento sugerido: `41531776`
   - Correo: un correo de prueba controlado.
3. Seleccionar `PSIQUIATRIA` si sigue siendo la especialidad con agenda disponible en HUN de pruebas.
4. Seleccionar un horario visible en `SLOTS`; despues del ajuste, no deben aparecer horarios vencidos.
5. Confirmar la cita en `CONFIRMAR`.
6. Esperar el mensaje WhatsApp asincronico de resultado.

## Evidencia que debe confirmarse

Responder en Codex con este formato:

```text
FLOW-003 externo listo
Especialidad usada: <codigo y nombre>
Documento de prueba usado: <tipo y ultimos 4 digitos, no documento completo>
Asignacion HUN exitosa: si/no
Paciente recibio WhatsApp de confirmacion: si/no
Paciente recibio WhatsApp de cancelacion automatica: si/no
Mensaje de error recuperable probado si el slot cambio: si/no
Supabase revisado sin datos sensibles de cita: si/no
Variables temporales desactivadas despues de la prueba: si/no
Observaciones:
```

No enviar numero de cita, documento completo, nombre de paciente, medico, fecha/hora exacta ni capturas con datos sensibles por este canal.
