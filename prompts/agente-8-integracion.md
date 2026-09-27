# Pasada de integración (después de los 7)

> Correlo cuando terminen los 6 agentes y después el 7 (macOS). Pegá este
> archivo entero como prompt.

Seis agentes armaron en paralelo la app de escritorio de `escritorio/` según
los archivos de `prompts/` (leé los 6: tienen el contrato común y la lista
**SÍ O SÍ** de cada uno), y el 7 la adaptó a macOS (leé
`agente-7-macos.md`: suma funciones a `tv.sys` y `tv.ventana`). Tu trabajo:
que encaje y que ande, en Windows y en Mac.

## Lo que tiene que estar SÍ O SÍ al terminar

- [ ] `npm install` y `npm start` en `escritorio/` sin errores de consola.
- [ ] `node --test escritorio/test/` pasa entero.
- [ ] Cada punto de la lista SÍ O SÍ de los 7 agentes, verificado. Hacé una
      tabla: punto / anda / no anda / qué arreglaste.
- [ ] Los 4 flujos de abajo funcionan de punta a punta.
- [ ] `npm run dist` genera el instalador, instala, abre, y el servidor del
      iPad anda desde la app instalada (`remoto/` y `src/nucleo/` dentro del
      asar).
- [ ] Lo de Mac no rompió Windows: atajos con Ctrl, botones de la ventana a
      la derecha, sin menú, el `.exe` igual que antes.
- [ ] Mac: el workflow `escritorio-mac.yml` pasa (tests + `.dmg` arm64 y
      x64). Con una Mac a mano, `escritorio/MAC-PRUEBAS.md` entera y los 4
      flujos también en Mac; si no hay Mac, decilo en el informe.

## Pasos

1. Recorré el menú principal y las 5 ramas. Lista de errores de consola y de
   funciones del contrato que falten o no coincidan (sobre todo:
   `tv.remoto.*` en preload, `main/remoto.js` registrado, `piezas.js` y
   `nucleo/*` usados por las ramas `ipad`, `base` e `importar`,
   `params.videoRuta` de Importar a Captura).
2. Flujos completos:
   a) **Plantillas**: importar una copia de seguridad del iPad → aparecen en
      el menú principal y en Base de datos → Plantillas.
   b) **Captura en vivo**: webcam, 2 min, 8 eventos, cortar 2 clips durante
      la grabación, terminar → en `Partidos/<nombre>/` están el .mp4, el
      .xml y los clips; en la Base de datos el partido abre con el video
      enlazado y los clips caen en el segundo correcto.
   c) **Captura desde iPad**: celular o iPad en la misma wifi, 2 min, 8
      toques, cortar el wifi 20 s → todos los eventos en la base.
   d) **Importar**: el .mp4 + .xml de (b) como partido nuevo → mismos
      eventos; una sesión del iPad + un video, sincronizar → clips bien.
3. `api-simulada.js` solo para desarrollo: que no se cargue si existe
   `window.tv` real, con un comentario. Que tenga lo que sumó el Agente 7
   (`tv.sys.permiso`, `pedirPermiso`, `abrirAjustesSistema`,
   `tv.ventana.onPantallaCompleta`).

Arreglá lo mínimo para que encaje; no rediseñes. Informe con lo que
encontraste, lo que cambiaste y la tabla de SÍ O SÍ.
