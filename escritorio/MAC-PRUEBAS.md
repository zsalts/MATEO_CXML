# Pruebas a mano en una Mac

Lo que las pruebas automáticas no pueden ver: cámara, permisos, Gatekeeper,
el firewall y la grabación de verdad. Hacelo con el `.dmg` que arma el
workflow **Escritorio Mac** (pestaña Actions de GitHub → la última corrida →
*Artifacts*), una vez en una Mac con chip Apple y otra en una Intel si hay.

Anotá al lado de cada casilla la versión de macOS y la Mac.

## Instalar

- [ ] Abrir el `.dmg` y arrastrar la app a Aplicaciones.
- [ ] Primer arranque: macOS dice que no puede verificar al desarrollador
      (la app no está firmada). En macOS 15+: **Ajustes del Sistema →
      Privacidad y seguridad → "Abrir igualmente"**. En macOS 14 o antes:
      clic derecho en la app → Abrir → Abrir. Desde la segunda vez abre
      directo.
- [ ] Si dice **"está dañada y no se puede abrir"**: es la cuarentena de la
      descarga. Anotalo. (Arreglo temporal:
      `xattr -dr com.apple.quarantine "/Applications/Tag & View Pro.app"`.)
- [ ] Acerca de Tag & View Pro muestra el nombre y la versión.

## Ventana y menú

- [ ] El semáforo (rojo/amarillo/verde) queda centrado en la barra superior y
      no tapa el logo ni ningún botón.
- [ ] Pantalla completa (verde o ⌃⌘F): el semáforo desaparece y la barra deja
      de reservarle lugar. Al salir, vuelve.
- [ ] Arrastrar la ventana desde la barra superior.
- [ ] ⌘C / ⌘V / ⌘X / ⌘A / ⌘Z en un campo de texto (renombrar un partido).
- [ ] ⌘, abre Ajustes. ⌘H oculta. ⌘M minimiza.
- [ ] ⌘1…⌘6 cambian de rama y ⌘K abre el buscador. Los textos de ayuda dicen
      `⌘K`, no `Ctrl+K`.
- [ ] Doble clic en el icono con la app abierta: trae la ventana al frente,
      no abre otra.
- [ ] Modo claro y oscuro de la app se ven bien.

## Cámara y micrófono

- [ ] Primera vez en Captura en vivo: macOS pregunta por la cámara (con el
      texto en castellano) y después por el micrófono.
- [ ] Negar la cámara → la pantalla lo explica, **"Abrir Ajustes del
      Sistema"** abre Privacidad → Cámara, se tilda la app, **"Reintentar"**
      → vista previa. (macOS puede pedir reabrir la app: anotalo.)
- [ ] Cámara sí, micrófono no → graba con "Sin audio" y lo dice.
- [ ] La lista de cámaras muestra los nombres reales (no "Cámara 1").
- [ ] Placa HDMI (Cam Link, UltraStudio, etc.): vista previa con resolución
      y fps reales.
- [ ] Webcam integrada (FaceTime HD) y, si hay, el iPhone como cámara de
      Continuidad.
- [ ] Desenchufar la placa en medio de la grabación y volver a enchufarla:
      sigue sin perder la codificación.

## Grabación

- [ ] 10 minutos de grabación con 15 eventos, **con la ventana minimizada
      la mitad del tiempo** y en otro Escritorio un rato. Al terminar, los
      eventos caen en el segundo correcto del video (±0,5 s).
- [ ] El `.mp4` abre en QuickTime y en el reproductor de la app.
- [ ] Cortar 2 clips **mientras graba** (✂ Guardar clip): los `.mp4` quedan en
      `Partidos/<nombre>/Clips/` y abren en QuickTime.
- [ ] La Mac no se durmió durante la grabación (con la tapa abierta y sin
      tocar nada 10 min).
- [ ] **⌘Q mientras graba**: pregunta antes de salir. Aceptar → el video
      queda en el disco y abre bien.
- [ ] Cerrar la ventana (botón rojo) mientras graba: igual que ⌘Q.
- [ ] Partido de 90 min (una vez): la grabación no se frena ni se desfasa.

## Captura desde iPad

- [ ] La pantalla muestra la IP de la Wi-Fi (192.168… o 10…), no la de una
      VPN ni la de "Compartir Internet".
- [ ] Con el **firewall de macOS prendido** (Ajustes → Red → Firewall): macOS
      pregunta si acepta conexiones entrantes; aceptar → el iPad entra.
- [ ] Si se niega: a los 60 s la pantalla explica qué tocar y el botón abre
      Ajustes del Sistema en el Firewall. Anotá si abrió la página justa.
- [ ] En macOS 15+: aparece el pedido de **Red local**; si se niega, la
      pantalla lo explica.
- [ ] 2 min, 8 toques desde el iPad, Wi-Fi del iPad cortada 20 s en el medio:
      todos los eventos en la base.

## Archivos y base

- [ ] Partido llamado `Peñarol vs Nacional (ñ, á, ü)`: se guarda, aparece en
      la base, el video se reproduce, y guardarlo otra vez no crea `(2)`
      sin motivo.
- [ ] "Mostrar en Finder" abre la carpeta del partido con el archivo
      seleccionado.
- [ ] Importar un `.mov` + un XML exportado por **Sportscode para Mac**:
      mismos eventos, clips bien.
- [ ] Base de datos: ⌘+clic suma a la selección (Ctrl+clic abre el menú
      contextual, no selecciona). Zoom de la línea de tiempo con ⌘+rueda y
      con pellizco del trackpad.
- [ ] Importar las plantillas del iPad (copia de seguridad `.json`).
- [ ] La carpeta de trabajo por defecto está en tu carpeta de usuario
      (Películas o Documentos), no adentro de la app.

## Informe

Anotá lo que falló con la versión de macOS, la Mac (chip Apple / Intel) y, si
hay, el mensaje exacto. La consola de la app: en desarrollo, ⌘⌥I.
