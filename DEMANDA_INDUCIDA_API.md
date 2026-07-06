# Adaptador de audiencia de demanda inducida

## Alcance

`CAMPAIGN-002` obtiene referencias operativas para contactar pacientes en campanas de demanda inducida. El modelo actualizado separa dos responsabilidades:

- Fuente de audiencia: Supabase guarda solo `id_anonimo` / `audiencia_ref`, campana, especialidad objetivo y estado operativo.
- Resolver de paciente: el API orquestador se consulta en memoria, justo antes del envio, para obtener telefono y contexto de campana sin persistir datos sensibles.

El mock permite `DEV_READY`, pero no permite declarar `CONTRACT_READY` sin API real o waiver formal del supervisor.

## Variables

- `HUN_DEMANDA_API_BASE`: URL base del API oficial que entregue o sincronice referencias de audiencia.
- `HUN_DEMANDA_API_ENDPOINT`: ruta del endpoint de audiencia si existe una fuente remota de `id_anonimo`.
- `HUN_DEMANDA_API_AUTH_TYPE`: `none`, `bearer`, `api_key` o `x-api-key`.
- `HUN_DEMANDA_API_TOKEN`: token para `bearer`, `api_key` o `x-api-key`.
- `HUN_DEMANDA_API_TIMEOUT_MS`: timeout HTTP, por defecto `20000`.
- `HUN_ORQUESTADOR_API_BASE`: URL base del resolver por `id_anonimo`.
- `HUN_ORQUESTADOR_API_KEY`: API key del resolver; nunca se imprime ni se versiona.
- `HUN_ORQUESTADOR_API_ENDPOINT`: ruta del resolver, por defecto `/api/v1/get-appointment/{id_anonimo}`.

Los filtros y paginacion se envian como parametros del adaptador al sincronizar una campana si existe un endpoint de audiencia. Si no existe, la campana puede cargarse con referencias `id_anonimo` ya disponibles en Supabase.

## Contrato de audiencia

Cada destinatario de campana debe incluir como minimo:

```json
{
  "id_anonimo": "HUN-3040",
  "cod_especialidad_requerida": "590"
}
```

El backend puede aceptar el alias `audiencia_ref` para `id_anonimo`.

## Contrato actual del resolver

El resolver actual por `id_anonimo` devuelve telefono y contexto en tiempo real. Estos datos se usan solo para enviar WhatsApp y no se persisten:

```json
{
  "id_anonimo": "HUN-3040",
  "nombre": "Nombre",
  "telefono": "573001112233",
  "correo": "correo@ejemplo.com",
  "fecha_cita": "2026-09-12",
  "servicio": "Telemedicina Control",
  "medico": "Profesional",
  "eps": "EPS",
  "estado": "Asignada"
}
```

Limitacion vigente: este contrato no trae `tipo_documento`, `numero_documento`, `eps_codigo` ni `cod_especialidad_requerida` en forma suficiente para asignar sin pedir identificacion. Por eso el Flow de campana v1 pide identificacion minima y luego muestra solo slots de la especialidad de la campana. La version ideal de solo escoger fecha/hora queda condicionada a ampliar este contrato.

## Persistencia permitida

Para Supabase se deriva y guarda solo:

- `campaign_id`
- `audiencia_ref` / `id_anonimo`
- `especialidad_codigo`
- `estado_contacto`

No se guarda telefono, nombre, correo, documento plano, EPS, medico, fecha/hora, servicio, numero de cita ni payload completo del resolver.

## Envio de ofertas

`CAMPAIGN-003` envia la plantilla `hun_oferta_cita_flow` con boton al Flow de demanda inducida (`CAMPAIGN_FLOW_ID=2195324014654953`). Por cada destinatario:

1. Lee `audiencia_ref` y `especialidad_codigo` desde Supabase.
2. Consulta el resolver por `id_anonimo` y usa el telefono solo en memoria.
3. Firma un `flow_token` de campana con campana, destinatario/referencia y especialidad.
4. Envia la plantilla de WhatsApp.
5. Registra notificacion, estado y evento operativo sin telefono ni payload sensible.

Ejecucion manual controlada:

```bash
node scripts/send-campaign-offers.js <campaign_id> [limit]
```

## Validaciones

- Rechaza destinatarios sin `id_anonimo` / `audiencia_ref`.
- Rechaza destinatarios sin `especialidad_codigo` o `cod_especialidad_requerida`.
- Normaliza telefonos colombianos de 10 digitos a formato `57XXXXXXXXXX` solo en memoria antes del envio.
- Deduplica por `campaign_id + audiencia_ref`.
- Reporta resumen con `aceptados`, `guardados`, `rechazados`, `duplicados`, `errores` y motivos no sensibles.
