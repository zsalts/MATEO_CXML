# Tag & View Pro

App web para **codificación de video deportivo**: armás un panel de botones,
taggeás el partido en vivo y exportás un XML que se importa en Sportscode,
Nacsport o LongoMatch.

Sin dependencias de npm. Todo se guarda en el dispositivo; la copia a la nube
es opcional y se apaga dejando `nube-config.js` vacío.

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

Lo único que sale del dispositivo es la copia de los XML a la nube, si la
activaste — ver más abajo. Las plantillas y las sesiones no se suben.

Como el navegador puede limpiar su almacenamiento, conviene exportar la sesión
después de cada partido (**Historial ▾ → ⤓**) y hacer una copia completa cada
tanto (**Plantillas ▾ → Copia de seguridad**). Con la nube activada eso último
pasa solo, en cada cambio.

## Instalar en el iPad

Servido sobre HTTPS, en Safari: **Compartir → Añadir a pantalla de inicio**.
Abrilo una vez con señal para que el service worker cachee todo; después
funciona en modo avión.

Las rutas son relativas, así que anda igual en la raíz de un dominio que en un
subdirectorio (`https://usuario.github.io/xml/`).

## Nube (opcional)

Hace dos cosas:

- **Los XML.** Al exportar uno, la app sube una copia a Supabase Storage y la
  bajás desde la compu abriendo `descargas.html`. Así no hay que pelear con la
  descarga en el iPad.
- **Las plantillas y las codificaciones.** Cada vez que guardás, borrás o
  importás una, se sube un `respaldo.json` con todo. Se recupera desde
  **Plantillas → Restaurar de la nube**, en el iPad o en otro dispositivo.

### Armar la botonera en la PC

La app es una web: abrís la misma dirección en el navegador de la PC, entrás a
la nube con el mismo usuario, y armás el panel con mouse y teclado. Cuando
después abrís el iPad, detecta que en la nube hay algo más nuevo y ofrece
traerlo.

Funciona en las dos direcciones, pero **no es una sincronización de verdad**:
hay un solo `respaldo.json` y el último que guarda pisa al anterior. Mientras
uses un dispositivo por vez no hay problema. Si editás en los dos sin abrir el
otro en el medio, uno de los dos cambios se pierde.

Dos cosas evitan los accidentes más comunes:

- Al abrir la app se mira la nube **antes** de subir lo que haya quedado
  pendiente. Al revés, un respaldo viejo que se quedó sin señal pisaría lo que
  hiciste en la PC sin preguntar.
- Si aceptás traer la copia de la nube, el respaldo local que estaba en la cola
  se descarta: ya elegiste cuál vale.

Aclaración por si preocupa: **actualizar la app no borra nada.** Subir una
versión nueva cambia la caché del service worker, que no tiene relación con el
`localStorage` donde viven las plantillas. Lo que sí las puede borrar es
Safari: siete días sin abrir la app, un "borrar historial y datos de sitios", o
cambiar de iPad. Para eso está el respaldo.

Es **opcional y aditivo**. Con `nube-config.js` sin completar, la app funciona
exactamente como antes y no sube nada. El XML se sigue guardando en el
dispositivo siempre: la nube es una copia, nunca el único lugar donde está.

Sin señal —una cancha sin wifi— el XML queda en una cola en el `localStorage` y
sube solo cuando vuelve la conexión. La codificación nunca depende de la red.

Para activarla:

1. Creá un proyecto en Supabase.
2. **SQL Editor** → pegá `supabase-setup.sql` y dale Run. Crea el bucket
   privado y las tres políticas que Storage necesita.
3. **Authentication → Users → Add user**: tu correo y contraseña. Es el
   usuario con el que vas a entrar en el iPad y en la compu.
4. **Project Settings → API**: copiá la *Project URL* y la clave *anon* a
   `nube-config.js`.

Conectar el repositorio a Supabase no reemplaza nada de esto: esa integración
aplica migraciones que vos escribís, no deduce la configuración del código.

La clave anon queda a la vista en el código de la página: es así por diseño y
no es un secreto. La seguridad la dan las políticas del bucket y el login, por
eso el bucket va privado. **Nunca pongas la clave `service_role` ahí**: esa da
acceso total al proyecto.

La primera vez, en cada dispositivo, la app pide entrar una sola vez. La sesión
queda guardada y se renueva sola.

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
| `nube-config.js` | Url y clave de Supabase. Vacío = sin nube |
| `supabase-setup.sql` | Crea el bucket y sus políticas. Se corre una vez |
| `descargas.html` | Lista y baja los XML subidos. Se abre en la compu |
| `style.css` | Estilos propios (el resto es Tailwind) |
| `tailwind.css` | Tailwind precompilado: solo las clases que la app usa |
| `tailwind.js` | Compilador de Tailwind, solo para regenerar el CSS |
| `build-tailwind.py` | Regenera `tailwind.css` |
| `sw.js` | Service worker (caché offline) |
| `manifest.json` | Metadatos de la PWA |
| `build-ipad.py` | Genera el archivo único |
| `TagView-iPad.html` | Archivo único generado |
# xml
