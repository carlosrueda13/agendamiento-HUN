# Notificaciones HUN

## Confirmacion inmediata

Despues de una asignacion exitosa, el backend envia la confirmacion con datos frescos de HUN. Supabase registra solo canal, tipo, estado, proveedor y hashes operativos; no guarda el cuerpo, contacto o datos de la cita.

## Recordatorios un dia antes

`HunReminderCandidateProvider` consulta diariamente:

```http
GET /webServiceFechaMedico/consultar
  ?fecha_inicial=YYYY-MM-DD
  &fecha_final=YYYY-MM-DD
```

Las dos fechas corresponden al dia siguiente calculado en `America/Bogota`. Solo se procesan filas cuyo estado normalizado sea `Reservada` y cuya fecha coincida con la fecha solicitada.

Por cada cita se procesan de forma independiente:

- WhatsApp: nombre, fecha, hora y especialidad.
- EmailJS: correo, nombre, especialidad, medico, procedimiento, fecha, hora, numero de cita y anio.

Los datos anteriores viven solo en memoria durante la corrida. `consultorio` no se envia porque el endpoint HUN no lo entrega.

## Idempotencia

La migracion `supabase/009_notification_reminder_dedupe.sql` agrega `dedupe_key_hash` a `notificaciones`. El valor es un HMAC SHA-256 de numero de cita, fecha y hora; Supabase nunca recibe los valores originales.

El indice unico por canal evita repetir un recordatorio ya registrado. Los estados `enviado`, `entregado`, `omitido` y `enviando` no se reenvian automaticamente. Un estado `enviando` incierto requiere revision manual para priorizar no duplicar el contacto.

## Ejecucion

```bash
npm run reminders:send
npm run reminders:send -- --dry-run
npm run reminders:send -- --date 2026-07-23
```

`--dry-run` consulta HUN y devuelve contadores agregados, pero no escribe en Supabase ni llama a Meta o EmailJS. `--date` existe para pruebas controladas.

Render debe ejecutar `npm run reminders:send` con Cron `0 13 * * *`, equivalente a las 08:00 en Colombia. El Cron debe usar las mismas variables secretas del servicio web mediante un Environment Group.

Variables especificas:

```env
EMAILJS_REMINDER_TEMPLATE_ID=
REMINDER_TIME_ZONE=America/Bogota
REMINDER_TEMPLATE_NAME=hun_recordatorio_cita_24h
REMINDER_TEMPLATE_LANGUAGE=es_CO
REMINDER_DEDUPE_SECRET_B64=
REMINDER_CONCURRENCY=5
REMINDER_MAX_ATTEMPTS=3
REMINDER_RETRY_BASE_MS=1000
REMINDER_SEND_ENABLED=false
REMINDER_TEST_MODE=false
REMINDER_TEST_APPOINTMENT_NUMBERS=
```

`REMINDER_SEND_ENABLED=false` bloquea cualquier envio real. Para certificar con una a tres citas controladas, establecer temporalmente `REMINDER_TEST_MODE=true` y cargar sus numeros separados por coma en `REMINDER_TEST_APPOINTMENT_NUMBERS`. La lista solo vive en el almacen de secretos de Render, no se loguea y debe limpiarse al terminar. El Cron productivo usa `REMINDER_TEST_MODE=false`.

## Fallos y privacidad

- Timeout, desconexion, HTTP 429 y 5xx admiten reintento con espera exponencial.
- Errores permanentes 4xx no se reintentan.
- Un fallo de WhatsApp no bloquea email y viceversa.
- Los logs solo muestran el resumen agregado de la corrida.
- El endpoint HUN actual usa HTTP para datos personales. No se debe declarar `CONTRACT_READY` sin HTTPS, red privada/VPN o aceptacion formal del riesgo.
