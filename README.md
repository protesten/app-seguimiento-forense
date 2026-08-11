# App de Seguimiento Forense

Aplicación para marcar imágenes y documentos de forma invisible (watermarking) y poder rastrear el origen de una filtración si el archivo se comparte sin permiso.

Esta guía asume que **no sabes programar** y te explica cada paso, incluso los que a un programador le parecerían obvios.

## 🌐 La app ya está desplegada

- **Web**: https://app-seguimiento-forense.vercel.app
- **API**: https://seguimiento-forense-backend.onrender.com

Todo lo demás en este documento (los "Paso 1-4") es para trabajar en el proyecto **en tu ordenador** (añadir funciones, arreglar cosas, probar antes de subir). Para el detalle de cómo está desplegado, ve a la sección [Despliegue en la nube](#despliegue-en-la-nube).

## Estado actual del proyecto

Lo que **ya funciona y está probado**:

- ✅ Backend en FastAPI con endpoints reales: registrar y listar documentos (`/archivos`), marcar y leer la marca de **imágenes** (`/ocultar-marca`, `/extraer-marca`), marcar y leer la marca de **PDFs** (`/ocultar-marca-pdf`, `/extraer-marca-pdf`) y buscar quién recibió una marca concreta (`/copias/{id_unico_marca}`).
- ✅ El marcado invisible de imágenes usa el algoritmo `dwtDctSvd` (frecuencia de la imagen, no metadatos ni píxeles visibles) — implementado directamente en [backend/app/dwt_dct_svd.py](backend/app/dwt_dct_svd.py) en vez de depender del paquete `invisible-watermark` completo, que arrastraba `torch` sin usarlo (ver detalle más abajo). En PDFs, las páginas con texto real usan texto en modo de renderizado invisible dentro del contenido (no metadatos), y las páginas que son un escaneo usan el mismo marcado de frecuencia que las imágenes, elegido automáticamente según cada página (ver detalle más abajo).
- ✅ Cada vez que se marca un archivo, se guarda automáticamente en Supabase quién lo recibió (nombre, email) y qué marca se le puso.
- ✅ Base de datos en Supabase conectada y probada con datos reales.
- ✅ Frontend (React + Tailwind) con dos pantallas funcionales que aceptan imagen o PDF indistintamente: **Marcar imagen** (elegir/crear documento, subir el archivo, poner destinatario, descargar el resultado) y **Verificar imagen filtrada** (subir el archivo sospechoso y ver directamente quién lo recibió, sin tocar Supabase a mano).
- ✅ Investigado y descartado: rescatar la marca de una foto de cámara a la pantalla (ver [Limitaciones conocidas](#limitaciones-conocidas-probadas-no-teóricas)) y añadir una marca visible de respaldo (rompería el sigilo, que es el objetivo central del proyecto).
- ✅ **Autenticación**: todos los endpoints que tocan datos exigen haber iniciado sesión (Supabase Auth). El frontend tiene una pantalla de login; sin sesión válida, la API devuelve 401 y no deja hacer nada.
- ✅ **Desplegado en producción**: backend en Render, frontend en Vercel, ambos en capa gratuita, probado de extremo a extremo con las URLs reales (ver [Despliegue en la nube](#despliegue-en-la-nube)).
- ✅ **Panel de administración**: pestaña "Administración" (solo visible para administradores) con gestión de usuarios (crear, eliminar, dar/quitar permisos de admin — no hay registro público, todas las cuentas se crean aquí) y estadísticas (totales, desglose por documento/destinatario/fecha, actividad reciente).
- ✅ **Cambiar tu propia contraseña**: cualquier usuario logueado puede hacerlo desde el propio frontend (junto a "Cerrar sesión"), sin depender de que Supabase tenga el envío de emails configurado.
- ✅ **Bug crítico corregido (2026-08-11)**: la marca de imágenes no sobrevivía a reenviarlas por WhatsApp — se perdía por completo, no parcialmente. La causa real no era la compresión (eso ya lo tolerábamos bien) sino que **WhatsApp cambia la resolución de la imagen**, y el algoritmo no tenía forma de encontrar la marca si el tamaño no coincidía exactamente con el original. Se rediseñó el marcado para que sea invariante a cambios de resolución (ver [Por qué se marca a un tamaño fijo](#por-qué-se-marca-a-un-tamaño-fijo-no-al-tamaño-original-de-la-imagen)). Confirmado con las imágenes reales del usuario que fallaban antes de este cambio.
- ✅ **Destinatarios guardados**: al marcar un archivo, puedes elegir un destinatario ya guardado (autocompleta nombre y email) o guardar uno nuevo con una casilla, para no tener que volver a escribirlo la próxima vez. Cada usuario tiene su propia lista, aislada de la de los demás.

Lo que **falta** está en la sección [Próximos pasos](#próximos-pasos-del-proyecto) al final de este documento.

## Estructura del proyecto

```
App-seguimiento-forense/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # Define los endpoints de la API (las URLs que se pueden llamar)
│   │   ├── watermark.py        # Logica de marcar/leer la marca invisible en imagenes
│   │   ├── dwt_dct_svd.py      # Algoritmo de marcado en si (adaptado de invisible-watermark, sin torch)
│   │   ├── watermark_pdf.py    # Logica de marcar/leer la marca invisible en PDFs
│   │   ├── admin.py            # Gestion de usuarios y estadisticas (solo para administradores)
│   │   └── supabase_client.py  # Conexion con la base de datos de Supabase
│   ├── supabase/
│   │   └── schema.sql          # Script SQL para crear las tablas (se ejecuta en el panel de Supabase, no aqui)
│   ├── venv/                   # Entorno virtual de Python (se crea en el paso 2, no se sube a git)
│   ├── .env                    # Tus claves secretas de Supabase (no se sube a git)
│   └── requirements.txt        # Lista de librerias Python que necesita el backend
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Componente principal: login + las pestañas de la web
│   │   ├── main.jsx            # Punto de entrada de React
│   │   ├── api.js              # Funciones que llaman al backend (fetch, con el token de sesion)
│   │   ├── supabaseClient.js   # Cliente de Supabase Auth para el navegador
│   │   └── components/
│   │       ├── EstadoBackend.jsx  # Indicador de conexion con el backend
│   │       ├── Login.jsx          # Pantalla de inicio de sesion
│   │       ├── MarcarImagen.jsx   # Pantalla para subir y marcar una imagen o PDF
│   │       ├── ExtraerMarca.jsx   # Pantalla para leer la marca de una imagen o PDF
│   │       ├── Admin.jsx              # Contenedor de las sub-pestañas de administracion
│   │       ├── AdminUsuarios.jsx      # Crear/eliminar/ascender usuarios
│   │       ├── AdminEstadisticas.jsx  # Totales y desgloses
│   │       └── CambiarPassword.jsx    # Formulario para que un usuario cambie su propia contraseña
│   ├── .env                    # URL y clave publica de Supabase para el login (no se sube a git)
│   ├── index.html
│   └── package.json            # Lista de librerias que necesita el frontend
│
└── README.md                   # Este archivo
```

Más adelante añadiremos una carpeta `/mobile` para la app móvil (por ejemplo con React Native, que reutiliza mucho código del frontend web).

## Conceptos básicos antes de empezar

- **Backend**: es el servidor. Corre en tu ordenador (o en la nube) y hace el trabajo "invisible": procesar archivos, marcarlos, guardar quién descargó qué. Lo escribimos en Python con un framework llamado **FastAPI**.
- **Frontend**: es la parte visual, la página web que tú y tus usuarios vais a ver en el navegador. La escribimos con **React** (para la interactividad) y **Tailwind CSS** (para los estilos/diseño).
- **Base de datos (Supabase)**: es donde queda guardado el historial de "a quién le diste qué copia marcada con qué código". Sin esto, podrías marcar imágenes pero no sabrías traducir una marca encontrada de vuelta al nombre de la persona.
- **Terminal**: los comandos de abajo se ejecutan en una ventana de terminal (PowerShell en Windows). Cada bloque de código es un comando que copias y pegas.
- El backend y el frontend son **dos programas independientes** que se ejecutan **al mismo tiempo**, cada uno en su propia ventana de terminal, mientras estás desarrollando.

## Paso 1: Requisitos ya instalados

Ya verifiqué en tu equipo:
- Python 3.14
- Node.js 24 y npm 11

No necesitas instalar nada más para empezar.

## Paso 2: Configurar Supabase (base de datos)

Esto ya lo hiciste una vez, pero lo dejo documentado por si necesitas repetirlo (por ejemplo, en otro ordenador):

1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa el que ya tienes: **seguimiento-forense**).
2. En el panel del proyecto, ve a **SQL Editor → New query**, pega todo el contenido de [backend/supabase/schema.sql](backend/supabase/schema.sql) y dale a **Run**. Esto crea las tablas `archivos_originales` y `copias_distribuidas`.
3. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - La clave **service_role** (NO la clave `anon`/`publishable` — esa es para el frontend público, esta otra da acceso total y solo debe usarla el backend)
4. Abre `backend/.env` y pégalas:
   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_KEY=tu-clave-service-role
   ```

⚠️ **Nunca compartas la clave `service_role`** (ni la subas a GitHub, ni la pongas en el frontend). Si alguna vez crees que se expuso, puedes invalidarla y generar una nueva desde **Project Settings → API → Reset service_role key** — luego actualiza `backend/.env` con la nueva.

5. Copia también la clave **`anon` / `publishable`** (esta sí es para el frontend) y pégala en `frontend/.env`:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-publishable
   ```

6. Crea al menos un usuario para poder entrar a la app: **Authentication → Users → Add user**, escribe un email y contraseña, y marca "Auto Confirm User" (así no hace falta configurar el envío de emails de confirmación). No hay registro público — todas las cuentas se crean así, a mano, desde el panel.

## Paso 3: Arrancar el backend (API en Python)

Abre una terminal (PowerShell) y ejecuta estos comandos **uno por uno**, en este orden:

1. Entra en la carpeta del backend:
   ```bash
   cd backend
   ```

2. Crea un "entorno virtual" (una caja aislada donde se instalan las librerías de Python solo para este proyecto, sin mezclarlas con otras cosas de tu ordenador). **Esto solo se hace una vez**:
   ```bash
   python -m venv venv
   ```

3. Activa el entorno virtual (esto hay que hacerlo **cada vez que abras una terminal nueva** para trabajar en el backend):
   - En PowerShell:
     ```bash
     venv\Scripts\Activate.ps1
     ```
   - Si usas Git Bash en vez de PowerShell:
     ```bash
     source venv/Scripts/activate
     ```
   Sabrás que funcionó porque aparecerá `(venv)` al principio de la línea de tu terminal.

4. Instala las librerías que necesita el backend. **Esto solo hace falta la primera vez, o cuando añadamos una librería nueva**:
   ```bash
   pip install -r requirements.txt
   ```

5. Arranca el servidor:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Si todo va bien verás un mensaje tipo `Uvicorn running on http://127.0.0.1:8000`.

6. Abre tu navegador en [http://localhost:8000/docs](http://localhost:8000/docs) — ahí puedes probar todos los endpoints desde un formulario visual, sin escribir código (FastAPI lo genera solo). Desde que hay autenticación, la mayoría de endpoints piden una cabecera `Authorization: Bearer <token>` — para probar cosas rápido a mano es más simple usar el frontend (que ya se ocupa de esto solo tras iniciar sesión).

Para **detener** el servidor, vuelve a la terminal y pulsa `Ctrl + C`.

## Paso 4: Arrancar el frontend (web en React)

Abre **otra** ventana de terminal nueva (deja la del backend abierta y corriendo) y ejecuta:

1. Entra en la carpeta del frontend:
   ```bash
   cd frontend
   ```

2. Instala las librerías del frontend. **Esto solo hace falta la primera vez, o cuando añadamos una librería nueva**:
   ```bash
   npm install
   ```

3. Arranca el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Verás un mensaje con una dirección tipo `http://localhost:5173`.

4. Abre esa dirección en tu navegador. Primero verás una pantalla de **inicio de sesión** — entra con el email y contraseña que creaste en el Paso 2.6. Una vez dentro verás dos pestañas: **Marcar imagen** y **Verificar imagen filtrada** (por eso es importante tener el backend corriendo del Paso 3 al mismo tiempo — arriba del todo verás si logró conectarse).

Para **detener** el servidor, vuelve a esa terminal y pulsa `Ctrl + C`.

### Cómo se usa

**Marcar imagen**: opcionalmente elige o crea un documento (para agrupar copias del mismo archivo), sube la imagen, escribe un código corto (máximo 8 caracteres) y los datos del destinatario, y dale a "Marcar imagen y guardar registro". Descarga la imagen resultante desde el botón que aparece.

**Verificar imagen filtrada**: sube la imagen sospechosa y dale a "Buscar marca invisible". Te muestra el código escondido y, automáticamente, quién recibió esa copia (nombre, email, documento y fecha) si el código coincide con un registro en Supabase.

> Nota técnica: el frontend asume que el backend corre en `http://localhost:8000` (está escrito en [frontend/src/api.js](frontend/src/api.js)). Si algún día lo despliegas en otro servidor, ese es el único sitio donde hay que cambiar la dirección.

## Resumen del día a día

Cada vez que quieras trabajar en el proyecto, necesitas **dos terminales abiertas a la vez**:

**Terminal 1 (backend):**
```bash
cd backend
venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (frontend):**
```bash
cd frontend
npm run dev
```

## La API del backend

Todos los endpoints de esta sección (excepto `/` y `/health`) exigen haber iniciado sesión: hay que mandar la cabecera `Authorization: Bearer <token>`, donde `<token>` es el `access_token` que devuelve Supabase Auth al iniciar sesión. Sin eso, o con un token invalido/caducado, la API responde `401`. El frontend ya se ocupa de esto automáticamente tras el login.

### `POST /archivos`

Registra un documento/imagen original en la tabla `archivos_originales`, para poder vincularle después copias marcadas. Devuelve el registro creado, incluyendo su `id` (lo necesitas para el campo `archivo_id` de `/ocultar-marca`).

| Campo (form-data) | Obligatorio | Descripción |
|---|---|---|
| `nombre` | Sí | Un nombre o etiqueta para identificar el documento (ej. `contrato_2026.pdf`) |

```bash
curl -X POST http://localhost:8000/archivos -F "nombre=contrato_2026.pdf"
```
Devuelve: `{"id": "38f9bae5-...", "nombre": "contrato_2026.pdf", "fecha": "2026-08-05T19:09:12+00:00"}`

### `GET /archivos`

Devuelve la lista de todos los documentos registrados, del más reciente al más antiguo. Útil para consultar el `id` de un archivo que ya creaste antes, sin tener que entrar a Supabase.

```bash
curl http://localhost:8000/archivos
```
Devuelve: `[{"id": "...", "nombre": "contrato_2026.pdf", "fecha": "..."}, ...]`

### `POST /ocultar-marca`

Recibe una imagen, esconde un código dentro y guarda en Supabase quién la recibió. Devuelve la imagen ya marcada (PNG).

| Campo (form-data) | Obligatorio | Descripción |
|---|---|---|
| `imagen` | Sí | El archivo de imagen (mínimo 256x256 píxeles; cuanto más grande y de mejor calidad, más resiste el marcado a compresiones posteriores) |
| `ID_Usuario` | Sí | El código que se esconde dentro de la imagen. Máximo 8 caracteres (más adelante se explica por qué) |
| `nombre_destinatario` | Sí | Nombre de la persona a la que le vas a entregar esta copia |
| `email_destinatario` | Sí | Su email |
| `archivo_id` | No | El `id` de una fila ya creada en `archivos_originales`, si quieres vincular esta copia a un documento concreto |

Ejemplo con `curl` (todo en una sola línea, para evitar líos de sintaxis entre terminales):
```bash
curl -X POST http://localhost:8000/ocultar-marca -F "imagen=@foto.png" -F "ID_Usuario=user007" -F "nombre_destinatario=Juan Perez" -F "email_destinatario=juan@example.com" -o foto_marcada.png
```

### `POST /extraer-marca`

Recibe una imagen (por ejemplo, una que encontraste filtrada) y devuelve el código escondido.

```bash
curl -X POST http://localhost:8000/extraer-marca -F "imagen=@foto_marcada.png"
```
Devuelve: `{"ID_Usuario": "user007"}`

⚠️ Este endpoint siempre devuelve algo, incluso si la imagen nunca fue marcada — el algoritmo no distingue "no hay marca" de "hay marca pero es ruido", simplemente decodifica lo que sea que haya en esa zona de frecuencia. Por eso el siguiente paso (`GET /copias/...`) es el que de verdad confirma si el código significa algo.

### `POST /ocultar-marca-pdf` y `POST /extraer-marca-pdf`

Igual que sus equivalentes de imagen, pero para PDFs. Mismos campos (`pdf` en vez de `imagen`), mismo comportamiento con Supabase.

```bash
curl -X POST http://localhost:8000/ocultar-marca-pdf -F "pdf=@contrato.pdf" -F "ID_Usuario=user007" -F "nombre_destinatario=Juan Perez" -F "email_destinatario=juan@example.com" -o contrato_marcado.pdf
curl -X POST http://localhost:8000/extraer-marca-pdf -F "pdf=@contrato_marcado.pdf"
```

**Cómo funciona por dentro**: la técnica se elige automáticamente **página por página**, según si esa página tiene texto real o es un escaneo:

- **Página con texto** (el caso normal: un contrato, un informe, etc.): el código se inserta como texto en "modo de renderizado invisible" (`render_mode=3` de la especificación PDF — el mismo mecanismo que usan las capas de texto de OCR sobre documentos escaneados: el texto existe en el contenido del PDF y se puede extraer, pero ningún lector lo dibuja en pantalla ni al imprimir). No usa metadatos.
- **Página que es un escaneo** (no tiene texto, solo una imagen pegada, como saldría de un escáner o una foto de un documento): se aplica directamente sobre esa imagen el mismo marcado en frecuencia (`dwtDctSvd`) que se usa para imágenes sueltas — misma robustez y mismas limitaciones ya documentadas para imágenes.
- Al extraer, primero se busca el texto invisible en todas las páginas; si no aparece en ninguna (por ejemplo, porque el PDF entero es un escaneo), se prueba a decodificar la marca de frecuencia de cada imagen embebida.

**Probado y confirmado**:
- Comparación píxel a píxel entre el PDF original y el marcado (páginas de texto): **0 diferencias** — invisible de verdad, no solo "difícil de notar".
- Sobrevive a: reenviar el archivo tal cual, que alguien limpie los metadatos con otra herramienta, que alguien extraiga o reordene solo una página con otra librería distinta a la que usamos para marcar.
- Un PDF con una **página escaneada** conserva el código aunque esa página se reenvíe sola, separada del resto del documento.
- Al reemplazar la imagen de una página escaneada, hay que guardar el PDF con recolección de basura (`garbage=4`) — sin esto, la imagen ORIGINAL sin marcar se queda igualmente guardada dentro del archivo (aunque ya no se dibuje), extraíble por cualquiera que abra el PDF con una herramienta de bajo nivel. Lo detectamos probándolo y ya está corregido.
- **No sobrevive** a que el PDF entero se aplane a imágenes *después* de marcado (por ejemplo, "imprimir a PDF" desde un escáner sobre una página que tenía texto) — es la misma limitación de fondo que la foto-de-pantalla en imágenes: en cuanto el contenido se re-renderiza como píxeles puros, el texto invisible deja de existir. Las páginas que ya eran un escaneo desde el principio no tienen este problema porque usan el marcado de imagen, no de texto.
- A diferencia de las imágenes, el `ID_Usuario` **no tiene límite de longitud** en las páginas con texto real (es texto real, no una capacidad fija en bits) — pero si el PDF (o alguna de sus páginas) es un escaneo, aplica el mismo límite de 8 caracteres que las imágenes sueltas, por la misma razón.

### `GET /copias/{id_unico_marca}`

Busca en `copias_distribuidas` quién recibió una copia con ese código. Primero intenta una coincidencia exacta. Si no encuentra ninguna, compara el código contra **todos** los códigos ya emitidos y devuelve los que se parezcan (por defecto, hasta 2 caracteres de diferencia — ajustable con `?tolerancia=N`), del más parecido al menos. Cada resultado incluye `distancia_edicion` (`0` = exacto). Devuelve una lista vacía si no hay ni coincidencia exacta ni parecida.

```bash
curl "http://localhost:8000/copias/user007"
curl "http://localhost:8000/copias/user0o7?tolerancia=1"
```
Devuelve: `[{"id": "...", "nombre_destinatario": "Juan Perez", "email_destinatario": "juan@example.com", "id_unico_marca": "user007", "fecha_envio": "...", "archivos_originales": {"nombre": "contrato_2026.pdf"}, "distancia_edicion": 0}]`

**Por qué existe esto**: ya documentamos que una imagen muy comprimida puede hacer que `/extraer-marca` devuelva un código con 1-2 caracteres mal leídos (ver limitaciones más abajo). Antes, eso significaba una búsqueda sin resultados aunque la copia sí estuviera registrada. Ahora, si no hay coincidencia exacta, se busca automáticamente el código real más parecido entre los ya emitidos.

⚠️ Una coincidencia aproximada **no es matemáticamente segura** — es una sugerencia basada en similitud de texto, no una prueba. El frontend la marca claramente en amarillo con la diferencia exacta, para que la verifiques antes de actuar (por ejemplo, antes de acusar a alguien de una filtración).

El frontend encadena `/extraer-marca` y este endpoint automáticamente: subes la imagen sospechosa una vez y te muestra directamente quién la recibió (marcando si fue una coincidencia exacta o aproximada).

### Endpoints de destinatarios guardados (`/destinatarios`)

Cualquier usuario logueado (no hace falta ser admin) puede guardar personas a las que suele marcarles archivos, para no volver a escribir su nombre/email cada vez.

| Endpoint | Qué hace |
|---|---|
| `GET /destinatarios` | Lista los destinatarios guardados **del usuario que hace la petición** (no ve los de nadie más) |
| `POST /destinatarios` | Guarda uno nuevo (`nombre`, `email`). Si repites un email que ya tenías guardado, da `400` |
| `DELETE /destinatarios/{id}` | Elimina uno. Si el `id` no es tuyo (es de otro usuario o no existe), no falla pero tampoco borra nada — así no se puede usar para averiguar si un ID pertenece a otra persona |

El aislamiento entre usuarios se hace comparando siempre `usuario_id` en el backend (igual que con los roles: no hay políticas RLS para esto, todo pasa por el `service_role` del backend).

### Cambiar tu propia contraseña

No es un endpoint del backend — el frontend llama directamente a Supabase (`supabase.auth.updateUser({ password })`) usando la sesión que ya tienes abierta. No hace falta la contraseña actual (el hecho de tener una sesión válida ya es suficiente prueba), ni que Supabase tenga configurado el envío de emails (que es lo que fallaba antes, cuando la única forma de cambiarla era pedirle a Supabase que mandara un email de recuperación).

### Endpoints de administración (`/admin/...`)

Todos estos exigen, además del login normal, que tu cuenta tenga `role: "admin"` en Supabase Auth — si no, la API devuelve `403`. La forma normal de usarlos es desde la pestaña "Administración" del frontend, no a mano.

| Endpoint | Qué hace |
|---|---|
| `GET /admin/usuarios` | Lista todas las cuentas (email, si es admin, últimos accesos) |
| `POST /admin/usuarios` | Crea una cuenta nueva (`email`, `password`, `es_admin`) |
| `PATCH /admin/usuarios/{id}` | Cambia si una cuenta es admin o no (`es_admin`) |
| `DELETE /admin/usuarios/{id}` | Elimina una cuenta |
| `GET /admin/estadisticas` | Totales, desglose por documento/destinatario/fecha, actividad reciente |

**Cómo funcionan los roles**: no hay una tabla nueva para esto — se usa el campo `app_metadata` que ya trae Supabase Auth (`role: "admin"`). Cada endpoint de administración depende de `usuario_autenticado` (el login normal) más una comprobación extra de ese campo.

**Protecciones probadas**: no puedes eliminar tu propia cuenta ni quitarte a ti mismo el rol de administrador (para no dejar la app sin ningún admin por accidente) — ambas devuelven `400` con un mensaje claro si lo intentas.

⚠️ **Los cambios de rol tardan en aplicar si la persona ya tiene sesión iniciada**: el permiso de administrador viaja dentro del token de sesión (JWT), que se genera al iniciar sesión y dura hasta 1 hora. Si le quitas el rol de admin a alguien que ya está usando la app, seguirá teniendo acceso de administrador hasta que su token caduque o cierre sesión y vuelva a entrar — no es instantáneo.

**No hay registro público**: la única forma de crear cuentas es que un administrador lo haga desde este panel (o tú a mano desde Supabase, como al principio). La primera cuenta administradora del proyecto se creó así, directamente con la API, antes de que existiera ninguna cuenta.

### Por qué el `ID_Usuario` está limitado a 8 caracteres (solo en imágenes)

El algoritmo de marcado necesita saber de antemano cuántos caracteres tiene que buscar dentro de la imagen. Probamos varias longitudes: cuanto más largo el código, más frágil es la marca si la imagen se recomprime (por ejemplo, al hacerle una captura de pantalla o reenviarla por WhatsApp). Con 8 caracteres el equilibrio entre "cabe información útil" y "sobrevive a compresión" es razonable.

**Recomendación práctica**: usa códigos cortos generados por ti (ej. `a3f9k2`) en vez del nombre de usuario real, y guarda la relación código ↔ persona en la base de datos (que es justo para lo que sirve `copias_distribuidas`).

El límite de 8 caracteres lo valida el backend (`400` si te pasas), no solo el campo del formulario — así que aunque llames a la API directamente sin usar el frontend, no hay forma de generar por accidente una imagen cuyo código no coincida con lo guardado en Supabase.

### Por qué se marca a un tamaño fijo (no al tamaño original de la imagen)

**El problema real que motivó esto**: subiste una imagen, la marcaste, comprobaste que la marca era correcta, la mandaste por WhatsApp, la descargaste — y ya no tenía marca. Reproducimos el fallo exacto con tus dos imágenes reales y encontramos la causa: **WhatsApp había cambiado la resolución** (tu imagen pasó de 2000x1500 a 1600x1200). No era un problema de calidad de compresión (esa la tolerábamos bien) — es que el algoritmo original leía la marca dividiendo la imagen en una cuadrícula de bloques de píxeles; si el tamaño cambia, esa cuadrícula ya no coincide con la que se usó para esconder la marca, y la lectura sale vacía. Lo confirmamos aislando la causa: una imagen redimensionada (sin ninguna compresión de por medio) ya rompía la marca por completo.

**La solución**: en vez de trabajar con el tamaño real de cada imagen, el marcado y la lectura **siempre** se hacen sobre una copia reducida a un tamaño fijo (512x512 píxeles) — así que da igual si la imagen que te llega de vuelta mide 2000x1500, 1600x1200 o cualquier otro tamaño: antes de leer la marca, siempre se vuelve a reducir a ese mismo tamaño fijo, con lo que la cuadrícula vuelve a coincidir. El cambio visual que produce el marcado se calcula a ese tamaño reducido y luego se reescala (y se suaviza, para que no se note como una cuadrícula) a la resolución real de la imagen, así que la imagen que descargas conserva su calidad original.

**Probado con tus imágenes reales**: tras el cambio, simulamos exactamente lo que le hizo WhatsApp a tu imagen (mismo cambio de resolución, misma calidad JPEG) y el código se recuperó exacto. También lo probamos con una batería de casos más agresivos (reducir al 25-50% del tamaño, distintas calidades JPEG) — en el peor caso quedó a 1 carácter de diferencia, dentro de lo que ya cubre la búsqueda aproximada.

### Por qué ya no dependemos del paquete `invisible-watermark`

Al preparar el despliegue en la nube, medimos cuánta RAM y disco ocupaba el backend. Encontramos que `torch` (una librería de IA para redes neuronales) suponía **~500 MB en disco y ~250 MB de RAM solo con arrancar el servidor**, sin haber marcado ni una imagen — y no la usamos para nada: la libreria `invisible-watermark` la importa igual para su método `rivaGan`, que nosotros nunca usamos (solo usamos `dwtDctSvd`).

Como el archivo que sí necesitábamos (`dwtDctSvd.py`, con licencia MIT) no depende de `torch` en ningún momento, lo copiamos directamente a [backend/app/dwt_dct_svd.py](backend/app/dwt_dct_svd.py) y dejamos de depender del paquete completo. Antes de dar esto por bueno, comparamos byte a byte que produce **exactamente el mismo resultado** que la librería original, y volvimos a correr toda la batería de pruebas (imágenes, PDFs, compresión JPEG, búsqueda aproximada). Resultado: `site-packages` bajó de 892 MB a 288 MB, y la RAM en reposo del servidor de ~267 MB a ~110 MB — con margen de sobra para un plan gratuito de hosting.

### Limitaciones conocidas (probadas, no teóricas)

**Imágenes:**
- Una imagen guardada como PNG sin tocar conserva la marca perfectamente.
- **Reenvío por WhatsApp (o cualquier app que cambie la resolución de la imagen): confirmado que funciona** (ver [Por qué se marca a un tamaño fijo](#por-qué-se-marca-a-un-tamaño-fijo-no-al-tamaño-original-de-la-imagen)) — este era el caso que más importaba y antes fallaba siempre.
- Recomprimida como JPEG, la marca sobrevive bien incluso a calidades bastante agresivas (probado hasta calidad 50 sin cambios de tamaño, y hasta calidad 60-70 combinado con reducciones de tamaño del 50-80%).
- En los casos más extremos probados (reducir la imagen a una miniatura del 25% de su tamaño, combinado con compresión agresiva) puede aparecer **algún carácter incorrecto** en el código recuperado — cubierto por la búsqueda aproximada de `GET /copias/...` (tolera hasta 2 caracteres de diferencia).
- Una **foto tomada con el móvil a la pantalla** (en vez de una captura o reenvío digital) sigue sin conservar la marca — esto es un problema distinto al del tamaño: una foto de cámara no solo cambia la resolución, también introduce ángulo/rotación/perspectiva, para lo que investigamos una corrección automática y la descartamos (`dwtDctSvd` necesita ~3 píxeles de precisión de alineación en una imagen de 1920px, algo que ninguna detección de bordes sobre una foto real puede alcanzar). Sigue fuera del alcance del proyecto.
- **Decisión de diseño**: para el caso de foto-de-pantalla, se evaluó y se descartó añadir una marca visible de respaldo. El objetivo del proyecto es que el destinatario nunca sepa que su copia está marcada — una marca visible alertaría al filtrador y le daría la oportunidad de evitar la cámara o el reenvío para esa copia en concreto. Se acepta esta limitación como un caso que el sistema no cubre, en vez de comprometer el sigilo del resto.

**PDFs:**
- Sobrevive a reenvíos, limpieza de metadatos y manipulación con otras librerías (ver detalle en la sección de la API más arriba).
- Las páginas que ya son un escaneo (solo imagen, sin texto) se marcan con la misma técnica que las imágenes sueltas — hereda su misma robustez ante cambios de resolución.
- **Reenviar el PDF como documento (WhatsApp, email, etc.)**: probado que sobrevive a que otra librería reescriba el archivo por completo, y a compresores de PDF típicos usados moderadamente (probado con una reducción del 60% + JPEG calidad 70, quedó casi exacto). Con compresores muy agresivos (reducir a menos del 40% del tamaño) puede degradarse más allá de lo que cubre la búsqueda aproximada — mismo límite que ya conocíamos para imágenes muy comprimidas. No se probó con un envío real por WhatsApp específicamente (sí se probó con imágenes sueltas, ver más arriba); si te importa el caso exacto, podemos repetir esa misma prueba real con un PDF.
- **Captura de pantalla de una página con texto real**: la marca **no sobrevive nunca** — es esperable, el texto invisible (`render_mode=3`) literalmente no se dibuja en pantalla, así que no hay nada que una captura pueda capturar.
- **Captura de pantalla de una página escaneada**: sobrevive **solo si la captura encuadra exactamente el contenido de la imagen, sin ningún margen ni recorte** — lo probamos y funciona bien a distintas resoluciones de pantalla (96 a 220 DPI) y en PNG o JPEG. Pero es extremadamente sensible al encuadre: **un margen o recorte de apenas el 0.5% del borde ya rompe la marca por completo** (no es una degradación gradual, es todo o nada). En la práctica esto significa que una captura "limpia" de la imagen sola puede funcionar, pero una captura típica de un visor de PDF (con barra de herramientas, scroll, o un encuadre no perfecto) muy probablemente no conservará la marca — es el mismo tipo de problema de precisión de alineación que ya encontramos con las fotos de cámara a pantalla, aunque aquí el fallo es por un pequeño desplazamiento/recorte en vez de por perspectiva.

## Despliegue en la nube

La app está desplegada de verdad, con capa gratuita en las tres piezas:

| Pieza | Dónde | URL |
|---|---|---|
| Backend (API) | [Render](https://render.com) | https://seguimiento-forense-backend.onrender.com |
| Frontend (web) | [Vercel](https://vercel.com) | https://app-seguimiento-forense.vercel.app |
| Base de datos + Auth | [Supabase](https://supabase.com) | (ya lo tenías configurado) |

### Cómo se actualiza

El código vive en GitHub (`github.com/protesten/app-seguimiento-forense`). Tanto Render como Vercel están conectados a ese repositorio: **cada vez que hagas `git push` a la rama `main`, ambos vuelven a desplegar automáticamente solos**, sin que tengas que hacer nada en sus paneles. No hace falta repetir el proceso de configuración manual.

```bash
git add -A
git commit -m "mensaje describiendo el cambio"
git push
```

⚠️ **Excepción**: si un cambio añade o modifica una tabla (como pasó con `destinatarios_guardados`), el `git push` **no** actualiza la base de datos — hay que ejecutar tú el `backend/supabase/schema.sql` actualizado en el SQL Editor de Supabase, aparte y antes de que el código nuevo lo necesite.

### Variables de entorno en producción

Estas viven en los paneles de Render/Vercel, no en archivos `.env` (esos son solo para tu ordenador):

**Render** (Environment):
- `SUPABASE_URL`, `SUPABASE_KEY` (la clave `service_role`)
- `FRONTEND_ORIGINS=https://app-seguimiento-forense.vercel.app` (para que el navegador pueda hablar con la API — si despliegas el frontend en otro dominio más adelante, añádelo aquí separado por comas)

**Vercel** (Settings → Environment Variables):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (la clave pública/`publishable`, no la `service_role`)
- `VITE_API_URL=https://seguimiento-forense-backend.onrender.com`

### Limitaciones del plan gratuito (probadas, no teóricas)

- **El backend "se duerme"**: Render apaga la instancia gratuita tras ~15 minutos sin tráfico. La primera petición después de eso puede tardar **hasta 50 segundos** en responder mientras arranca de nuevo (esto lo avisa el propio Render en su panel). Las peticiones siguientes van rápido hasta que se vuelve a dormir por inactividad.
- **Ráfagas de peticiones simultáneas pueden fallar**: probando el despliegue, mandé 20 peticiones seguidas sin pausa y un 45% devolvió un `404` genérico. Investigando con los logs de Render confirmamos que **la aplicación en sí nunca fallaba** (su propio registro solo mostraba respuestas correctas, 200 o 401) — el `404` lo generaba la capa gratuita de Render cuando el único worker disponible (`WEB_CONCURRENCY=1` en el plan gratuito) recibía más peticiones a la vez de las que podía atender de inmediato. Repetimos la misma prueba con una pausa de 1.5s entre peticiones (uso normal de una persona) y salieron **15 de 15 correctas**. Conclusión: no afecta el uso normal de una sola persona a la vez; si varias personas fueran a usar la app simultáneamente con frecuencia, valdría la pena pasar a un plan de pago (más workers).
- Si algún día necesitas que el backend no se duerma nunca (por ejemplo, para una demo importante), la opción más simple es subir el plan de Render a uno de pago (~$7/mes).

### Cómo desplegarlo desde cero (por si algún día hay que rehacerlo)

1. El código debe estar en un repositorio de GitHub — `git init`, `git remote add origin <url>`, `git push`.
2. **Backend en Render**: New → Blueprint → selecciona el repo. Render detecta [render.yaml](render.yaml) automáticamente y te pide rellenar `SUPABASE_URL` y `SUPABASE_KEY` (deja `FRONTEND_ORIGINS` vacío por ahora).
3. **Frontend en Vercel**: Add New → Project → importa el repo → **Root Directory: `frontend`** (importante, es un monorepo) → añade las variables de entorno (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` con la URL de Render del paso 2) → Deploy.
4. Vuelve al panel de Render → Environment → rellena `FRONTEND_ORIGINS` con la URL que te dio Vercel en el paso 3 → guarda (se reinicia solo).

## Próximos pasos del proyecto

- [x] Elegir la técnica de marcado invisible → `invisible-watermark` con `dwtDctSvd`
- [x] Guardar en una base de datos qué copia se entregó a quién → Supabase (`copias_distribuidas`)
- [x] Endpoint para registrar archivos en `archivos_originales` desde la app → `POST /archivos`
- [x] Endpoint para listar los archivos ya registrados → `GET /archivos`
- [x] Construir la pantalla de subida de archivos en el frontend (elegir/crear documento, subir imagen, escribir destinatario, descargar resultado)
- [x] Pantalla en el frontend para subir una imagen sospechosa y ver el código detectado
- [x] Pantalla en el frontend para ver quién es el destinatario de un código detectado → `GET /copias/{id_unico_marca}`, encadenado automáticamente tras extraer la marca
- [x] Soportar documentos además de imágenes → PDFs vía `POST /ocultar-marca-pdf` y `POST /extraer-marca-pdf` (texto invisible en el contenido, no metadatos), frontend actualizado para aceptar ambos tipos en las mismas dos pantallas
- [x] Marcar PDFs que son solo escaneos (sin texto real) — se detecta automáticamente página por página y se aplica el marcado de imágenes (`dwtDctSvd`) sobre cada imagen embebida
- [x] Añadir autenticación de usuarios → Supabase Auth (login por email/contraseña), todos los endpoints de datos exigen token, cuentas creadas a mano desde el panel de Supabase (sin registro público)
- [x] **Revisión de código completa** (2026-08-06) — encontrado y corregido un bug real: `/ocultar-marca` no validaba la longitud de `ID_Usuario` en imágenes, así que un código de más de 8 caracteres se guardaba completo en Supabase pero solo se incrustaba truncado en la imagen — si esa copia se filtraba, la búsqueda nunca coincidía. Ahora la API lo rechaza con un `400` claro. También se fijaron las versiones exactas en `requirements.txt` (antes sin versión, riesgo de que una actualización futura de alguna librería rompiera el proyecto).
- [x] Mensajes de error saneados — antes `raise HTTPException(detail=f"...{error}")` exponía el texto interno de la excepción de Python al cliente; ahora se registra el detalle real con `logger.error(...)` (visible en la terminal del backend) y se devuelve al cliente un mensaje genérico y seguro
- [x] CORS restringido a `http://localhost:5173` / `http://127.0.0.1:5173` (antes `allow_origins=["*"]` + `allow_credentials=True`) y se quitó `allow_credentials` (no hace falta: la sesión viaja en la cabecera `Authorization`, no en cookies). Cuando despliegues el frontend en un dominio real, añádelo a la lista en `backend/app/main.py`
- [x] `nombre_destinatario` y `email_destinatario` ahora rechazan espacios en blanco vacíos, igual que `ID_Usuario`
- [x] Manejar los errores de marca "casi correcta" → `GET /copias/{id_unico_marca}` busca coincidencias aproximadas (distancia de edición, tolerancia configurable) cuando no hay coincidencia exacta; el frontend lo marca en amarillo con la diferencia exacta
- [x] Quitar la dependencia de `torch` (vía `invisible-watermark`) — no la usábamos para nada, y hacía el backend ~500MB más pesado y ~250MB más hambriento de RAM en balde. Ahora `dwtDctSvd` está implementado directamente en `backend/app/dwt_dct_svd.py`, sin `torch`. Preparación necesaria para que el despliegue en la nube quepa cómodo en un plan gratuito.
- [x] Preparar el despliegue en la nube → backend en Render + frontend en Vercel, ambos gratuitos, con auto-deploy desde GitHub en cada `git push`. Ver [Despliegue en la nube](#despliegue-en-la-nube).
- [x] Panel de administración → gestión de usuarios (crear/eliminar/ascender, sin registro público) y estadísticas (totales, desglose por documento/destinatario/fecha, actividad reciente). Roles vía `app_metadata` de Supabase Auth, sin tabla nueva.
- [x] Pantalla para que un usuario cambie su propia contraseña → junto a "Cerrar sesión", usa `supabase.auth.updateUser` directamente, sin depender del envío de emails de Supabase
- [x] Destinatarios guardados por usuario → `GET/POST /destinatarios`, `DELETE /destinatarios/{id}`, selector en la pantalla de marcar con autocompletado y checkbox "guardar para la próxima vez"
- [x] **Bug crítico: la marca no sobrevivía a reenviar la imagen por WhatsApp** (2026-08-11) — diagnosticado con las imágenes reales del usuario: la causa era el cambio de resolución que hace WhatsApp, no la compresión. Rediseñado el marcado de imágenes para que use siempre un tamaño de trabajo fijo (512x512), invariante a cualquier cambio de resolución posterior. Ver [Por qué se marca a un tamaño fijo](#por-qué-se-marca-a-un-tamaño-fijo-no-al-tamaño-original-de-la-imagen).
- [x] **Investigar si los PDFs sobreviven a reenvío y a capturas de pantalla** (2026-08-11) — probado y documentado en detalle en [Limitaciones conocidas](#limitaciones-conocidas-probadas-no-teóricas): el reenvío como documento sobrevive bien (probado con reescritura por otra librería y compresores moderados); las capturas de pantalla de páginas con texto nunca sobreviven (esperable); las capturas de páginas escaneadas sobreviven solo con un encuadre exacto, sin ningún margen ni recorte.
- [ ] Tolerar pequeños márgenes/recortes al leer la marca de una captura de pantalla (hoy hace falta un encuadre pixel-perfect) — necesitaría una búsqueda de desplazamiento/recorte en el momento de extraer, similar en espíritu a la búsqueda de tamaño que ya se hizo para el caso de WhatsApp
- [ ] Carpeta `/mobile` para la app móvil
