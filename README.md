# Tag & View Pro

App web para **codificación de video deportivo**: armás un panel de botones,
taggeás el partido en vivo y exportás un XML que se importa en Sportscode,
Nacsport o LongoMatch.

Sin backend, sin base de datos, sin dependencias de npm. Todo se guarda en el
dispositivo.

## Qué hace

- **Modo Formularios** — lienzo con grilla para armar el panel: eventos,
  etiquetas, etiquetas emergentes, contenedores, contadores y líneas.
- **Modo Codificación** — cronómetro, registro en vivo y tabla de tiempo en hielo.
- **Time on Ice** — botones de línea que abren y cierran el turno de varios
  jugadores de una vez, con reloj por jugador y acumulado en vivo.
- **Exportación** — XML estándar (`<ALL_INSTANCES>`), una instancia por turno,
  más CSV de tiempo acumulado.
- **Archivos** — plantillas, sesiones y copias de seguridad como `.json` que
  se guardan y se abren desde la app Archivos del iPad.

## Dónde se guardan los datos

En el dispositivo, siempre. El hosting solo sirve los archivos estáticos: nunca
recibe ni almacena nada. Las plantillas y sesiones viven en el `localStorage`
del navegador, y los respaldos son archivos `.json` que exportás vos.

Como el navegador puede limpiar su almacenamiento, conviene exportar la sesión
después de cada partido (**Historial ▾ → ⤓**) y hacer una copia completa cada
tanto (**Plantillas ▾ → Copia de seguridad**).

## Instalar en el iPad

Servido sobre HTTPS, en Safari: **Compartir → Añadir a pantalla de inicio**.
Abrilo una vez con señal para que el service worker cachee todo; después
funciona en modo avión.

Las rutas son relativas, así que anda igual en la raíz de un dominio que en un
subdirectorio (`https://usuario.github.io/xml/`).

## Sin hosting

`TagView-iPad.html` es la app entera en un solo archivo (~512 KB, Tailwind
incluido). Se copia a Archivos en el iPad y se abre con Safari, sin servidor ni
internet. Desde `file://` no hay service worker ni instalación en pantalla de
inicio.

Para regenerarlo después de tocar el código:

```bash
python3 build-ipad.py
```

## Sobre los estilos

`tailwind.css` es CSS estático, generado una vez a partir de las clases que la
app realmente usa (~16 KB). Antes se cargaba el *Play CDN* de Tailwind, un
compilador de 400 KB que corre en el navegador: en Safari de iPad viejo no
llegaba a ejecutarse y la app quedaba sin la mitad de los estilos.

Si agregás clases de Tailwind nuevas, regenerá el CSS con `build-tailwind.py`.
Si solo tocás `style.css`, no hace falta.

## Al modificar el código

Subí el número en los dos lugares, siempre juntos:

- `CACHE_VERSION` en `sw.js` (`tagview-v12`). Si no, los dispositivos que ya
  tienen la app instalada siguen sirviendo la versión vieja desde el caché.
- `APP_VERSION` en `app.js` (`v12`). Es lo que la app muestra al lado del logo:
  abrís la app y ves qué versión quedó servida de verdad. Si dice la vieja, el
  caché no se renovó todavía.

`build-ipad.py` corta si los dos números no coinciden.

## Archivos

| | |
|---|---|
| `index.html` | Estructura, paneles y modales |
| `app.js` | Toda la lógica |
| `style.css` | Estilos propios (el resto es Tailwind) |
| `tailwind.css` | Tailwind precompilado: solo las clases que la app usa |
| `tailwind.js` | Compilador de Tailwind, solo para regenerar el CSS |
| `build-tailwind.py` | Regenera `tailwind.css` |
| `sw.js` | Service worker (caché offline) |
| `manifest.json` | Metadatos de la PWA |
| `build-ipad.py` | Genera el archivo único |
| `TagView-iPad.html` | Archivo único generado |
# xml
