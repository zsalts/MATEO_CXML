#!/usr/bin/env python3
"""
Empaqueta la app en un único TagView-iPad.html autocontenido.

Lo copiás a Archivos en el iPad y lo abrís con Safari: no necesita servidor,
hosting ni internet. Volvé a correr este script cada vez que toques
index.html, style.css o app.js.

    python3 build-ipad.py
"""
import base64
import io
import os
import re
import sys

RAIZ = os.path.dirname(os.path.abspath(__file__))
SALIDA = 'TagView-iPad.html'


def leer(nombre):
    ruta = os.path.join(RAIZ, nombre)
    if not os.path.exists(ruta):
        sys.exit('Falta %s — corré el script desde la carpeta del proyecto.' % nombre)
    return io.open(ruta, encoding='utf-8').read()


def blindar(js):
    """Evita que un </script> dentro del JS cierre el bloque antes de tiempo."""
    return js.replace('</script', '<\\/script')


def version(texto, patron, archivo):
    m = re.search(patron, texto)
    if not m:
        sys.exit('No encontré el número de versión en %s.' % archivo)
    return m.group(1)


def main():
    html = leer('index.html')
    css = leer('style.css')
    app = leer('app.js')
    tailwind = leer('tailwind.css')

    # El número que muestra la app tiene que ser el mismo que versiona el caché:
    # si se desfasan, en pantalla dice una versión y el service worker sirve otra.
    v_app = version(app, r"APP_VERSION\s*=\s*'([^']+)'", 'app.js')
    v_sw = version(leer('sw.js'), r"CACHE_VERSION\s*=\s*'tagview-([^']+)'", 'sw.js')
    if v_app != v_sw:
        sys.exit('Versiones desfasadas: app.js dice %s y sw.js dice %s.' % (v_app, v_sw))

    # Favicon embebido para que no pida un archivo externo
    icono = base64.b64encode(open(os.path.join(RAIZ, 'icon-192.png'), 'rb').read()).decode()

    reemplazos = [
        # Tailwind y estilos, en línea
        ('<link rel="stylesheet" href="tailwind.css">',
         '<style>\n%s\n</style>' % tailwind),
        ('<link rel="stylesheet" href="style.css">',
         '<style>\n%s\n</style>' % css),
        # Sin red no hay nube, pero la config tiene que existir igual: app.js la
        # lee al arrancar y con la url vacía simplemente no sube nada.
        ('<script src="nube-config.js"></script>',
         '<script>%s</script>' % blindar(leer('nube-config.js'))),
        ('<script src="app.js"></script>',
         '<script>%s</script>' % blindar(app)),
        # El manifest y los iconos sueltos no existen en el archivo único
        ('<link rel="manifest" href="manifest.json">', ''),
        ('<link rel="apple-touch-icon" href="apple-touch-icon.png">',
         '<link rel="apple-touch-icon" href="data:image/png;base64,%s">' % icono),
        ('<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">',
         '<link rel="icon" type="image/png" href="data:image/png;base64,%s">' % icono),
    ]

    for viejo, nuevo in reemplazos:
        if viejo not in html:
            sys.exit('No encontré en index.html el fragmento:\n  %s' % viejo[:70])
        html = html.replace(viejo, nuevo, 1)

    # Sin servidor no hay service worker: sacamos su registro para no ensuciar la consola
    html = re.sub(
        r'\n *<script>\s*//[^\n]*\n\s*if \(\'serviceWorker\' in navigator.*?</script>',
        '', html, flags=re.S)
    if 'serviceWorker' in html:
        sys.exit('No pude quitar el registro del service worker.')

    io.open(os.path.join(RAIZ, SALIDA), 'w', encoding='utf-8').write(html)
    kb = len(html.encode('utf-8')) / 1024
    print('%s  —  %.0f KB, autocontenido, %s' % (SALIDA, kb, v_app))


if __name__ == '__main__':
    main()
