# Agente 4 — Captura en vivo

> Pegá este archivo entero como prompt. Trae todo lo que el agente necesita.

**Sos el dueño de:** `escritorio/src/ramas/captura/`, `escritorio/src/nucleo/`
(todos sus archivos) y `escritorio/test/captura*`. Cuando hayas portado lo
que sirve, BORRÁ `escritorio/video.js` y `escritorio/video.css`.

Qué es la captura en vivo, en una frase: **conectás la cámara (placa HDMI o
webcam), codificás el partido con una de tus plantillas del iPad, cada
evento se corta en vivo como clip, y al terminar el video y el XML quedan
enlazados al partido en la base y juntos en su carpeta.**

## Lo que tiene que estar SÍ O SÍ

- [ ] **Conectar una cámara**: elegir la entrada de video (placa HDMI tipo
      Elgato/Cam Link o webcam USB) y de audio (o "Sin audio"), ver la vista
      previa con resolución y fps reales, y reconectar si se desenchufa en
      medio del partido **sin perder la codificación**.
- [ ] **Codificar con las plantillas del iPad**: la botonera se ve y se
      comporta igual que en el iPad (emergentes, pestañas de detalle,
      etiquetas fijas y excluyentes, líneas, posesión, contadores).
- [ ] **PLAY arranca la grabación** del partido entero al disco (MP4
      H.264/AAC primero), a medida que llega: nunca entero en memoria.
- [ ] **Cortar en vivo**: cada evento marcado es un clip que se puede ver
      AL INSTANTE (botón "▶ Ver" y clic en el registro), con el partido
      todavía grabando. Y "✂ Guardar clip" corta ese evento a un archivo
      `.mp4` en `Partidos/<nombre>/Clips/` en el momento, sin esperar a
      terminar y sin recomprimir (`tv.clips.exportar` sobre el archivo en
      curso). Opción "Cortar cada evento automáticamente" en la preparación.
- [ ] Los dos relojes bien: los eventos caen en el segundo correcto del video
      aunque haya pausas (mapa de tramos).
- [ ] **Terminar deja todo enlazado**: el video y el XML de Sportscode en
      `Partidos/<nombre>/<nombre>.mp4` y `<nombre>.xml` (mismo nombre), y el
      partido guardado en la base con `videoRuta`, `xmlRuta`, eventos con
      `vInicio/vFin` y la plantilla. Al abrirlo en la Base de datos, el video
      ya está vinculado.
- [ ] El XML es **exactamente el mismo formato** que el de `app.js` (que
      Sportscode/Nacsport lo importen igual).
- [ ] No se pierde nada: no se puede salir de la rama grabando sin
      confirmar; si el disco falla, aviso rojo y la codificación sigue; si
      se cierra la ventana, lo grabado queda reproducible.
- [ ] `src/nucleo/*` listo para que lo reusen los Agentes 3, 5 y 6, con
      los nombres de abajo, sin Electron adentro.

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

El Agente 5 (Captura desde iPad) reusa TODO `src/nucleo/` y lo sirve al iPad
por wifi: nada de `window.tv` ni Electron en `nucleo/`, y que ande en Safari
de iPad.

Fuente de verdad: `app.js` del iPad. Leé STATE, CREATE / DELETE, RENDER,
CONTAINER HELPERS, PESTAÑAS, PLANTILLA DE DETALLE, AJUSTAR A LA PANTALLA,
TIMER, TIME ON ICE, LIVE CLICK, POSESIÓN, EQUIPOS CARGADOS, EVENT LIST y
EXPORT XML, y el `README.md` de la raíz. PORTÁ la lógica, no la reinventes,
en módulos limpios sin estado global.

### 1. `src/nucleo/plantilla.js` (puro)
`normalizar(datos)` (idempotente, tolera plantillas viejas),
`elementosDeHoja(datos, hojaId|null)`, `hojaQueAbre(datos, id)`,
`emergentesDe(datos, id)` (las 3 formas del README), `contenedorDe(datos,
id)`, `excluyentesDe(datos, id)`, `atajos(datos)` →
`{mapa: Map tecla→id, repetidas}`. No cambies estos nombres.

### 2. `src/nucleo/botonera-vista.js` (DOM)
```js
crearVista(contenedor, datos, { hoja: null, alTocar(elemento, evento){},
                                ajustar: true, tactil: false })
→ { mostrarHoja(id|null), marcar(id, 'activo'|'fijo'|'abierto'|null),
    ponerTexto(id, texto), mostrarEmergentes(id, [elementos]),
    ocultarEmergentes(), actualizar(datos), destruir() }
```
Replicá AJUSTAR A LA PANTALLA: sin scroll, cada botón siempre en el mismo
lugar. Colores de la plantilla. La tecla del atajo chiquita en la esquina.

### 3. `src/nucleo/codificacion.js` (puro, reloj inyectado)
`crearCodificacion(datosPlantilla, {ahora})` con `play()`, `pausa()`,
`tocar(id, {momento?})`, `elegirEmergente(id)`, `cerrarDetalle()`,
`terminar()`, `estado()`, `alCambiar(cb)` → quitar, y
`aplicar(accion)` / `exportarEstado()` / `importarEstado()`. Toda acción es
un objeto serializable (`{tipo:'tocar', elementoId, momento}`…) y
`aplicar(accion)` = llamar al método (el iPad manda acciones por wifi).
`momento` = segundo de reloj de partido en que ocurrió. Todas las reglas del
iPad: previo/posterior, manuales y excluyentes, emergentes, pestañas con N
etiquetas, fijas, líneas con turnos por jugador, posesión como estadística,
contadores. El mapa de tramos (partido → video) acá, como función pura, UNA
sola vez (hoy está duplicado en `video.js`: `videoDe` y `alVideo`).

### 4. `src/nucleo/grabadora.js` (MediaRecorder, sin `window.tv`)
Recibe un "destino" con `iniciar/trozo/finalizar/descartar/onError` (en la
compu es `tv.video`). Listar entradas, vista previa, MediaRecorder con MP4
H.264/AAC primero (y **fragmentado**, para que el archivo se pueda leer y
cortar mientras crece), trozos de 1 s al disco. Si el track termina
(`'ended'`), emite `'desconectada'`; reconectar sigue en el mismo archivo si
se puede o abre un tramo nuevo (documentá cuál y por qué, y que el mapa de
tramos lo sepa).

### 5. `src/nucleo/exportar.js` (puro)
`xmlSportscode(partido, datosPlantilla)` → string, byte a byte el formato de
`app.js` (portá `fechaSportscode`, `a16bits`, `rgbDeEvento`, ROWS…),
`csvTiempoEnHielo(...)`, `csvPosesion(...)`. Los Agentes 3 y 6 lo usan.

### 6. La rama, en tres pasos
**a) Preparación.** Fuente: "Cámara / placa de captura" o "Archivo de
video" (codificar uno ya grabado: el reloj del video ES el del partido, no
se graba nada; si llega `params.videoRuta`, entra directo con ese video —
lo manda la rama Importar—, y al terminar actualiza ese mismo partido si
llega también `params.partidoId`).
Cámara: video, audio, calidad (default de `tv.ajustes`),
vista previa. Plantilla: `params.plantillaId` o `elegirPlantilla(ctx)`, con
miniatura; sin plantillas, "Importar del iPad". Local y visitante
(`tv.equipos`), nombre (propuesto "LOCAL vs VISITANTE"). Casilla "Cortar
cada evento automáticamente". "Empezar".

**b) Codificación.** Video grande, botonera con `crearVista`, reloj grande,
PLAY/PAUSA (espacio), "● REC" con tiempo y tamaño
(`estadoGlobal.poner('grabando', {desde})`), "Terminar". Abajo una tira con
los eventos (color del botón). A la derecha el registro (último arriba); clic
→ visor superpuesto con ±5 s, 0,5×/1×/2×, cuadro a cuadro y "✂ Guardar
clip". Atajos de la plantilla disparan los botones. Al marcar: "▶ Ver" 6 s
(R repite el último). Cortes pedidos durante la grabación: en una cola
visible ("2 clips cortándose…"); si un corte falla, reintenta al terminar.

**c) Terminar.** Confirmar el nombre, cerrar el video, `tv.video.ubicar` a
`Partidos/<nombre>/<nombre>.mp4`, escribir `<nombre>.xml` (y CSV si hay)
con `tv.archivos.guardarTexto({subcarpeta})`, guardar el partido con
`videoRuta`, `xmlRuta`, `plantillaId`, `origen:'captura'`, terminar los
cortes pendientes, y ofrecer "Ver en la base" (`navegar('base',
{partidoId})`), "Abrir carpeta" o "Nueva captura".

Separá a/b/c en `preparacion.js`, `codificando.js`, `terminar.js`, y exportá
las piezas reutilizables (panel de cámara, reloj + REC, registro, visor de
clip, cola de cortes) desde `src/ramas/captura/piezas.js`: el Agente 5 las
importa en vez de copiarlas.

### 7. Lo que tiene que quedar más firme que en `video.js`
- Si la cámara se conecta con el partido empezado, la grabación arranca ahí.
- `desmontar()` devuelve false grabando (confirmar que ofrece terminar).
- Clip durante la grabación: hoy se pegan en memoria trozos sueltos y puede
  no reproducirse (los cortes no caen en keyframes). Leé el tramo del
  ARCHIVO que se está escribiendo vía `tv.video.url` con Range. Quedate con
  lo que funcione de verdad (probalo con una webcam) y explicá por qué en un
  comentario.

### 8. Pruebas
`node --test escritorio/test/captura*.test.js`: `plantilla.js` con fixtures
del formato del iPad (pestañas, emergentes de las 3 formas, línea, posesión,
excluyentes), mapa de tramos (pausas, previo antes del PLAY o dentro de una
pausa, reconexión de cámara), motor con reloj falso (`aplicar` = método;
`tocar` con momento pasado), XML contra uno esperado. **En la app, de
verdad:** 3 min con webcam y 2 pausas, 10 eventos, cortar 3 clips DURANTE
la grabación, terminar; verificar que en `Partidos/<nombre>/` están el .mp4,
el .xml y los clips, que el .mp4 abre en otro reproductor, que 3 clips caen
en el segundo correcto y que el partido en la base tiene `video_ruta` y
`xml_ruta`. Contá los resultados.

## Si te sobra tiempo
- Segunda cámara (dos ángulos) con el mismo mapa de tramos.
- Repetición instantánea en pantalla completa para mostrar al banco.
