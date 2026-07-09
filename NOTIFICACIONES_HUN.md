# Notificaciones HUN

## Alcance de NOTIF-001

El sistema registra y envia confirmaciones inmediatas por WhatsApp despues de una asignacion exitosa en HUN. La cita sigue viviendo en HUN; Supabase solo guarda metadatos operativos del intento de notificacion.

## Confirmacion inmediata

Cuando HUN acepta la asignacion:

1. El backend envia el mensaje de confirmacion por WhatsApp con los datos frescos disponibles en memoria.
2. Registra una fila en `notificaciones` con:
   - `session_id_hash`
   - `canal = whatsapp`
   - `tipo = confirmacion`
   - `estado = enviado` o `fallido`
   - `proveedor = whatsapp_cloud_api`
3. No guarda cuerpo del mensaje, telefono, correo, nombre, documento, EPS, medico, fecha/hora, numero de cita ni payload HUN.

El correo de confirmacion queda condicionado a proveedor configurado. En autoagendamiento se toma del campo `correo` del Flow y en campanas se toma del `correo` entregado por el orquestador. En ambos casos se maneja como contacto transitorio cifrado de la sesion y no se guarda correo plano en Supabase.

## Recordatorios

Los recordatorios reales deben obtener candidatos desde HUN por ventana de fechas. No se derivan de citas almacenadas localmente.

La interfaz implementada es `HunReminderCandidateProvider`. Mientras HUN no entregue un endpoint suficiente para consultar candidatos por ventana, el proveedor responde:

```json
{
  "ok": false,
  "blocked": true,
  "reason": "hun_reminder_window_endpoint_missing",
  "candidates": []
}
```

Reglas documentadas:

- Fuente de verdad: HUN por ventana.
- No persistir citas en Supabase.
- Dedupe por sesion o destinatario/campana y ventana.
- Maximo de intentos configurable con `REMINDER_MAX_ATTEMPTS`.
- Ventana configurable con `REMINDER_LOOKAHEAD_HOURS`.

## Bloqueo operativo

Los recordatorios reales quedan bloqueados hasta contar con un endpoint HUN que permita consultar citas/candidatos por ventana sin depender de citas guardadas en Supabase.
