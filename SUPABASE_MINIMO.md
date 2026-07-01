# SETUP-002 - Esquema minimo Supabase

Este ticket requiere una accion fuera del repo: ejecutar el SQL en el proyecto Supabase del HUN. Para respetar la regla de trabajo del proyecto, primero se entrega el artefacto SQL y esta guia; el ticket no debe cerrarse como completo hasta que el usuario confirme que el SQL fue aplicado correctamente.

## Archivo a ejecutar

Ejecutar en Supabase SQL Editor:

```text
supabase/001_minimal_operational_schema.sql
```

Addendum ejecutado para correo de confirmacion transitorio:

```text
supabase/002_flow_session_contact_email.sql
```

## Pasos para el usuario

1. Abrir el proyecto Supabase correspondiente.
2. Ir a SQL Editor.
3. Crear un query nuevo.
4. Pegar el contenido completo de `supabase/001_minimal_operational_schema.sql`.
5. Ejecutar el query.
6. Confirmar en el chat si Supabase reporto exito o pegar el error completo si falla.

## Tablas creadas

- `campanas`
- `campana_destinatarios`
- `flow_sesiones_temporales`
- `eventos_operativos`
- `notificaciones`

## Excepcion controlada: correo de confirmacion

Para enviar confirmaciones por correo sin crear un perfil permanente del paciente, `flow_sesiones_temporales` puede tener:

- `contacto_email_enc`: correo cifrado por el backend.
- `contacto_email_hmac`: HMAC no reversible del correo normalizado para idempotencia tecnica.
- `contacto_email_expires_at`: expiracion del correo, igual o menor a `expires_at`.

El correo plano no debe guardarse en Supabase. Solo puede existir en memoria durante el request o durante el envio por el proveedor aprobado. Al completar, fallar, cancelar o expirar la sesion, el backend debe limpiar estos campos.

## Vistas creadas

- `vista_medica_operativa`
- `vista_it_auditoria`

## Datos prohibidos

El esquema no incluye columnas para:

- numero de cita
- nombre del paciente
- documento plano
- EPS/contrato
- medico
- fecha/hora exacta de la cita
- CUPS/procedimiento
- correo plano o correo permanente de paciente
- historia de citas
- respuesta HUN completa
- adjuntos, ordenes o autorizaciones
- tokens, llaves privadas o service role keys

## Verificacion esperada

Despues de ejecutar el SQL, las tablas deben existir con RLS habilitado. No se crean policies para `anon` o `authenticated`; el backend debe usar `SUPABASE_SERVICE_ROLE_KEY` desde servidor.

La validacion de lectura/escritura desde el backend se hara despues de que el usuario confirme que el SQL fue aplicado en Supabase.
