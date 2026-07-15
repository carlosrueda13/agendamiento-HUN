# Guia de correccion y puesta en marcha: campanas desde el panel del hospital

Documento para el equipo de `hun-teleconsulta` (backend Python en Railway + panel administrativo).
Resultado de la revision tecnica completa de la implementacion de campanas hecha a partir de
`INSTRUCTIVO_PANEL_CAMPANAS.md`, revisada el 2026-07-14 sobre la rama `main` del repositorio
`asigna-hun/hun-teleconsulta`.

Archivos revisados:

- `backend/hun_servidor_JCRB.py` (rutas `/api/campanas*`, resolver de orquestador, envio WhatsApp, hilo de lanzamiento)
- `database/campanas_migration.sql` (tablas y politicas RLS en su Supabase)
- `backend/hun_mock_db.py` (equivalentes del modo simulado)
- `frontend/hun_playground_2.html` (UI de campanas del playground)
- `frontend/panel_de_administraci_n.html` (panel de produccion)
- `.env.example`

---

## 1. Veredicto general

El trabajo implementado es de buena calidad y demuestra que el contrato del instructivo es
implementable: la autenticacion, la idempotencia por `referencia_externa`, la validacion de
lotes, el lanzamiento asincrono con polling y el modo Sandbox estan bien resueltos.

**Pero hay un malentendido de arquitectura que debe corregirse antes de cualquier puesta en
marcha real:** el instructivo define un API que el backend de agendamiento (Render) **expone**
y que el panel **consume**. Lo implementado construye ese mismo API **dentro del servidor del
panel**, con tablas propias en su Supabase y un envio propio de WhatsApp. Como simulador de
desarrollo es valido y util; como servicio real **no puede funcionar** (seccion 3 explica por
que) y ademas crea dos sistemas de campanas paralelos e incompatibles.

Regla de oro de esta guia: **en produccion, el unico sistema que resuelve telefonos, firma
tokens y envia WhatsApp es el backend de agendamiento en Render. El servidor del panel solo
reenvia (proxy) las llamadas de su frontend hacia ese API.**

---

## 2. Lo que esta bien (no tocar, salvo lo indicado)

| Aspecto | Donde | Estado |
| --- | --- | --- |
| Validacion 401 por `x-api-key` en las 5 rutas | `_validar_campana_api_key` (~linea 655) | Correcto (ver hallazgo C3 para endurecerla) |
| Idempotencia por `referencia_externa` (201 vs 200) | `sb_crear_campana` (~linea 691) | Correcto |
| Validacion de `nombre` y `cupos_objetivo` con 422 | POST `/api/campanas` (~linea 1554) | Correcto |
| Lote de maximo 500 con 422, rechazos por registro con `index` y `campos` | `sb_cargar_destinatarios` (~linea 737) | Correcto |
| Deduplicacion por `campaign_id + id_anonimo` (logica + indice unico SQL) | migracion 1.2 + carga | Correcto |
| 404 / 409 / `lanzamiento_en_curso` / 503 sin configuracion / 202 con hilo de fondo / `destinatarios_a_procesar: 0` | POST `lanzar` (~linea 1606) | Correcto en lo esencial (ver C5, C9, C10) |
| Modo Sandbox con telefono deterministico y convencion `FAIL` para probar fallos | `_resolver_telefono_orquestador` (~linea 835) | Correcto y recomendamos conservarlo |
| Lotes de 500 y polling mientras `enviando` en el frontend | `hun_playground_2.html` (~lineas 3892-3995) | Correcto |
| Minimizacion de datos: solo `id_anonimo` + `cod_especialidad_requerida` persistidos | migracion + carga | Correcto |

---

## 3. El problema central: el envio real de WhatsApp no puede hacerse desde su servidor

`_enviar_whatsapp_campana` (~linea 865) envia la plantilla `hun_oferta_cita_flow` directamente
a Meta con un payload minimo:

```python
payload = {
    "messaging_product": "whatsapp",
    "to": telefono,
    "type": "template",
    "template": {"name": "hun_oferta_cita_flow", "language": {"code": "es_CO"}},
}
```

Esto esta roto por diseno, por tres razones independientes:

1. **Falta el `flow_token` firmado.** La plantilla tiene un boton que abre el WhatsApp Flow de
   oferta de cita. Ese boton exige un componente con un `flow_token` firmado con HMAC-SHA256
   usando un secreto que **solo existe en el backend de Render**. El token transporta, ademas,
   el `campaign_id`, el destinatario y la especialidad (y el correo/telefono cifrados). Sin
   ese componente, Meta rechaza el envio o el boton llega roto; y si un paciente llegara a
   abrir el Flow, el endpoint cifrado del Flow lo rechazaria con `campaign_flow_token_invalid`.
   **No hay forma de que el servidor del panel genere ese token**: el secreto no se comparte.
2. **Linea de WhatsApp distinta.** El Flow esta publicado sobre la linea/numero del backend de
   agendamiento. Un envio desde otra `WHATSAPP_PHONE_ID` no puede abrir ese Flow.
3. **Fuente de verdad dividida.** Los destinatarios quedarian marcados `enviado` en el Supabase
   del panel, mientras el sistema de agendamiento (que registra notificaciones, eventos y los
   estados `flow_iniciado`/`agendado` cuando el paciente responde) no sabria que esa campana
   existe. Los contadores nunca avanzarian mas alla de `enviado`.

**Correccion:** eliminar la rama real de `_enviar_whatsapp_campana` (o dejarla lanzando
excepcion explicita con comentario), y **nunca** configurar `WHATSAPP_TOKEN` /
`WHATSAPP_PHONE_ID` para campanas en Railway. El modo simulado puede conservarse tal cual para
desarrollo. El envio real ocurre solo en el backend de Render, seccion 5.

Lo mismo aplica a `_resolver_telefono_orquestador` (~linea 835): en la arquitectura objetivo,
el orquestador del hospital lo consume **el backend de Render**, no el servidor del panel. La
rama real de esa funcion tampoco debe activarse (la rama simulada si se conserva).

---

## 4. Hallazgos de seguridad (corregir de inmediato, independientes de la arquitectura)

### S1 - CRITICO: las politicas RLS dejan las tablas abiertas a cualquiera

`database/campanas_migration.sql`, paso 2, crea estas politicas:

```sql
CREATE POLICY "Lectura publica campanas"  ON public.campanas  FOR SELECT USING (true);
CREATE POLICY "Escritura server campanas" ON public.campanas  FOR ALL USING (true) WITH CHECK (true);
-- (identicas para campana_destinatarios)
```

Sin clausula `TO`, ambas politicas aplican a **todos los roles, incluido `anon`**. Resultado:
cualquier persona con la URL del proyecto y la `anon key` de Supabase (que viaja en cualquier
frontend que la use) puede **leer, insertar, modificar y borrar** campanas y destinatarios,
sin pasar por el servidor ni por la `x-api-key`. La politica llamada "Escritura server" no
restringe nada al servidor.

**Correccion (ejecutar en el SQL Editor de su Supabase):**

```sql
DROP POLICY IF EXISTS "Lectura publica campanas" ON public.campanas;
DROP POLICY IF EXISTS "Escritura server campanas" ON public.campanas;
DROP POLICY IF EXISTS "Lectura publica campana_destinatarios" ON public.campana_destinatarios;
DROP POLICY IF EXISTS "Escritura server campana_destinatarios" ON public.campana_destinatarios;
-- Sin politicas y con RLS habilitado, anon/authenticated no pueden leer ni escribir.
-- El service_role (que usa el servidor) ignora RLS, que es exactamente lo deseado.
```

Y en Railway, asegurar que `SUPABASE_KEY` sea la **service role key** (el `.env.example`
actual dice "ANON_KEY_O_SERVICE_ROLE_KEY"; debe ser service role, y solo en el servidor).

### S2 - CRITICO: la API key tiene un valor por defecto conocido

```python
CAMPANAS_API_KEY = os.environ.get("CAMPANAS_API_KEY", "hun-campanas-test-key")
```

Si la variable no esta configurada en Railway, el servicio queda protegido por una llave que
esta escrita en el codigo fuente y en el placeholder del playground. El instructivo (seccion
4) exige fallar cerrado.

**Correccion:** sin variable configurada, las rutas `/api/campanas*` deben responder
`503 { "error": "panel_api_no_configurada" }`, no aceptar una llave por defecto:

```python
CAMPANAS_API_KEY = os.environ.get("CAMPANAS_API_KEY", "")

def _validar_campana_api_key(handler):
    if not CAMPANAS_API_KEY:
        handler._responder(503, {"error": "panel_api_no_configurada",
                                 "detalle": "CAMPANAS_API_KEY no esta configurada."})
        return False
    llave = handler.headers.get("x-api-key") or ""
    import hmac
    if not hmac.compare_digest(llave, CAMPANAS_API_KEY):
        handler._responder(401, {"error": "api_key_invalida",
                                 "detalle": "Falta el header x-api-key o la llave no es valida."})
        return False
    return True
```

(`hmac.compare_digest` reemplaza el `!=` actual, que permite ataques de temporizacion; es el
equivalente Python del `timingSafeEqual` que usa el backend de Render.)

### S3 - ALTO: la API key vive en el navegador

El playground guarda la llave en `localStorage` y la envia desde el navegador
(`getCampanaApiKey`, ~linea 3806). Para un playground de desarrollo con la llave de prueba es
tolerable; **el panel de produccion no puede repetir ese patron**. El instructivo (seccion 2)
lo dice explicitamente: las llamadas salen del **servidor** del panel; el navegador nunca ve
la llave.

**Correccion:** en produccion, el frontend llama a su propio servidor (con la sesion de
usuario del panel) y es el servidor quien agrega `x-api-key` desde la variable de entorno.
La seccion 6 muestra como el diseno de proxy que ya tienen resuelve esto sin cambiar el
frontend.

---

## 5. Arquitectura objetivo (la que hay que implementar)

```text
[Panel HTML]                    [Servidor del panel - Railway]                [Backend agendamiento - Render]
navegador                       hun_servidor_JCRB.py                          agendamiento-hun.onrender.com
    |                                   |                                             |
    |  fetch /api/campanas/* (sesion)   |                                             |
    |---------------------------------->|  PROXY: agrega x-api-key (env) y reenvia    |
    |                                   |-------------------------------------------->|
    |                                   |                                             |-- crea campana en SU Supabase (el de agendamiento)
    |                                   |                                             |-- resuelve telefono contra el ORQUESTADOR del hospital
    |                                   |                                             |-- firma flow_token y envia WhatsApp (Meta)
    |                                   |<--------------------------------------------|
    |<----------------------------------|   respuesta identica del contrato           |
```

Puntos no negociables:

1. Las campanas de produccion viven en el Supabase **del backend de agendamiento**. Las tablas
   `campanas`/`campana_destinatarios` del Supabase del panel quedan solo como soporte del modo
   Sandbox (o se eliminan cuando el Sandbox migre al mock en memoria).
2. El `flow_token`, la resolucion de telefono y el envio a Meta ocurren **solo** en Render.
3. El hospital expone el **orquestador** (`GET /api/v1/get-appointment/{id_anonimo}`) para que
   lo consuma el backend de Render, con su propia API key (distinta de la de campanas). Esto
   sigue pendiente de su lado y es requisito para envios reales (instructivo, seccion 2.2).
4. El modo Sandbox actual (x-sandbox / sandbox=true) se conserva tal cual para desarrollo y
   demos: es una buena pieza.

---

## 6. Plan de correccion paso a paso (backend del panel)

El servidor ya tiene un patron de proxy hacia la API del HUN (`_proxy_request`). La correccion
consiste en aplicar ese mismo patron a `/api/campanas*`:

**Paso 1 - Variables nuevas en Railway y en `.env.example`:**

```text
CAMPANAS_API_KEY=            # llave real, entregada por el equipo de agendamiento por canal seguro
CAMPANAS_BASE_URL=           # https://agendamiento-hun.onrender.com (se confirma en la puesta en marcha)
```

`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` y `ORQUESTADOR_BASE_URL` **se eliminan** del codigo de
campanas (ver Paso 4). Documentar todas las variables en `.env.example`, que hoy no incluye
ninguna de campanas.

**Paso 2 - Convertir las rutas `/api/campanas*` en proxy cuando no es Sandbox:**

En `do_GET` (~linea 1348) y `do_POST` (~linea 1544), la logica queda:

```python
if parsed.path.startswith("/api/campanas"):
    simulado = (self.headers.get("x-sandbox") == "true") or ("sandbox=true" in parsed.query)
    if simulado:
        # ... implementacion local actual (mock_db / Supabase local), sin cambios ...
    else:
        if not CAMPANAS_BASE_URL or not CAMPANAS_API_KEY:
            self._responder(503, {"error": "envio_no_configurado",
                                  "detalle": "CAMPANAS_BASE_URL/CAMPANAS_API_KEY sin configurar."})
            return
        # Reenviar el request tal cual al backend de agendamiento,
        # inyectando x-api-key desde la variable de entorno.
        # Devolver status y body del backend sin transformarlos:
        # las respuestas ya cumplen el contrato del instructivo.
        self._proxy_campanas(parsed, body_bytes)   # timeout sugerido: 30s (arranque en frio de Render)
    return
```

Con esto: el frontend no cambia, la llave sale del `localStorage` en produccion (el proxy la
inyecta), y las respuestas reales vienen del sistema que si puede enviar.

**Paso 3 - Validacion de sesion del panel en el proxy.** Antes de reenviar, validar que quien
llama este autenticado en el panel (la sesion/rol que ya usan para las demas vistas
administrativas). La `x-api-key` del navegador deja de ser el mecanismo de autenticacion del
frontend; en modo Sandbox puede conservarse como esta hoy.

**Paso 4 - Neutralizar el envio real local.** En `_enviar_whatsapp_campana` y
`_resolver_telefono_orquestador`, eliminar las ramas reales (todo lo que no es `simulado`) o
reemplazarlas por:

```python
raise RuntimeError("Envio real deshabilitado: en produccion las campanas se lanzan via proxy "
                   "al backend de agendamiento (ver GUIA_CORRECCION_PANEL_CAMPANAS.md).")
```

Retirar `WHATSAPP_AVAILABLE` del gate de `/lanzar` (el 503 del proxy lo reemplaza, Paso 2).

**Paso 5 - Correcciones puntuales del modo Sandbox** (para que se comporte igual que el API
real y las pruebas sean representativas):

| # | Problema | Donde | Correccion |
| --- | --- | --- | --- |
| 5.1 | Cancelar durante `enviando` no da 409, y el `finally` del hilo deja la campana en `activa`, deshaciendo la cancelacion | `do_POST` cancelar (~linea 1657) y `_procesar_lanzamiento_campana` (~linea 897) | Responder `409 lanzamiento_en_curso` si `estado == "enviando"`; en el `finally`, solo poner `activa` si el estado sigue siendo `enviando` |
| 5.2 | Doble lanzamiento simultaneo: dos requests pueden pasar el chequeo `estado == "enviando"` antes de que el primero escriba | POST lanzar (~lineas 1622, 1643) | Usar un lock en memoria (`threading.Lock` + set de `campaign_id` en curso) ademas del estado persistido |
| 5.3 | `limite` invalido se corrige en silencio a 500 | POST lanzar (~linea 1633) | Responder `422` como define el contrato (seccion 5.3) |
| 5.4 | Si Supabase falla, cada funcion `sb_*` cae en silencio al mock: una campana "creada" u "enviada" en ese estado no existe realmente | todas las `sb_*` (~lineas 691-832) | En rutas no-Sandbox el fallback al mock es inaceptable: responder `503 persistencia_no_disponible`. El fallback al mock queda solo para `simulado` |
| 5.5 | Cancelar una campana `cerrada` la sobreescribe a `cancelada` | `sb_cancelar_campana` (~linea 804) | `409 estado_no_admite_cancelacion` si esta `cerrada`; cancelar dos veces si es idempotente (200) |
| 5.6 | El GET devuelve todas las columnas de la fila (`{**campana, ...}`) y no incluye `actualizado_en` | `sb_obtener_campana` (~linea 731) | Construir la respuesta a mano con las claves exactas del instructivo (seccion 5.4); asi el frontend no depende de campos que el API real no devuelve |
| 5.7 | Codigos de error distintos a los del contrato: `campana_cerrada` vs `estado_no_admite_destinatarios` / `estado_no_admite_lanzamiento` | POST destinatarios/lanzar (~lineas 1596, 1619) | Alinear los codigos; el frontend debe reaccionar al codigo, no al texto |

Nota sobre estas correcciones: cuando el proxy del Paso 2 este activo, las respuestas reales
vendran del backend de Render con el contrato exacto; el Paso 5 alinea el Sandbox para que
desarrollo y produccion se comporten igual.

**Paso 6 - Panel de produccion.** `panel_de_administraci_n.html` aun no tiene la vista de
campanas; la UI existe solo en `hun_playground_2.html`. Al construir la vista de produccion:
reutilizar la logica del playground (creacion, carga por lotes de 500, lanzar, polling cada
15-30 s mientras `enviando`, cancelar) pero llamando al proxy con la sesion del panel, sin
input de API key, y con `referencia_externa` real (el id interno de la campana en el panel,
no `PLAYGROUND-<timestamp>`).

---

## 7. Requisito paralelo del lado del hospital: el orquestador

Para que un lanzamiento real funcione, el hospital debe exponer el resolver de audiencia
(el "orquestador") que consume el backend de agendamiento:

```text
GET {ORQUESTADOR_BASE}/api/v1/get-appointment/{id_anonimo}
Header: x-api-key: <llave propia del orquestador, distinta de la de campanas>
Respuesta minima: { "id_anonimo": "...", "telefono": "573001112233", "correo": "...", "cod_especialidad_requerida": "590" }
```

Reglas: el telefono debe ser movil colombiano valido (10 digitos empezando por 3, o con
prefijo 57); si entrega `cod_especialidad_requerida`, esa especialidad prima sobre la cargada
en el lote; si entrega `correo`, se usa solo para la confirmacion transaccional. Cada
`id_anonimo` que el panel cargue debe resolver aqui; los que no resuelvan quedaran `fallido`
con motivo `telefono_invalido` u `orquestador_no_disponible`.

Entregables de este punto: URL base del orquestador (ambiente de pruebas y produccion) y su
API key, entregadas por canal seguro al equipo de agendamiento.

---

## 8. Configuracion final de variables (resumen)

| Variable | Donde | Valor |
| --- | --- | --- |
| `CAMPANAS_BASE_URL` | Railway (panel) | URL del backend de agendamiento en Render |
| `CAMPANAS_API_KEY` | Railway (panel) | Llave real del API de campanas (la entrega el equipo de agendamiento; sin valor por defecto en codigo) |
| `SUPABASE_KEY` | Railway (panel) | Service role key del Supabase del panel (solo para Sandbox y demas funciones del panel) |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` | Railway (panel) | **No configurar para campanas** (solo las usa el backend de agendamiento en Render) |
| `ORQUESTADOR_BASE_URL` | Railway (panel) | **No configurar** (el orquestador lo consume Render) |
| `HUN_ORQUESTADOR_API_BASE` / `_KEY` / `_ENDPOINT` | Render (agendamiento) | URL y llave del orquestador del hospital (seccion 7) |

---

## 9. Secuencia de puesta en marcha conjunta

Orden recomendado; los pasos 1-3 pueden avanzar en paralelo:

1. **Equipo del panel:** aplicar S1 y S2 (RLS + llave sin default) — hoy mismo, son
   independientes de todo lo demas.
2. **Equipo del panel:** implementar el proxy (Pasos 1-4 de la seccion 6) y las correcciones
   del Sandbox (Paso 5).
3. **Equipo de agendamiento (nosotros):** desplegar el API real `/api/campanas*` en Render
   (esta planificado y con tickets definidos) y generar la API key real.
4. **Hospital:** exponer el orquestador (seccion 7) y entregar URL + llave.
5. **Intercambio de llaves** por canal seguro: llave de campanas (nosotros -> panel), llave
   del orquestador (hospital -> nosotros).
6. **Prueba de integracion sin envio real:** panel en modo proxy contra Render; crear campana,
   cargar lote con un registro invalido y un duplicado, verificar resumen y contadores por
   `GET`. Lanzar debe responder `503 envio_no_configurado` mientras el orquestador no este
   configurado en Render — esa respuesta confirma que toda la cadena esta conectada.
7. **Prueba controlada de envio real:** una campana con 1-3 `id_anonimo` de prueba que
   resuelvan a telefonos del equipo; verificar recepcion de la plantilla, apertura del Flow,
   creacion de cita en HUN de pruebas y avance de contadores (`enviado` -> `flow_iniciado` ->
   `agendado`).
8. **Certificacion:** ejecutar completo el checklist de la seccion 10 del instructivo, ya
   contra el API real. Registrar evidencia.
9. **Salida a operacion:** construir/activar la vista de campanas en el panel de produccion
   (Paso 6 de la seccion 6) y definir responsables operativos.

---

## 10. Checklist de verificacion de esta guia

Seguridad (inmediato):

- [ ] Politicas RLS `USING (true)` eliminadas de `campanas` y `campana_destinatarios` (S1).
- [ ] `CAMPANAS_API_KEY` sin valor por defecto; sin variable el servicio responde 503 (S2).
- [ ] Comparacion de llave con `hmac.compare_digest` (S2).
- [ ] La llave real nunca llega al navegador en produccion (S3).

Arquitectura:

- [ ] Rutas `/api/campanas*` en modo no-Sandbox actuan como proxy hacia `CAMPANAS_BASE_URL`.
- [ ] Ramas reales de `_enviar_whatsapp_campana` y `_resolver_telefono_orquestador` eliminadas o deshabilitadas.
- [ ] `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`/`ORQUESTADOR_BASE_URL` sin configurar en Railway.
- [ ] Campanas de produccion visibles unicamente via el API de Render (ninguna escritura local no-Sandbox).

Sandbox alineado al contrato:

- [ ] Cancelar durante `enviando` responde 409 y el hilo no revive la campana cancelada (5.1).
- [ ] Doble lanzamiento simultaneo imposible (lock) (5.2).
- [ ] `limite` invalido responde 422 (5.3).
- [ ] Fallo de Supabase responde 503, sin fallback silencioso al mock fuera de Sandbox (5.4).
- [ ] Cancelar campana `cerrada` responde 409 (5.5).
- [ ] GET devuelve exactamente las claves del instructivo, incluida `actualizado_en` (5.6).
- [ ] Codigos de error alineados: `estado_no_admite_destinatarios`, `estado_no_admite_lanzamiento`, `estado_no_admite_cancelacion` (5.7).

Documentacion:

- [ ] `.env.example` del panel documenta `CAMPANAS_BASE_URL` y `CAMPANAS_API_KEY`.
- [ ] El README del panel indica que el modo real es proxy y el Sandbox es local.

---

## 11. Reglas que no deben romperse nunca

1. **Nunca** enviar al API de campanas datos personales del paciente: solo `id_anonimo` y
   `cod_especialidad_requerida`. Los datos personales viven en el hospital y se resuelven en
   memoria via el orquestador.
2. **Nunca** intentar generar o adivinar el `flow_token`: se firma solo en el backend de
   agendamiento con un secreto no compartido.
3. **Nunca** configurar credenciales de Meta para campanas fuera del backend de agendamiento.
4. **Nunca** dejar la API key con valor por defecto, en el codigo, en el navegador o en un
   repositorio.
5. **Nunca** exponer tablas de campanas con politicas RLS abiertas, aunque "solo" contengan
   referencias anonimas.

Dudas o desviaciones del contrato durante la implementacion: reportarlas al equipo de
agendamiento antes de codificar una solucion propia, para mantener un solo contrato
(`INSTRUCTIVO_PANEL_CAMPANAS.md`) como fuente de verdad.
