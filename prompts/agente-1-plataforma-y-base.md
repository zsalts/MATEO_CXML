# Agente 1 — Plataforma y base de datos SQLite

> Pegá este archivo entero como prompt. Trae todo lo que el agente necesita.

**Sos el dueño de:** `escritorio/main.js`, `preload.js`, `db.js`,
`package.json`, `escritorio/main/` (salvo `main/remoto.js`, que es del
Agente 5), `escritorio/build/` y `escritorio/test/plataforma*`. También
`escritorio/README.md`.

## Lo que tiene que estar SÍ O SÍ

- [ ] La app abre su propia pantalla (`escritorio/src/` por `app://tagview`),
      no la web del iPad. Si `src/` todavía está vacío, abre igual sin romperse.
- [ ] `window.tv` completa, EXACTAMENTE con los nombres del contrato, con los
      argumentos validados en main.
- [ ] La base SQLite migra la `tagview.sqlite` que ya existe **sin perder
      nada** (copia de seguridad antes de migrar) y suma: plantillas, equipos,
      playlists, `partidos.xml_ruta`, `partidos.origen`, `partidos.desfase`,
      `partidos.plantilla_id`.
- [ ] Grabar el video de la cámara al disco no se cae si el disco se llena
      o se desconecta: avisa por `tv.video.onError` y lo grabado queda.
- [ ] `tv.clips.exportar` corta clips **sin recomprimir** con ffmpeg, también
      sobre el archivo que se está grabando en ese momento (lo necesita la
      Captura en vivo para cortar en vivo).
- [ ] `/__video` sirve con Range (para saltar en el reproductor) y SOLO
      archivos permitidos (carpeta de trabajo o elegidos por el usuario).
- [ ] Importar las plantillas del iPad (archivo `.json` de plantilla, sesión
      o copia de seguridad) sin duplicar.
- [ ] `npm start` abre sin errores y `npm run dist` genera el instalador.

## Contexto y contrato común (es igual en los 6 archivos)

Estás trabajando en el repo MATEO_CXML (Windows, PowerShell 5.1). Ahí hay:

- Una app web para iPad de codificación de video deportivo ("Tag & View Pro"):
  `index.html`, `app.js` (~4500 líneas, TODA la lógica), `style.css`,
  `tailwind.css`. Se arma una botonera (plantilla), se taggea el partido en
  vivo y se exporta un XML de Sportscode. Leé `README.md` de la raíz.
- `escritorio/`: una versión Electron que HOY carga esa misma web e inyecta
  `video.js`/`video.css` para grabar desde una placa de captura y guardar en
  SQLite. Leé `escritorio/README.md`, `main.js`, `preload.js`, `db.js` y
  `video.js`.

**EL PROYECTO:** convertir `escritorio/` en una app de Windows con identidad
propia. Ya no carga la web del iPad: tiene sus pantallas en
`escritorio/src/`, un MENÚ PRINCIPAL y estas ramas:

| Rama (id) | Qué hace | Agente |
|---|---|---|
| `inicio` | Menú principal | 2 |
| `base` | Base de datos: partidos, clips, plantillas, playlists | 3 |
| `captura` | Captura en vivo: cámara/placa HDMI + botonera, cortes en vivo | 4 |
| `ipad` | Captura desde iPad: la compu graba, el iPad codifica por wifi | 5 |
| `importar` | Importar un video + su archivo de marcas a la base | 6 |
| `ajustes` | Ajustes y equipos | 2 |

La plataforma (Electron, base SQLite, API `window.tv`) es del Agente 1.

Las plantillas NO se diseñan en la compu: se arman en la app del iPad (o en
la web desde la PC) y se importan. La web del iPad NO SE TOCA: ningún archivo
fuera de `escritorio/` se modifica.

Hay 6 agentes trabajando EN PARALELO sobre el mismo árbol. Vos sos uno.
**Regla de oro:** escribís SOLO en las carpetas que tu parte dice que son
tuyas. Si necesitás algo de otra carpeta, programá contra el CONTRATO de
abajo aunque todavía no exista, y anotá lo que te falte en tu informe final.
No edites archivos de otro agente "para que ande".

### Estructura

```
escritorio/
  main.js, preload.js, db.js, package.json, main/*      → Agente 1
  main/remoto.js  (servidor wifi para el iPad)           → Agente 5
  remoto/         (la página que abre el iPad)           → Agente 5
  test/           cada uno sus archivos, con su prefijo
  src/
    index.html, app.js (arranque + router)               → Agente 2
    ui/        componentes compartidos                   → Agente 2
    estilos/   tokens de diseño y estilos base           → Agente 2
    ramas/
      inicio/    menú principal                          → Agente 2
      ajustes/   ajustes y equipos                       → Agente 2
      base/      base de datos                           → Agente 3
      captura/   captura en vivo                         → Agente 4
      ipad/      captura desde iPad                      → Agente 5
      importar/  importar video + archivo                → Agente 6
    nucleo/      lógica compartida, sin pantallas        → Agente 4
      plantilla.js       leer una botonera del iPad
      botonera-vista.js  dibujarla y tocarla en vivo
      codificacion.js    motor de codificación
      grabadora.js       cámara + MediaRecorder + mapa de tramos
      exportar.js        XML de Sportscode y CSV
```

La app se sirve desde `escritorio/src/` por el esquema `app://tagview`
(contexto seguro, necesario para `getUserMedia`). JavaScript: ES modules
nativos, sin bundler ni build, sin frameworks. Nada se carga de internet.
`src/nucleo/` NO usa `window.tv` ni nada de Electron: el Agente 5 también lo
sirve al iPad por wifi y tiene que andar en Safari.

### Cómo se enchufa una rama

Cada rama es `src/ramas/<id>/index.js` con un export default:

```js
export default {
  id: 'captura',
  titulo: 'Captura en vivo',
  icono: '<svg viewBox="0 0 24 24">…</svg>',   // trazo, usa currentColor
  descripcion: 'Grabá y codificá el partido',   // para la tarjeta del menú
  async montar(contenedor, ctx) { … },
  async desmontar() { return true; }            // false = no dejar salir
};

ctx = {
  api:     window.tv,
  ui:      { aviso(texto, tipo='info'|'ok'|'error'),
             confirmar(texto, {titulo, peligro}) → Promise<boolean>,
             pedirTexto(titulo, valorInicial, {etiqueta}) → Promise<string|null>,
             modal({titulo, contenido: HTMLElement, botones:[{texto, valor, primario, peligro}]}) → Promise<valor|null> },
  navegar: (idRama, params) => void,
  params:  {}
};
```

`src/ui/` (Agente 2) exporta también: `crearIcono(nombre)`, `escapar(texto)`,
`formatoTiempo(seg)`, `elegirPlantilla(ctx)` → `Promise<plantillaId|null>` y
`estadoGlobal.poner('grabando', {desde} | null)`.

CSS propio de una rama: `src/ramas/<id>/estilo.css` (lo carga el router),
clases con prefijo `tv-<id>-`. Usá las variables de `src/estilos/tokens.css`
(`--tv-fondo, --tv-panel, --tv-panel-2, --tv-borde, --tv-texto, --tv-texto-2,
--tv-acento, --tv-peligro, --tv-ok, --tv-aviso, --tv-rec, --tv-radio,
--tv-esp-1..6`) y las clases base `.tv-btn, .tv-btn--primario,
.tv-btn--peligro, .tv-btn--icono, .tv-panel, .tv-campo, .tv-lista,
.tv-lista__fila, .tv-barra, .tv-vacio`. Nunca colores fijos (salvo los de
cada botón de la botonera, que vienen de la plantilla).

Si una rama no existe todavía, el router muestra "En construcción".

Navegación entre ramas:

```
navegar('base',     {partidoId})     abre ese partido en la base
navegar('captura',  {plantillaId?, videoRuta?})  con videoRuta = codificar ese
                                     video ya grabado (fuente "Archivo")
navegar('ipad',     {plantillaId})   ídem, captura desde iPad
navegar('importar', {partidoId?})    importar; con partidoId = vincular video
                                     a un partido que ya está en la base
```

### API `window.tv` (la expone `preload.js`, Agente 1)

Todas devuelven Promise.

```
tv.plantillas.listar()                → [{id, nombre, actualizado, origen}]
tv.plantillas.leer(id)                → {id, nombre, datos}
tv.plantillas.guardar({id?, nombre, datos}) → id
tv.plantillas.borrar(id)
tv.plantillas.importarArchivo()       → {plantillas:n, equipos:n, partidos:n}
tv.plantillas.importarNube()          → {plantillas:n, equipos:n, partidos:n}
tv.plantillas.exportarArchivo(id)     → ruta | null

tv.equipos.listar()                   → [{id, nombre, color}]
tv.equipos.guardar({id?, nombre, color}) → id
tv.equipos.borrar(id)

tv.partidos.guardar(partido)          → id    (formato PARTIDO, abajo)
tv.partidos.listar(filtro?)           → [{id, nombre, creado, duracion, video_ruta,
                                          xml_ruta, local, visitante, eventos, origen}]
                                        filtro = {texto?, equipo?, desde?, hasta?,
                                        conVideo?, origen?}
tv.partidos.leer(id)                  → PARTIDO completo, con ids de evento
tv.partidos.actualizar(id, {nombre?, local?, visitante?, video_ruta?,
                            xml_ruta?, desfase?})
tv.partidos.borrar(id)                (el video y el XML quedan en el disco)
tv.eventos.agregar(partidoId, evento) → id
tv.eventos.actualizar(id, {nombre?, v_inicio?, v_fin?, etiquetas?:[{grupo,texto}]})
tv.eventos.actualizarVarios([{id, v_inicio, v_fin}])   (una sola escritura)
tv.eventos.borrar(id)
tv.eventos.buscar(filtro)             → [{...evento, partido_id, partido_nombre, video_ruta}]
                                        filtro = {nombres?, etiquetas?:[{grupo,texto}],
                                        equipo?, partidos?, texto?}

tv.playlists.listar() / leer(id) / guardar({id?, nombre, items:[{evento_id, nota}]}) / borrar(id)

tv.video.iniciar(nombre, mime)        → {ruta, nombre}
tv.video.trozo(Uint8Array)            → {bytes}
tv.video.finalizar()                  → {ruta, bytes, mime} | null
tv.video.descartar()
tv.video.ubicar(ruta, {nombre, subcarpeta}) → {ruta}
                                        (renombra y mueve a <carpeta>/<subcarpeta>/)
tv.video.url(ruta)                    → 'app://tagview/__video?p=…' | null  (con Range)
tv.video.elegirArchivo()              → ruta | null
tv.video.copiarACarpeta(ruta, {nombre, subcarpeta}) → {ruta}
tv.video.info(ruta)                   → {duracion, ancho, alto, bytes} | null (ffprobe si hay)
tv.video.onError(cb)                  → quitar()
tv.video.onProgreso(cb)               → quitar()   cb({hecho, total}) al copiar

tv.clips.disponible()                 → boolean (hay ffmpeg)
tv.clips.exportar({ruta, cortes:[{desde, hasta, nombre}], destino?:'carpeta'|'uno',
                   subcarpeta?})      → {rutas:[…]}  (corta sin recomprimir; también
                                        sobre el archivo que se está grabando)

tv.archivos.elegir({titulo, filtros:[{nombre, extensiones:[]}]})
                                      → {ruta, nombre, extension, contenido} | null
                                        (contenido = texto decodificado; hasta 20 MB)
tv.archivos.guardarTexto({nombre, extension, contenido, subcarpeta?}) → ruta
tv.archivos.mostrar(ruta)
tv.archivos.abrirCarpeta(subcarpeta?)
tv.archivos.respaldarBase()           → ruta

tv.remoto.iniciar({plantillaId})      → {url, ips, puerto, pin, qrSvg}
tv.remoto.detener() / estado() / enviar(mensaje)
tv.remoto.onMensaje(cb) / onCliente(cb) → quitar()

tv.ajustes.leer()                     → {carpeta, tema, calidad, margen, puertoRemoto,
                                          copiarVideosImportados, ...}
tv.ajustes.guardar(parcial)           → ajustes completos
tv.sys.info()                         → {version, electron, chrome, carpeta, base}
tv.sys.elegirCarpeta()                → {carpeta, cambio}
tv.ventana.tema({fondo, simbolos})
```

### Formatos de datos

**PLANTILLA.datos** = exactamente `{ elements, links, hojas }`, el MISMO
formato que el state del iPad (en `app.js`: STATE, CREATE / DELETE,
PESTAÑAS). Tipos de elemento: event, sticky_label, popup_label, descriptor,
container, counter, line, teams, possession, text, image. Campo nuevo,
opcional, que el iPad ignora: `element.atajo = 'q'`.

**PARTIDO** (lo que se manda a `tv.partidos.guardar`):

```
{ id?, nombre, inicioReal, duracion, videoRuta, videoMime, videoBytes,
  xmlRuta?,                       // el XML de Sportscode enlazado al partido
  local, visitante, plantilla (JSON de datos), plantillaId?,
  origen: 'captura' | 'ipad-vivo' | 'ipad-importado' | 'importado',
  desfase?: segundos,             // video = partido + desfase
  eventos:[{ nombre, botonId, equipo, linea, inicio, fin, vInicio, vFin,
             etiquetas:[{grupo, texto}] }],
  posesion:[{ equipo, inicio, fin }] }
```

`tv.partidos.leer` devuelve columnas en snake_case (`v_inicio`, `v_fin`,
`video_ruta`, `xml_ruta`…), con `eventos[].id` y `eventos[].etiquetas`.

`inicio/fin` = reloj del partido (se frena en PAUSE). `v_inicio/v_fin` =
segundos dentro del archivo de video. Son dos relojes distintos (ver el "mapa
de tramos" de `video.js`).

**Carpeta de cada partido** (la usan los Agentes 4, 5 y 6):

```
<carpeta de trabajo>/Partidos/<nombre del partido>/
    <nombre>.mp4     el video
    <nombre>.xml     el XML de Sportscode (mismo nombre: Sportscode y
                     Nacsport lo emparejan solo)
    <nombre>.csv     tiempo en hielo / posesión, si hay
    Clips/           los clips cortados
```

`subcarpeta` en la API = `'Partidos/<nombre>'`. Nombres limpios para Windows
(sin `\ / : * ? " < > |`); si ya existe, `(2)`.

### Estilo de código

- Nombres y comentarios en español rioplatense, como el resto del repo
  (`vAhora`, `abrirTramo`, `guardarEnBase`…). Comentá el POR QUÉ.
- Sin dependencias nuevas salvo las que tu parte autorice.
- `innerHTML` solo con texto escapado.
- No hagas commits (el usuario los hace).
- Node.js y npm están en `C:\Program Files\nodejs`. Si la terminal no los
  encuentra, recargá el PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
  Usá `npm.cmd` en vez de `npm`. No instales nada del sistema sin preguntar.
- Mientras la API real no exista, las pantallas usan `src/ui/api-simulada.js`
  (Agente 2), que arma un `window.tv` falso en memoria.

### Al terminar

Informe corto: qué hiciste, repasá la lista **SÍ O SÍ** punto por punto
(hecho / no hecho y por qué), qué probaste y cómo (con la salida real), y lo
que necesites de otro agente (con el nombre exacto de función o archivo).

## Tu parte, en detalle

### 1. Servir la app propia
- `app://tagview` sirve `escritorio/src/` (en desarrollo y empaquetada;
  `src/**` y `remoto/**` entran en `"files"` del `package.json`). Se va todo
  lo del sitio del iPad: `RAIZ_WEB`, la inyección de `video.js`/`video.css`
  en `did-finish-load`, el truco de `sw.js` y los `extraResources` "web".
  Sacá `video.js` y `video.css` de `"files"` (los borra el Agente 4).
- Chequeo de ruta bien hecho en una función pura `dentroDe(raiz, ruta)` en
  `main/rutas.js` (path.resolve + comparar con separador al final: hoy
  `startsWith` deja pasar carpetas hermanas como `src2`). El Agente 5 la
  reusa. MIME correctos para `.js` (ES modules), `.css`, `.svg`, `.png`,
  `.woff2`, `.json`.
- `/__video`: Range, y lista blanca en memoria (carpeta de trabajo + lo que
  pasó por `tv.video.elegirArchivo`, `tv.archivos.elegir` o
  `tv.partidos.actualizar({video_ruta})`).

### 2. Ventana con cara de app
- `Menu.setApplicationMenu(null)`, `titleBarStyle: 'hidden'` +
  `titleBarOverlay` (alto 36). El Agente 2 dibuja la barra superior.
- Recordar tamaño, posición y maximizada (en `config.json`). Mínimo 1024×680.
- DevTools (F12 / Ctrl+Shift+I) solo si `!app.isPackaged`.
- Una sola instancia (`requestSingleInstanceLock`).
- Icono: copiá `../icon-512.png` a `escritorio/build/icon.png` y usalo en la
  ventana y el instalador (el instalador no depende de `../`).

### 3. La API
`preload.js` con `contextBridge`; handlers `ipcMain` agrupados por tema en
`main/*.js`. Borrá `window.escritorio`.

`tv.remoto.*`: solo declarás el puente en preload (invoke a
`'remoto:iniciar' | 'remoto:detener' | 'remoto:estado' | 'remoto:enviar'`, y
`on('remoto:mensaje')` / `on('remoto:cliente')`). En `main.js`, con la base y
la ventana listas:

```js
try { require('./main/remoto').registrar({ ipcMain, ventana, bd, carpeta, rutaSrc }) }
catch (e) { console.warn('Sin captura desde iPad:', e.message) }
```

Si `main/remoto.js` no existe, la app arranca igual. Al salir, llamá a su
`detener()` si lo exporta.

`tv.archivos.elegir`: diálogo abrir con los filtros pedidos; si es texto,
devolvé `contenido` decodificado (UTF-8 con o sin BOM, UTF-16 con BOM; si no
es UTF-8 válido, Windows-1252). Sumá la ruta a la lista blanca.

`tv.video.copiarACarpeta`: copia con stream, emite `tv.video.onProgreso`
cada ~250 ms, y si falla borra la copia a medias. `tv.video.info`: con
ffprobe (viene con ffmpeg-static? si no, `ffprobe-static`, autorizado) y si
no hay, `null`.

`tv.video.ubicar(ruta, {nombre, subcarpeta})`: crea la subcarpeta, mueve y
renombra, sin pisar (`(2)`). Si mover entre discos falla, copiar + borrar.

### 4. La base de datos (`db.js`, sql.js) — pieza central
- `PRAGMA user_version` y migraciones en orden. v1 = el esquema actual.
  Copia `tagview.antes-vN.sqlite` antes de migrar.
- Tablas nuevas: `plantillas` (id, nombre, datos JSON, origen, huella,
  creado, actualizado), `equipos` (id, nombre UNIQUE, color), `playlists`,
  `playlist_items` (con ON DELETE CASCADE). `partidos` suma `plantilla_id`,
  `origen`, `desfase`, `xml_ruta`.
- Índices: eventos por partido y por nombre, etiquetas por (grupo, texto),
  partidos por fecha.
- `tv.eventos.buscar` con SQL parametrizado. Etiquetas: Y entre grupos, O
  dentro del mismo grupo. < 100 ms con 50 partidos × 800 eventos.
- `tv.eventos.agregar` y `tv.eventos.actualizarVarios` (este último en una
  transacción y una sola persistencia: el Agente 6 re-sincroniza cientos de
  eventos de una).
- Borrar un evento borra sus etiquetas y lo saca de las playlists.
- `persistir()` atómico (`.tmp` + renombrar), agrupado: a lo sumo una
  escritura cada 500 ms y siempre al cerrar.

### 5. Importar del iPad (`tv.plantillas.importarArchivo` / `importarNube`)
Leé en `app.js`: `armarRespaldo()`, `getSavedTemplates()`,
`getSavedSessions()` y la sección "PLANTILLAS Y SESIONES COMO ARCHIVOS DEL
iPad".
- copia de seguridad `{app:'tagview', kind:'backup', current, templates,
  sessions, equipos}` → plantillas + equipos + partidos (sin video, origen
  `'ipad-importado'`)
- plantilla suelta → una plantilla; sesión suelta → un partido sin video
- huella = hash de los datos normalizados: misma huella no se reimporta.
  Mismo nombre, datos distintos → `"Nombre (iPad 26-09)"`.
- `importarNube`: leé `../nube-config.js` (copialo a `escritorio/build/` al
  empaquetar) y bajá `respaldo.json` con fetch desde main. Si hace falta
  login, rechazá con `{necesitaLogin:true}` y aceptá `{correo, clave}` en el
  reintento. Leé en `app.js` la sección de la nube para la ruta y el login.

### 6. Grabación
- `'error'` en el WriteStream → `tv.video.onError`, cerrar y conservar.
- Backpressure: si `write()` devuelve false, esperar `'drain'`.
- Cerrar la grabación desde UN solo lugar al salir (hoy `before-quit` y
  `window-all-closed` compiten), y cerrar la base después.

### 7. Clips (`tv.clips.*`)
Dependencia autorizada: `ffmpeg-static` (con `asarUnpack`). `-ss/-to -c copy`.
`'carpeta'` = un archivo por corte en `<subcarpeta>/Clips/`; `'uno'` = concat
demuxer. **Sobre un archivo que se está grabando** (MP4 fragmentado de
MediaRecorder): probá que ffmpeg lo lea hasta donde hay escrito; si un corte
pide un tramo que todavía no está en el disco, esperá a que esté (con
timeout) en vez de fallar. Probalo de verdad con una grabación en curso y
contá el resultado. Sin ffmpeg, `disponible()` = false y nada se rompe.

### 8. Pruebas
`node --test escritorio/test/plataforma*.test.js`: migración de una base v1
armada en la prueba, guardar/leer/borrar partido con `xml_ruta`, buscar con
filtros combinados, playlists con cascada, `actualizarVarios`, importar los
tres formatos del iPad sin duplicar (fixtures a mano en
`test/fixtures/`), `dentroDe()` (incluido `..` y `%2e%2e`). `npm start` sin
errores en la consola de main. Actualizá `escritorio/README.md`.

## Si te sobra tiempo
- Copia automática semanal de la base en `<carpeta>/Respaldos/`.
- Firma del instalador y auto-actualización: solo dejarlo anotado, no lo
  hagas sin preguntar.
