# Agente 7 — Todo para macOS

> Correlo cuando terminen los 6 (toca archivos de todos). Pegá este archivo
> entero como prompt. Después va el 8 (integración).

Seis agentes armaron en paralelo la app de escritorio de `escritorio/`
("Tag & View Pro", Electron) pensada para Windows. Leé los 6 archivos de
`prompts/`: tienen el contrato común (API `window.tv`, formatos, carpetas,
estilo de código) y la lista **SÍ O SÍ** de cada uno. Leé también
`README.md` de la raíz y `escritorio/README.md`.

**Tu trabajo: que la misma app ande en macOS igual de bien que en Windows**,
con el instalador `.dmg`, y que en Windows no cambie nada.

## Reglas

- Podés tocar cualquier archivo de `escritorio/`, pero **solo para lo de
  Mac**: `process.platform === 'darwin'` en main, `esMac` en las pantallas,
  o un arreglo que sirve a las dos plataformas. No rediseñes ni reescribas lo
  de otro agente; cambio mínimo, con un comentario que diga por qué.
- Fuera de `escritorio/` lo único que podés crear es
  `.github/workflows/escritorio-mac.yml`. La web del iPad NO SE TOCA.
- **En Windows todo tiene que seguir exactamente igual**: `npm start`,
  `npm test` y `npm run dist` (el `.exe`) sin diferencias.
- Sin dependencias nuevas salvo las que se autorizan abajo.
- No hagas commits ni push (los hace el usuario). No firmes ni notarices
  nada ni gastes dinero sin preguntar.

**Dónde corrés:** si estás en una Mac, probá todo de verdad. Si estás en
Windows (lo más probable: el repo vive ahí, PowerShell 5.1, `npm.cmd`),
hacé todo el código, las pruebas que corren en cualquier sistema, el
workflow de GitHub Actions que arma el `.dmg` en una Mac de GitHub, y
dejá `escritorio/MAC-PRUEBAS.md` con lo que hay que probar a mano en una
Mac. Decí claramente en el informe qué probaste en Mac y qué no.

## Lo que tiene que estar SÍ O SÍ

- [ ] `npm install` y `npm start` en una Mac (Apple Silicon e Intel) abren
      la app sin errores de consola.
- [ ] `npm run dist:mac` genera `.dmg` y `.zip` para **arm64** y **x64**,
      cada uno con el ffmpeg y el ffprobe de SU arquitectura adentro.
      `npm run dist` sigue generando el instalador de Windows como hoy.
- [ ] Ventana con cara de Mac: semáforo (cerrar/minimizar/zoom) dentro de la
      barra superior de 36 px sin tapar nada, y la barra se acomoda en
      pantalla completa (ahí el semáforo desaparece).
- [ ] Menú nativo de macOS (sin él no andan ⌘C/⌘V/⌘Q/⌘H en Mac): menú de la
      app con Acerca de, Ajustes… ⌘, (va a la rama `ajustes`), Ocultar y
      Salir; Edición con los roles; Ventana. En Windows sigue sin menú.
- [ ] Atajos con ⌘ en Mac donde en Windows son Ctrl (⌘1…6, ⌘K, ⌘Z,
      ⌘+clic para seleccionar varios, zoom de la línea de tiempo con ⌘+rueda
      y con pellizco del trackpad), y los textos de ayuda muestran `⌘K` en
      Mac y `Ctrl+K` en Windows. Los atajos de letra de la plantilla andan
      igual.
- [ ] **Permiso de cámara y micrófono**: la app lo pide al entrar a Captura
      en vivo / Captura desde iPad, y si está denegado la pantalla explica
      cómo darlo y tiene un botón que abre Ajustes del Sistema en esa página.
      Nunca queda una vista previa negra sin explicación.
- [ ] La placa HDMI (Cam Link, UltraStudio, etc.) y la webcam aparecen con
      su nombre, graban MP4 H.264/AAC al disco y se cortan clips en vivo como
      en Windows.
- [ ] Captura desde iPad: el servidor de la red local anda en Mac, muestra
      las IP correctas (Wi-Fi/Ethernet, sin `utun`, `awdl`, `llw`, `bridge`,
      `vmnet`, `lo0`), y si el firewall de macOS o el permiso de Red local lo
      bloquea, la pantalla explica qué tocar en Ajustes del Sistema.
- [ ] Grabar un partido de 90 min con la ventana tapada, minimizada o en otro
      Escritorio no se frena ni se desfasa (App Nap, estrangulamiento de
      timers en segundo plano, reposo de pantalla).
- [ ] Rutas y nombres: nombres con tildes y ñ (`Peñarol vs Nacional`) se
      guardan, se encuentran en la base, pasan la lista blanca de
      `/__video` y no se duplican con `(2)` por error (macOS puede devolver
      los nombres en Unicode NFD).
- [ ] Textos: "Mostrar en Finder" en Mac, "Mostrar en el Explorador" en
      Windows (y cualquier otro texto que nombre a Windows).
- [ ] `node --test escritorio/test/` pasa entero en Windows **y** en Mac
      (el workflow lo corre en Mac).
- [ ] `escritorio/README.md` con una sección macOS: requisitos, cómo
      instalar el `.dmg` sin firmar (abrir por primera vez), permisos, y
      cómo generar el `.dmg`.

## Tu parte, en detalle

### 1. Plataforma en la API

Sumá al contrato (y a `src/ui/api-simulada.js`, para que las pantallas se
prueben sin Electron):

```
tv.sys.info()                → {..., plataforma: 'win32' | 'darwin', arquitectura}
tv.sys.permiso(tipo)         → 'concedido' | 'denegado' | 'no-determinado' | 'restringido'
                               tipo = 'camara' | 'microfono'   (en Windows: siempre 'concedido')
tv.sys.pedirPermiso(tipo)    → boolean
tv.sys.abrirAjustesSistema(pagina)   pagina = 'camara' | 'microfono' | 'red-local' | 'firewall'
                               (en Windows: abre lo equivalente o no hace nada)
tv.ventana.onPantallaCompleta(cb) → quitar()   cb(boolean)
```

En Mac: `systemPreferences.getMediaAccessStatus` / `askForMediaAccess`, y
`shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera')`
(y `Privacy_Microphone`, `Privacy_LocalNetwork`; el firewall está en
`com.apple.Network-Settings.extension` en macOS 13+; si no abre, que al
menos abra Ajustes del Sistema). Validá `tipo` y `pagina` en main.

Al arrancar, el router (Agente 2) pone `data-plataforma="mac"` o `"win"` en
`<html>` con lo que dice `tv.sys.info()`. Todo el CSS de Mac cuelga de ahí.

Dejá lo específico de Mac de main en `escritorio/main/mac.js` (menú,
permisos, ventana, energía) y llamalo desde `main.js` solo en `darwin`, así
`main.js` casi no cambia.

### 2. Ventana y ciclo de vida

- En Mac: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition` para que el
  semáforo quede centrado en la barra de 36 px, sin `titleBarOverlay` (eso es
  de Windows). La barra superior del Agente 2 deja ~78 px a la izquierda en
  `[data-plataforma="mac"]`, y 0 en pantalla completa
  (`enter-full-screen` / `leave-full-screen` → `tv.ventana.onPantallaCompleta`).
  En Windows los botones siguen a la derecha como hoy.
- Menú nativo (`Menu.buildFromTemplate` con `role`s): sin menú no andan
  copiar/pegar en los campos. Nada de DevTools en el menú si
  `app.isPackaged`; en desarrollo ⌘⌥I.
- ⌘Q y cerrar la ventana pasan por el MISMO lugar que en Windows (el cierre
  único del Agente 1): si hay algo grabando, confirmar; cerrar la grabación,
  el servidor del iPad y la base, en ese orden.
- Cerrar la ventana cierra la app también en Mac (hay una sola ventana,
  grabación y servidor: dejarlos vivos sin ventana es peligroso). Igual
  manejá `activate` por si macOS lo manda. Comentalo en el código.
- `app.setAboutPanelOptions` con nombre y versión.
- Una sola instancia (ya está): en Mac, `second-instance` trae la ventana al
  frente.

### 3. Teclado y mouse

En `src/ui/` (Agente 2), sumá y exportá:

```js
esMac                         // boolean, de data-plataforma
teclaMod(evento)              // e.metaKey en Mac, e.ctrlKey en Windows
textoAtajo('Mod+K')           // '⌘K' en Mac, 'Ctrl+K' en Windows (Mod, Shift, Alt/⌥)
```

Buscá en `src/` todos los `ctrlKey`, `'Ctrl'` y `Ctrl+` y pasalos a eso.
Cuidado con:
- **En Mac Ctrl+clic es clic derecho**: la selección múltiple de la base es
  ⌘+clic.
- **Zoom con rueda**: el pellizco del trackpad llega como `wheel` con
  `ctrlKey = true` (en las dos plataformas). En Mac aceptá ⌘+rueda **y**
  `ctrlKey` (pellizco); en Windows sigue Ctrl+rueda.
- **Mientras ⌘ está apretada, macOS no manda `keyup` de las otras teclas.**
  Si la captura usa keydown/keyup (eventos que duran mientras se mantiene la
  tecla), que un ⌘ no deje un evento abierto para siempre: al soltar ⌘ o al
  perder el foco (`blur`), soltá lo que esté apretado.
- ⌥ + letra en Mac escribe otro carácter (`e.key = 'œ'`): los atajos de
  letra de la plantilla se comparan sin modificadores; si hace falta, con
  `e.code`.
- F12 para DevTools no existe en muchos teclados de Mac: ⌘⌥I.

### 4. Cámara, micrófono y grabación

- `extendInfo` en `package.json` → `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription` (en castellano: para qué la usa) y
  `NSLocalNetworkUsageDescription`.
- `hardenedRuntime: true` y `build/mac/entitlements.mac.plist` con
  `com.apple.security.device.camera`, `com.apple.security.device.audio-input`,
  `com.apple.security.cs.allow-jit` y
  `com.apple.security.cs.allow-unsigned-executable-memory` (Electron las
  necesita), y `network.server` / `network.client` por si algún día va con
  sandbox.
- En la Captura en vivo y en Captura desde iPad (Agentes 4 y 5), antes de
  `getUserMedia`: `tv.sys.permiso('camara')`; si es `no-determinado`,
  `pedirPermiso`; si es `denegado`, un panel que lo explica con el botón
  "Abrir Ajustes del Sistema" y "Reintentar". Los nombres de las cámaras
  solo aparecen DESPUÉS del permiso: volvé a llamar `enumerateDevices`.
  Ídem micrófono, que puede estar denegado con la cámara permitida ("Sin
  audio" sigue andando).
- Revisá que `MediaRecorder` en Mac elija MP4 H.264/AAC en el mismo orden
  que en Windows (Chromium usa VideoToolbox) y probá una grabación real de
  10 min: el archivo abre en QuickTime y ffmpeg corta clips en vivo sobre el
  archivo en curso.
- **Energía**: `backgroundThrottling: false` en la ventana (con la ventana
  tapada, macOS frena los timers y el reloj del partido se desfasa) y
  `powerSaveBlocker.start('prevent-app-suspension')` mientras se graba o el
  servidor del iPad está prendido; soltalo al terminar. Si lo ponés para las
  dos plataformas, que en Windows no cambie nada visible.

### 5. Captura desde iPad en Mac (`main/remoto.js`)

- Filtro de interfaces: hoy descarta adaptadores virtuales de Windows
  (línea ~70). Sumá los de Mac: `utun*`, `awdl*`, `llw*`, `bridge*`,
  `vmnet*`, `anpi*`, `ap*`, `lo0`. Sacá la lógica a una función pura
  `ipsLocales(interfaces, plataforma)` para probarla con datos armados.
- Firewall: si en 60 s no se conecta nadie, en Mac la explicación es
  "Ajustes del Sistema → Red → Firewall → Opciones → permitir Tag & View
  Pro" y, en macOS 15+, "Privacidad y seguridad → Red local", con el botón
  `abrirAjustesSistema('firewall')`. Sin firmar, macOS puede volver a
  preguntar en cada versión nueva: decilo en el README.

### 6. Archivos y rutas

- `main/rutas.js`: `dentroDe()` compara sin mayúsculas solo en `win32`, pero
  el disco de una Mac tampoco distingue mayúsculas por defecto. Normalizá a
  NFC las dos rutas y compará sin mayúsculas también en `darwin` (en Linux
  no). Mismo cuidado en la lista blanca de `/__video` y en todo lo que
  compare rutas o nombres de archivo (`(2)`, importar, "ya existe").
- Nombres limpios: la regla de Windows ya cubre lo que prohíbe Mac (`/` y
  `:`); sumá que no empiecen con `.` y normalizá a NFC.
- Carpeta de trabajo por defecto: donde la elija el Agente 1 con
  `app.getPath(...)`; comprobá que en Mac quede en una carpeta del usuario
  que exista (Películas o Documentos), no dentro del `.app`.
- `app://tagview` y `/__video` con rutas con espacios, tildes y `&` (el
  nombre de la app tiene `&`: `~/Library/Application Support/Tag & View Pro`).
- `build/preparar.js` y cualquier script: `path.join`, nada de `\` a mano.
- La decodificación de XML (UTF-8, UTF-16, Windows-1252) queda igual; probá
  además un XML con finales de línea `\r` solo (Mac viejo) y un XML
  exportado por Sportscode para Mac si hay uno a mano.

### 7. Empaquetado (`package.json` → `build`)

- `"mac"`: `target` `dmg` y `zip`, `category`
  `public.app-category.sports`, `icon` (electron-builder arma el `.icns` a
  partir de `build/icon.png`; si pide 1024 px, generalo a partir de
  `icon-512.png` y avisá), `hardenedRuntime`, `entitlements`,
  `entitlementsInherit`, `extendInfo`, `minimumSystemVersion` = lo que pida
  la versión de Electron instalada (fijate en su documentación, no lo
  inventes).
- Hoy `"files"` excluye `ffprobe-static/bin/darwin/**`: mové las
  exclusiones por plataforma a `win.files` / `mac.files` para que el `.exe`
  lleve solo `win32/x64` y cada `.dmg` solo `darwin/<su arquitectura>`.
- **ffmpeg-static baja UN binario al instalar, el de la máquina donde corre
  `npm install`.** Un `.dmg` x64 armado en una Mac M1 llevaría ffmpeg arm64.
  Armá cada arquitectura en su máquina (el workflow de abajo) o reinstalá
  ffmpeg-static con `npm_config_arch` antes de cada una; verificá con
  `file` / `lipo -archs` el binario que quedó adentro de cada `.app`.
- Sin firma: `identity: null` en desarrollo. En Apple Silicon todo binario
  tiene que estar al menos firmado ad-hoc o macOS lo mata al arrancar:
  verificá `codesign -dv` sobre ffmpeg y ffprobe dentro de la `.app`; si no
  lo están, `codesign --force -s -` en un hook `afterSign` / `afterPack`
  (`build/mac/firmar-adhoc.js`).
- Scripts: `"dist:mac": "node build/preparar.js && electron-builder --mac"`
  (con la arquitectura por parámetro) y dejá `"dist"` como está para
  Windows (sumá `"dist:win"` igual a `"dist"`).
- Firma con Developer ID y notarización: solo dejalo anotado en el README
  (qué cuenta hace falta y qué variables pide electron-builder). No lo
  configures sin preguntar.

### 8. Workflow `.github/workflows/escritorio-mac.yml`

`workflow_dispatch` (y `push` solo si toca `escritorio/**`). Matriz:
`macos-14` (arm64) y `macos-13` (x64). Pasos: checkout, Node LTS, `npm ci`
en `escritorio/`, `npm test`, `npm run dist:mac`, verificar la arquitectura
de ffmpeg adentro de la `.app`, subir el `.dmg` y el `.zip` como artifacts.
Sin publicar releases ni secretos. Explicá en el README cómo correrlo desde
la pestaña Actions y bajar el `.dmg`.

### 9. Pruebas

`escritorio/test/mac*.test.js`, que corran en cualquier sistema (la
plataforma se pasa por parámetro, no se lee de `process`):
- `ipsLocales()` con interfaces de Mac y de Windows armadas a mano.
- `dentroDe()` con NFD vs NFC, mayúsculas, `..` y `%2e%2e`, por plataforma.
- nombres limpios (`:`, `/`, punto inicial, tildes en NFD).
- `textoAtajo()` y `teclaMod()` con eventos falsos.
- la plantilla del menú de Mac tiene los roles de Edición y ⌘, va a
  `ajustes`.
- `package.json`: `mac.extendInfo` tiene las tres descripciones, los
  entitlements existen, y `win` no cambió.

Con Mac a mano, además: la lista de `escritorio/MAC-PRUEBAS.md` entera.

### 10. `escritorio/MAC-PRUEBAS.md`

Lista para probar en una Mac real, con casillas: instalar el `.dmg` sin
firma (y el mensaje de Gatekeeper), primer arranque, permiso de cámara
denegado → dado, placa HDMI + webcam, 10 min de grabación con la ventana
minimizada, cortar 2 clips en vivo, ⌘Q grabando, captura desde iPad con el
firewall prendido, importar un `.mov` + XML de Sportscode, base de datos
con ⌘+clic y pellizco, pantalla completa, modo claro/oscuro.

## Al terminar

Informe corto: qué cambiaste y en qué archivos de qué agente (con el porqué),
la lista **SÍ O SÍ** punto por punto (hecho y probado en Mac / hecho sin
probar en Mac / no hecho y por qué), la salida real de `npm test` en
Windows (y en Mac si pudiste), y lo que queda para el Agente 8.
