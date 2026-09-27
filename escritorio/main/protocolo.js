// El esquema app://tagview: sirve las pantallas de escritorio/src y los videos.
//
// La app NO se sirve desde file://. Chromium no considera file:// un contexto
// seguro y ahi getUserMedia no existe: sin esto la placa de captura no se
// puede abrir. Por eso hay un esquema propio, declarado como seguro. Es todo
// local: no hay servidor ni puerto abierto.

const fs = require('fs');
const { archivoDeUrl, mimeDe } = require('./rutas');

const ESQUEMA = 'app';
const HOST = 'tagview';
const ORIGEN = `${ESQUEMA}://${HOST}`;

// Tiene que correr antes de app.ready.
function declararEsquema(protocol) {
    protocol.registerSchemesAsPrivileged([{
        scheme: ESQUEMA,
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }]);
}

// Mientras src/ no tenga su index.html (las pantallas las arma otro agente),
// la app abre igual con esto en vez de una pagina de error.
const PAGINA_VACIA = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Tag &amp; View Pro</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; height:100vh; display:grid; place-items:center; font:15px system-ui, sans-serif;
         background:#f2f2f7; color:#1c1c1e; -webkit-app-region: drag; }
  @media (prefers-color-scheme: dark) { body { background:#1c1c1e; color:#f2f2f7; } }
  div { text-align:center; } h1 { font-size:22px; margin:0 0 8px; } p { opacity:.7; margin:0; }
</style></head>
<body><div><h1>Tag &amp; View Pro</h1><p>Las pantallas de la app todavia no estan en escritorio/src/.</p></div></body></html>`;

function servir(protocol, { rutaSrc, video }) {
    protocol.handle(ESQUEMA, async (req) => {
        let url;
        try { url = new URL(req.url); } catch (_) { return new Response('Mal pedido', { status: 400 }); }
        if (url.host !== HOST) return new Response('No', { status: 404 });

        if (url.pathname === '/__video') {
            return video.servirVideo(url.searchParams.get('p'), req.headers.get('range'));
        }

        const destino = archivoDeUrl(rutaSrc, url.pathname);
        if (!destino) return new Response('No', { status: 403 });

        let datos;
        try {
            const st = await fs.promises.stat(destino);
            if (!st.isFile()) throw new Error('no es archivo');
            datos = await fs.promises.readFile(destino);
        } catch (_) {
            if (url.pathname === '/' || url.pathname === '/index.html') {
                return new Response(PAGINA_VACIA, { headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            return new Response('No esta: ' + url.pathname, { status: 404 });
        }
        return new Response(datos, {
            headers: {
                'content-type': mimeDe(destino),
                // En desarrollo se edita src/ y se recarga: nada de cache vieja.
                'cache-control': 'no-cache'
            }
        });
    });
}

module.exports = { declararEsquema, servir, ORIGEN };
