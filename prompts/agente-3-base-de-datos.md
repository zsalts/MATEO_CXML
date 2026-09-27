# Agente 3 — Rama Base de datos

> Pegá este archivo entero como prompt. Trae todo lo que el agente necesita.

**Sos el dueño de:** `escritorio/src/ramas/base/` y `escritorio/test/base*`.
Los datos los da `window.tv` (Agente 1); mientras no esté, usá
`src/ui/api-simulada.js` (Agente 2).

## Lo que tiene que estar SÍ O SÍ

- [ ] Pestañas **Partidos · Clips · Plantillas · Playlists**.
- [ ] Lista de partidos con buscador y filtros; abrir, renombrar, borrar
      (el video y el XML quedan en el disco), mostrar en el Explorador.
- [ ] Partido abierto: **reproductor** con su video enlazado + **línea de
      tiempo** con los eventos + **lista de eventos filtrable**; clic en un
      evento reproduce su clip.
- [ ] Editar un evento (inicio, fin, nombre, etiquetas) y borrarlo.
- [ ] Mostrar si el partido tiene video y XML enlazados, y abrirlos en la
      carpeta. Si falta el video: "Vincular video…" →
      `navegar('importar', {partidoId})` (lo hace el Agente 6).
- [ ] Exportar el XML (con `xmlSportscode` del Agente 4) y cortar clips a
      archivos (`tv.clips.exportar`).
- [ ] Playlists: agregar clips, reordenar, reproducir seguido.
- [ ] Plantillas: lista con miniatura, importar, exportar para el iPad,
      borrar, "Capturar con esta".

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

### 1. Partidos
Tabla con `tv.partidos.listar(filtro)`: nombre, fecha, local/visitante,
duración, eventos, origen (captura / iPad en vivo / iPad importado /
importado), íconos de video y XML. Filtros: texto, equipo, fechas, con/sin
video, origen. Si llega `params.partidoId`, se abre directo.

### 2. El partido abierto
- Reproductor (`tv.video.url`) con controles propios: espacio, ←/→ ±5 s,
  `,` `.` cuadro a cuadro, velocidad 0,25×–4×, F pantalla completa, volumen.
- Línea de tiempo tipo matriz: una fila por categoría (nombre del evento),
  barras de `v_inicio` a `v_fin` con el color del botón (de la plantilla
  guardada del partido). Ctrl+rueda zoom, cabezal que sigue al video, clic en
  la regla salta, clic en una barra reproduce. Fluida con 800 eventos en 2 h:
  sin re-renderizar todo en cada `timeupdate`.
- Panel de eventos filtrable por categoría, etiqueta (grupo + texto), equipo
  y texto (Y entre grupos, O dentro del grupo), que también filtra la matriz.
  "N de M eventos".
- Reproducir la selección seguida con el margen de `tv.ajustes` (N/P).
- Editar: arrastrar los bordes de la barra, o I/O para marcar inicio/fin en
  el cabezal, renombrar, etiquetas, borrar. `tv.eventos.actualizar/borrar`,
  Ctrl+Z deshace.
- Estadísticas: conteo categoría × etiqueta (y por equipo) y posesión (% y
  tiempo por equipo). Exportable a CSV.
- Barra del partido: "Video: <ruta>" y "XML: <ruta>" con "Mostrar en la
  carpeta"; si falta alguno, el aviso correspondiente. Video movido o
  borrado → la pantalla anda sin reproductor y ofrece "Vincular video…"
  (`navegar('importar', {partidoId})`).

### 3. Clips (entre todos los partidos)
`tv.eventos.buscar`: categorías, etiquetas, equipo, partidos → lista de
clips de cualquier partido. Reproducirlos seguidos (el reproductor cambia de
archivo solo) y mandarlos a una playlist.

### 4. Plantillas
Lista con miniatura (`crearVista` de `src/nucleo/botonera-vista.js`, Agente
4, escalada; si no existe, rectángulos con el color de cada botón).
Renombrar, duplicar, borrar, exportar para el iPad, importar (archivo /
nube), "Capturar con esta" (`navegar('captura', {plantillaId})`) y "Capturar
desde iPad" (`navegar('ipad', {plantillaId})`). Detalle: botones con tipo,
color y atajo; se edita SOLO el atajo de teclado (`element.atajo`), avisando
teclas repetidas. El diseño se hace en el iPad.

### 5. Playlists
Selección (clic, Shift/Ctrl) → "Agregar a playlist" (nueva o existente).
Reordenar arrastrando, nota por clip, reproducir entera mezclando partidos.

### 6. Exportar
- XML de Sportscode del partido o de lo filtrado con `xmlSportscode` de
  `src/nucleo/exportar.js`. No lo reescribas; si no está, programá contra
  ese nombre y anotalo. Re-exportar el partido entero pisa su `xml_ruta` y
  lo actualiza en la base (`tv.partidos.actualizar`).
- CSV de los eventos filtrados.
- Clips: si `tv.clips.disponible()`, sueltos o en un solo video, de la
  selección o una playlist, con el margen, en `Partidos/<nombre>/Clips/`.
  Si no, botón deshabilitado con el motivo.
Al terminar, aviso con "Mostrar en la carpeta".

### 7. Detalles de escritorio
Paneles redimensionables (lista | video | eventos, matriz abajo), con las
proporciones en `tv.ajustes`.

### 8. Pruebas
Lógica pura (filtros combinados, agrupación para la matriz, estadísticas,
cola de reproducción) en `src/ramas/base/logica.js`, con
`node --test escritorio/test/base*.test.js`. En la app: filtrar, reproducir
la selección, editar un evento, playlist de 2 partidos, exportar XML y
clips.

## Si te sobra tiempo
- Dibujo sobre el video pausado (flechas, círculos) guardado por evento.
- Comparar dos clips lado a lado.
