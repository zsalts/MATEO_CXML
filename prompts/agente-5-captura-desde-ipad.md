# Agente 5 — Captura desde el iPad

> Pegá este archivo entero como prompt. Trae todo lo que el agente necesita.

**Sos el dueño de:** `escritorio/main/remoto.js`, `escritorio/remoto/` (la
página que abre el iPad), `escritorio/src/ramas/ipad/` y
`escritorio/test/ipad*`.

Qué es: **la compu tiene la cámara y graba; el iPad, en la misma wifi,
muestra la botonera y cada toque llega a la compu y queda como evento en el
segundo correcto del video.**

## Lo que tiene que estar SÍ O SÍ

- [ ] La compu levanta un servidor en la red local y muestra **QR + dirección
      + PIN**; el iPad lo abre en Safari, pone el PIN y ve la botonera.
- [ ] La botonera del iPad es la misma plantilla, dibujada con
      `src/nucleo/botonera-vista.js` (sin duplicar código).
- [ ] Cada toque del iPad entra en la compu como evento **en el momento real
      del toque** (corrigiendo la demora del wifi).
- [ ] **Si se corta el wifi no se pierde ningún toque**: quedan en el iPad y
      entran en orden al reconectar, sin duplicarse.
- [ ] La compu graba el video igual que en la Captura en vivo (reusando
      `grabadora.js` y `piezas.js` del Agente 4) y al terminar deja video +
      XML enlazados en `Partidos/<nombre>/` y en la base (`origen:'ipad-vivo'`).
- [ ] Seguridad mínima: sin PIN no se acepta nada; el servidor solo sirve
      la página del iPad y `nucleo/`, nada más del disco.
- [ ] Si Windows bloquea el puerto (firewall), la pantalla explica qué hacer.

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

### Arquitectura (respetala: evita perder eventos)
- El motor (`src/nucleo/codificacion.js`) corre en la COMPU: única fuente de
  verdad. El iPad es un control remoto con espejo: manda acciones
  `{tipo:'tocar', elementoId, momento, n}` y recibe el estado para pintar.
- La compu sirve la página del iPad por HTTP en la red local
  (`http://IP:8787`). No se usa la PWA del iPad que ya existe: está en HTTPS
  y Safari no deja que una página HTTPS hable con un `ws://` de la red local
  (contenido mixto). Dejalo explicado en un comentario.
- La página del iPad importa `/nucleo/botonera-vista.js` y
  `/nucleo/plantilla.js` servidos desde `src/`.

### 1. `main/remoto.js`
Exportá `registrar({ipcMain, ventana, bd, carpeta, rutaSrc})` y `detener()`.
Dependencias autorizadas: `ws` y `qrcode` (QR como SVG, sin internet).
- `http.createServer` en `0.0.0.0:puerto` (`puertoRemoto`, 8787). Sirve
  `escritorio/remoto/**` en `/` y `src/nucleo/**` en `/nucleo/`, solo GET,
  sin listados (usá `dentroDe()` de `main/rutas.js` del Agente 1; si no
  está, copia local marcada TODO).
- WebSocket en `/ws`. PIN de 4 dígitos nuevo en cada `iniciar()`. 5 intentos
  fallidos desde una IP → bloqueo 1 minuto. Token de sesión para reconectar
  sin PIN mientras el servidor siga.
- IPs: IPv4 privadas sin adaptadores virtuales (vEthernet, VirtualBox,
  VMware, Hyper-V); si hay varias, todas, y la pantalla deja elegir.
- IPC `'remoto:iniciar' | 'remoto:detener' | 'remoto:estado' |
  'remoto:enviar'` y eventos `'remoto:mensaje'`, `'remoto:cliente'` (el
  Agente 1 los expone como `tv.remoto.*`).
- Reloj compartido: ping cada 2 s (`{tipo:'ping', t0}` →
  `{tipo:'pong', t0, tServidor}`); el iPad estima desfase y latencia (mediana
  de 8) y manda cada toque en reloj de la COMPU. `latenciaMs` en `estado()`.
- Firewall: si en 60 s no se conecta nadie, la pantalla explica "permitir en
  redes privadas" y "marcar la wifi como red privada".

### 2. `escritorio/remoto/` (la página del iPad)
- PIN con teclado numérico grande → botonera a pantalla completa con
  `crearVista(..., {tactil:true, ajustar:true})`. Franja fina arriba: reloj,
  "● REC" si la compu graba, conexión (verde / amarillo / rojo), último
  evento marcado.
- Respuesta al toque INMEDIATA (se pinta optimista y se corrige con el
  estado que vuelve). Emergentes, pestañas y fijas según el estado.
- Cola: cada acción lleva `n` creciente; sin socket, van a una cola (memoria
  + localStorage) con el momento ya calculado; al reconectar, en orden. La
  compu aplica cada `n` una sola vez y confirma `{tipo:'ack', n}`.
- Para el dedo: sin zoom accidental, sin selección, sin rebote; Wake Lock
  si existe (si no, avisar que desactive el bloqueo automático); manifest
  propio para "Añadir a pantalla de inicio".
- Un iPad por vez; un segundo ve "Ya hay un iPad codificando" y puede pedir
  el control (confirmar en la compu).
- Botones PLAY/PAUSA y Terminar también en el iPad (Terminar pide confirmar
  en la compu).

### 3. La rama (`src/ramas/ipad/`)
Reusá `src/ramas/captura/piezas.js` y `src/nucleo/grabadora.js` del Agente 4
(si no existen, programá contra esos nombres y anotalo).
- **Preparación**: cámara/placa, plantilla (`params.plantillaId` o
  `elegirPlantilla`), equipos, nombre. "Conectar iPad" → QR grande, URL, PIN
  grande, iPads conectados con su latencia. "Empezar" se habilita con un
  iPad conectado (o "Empezar sin iPad" = codificar desde la compu).
- **En vivo**: video grande, reloj, REC, registro con el origen de cada
  evento (iPad / compu), botonera chica de solo lectura que espeja el iPad,
  "▶ Ver" y "✂ Guardar clip" igual que la Captura en vivo. Mensaje del iPad
  → `codificacion.aplicar(accion)` → `tv.remoto.enviar(estadoResumido)`.
  iPad desconectado > 10 s → aviso grande ("los toques quedan guardados en
  el iPad y entran al reconectar").
- **Terminar**: igual que la Captura en vivo (video + XML en
  `Partidos/<nombre>/`, partido con `videoRuta`, `xmlRuta`,
  `origen:'ipad-vivo'`). El iPad muestra "Partido guardado en la compu".
- `desmontar()` = false grabando o con un iPad en un partido en curso.
- Tarjeta aparte "Codifiqué en el iPad sin la compu": explica exportar la
  sesión en el iPad (Historial ▾ → ⤓, o la nube) y lleva a
  `navegar('importar')` (el Agente 6 hace esa pantalla; no la dupliques).

### 4. Pruebas
`node --test escritorio/test/ipad*.test.js`, con el servidor en un puerto
libre y un cliente `ws` de prueba: PIN malo y bloqueo tras 5, token de
reconexión, 404 fuera de `remoto/` y `nucleo/` (incluido `../` y
`%2e%2e`), cola (n=1..20, cortar en el 8, reconectar: 20 acciones aplicadas,
ninguna dos veces), desfase de reloj con latencias simuladas. **De verdad:**
iPad (o celular) en la misma wifi, 5 min con webcam, 15 toques con
emergentes y una pestaña de detalle, wifi del iPad apagado 30 s en el medio:
todos los eventos en la base, 3 clips en el segundo correcto, latencia
medida.

## Si te sobra tiempo
- Dos iPads a la vez (uno por equipo), con el motor mezclando acciones.
- Desde el iPad, ver el último clip marcado (streaming del tramo por HTTP).
