# Estrategia de reagendamiento HUN

## Decision aprobada

HUN no expone un endpoint especifico de reagendamiento. El proceso se implementara como una saga de dos operaciones independientes:

1. Asignar y confirmar la nueva cita.
2. Solicitar la cancelacion de la cita original.
3. Verificar asincronicamente la cancelacion original.
4. Confirmar la modificacion al paciente solo cuando ambas operaciones esten confirmadas por HUN.

La cita original no se cancela antes de confirmar la nueva. Esta regla fue aprobada por el usuario/supervisor el 2026-07-14.

## Flujo funcional

1. El paciente selecciona `Modificar/cancelar`, acepta el consentimiento y se identifica.
2. El backend consulta HUN por documento y muestra las citas modificables.
3. El paciente selecciona la cita original y la opcion `Modificar`.
4. El backend usa la especialidad y el procedimiento de la cita original para consultar alternativas en HUN. El paciente no cambia manualmente la especialidad.
5. Los horarios se presentan mediante `slot_token` opaco, firmado y con TTL. No se persisten los datos completos del slot.
6. Al seleccionar un horario, el backend reconsulta HUN y valida que el cupo siga disponible y corresponda a la cita que se esta modificando.
7. Antes de ejecutar cambios, WhatsApp muestra esta advertencia y exige confirmacion explicita:

   `Primero reservaremos el nuevo horario. Cuando HUN lo confirme, solicitaremos la cancelacion de tu cita actual. Si la cancelacion no puede completarse, podrias conservar temporalmente ambas citas y el hospital debera revisar el caso. Deseas continuar?`

8. El backend asigna la nueva cita con idempotencia y conserva sus identificadores solo en memoria dentro del TTL.
9. El backend confirma la nueva cita contra la respuesta de asignacion y, cuando exista numero de cita, mediante consulta HUN.
10. Solo despues de confirmar la nueva cita, solicita cancelar la cita original.
11. Verifica la cancelacion original con la misma politica asincronica e idempotente de `CANCEL-002`.
12. Si HUN confirma la cancelacion original, envia:

    `Tu cita fue modificada correctamente. La nueva cita quedo confirmada y la cita anterior fue cancelada.`

## Estados y recuperacion

| Resultado | Cita original | Nueva cita | Respuesta al paciente |
|---|---|---|---|
| El cupo deja de estar disponible | Se conserva | No creada | Pedir seleccionar otro horario |
| Falla la asignacion | Se conserva | No confirmada | Informar que no hubo modificacion |
| La asignacion queda incierta | Se conserva | Estado por confirmar | No cancelar la original; escalar a revision |
| Nueva cita confirmada y cancelacion original en proceso | Se conserva hasta confirmacion HUN | Confirmada | Informar que la modificacion sigue en proceso |
| Falla o expira la cancelacion original | Puede seguir activa | Confirmada | Informar posible doble reserva y escalar a conciliacion manual |
| Cancelacion original confirmada | Cancelada | Confirmada | Confirmar modificacion exitosa |

No existe rollback automatico seguro: cancelar la nueva cita para compensar un fallo podria eliminar el horario elegido y no garantiza recuperar el cupo original. Los estados inciertos requieren revision operativa del hospital.

## Idempotencia y minimizacion

- Usar `reschedule_operation_id` no reversible para impedir asignaciones o cancelaciones duplicadas.
- Mantener documento, numeros de cita, medico, fecha/hora, procedimiento y payloads HUN solo en memoria durante el TTL.
- Supabase solo puede conservar estados agregados, hashes/correlation IDs, timestamps, reintentos y errores tecnicos sanitizados.
- No confirmar `reagendada` hasta que HUN confirme tanto la nueva asignacion como la cancelacion original.
- Si Render reinicia y pierde el contexto sensible, no reintentar operaciones modificadoras a ciegas; informar que el caso requiere verificacion y conciliacion.

## Dependencias para implementacion

- Extender la rama conversacional `Modificar/cancelar` para distinguir ambas acciones.
- Reutilizar `slot_token` y reconsulta HUN de `CORE-004`/`CORE-005`.
- Reutilizar la verificacion asincronica de `CANCEL-002` para la cita original.
- Definir estados agregados de reagendamiento y su migracion minima antes de persistirlos.
- Agregar pruebas de idempotencia, concurrencia, reinicio y cada estado parcial de la tabla anterior.
- Mantener una ruta de conciliacion manual para una nueva cita confirmada cuya cita original no pueda cancelarse.
