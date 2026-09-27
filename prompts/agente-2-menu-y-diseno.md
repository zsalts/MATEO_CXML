# Agente 2 — Menú principal y diseño

> Pegá este archivo entero como prompt. Trae todo lo que el agente necesita.

**Sos el dueño de:** `escritorio/src/index.html`, `src/app.js`, `src/ui/`,
`src/estilos/`, `src/ramas/inicio/`, `src/ramas/ajustes/` y
`escritorio/test/menu*`.

## Lo que tiene que estar SÍ O SÍ

- [ ] **Menú principal** (rama `inicio`) como primera pantalla, con tarjetas
      grandes para: **Captura en vivo**, **Captura desde iPad**, **Importar
      video + archivo** y **Base de datos**, y una más chica de Ajustes.
- [ ] "Mis plantillas" en el menú: las plantillas importadas del iPad, y los
      botones para importarlas (archivo y nube). Un clic en una plantilla
      lleva a capturar con ella.
- [ ] "Partidos recientes" en el menú, que abren el partido en la base.
- [ ] Barra superior arrastrable + barra lateral con las 6 ramas, y el
      indicador global **● REC** cuando algo graba.
- [ ] Router que carga cada rama con `import()` y muestra "En construcción"
      si todavía no existe (las ramas de los otros agentes pueden faltar).
- [ ] `ctx.ui` (aviso, confirmar, pedirTexto, modal) y los exports de
      `src/ui/` del contrato: `crearIcono`, `escapar`, `formatoTiempo`,
      `elegirPlantilla`, `estadoGlobal`.
- [ ] `src/ui/api-simulada.js`: un `window.tv` falso en memoria, para que
      los 6 agentes puedan probar sus pantallas sin el Agente 1.
- [ ] Tema oscuro (por defecto) y claro, y `src/estilos/LEEME.md` con los
      tokens y las clases para los demás.

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

La estética: software de análisis deportivo profesional (la ESTRUCTURA de
Nacsport o Sportscode: menú principal con ramas, paneles densos y oscuros,
mouse y teclado en pantalla grande). No copies logos, nombres ni colores de
marca. Tiene que parecer una app nativa de Windows: sin scroll de página
entera, sin links subrayados, cursor por defecto en los controles, texto de
interfaz no seleccionable (los campos sí).

### 1. Sistema de diseño (`src/estilos/`)
- `tokens.css`: las variables del contrato (y `--tv-acento-texto`,
  `--tv-fuente`, `--tv-fuente-mono`) en oscuro y claro
  (`[data-tema="claro"]` en `<html>`). Un solo acento con contraste AA en los
  dos. `--tv-rec` distinto de `--tv-peligro`. Fuente del sistema
  (`"Segoe UI Variable", "Segoe UI", system-ui`), números tabulares para
  relojes.
- `base.css`: reset, clases base, foco visible con teclado, scrollbars finos.
- `LEEME.md`: cada token y clase con un ejemplo.

### 2. La carcasa (`index.html` + `app.js`)
- Barra superior de 36px (`-webkit-app-region: drag`, los botones
  `no-drag`), dejando ~138px libres a la derecha para los botones nativos.
  Nombre de la app + miga de pan. A la derecha, "● REC 00:42:10" cuando
  `estadoGlobal.poner('grabando', {desde})`; clic lleva a la rama que graba.
- Barra lateral angosta de íconos: Inicio, Base de datos, Captura en vivo,
  Captura desde iPad, Importar, Ajustes. Tooltip, activa resaltada, plegable.
- Router: `navegar(id, params)` → `desmontar()` de la actual (false = no
  navega) → `import()` de `src/ramas/<id>/index.js` → su `estilo.css` la
  primera vez → `montar()`. Import fallido = "En construcción".
- Atajos: Ctrl+1..6 cambian de rama, Esc cierra el modal. Los atajos de la
  rama van primero (la captura usa todo el teclado y puede frenar el evento).
- Al cambiar el tema, `tv.ventana.tema({fondo, simbolos})`.

### 3. Componentes (`src/ui/`)
- `aviso`: toast apilable abajo a la derecha, 5 s; los de error se quedan.
- `confirmar`, `pedirTexto`, `modal`: atrapan el foco, Enter/Esc.
- `crearIcono(nombre)`: set chico SVG de trazo (play, pausa, stop, grabar,
  cámara, ipad, wifi, base, importar, carpeta, lista, filtro, tijera,
  descargar, subir, más, basura, lápiz, ajustes, casa, botonera, cerrar,
  flechas).
- `escapar(texto)`, `formatoTiempo(seg)` → `"1:02:03"`.
- `elegirPlantilla(ctx)`: modal con la lista de plantillas, buscador y
  miniatura (si existe `src/nucleo/botonera-vista.js` del Agente 4, usalo;
  si no, rectángulos con el color de cada botón).
- `estadoGlobal`: `poner(clave, valor)`, `leer(clave)`, `alCambiar(cb)`.
- `api-simulada.js`: se carga SOLO si no hay `window.tv` real. Con 3
  plantillas (armalas leyendo el formato de `app.js`), 2 equipos y 4
  partidos de ejemplo (uno con video y XML, uno sin video, uno de iPad).

### 4. Rama Inicio — el menú principal
- Cuatro tarjetas grandes de acción, bien distintas:
  - **Captura en vivo** — "Conectá la cámara, codificá y cortá en vivo"
  - **Captura desde iPad** — "La compu graba, el iPad codifica por wifi"
  - **Importar video + archivo** — "Subí un partido ya grabado a la base"
  - **Base de datos** — "Partidos, clips, plantillas y playlists"
  y una chica de **Ajustes**.
- **Mis plantillas**: fila con nombre + miniatura; clic pregunta "¿Captura
  en vivo o desde iPad?" y navega con `{plantillaId}`. Botones "Importar del
  iPad (archivo)" y "Traer de la nube", con el resultado en un aviso ("3
  plantillas, 2 equipos, 5 partidos"). Si `importarNube` rechaza con
  `necesitaLogin`, pedí correo y contraseña en un modal y reintentá.
- **Partidos recientes**: los últimos 8 (nombre, fecha, duración, eventos,
  ícono según origen, ícono si tiene video y XML); clic →
  `navegar('base', {partidoId})`.
- Primera vez (base vacía): "1. Importá tus plantillas del iPad · 2.
  Conectá la cámara · 3. Capturá", con importar destacado.

### 5. Rama Ajustes
General (tema; carpeta de trabajo con `tv.sys.elegirCarpeta` y "Abrir
carpeta"), Video (calidad 3/6/10/16 Mb/s; margen de clip 0/2/5/10 s),
Importar ("Copiar los videos importados a la carpeta de trabajo":
`copiarVideosImportados`, por defecto sí), iPad (puerto, 8787), Equipos (ABM
nombre + color), Base de datos ("Hacer copia de la base"), Acerca de
(`tv.sys.info`). Se guarda al cambiar, sin botón Guardar.

### 6. Pruebas
Con `npm start`, o `src/index.html` en un servidor estático si main todavía
no sirve `src/`. Verificá: navegación, "En construcción", los dos temas,
atajos, modal con teclado, 1024×680. Lógica pura (`formatoTiempo`, orden de
recientes, `estadoGlobal`) con `node --test escritorio/test/menu*.test.js`.

## Si te sobra tiempo
- Buscador global (Ctrl+K) que salte a un partido o una plantilla.
- Animaciones cortas de entrada de rama (respetando `prefers-reduced-motion`).
