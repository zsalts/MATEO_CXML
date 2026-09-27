# Agente 6 — Importar video + archivo a la base de datos

> Pegá este archivo entero como prompt. Trae todo lo que el agente necesita.

**Sos el dueño de:** `escritorio/src/ramas/importar/` y
`escritorio/test/importar*`.

Qué es: **elegís un video de un partido ya grabado y el archivo con sus
marcas (un XML de Sportscode/Nacsport/LongoMatch o una sesión del iPad), la
app los junta, los alinea y los sube a la base de datos como un partido con
su video enlazado y sus clips.**

## Lo que tiene que estar SÍ O SÍ

- [ ] Rama `importar` con un asistente de pasos: **1. Video · 2. Archivo de
      marcas · 3. Revisar y sincronizar · 4. Guardar**.
- [ ] Paso 1: elegir el video (`.mp4 .mov .mkv .webm .avi .mts .m4v`) con
      vista previa y duración.
- [ ] Paso 2: elegir el archivo y leerlo:
  - XML de Sportscode / Nacsport / LongoMatch (`<ALL_INSTANCES>`) — el
    mismo formato que exporta `app.js`, y también los que exportan esos
    programas;
  - sesión `.json` del iPad (o una copia de seguridad: elegir qué sesión);
  - o **"Solo el video"**, para codificarlo después.
- [ ] Paso 3: resumen (cantidad de eventos, categorías, duración) y
      **sincronización**: ver 3 clips de muestra sobre el video y poder
      correr todo con un desfase (el partido arranca acá / ±1 s / ±0,1 s)
      antes de guardar.
- [ ] Paso 4: guardar en la base con `tv.partidos.guardar` (`origen:
      'importado'`), el **video enlazado** (copiado a
      `Partidos/<nombre>/<nombre>.<ext>` o dejado donde está, según
      `copiarVideosImportados`, con barra de progreso) y **el XML enlazado**
      (el original copiado al lado, o uno generado con `xmlSportscode` si
      vino de una sesión del iPad). Al terminar, "Ver en la base".
- [ ] **Vincular video a un partido que ya está en la base** (entrada
      `navegar('importar', {partidoId})`): saltea el paso 2, sincroniza y
      actualiza los eventos con `tv.eventos.actualizarVarios`.
- [ ] Nada se rompe con un archivo raro: XML mal formado, codificación
      Windows-1252, etiquetas vacías, eventos con fin antes del inicio →
      mensaje claro de qué falló y en qué renglón, o se salta ese evento
      avisando cuántos se saltaron.
- [ ] Probado con un XML generado por la app (ida y vuelta: exportar →
      importar → mismos eventos).

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

### 1. El lector de marcas (`src/ramas/importar/lectores.js`, puro)
Sin DOM y sin `DOMParser`, para poder probarlo con `node --test` (un
tokenizador chico alcanza: el formato es conocido). Exportá:

```js
detectarFormato(texto, nombreArchivo) → 'sportscode' | 'ipad-sesion' |
                                         'ipad-respaldo' | 'desconocido'
leerSportscode(texto) → { eventos:[{nombre, vInicio, vFin, etiquetas:[{grupo,texto}]}],
                          filas:[{nombre, color}], avisos:[texto] }
leerSesionIpad(json)  → PARTIDO sin video (mismo formato que el contrato)
sesionesDeRespaldo(json) → [{indice, nombre, fecha, eventos}]
plantillaDesdeFilas(filas) → datos de plantilla mínima (un botón event por
                              categoría, con su color) para que la base
                              pinte la matriz con colores
```

Sportscode: `<file><ALL_INSTANCES><instance><ID/><start/><end/><code/>
<label><group/><text/></label>…</instance></ALL_INSTANCES><ROWS>…</ROWS>
</file>`. `<label>` sin `<group>` → grupo vacío. Entidades XML (`&amp;`
etc.) y CDATA. Colores de ROWS en 16 bits (`R/G/B` 0–65535) → `#rrggbb`.
Tolerá mayúsculas/minúsculas y espacios. Leé `EXPORT XML` y
`fechaSportscode`/`a16bits` en `app.js` para el formato exacto que produce la
app, y buscá cómo lo exportan Nacsport y LongoMatch para cubrir sus
diferencias (documentalas en un comentario).

Sesión del iPad: leé en `app.js` `getSavedSessions()`, `armarRespaldo()` y
la sección "PLANTILLAS Y SESIONES COMO ARCHIVOS DEL iPad". Sus tiempos son
reloj de partido: `vInicio = inicio + desfase`.

### 2. La rama (`src/ramas/importar/`)
- Asistente con los 4 pasos arriba, "Atrás" y "Siguiente"; se puede volver
  a cualquier paso sin perder lo elegido.
- **Paso 1**: `tv.video.elegirArchivo()`, reproductor con `tv.video.url`,
  `tv.video.info` (duración, resolución, tamaño; si no hay ffprobe, la
  duración del `<video>`). Aviso si el formato no se reproduce en Chromium
  (p. ej. `.avi` o `.mts` con códecs raros): se puede importar igual, pero
  sin vista previa.
- **Paso 2**: `tv.archivos.elegir({filtros: [XML, JSON]})`,
  `detectarFormato`, lectura, y lista de lo encontrado. Respaldo del iPad →
  elegir la sesión. "Solo el video" → paso 4 directo, partido sin eventos,
  y al final ofrece "Codificarlo ahora" (`navegar('captura', {videoRuta,
  partidoId})`: la Captura en vivo lo abre como fuente "Archivo").
- **Paso 3**: resumen (eventos, categorías con conteo, duración de las
  marcas vs. duración del video: avisar si hay eventos que caen después del
  final del video). Sincronización:
  - XML de Sportscode: desfase 0 por defecto (sus tiempos ya son del video).
  - Sesión del iPad: desfase desconocido. "El partido arranca acá": pausás
    el video en el PLAY del partido y eso fija el desfase.
  - Botones ±1 s, ±0,1 s y campo numérico. Tres clips de muestra (primero,
    del medio, último) que se reproducen con el desfase actual.
  - Nombre del partido, local, visitante (de `tv.equipos`, o crear).
- **Paso 4**: guardar. Con `copiarVideosImportados`, `tv.video.copiarACarpeta`
  a `Partidos/<nombre>/` con barra de progreso (`tv.video.onProgreso`) y
  cancelar; si no, se deja el video donde está. El XML: si vino un XML, se
  copia al lado del video con el mismo nombre (`tv.archivos.guardarTexto`
  con el contenido original); si vino una sesión del iPad, se genera con
  `xmlSportscode` de `src/nucleo/exportar.js` (Agente 4). Plantilla: la de la
  sesión del iPad, o `plantillaDesdeFilas`. `tv.partidos.guardar({...,
  videoRuta, xmlRuta, origen:'importado', desfase})`. Al terminar: "Ver en
  la base" (`navegar('base', {partidoId})`) o "Importar otro".
- **Vincular a un partido existente** (`params.partidoId`): muestra el
  partido, pide el video, paso 3 con sus eventos, y guarda con
  `tv.partidos.actualizar(id, {video_ruta, desfase})` +
  `tv.eventos.actualizarVarios` (v_inicio/v_fin = inicio/fin + desfase).
- Duplicados: si ya hay un partido con el mismo video o el mismo nombre y
  la misma cantidad de eventos, avisá antes de guardar ("¿importar igual?").
- `desmontar()` devuelve false mientras copia el video (confirmar que
  cancela la copia).

### 3. Pruebas
`node --test escritorio/test/importar*.test.js`:
- ida y vuelta: `xmlSportscode(partido)` del Agente 4 → `leerSportscode` →
  mismos eventos, etiquetas y colores (si `exportar.js` no existe todavía,
  usá un XML fixture escrito a mano copiando el formato de `app.js`);
- XML con entidades, CDATA, BOM, Windows-1252, labels sin grupo, eventos
  rotos (se saltan con aviso), archivo que no es XML;
- sesión y respaldo del iPad (fixtures a mano en `test/fixtures/`),
  `detectarFormato` con los 4 casos, `plantillaDesdeFilas`, recálculo por
  desfase.
**En la app:** importar un .mp4 + un XML exportado por la Captura en vivo →
aparece en la Base de datos con el video enlazado y los clips en el segundo
correcto; importar una sesión del iPad + un video, sincronizar con "el
partido arranca acá", y verificar 3 clips.

## Si te sobra tiempo
- Importar varios partidos de una (carpeta con pares video + XML del mismo
  nombre).
- Importar un CSV genérico (inicio, fin, nombre, etiquetas) eligiendo las
  columnas.
