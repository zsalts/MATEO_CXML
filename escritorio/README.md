# Tag & View Pro — versión de escritorio

App de escritorio de Tag & View Pro, con pantallas propias (ya no carga la web
del iPad): capturás el partido con la cámara o la placa HDMI y lo codificás con
las plantillas que armaste en el iPad, o lo codificás desde el iPad por wifi, o
importás un video con su XML. Todo queda en una base de datos local, con el
video y el XML enlazados a cada partido.

## Qué agrega

- **Cámara por placa de captura HDMI** (Elgato, Cam Link, genérica): Windows la
  muestra como si fuera una webcam y la app la abre directo. También anda una
  webcam USB común.
- **Grabación del partido entero** a un archivo MP4, escrito al disco a medida
  que llega. Un partido de dos horas nunca está entero en memoria.
- **Clips por marcas, no por archivos.** Es como trabaja Sportscode: hay un
  video del partido y cada evento es un par de marcas adentro. Ver un clip es
  saltar a su marca, así que sale al instante.
- **Base de datos local** — un `tagview.sqlite` de verdad, al lado de los
  videos. Guarda partidos, eventos, etiquetas, posesión y la botonera con la
  que se codificó.
- El **XML de Sportscode sigue saliendo igual**, y cae en la misma carpeta que
  el video.

## Instalar para desarrollar

Hace falta Node.js una sola vez:

```bash
winget install OpenJS.NodeJS.LTS
```

Cerrá y abrí la terminal para que tome el PATH. Después:

```bash
cd escritorio; npm install; npm start
```

Pruebas: `npm test`. En Node 22 o más nuevo `node --test test/` no acepta una
carpeta; usá `npm test` o `node --test "test/*.test.js"`.

Sin Electron, `src/index.html` en un servidor estático abre las pantallas con
una API de mentira (`src/ui/api-simulada.js`, solo para desarrollo).

## Generar el instalador .exe

```bash
cd escritorio; npm run dist
```

Deja el instalador en `escritorio/dist/`. Es un NSIS común: se instala, queda
en el menú Inicio y con acceso directo en el escritorio.

## Cómo se usa

La app abre en el **menú principal**:

1. **Mis plantillas**: **Nueva** arma una botonera en la compu, igual que en
   el iPad (Base de datos › Plantillas › Editar diseño para cambiar una que
   ya está), con una tecla por botón para codificar con el teclado. O
   **Importar del iPad**: la copia de seguridad, una plantilla o una sesión
   exportada desde el iPad (o "Traer de la nube").
2. **Captura en vivo**: elegís la cámara o la placa HDMI y la plantilla.
   **PLAY arranca la grabación.** Cada evento se ve al instante (▶ Ver) y se
   corta como clip sin esperar (✂). **Terminar** deja el video, el XML y los
   clips en `Partidos/<nombre>/` y el partido en la base.
3. **Captura desde iPad**: la compu graba y muestra un QR, la dirección y un
   PIN; el iPad (misma wifi) lo abre en Safari y codifica. Si se corta el
   wifi, los toques quedan en el iPad y entran al reconectar.
4. **Importar video + archivo**: un video con su XML de Sportscode/Nacsport/
   LongoMatch o una sesión del iPad; se sincroniza y se guarda en la base.
   También sirve para vincular un video a un partido que ya está en la base.
5. **Base de datos**: partidos con su video, línea de tiempo, clips entre
   partidos, plantillas y playlists; exportar XML, CSV y clips.

## Los dos relojes

El del partido se para cuando tocás PAUSE; el del video no, porque la cámara
no se entera. La app guarda un mapa de tramos entre los dos, así que el clip de
un evento marcado después de tres pausas cae igual en el segundo correcto del
video.

Por eso el video que queda es el partido **entero, sin cortes**, incluidos los
tiempos muertos: es un solo archivo continuo, y las marcas saben dónde está
cada cosa.

## Dónde queda cada cosa

| | |
|---|---|
| `Videos\Tag & View Pro\tagview.sqlite` | La base: partidos, eventos, plantillas, equipos, playlists |
| `Videos\Tag & View Pro\Partidos\<nombre>\` | Video, XML (mismo nombre), CSV y `Clips\` de cada partido |
| `Videos\Tag & View Pro\Respaldos\` | Copias de la base |
| `%APPDATA%\tagview-escritorio\config.json` | Carpeta de trabajo, ajustes y ventana |

La carpeta de trabajo se cambia en Ajustes. La base se abre con [DB Browser for SQLite](https://sqlitebrowser.org/) o con
cualquier cosa que lea `.sqlite`: es SQLite común, sin nada raro adentro.

## Por qué el esquema `app://`

Chromium no considera `file://` un contexto seguro, y ahí `getUserMedia` no
existe: la placa de captura no se podría abrir. La app se sirve a sí misma por
un esquema propio declarado como seguro. Es todo local. El único puerto que se
abre es el de la Captura desde iPad (8787 por defecto, se cambia en Ajustes),
y solo mientras esa pantalla lo tiene prendido.

## macOS

La misma app corre en Mac, con Apple Silicon (M1 en adelante) o Intel. En
Windows no cambia nada: `npm start`, `npm test` y `npm run dist` hacen lo mismo
que antes.

### Requisitos

- **macOS 11 (Big Sur) o más nuevo**: es lo mínimo que pide Electron 33.
- Para desarrollar: Node.js LTS (`brew install node` o el instalador de
  nodejs.org) y después, igual que en Windows,
  `cd escritorio && npm install && npm start`.

### Instalar el `.dmg` (sin firmar)

La app no está firmada con una cuenta de Apple Developer, así que macOS
desconfía la primera vez:

1. Abrí el `.dmg` que corresponde a tu Mac (`arm64` = chip Apple, `x64` =
   Intel) y arrastrá **Tag & View Pro** a Aplicaciones.
2. Abrila. macOS dice que no puede verificar al desarrollador:
   - **macOS 15 o más nuevo:** Ajustes del Sistema → Privacidad y seguridad →
     abajo de todo, **Abrir igualmente**.
   - **macOS 14 o anterior:** clic derecho sobre la app → **Abrir** → **Abrir**.
3. Desde la segunda vez abre directo.

Si dice que **"está dañada y no se puede abrir"**, es la cuarentena de la
descarga (pasa con apps sin firma bajadas de internet). En la Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/Tag & View Pro.app"
```

### Permisos

- **Cámara y micrófono**: se piden la primera vez que entrás a Captura en vivo
  o Captura desde iPad. Si los negaste, la pantalla lo explica y tiene un botón
  que abre Ajustes del Sistema → Privacidad y seguridad → Cámara. Sin micrófono
  se graba igual, mudo.
- **Red local y Firewall** (Captura desde iPad): macOS pregunta si la app puede
  recibir conexiones; hay que aceptar. Si en un minuto el iPad no entra, la
  pantalla dice qué tocar (Red → Firewall → Opciones, y en macOS 15+
  Privacidad y seguridad → Red local). **Sin firma, macOS puede volver a
  preguntar después de cada versión nueva**: es normal, se acepta de nuevo.
- La carpeta de trabajo por defecto es `~/Movies/Tag & View Pro` (Películas).

### Atajos

Donde Windows usa Ctrl, Mac usa ⌘: ⌘1…⌘6 cambian de pantalla, ⌘K busca, ⌘Z
deshace, ⌘+clic suma a la selección (Ctrl+clic es clic derecho, como en
cualquier app de Mac), ⌘, abre Ajustes. El zoom de la línea de tiempo es
⌘+rueda o pellizco del trackpad. Consola en desarrollo: ⌘⌥I.

### Generar el `.dmg`

**Desde GitHub (recomendado):** pestaña **Actions** → **Escritorio Mac** →
**Run workflow**. Arma en dos Macs de GitHub (una Apple Silicon y una Intel),
corre las pruebas y deja `tagview-mac-arm64` y `tagview-mac-x64` en
**Artifacts**, abajo de la corrida: se bajan como `.zip` con el `.dmg` y el
`.zip` adentro. También corre solo cuando un push toca `escritorio/`.

**En una Mac:**

```bash
cd escritorio && npm ci && npm run dist:mac -- --arm64   # o --x64
```

Cada arquitectura en **su** Mac: `ffmpeg-static` baja el ffmpeg de la máquina
donde corre `npm install`, y un `.dmg` x64 armado en una M1 llevaría ffmpeg
arm64. `build/mac/firmar-adhoc.js` corta el build si pasa eso y firma ffmpeg y
ffprobe "ad-hoc" (sin eso, en chip Apple macOS los mata al arrancar).

Excepción: `ffprobe-static` no trae un ffprobe arm64 de verdad (su
`bin/darwin/arm64` es x86_64). En el `.dmg` arm64 va ese y corre con Rosetta 2;
la app solo lo usa para leer duración y resolución, y si no anda usa la del
reproductor. ffmpeg, que corta los clips, sí es arm64.

### Firma y notarización (no configurado)

Para que abra sin el aviso de Gatekeeper hace falta una cuenta de **Apple
Developer Program** (USD 99/año), un certificado **Developer ID Application** y
notarizar. electron-builder lo hace solo con estas variables en el workflow
(como *secrets*): `CSC_LINK` (el `.p12` en base64), `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`, sacando
`"identity": null` de `package.json` → `build.mac` y agregando
`"notarize": true`. No está hecho: cuesta plata y necesita la cuenta.

Lo que hay que probar a mano en una Mac: `MAC-PRUEBAS.md`.

Para ver la cara de Mac sin una Mac, abrí `src/index.html` en un servidor
estático con `?plataforma=mac` (API simulada). `?camara=denegado` muestra el
panel de permisos.

## Archivos

| | |
|---|---|
| `main.js` | Arranque y salida: enchufa las piezas de `main/` |
| `main/*.js` | Esquema `app://`, ventana, video, clips (ffmpeg), datos, nube, iPad (`remoto.js`) |
| `preload.js` | `window.tv`: lo único que la página ve del sistema |
| `db.js` | La base SQLite (sql.js, sin módulos nativos) |
| `src/` | Las pantallas: `app.js` (router), `ui/`, `estilos/`, `ramas/<id>/` |
| `src/nucleo/` | Plantilla, botonera, motor, grabadora, XML. Sin Electron: el iPad también lo usa |
| `remoto/` | La página que abre el iPad en la Captura desde iPad |
| `main/mac.js` | Lo de macOS: menú, permisos, semáforo, energía |
| `main/red.js` | IPs de la red local para el iPad (filtra VPN, AirDrop, etc.) |
| `src/ui/plataforma.js` | ⌘ o Ctrl, "Finder" o "Explorador" |
| `src/ui/permisos.js` | Paneles de permiso de cámara y de firewall |
| `build/mac/` | Entitlements y firma ad-hoc de ffmpeg para el `.dmg` |
