// Servidor wifi para codificar desde el iPad.
//
// La compu tiene la camara y graba; el iPad, en la misma red, muestra la
// botonera y manda cada toque. El motor de codificacion corre en la COMPU
// (unica fuente de verdad): el iPad es un control remoto con espejo, manda
// acciones y recibe el estado para pintar.
//
// Por que HTTP y no la PWA del iPad que ya existe: la PWA vive en HTTPS, y
// Safari no deja que una pagina HTTPS abra un ws:// de la red local
// (contenido mixto). Un certificado valido para una IP de la casa no existe
// sin instalar una CA en el iPad, asi que la compu sirve su propia pagina por
// http://IP:puerto y ahi el ws:// es del mismo origen.
//
// Que sirve, y nada mas:
//   /            escritorio/remoto/**      (la pagina del iPad)
//   /nucleo/     escritorio/src/nucleo/**  (botonera-vista.js, plantilla.js…)
//   /ws          el WebSocket
//   /clips       la misma pagina, para MIRAR los clips (nunca codifica)
//   /clip/<id>?d=<dispositivo>&t=<token>
//                un clip cortado en vivo, para el iPad que mira. Solo los
//                que la rama publico, y solo a un iPad que ya paso el PIN.
//   /vivo?d=<dispositivo>&t=<token>
//                la imagen de la grabacion en curso (main/vivo.js), para
//                el que mira. Mismo permiso que /clip.
// Solo GET/HEAD, sin listados de carpetas, sin salir de esas dos raices.
//
// Protocolo (todo JSON por el WebSocket):
//   iPad → compu
//     {tipo:'hola', dispositivo, nombre, pin?, token?, rol?:'mirar'}
//     {tipo:'ping', t0, latenciaMs?}
//     {tipo:'accion', n, accion:{tipo:'tocar', elementoId, momento}, …}
//         n = numero creciente por dispositivo; momento = ms en el reloj de
//         la COMPU (el iPad ya corrigio el desfase). La compu aplica cada n
//         una sola vez y contesta {tipo:'ack', n} aunque sea repetido.
//     {tipo:'pedirControl'}            (un segundo iPad quiere codificar)
//     {tipo:'pedirTerminar'}           (la compu pide confirmar)
//   compu → iPad
//     {tipo:'bienvenida', token, activo, plantilla, estado}
//     {tipo:'rechazo', motivo:'pin'|'bloqueado'|'token', quedan?, esperaMs?}
//     {tipo:'pong', t0, tServidor}
//     {tipo:'ack', n}
//     {tipo:'control', activo:boolean}  (este iPad codifica o mira)
//     {tipo:'clip', clip:{id, nombre, etiquetas, equipo, inicio, duracion}}
//     {tipo:'quitarClip', id}
//     lo que mande la rama con tv.remoto.enviar() (estado, guardado…)
//   La bienvenida trae tambien clips: [...], los publicados hasta ahi.
//
// Mensajes de la rama que entiende el servidor (no se reenvian):
//   {tipo:'plantilla', plantilla:{nombre, datos}}   la que baja el iPad
//   {tipo:'darControl', dispositivo} / {tipo:'negarControl', dispositivo}
//   {tipo:'clip', clip:{id, pendiente:true, …}}  se esta cortando: aparece
//       en la lista sin archivo hasta que llega el mismo id con la ruta
//   {tipo:'clip', clip:{id, ruta, …}}   un clip cortado: se guarda la ruta
//       (que nunca llega al iPad) y se reenvia sin ella. Mismo id = se
//       reemplaza (cambiaron las etiquetas o se volvio a cortar).
//   {tipo:'quitarClip', id}             el evento se borro
//   cualquier otro con {tipo:'estado', …} se guarda y se reenvia: un iPad que
//   se reconecta lo recibe al toque, sin esperar al proximo cambio.

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let WebSocketServer = null;   // de 'ws'; se carga al iniciar
let qrcode = null;            // de 'qrcode'; opcional (sin el, no hay QR)

// El chequeo "esta ruta queda dentro de esta carpeta" es del Agente 1
// (main/rutas.js). Si todavia no esta, una copia local con la misma regla.
let dentroDe;
try {
    ({ dentroDe } = require('./rutas'));
    if (typeof dentroDe !== 'function') throw new Error('sin dentroDe');
} catch (_) {
    // TODO: borrar cuando exista main/rutas.js del Agente 1.
    // Comparar con el separador al final: con startsWith a secas, la raiz
    // "C:\app\src" dejaria pasar "C:\app\src2\secreto".
    dentroDe = (raiz, ruta) => {
        const r = path.resolve(raiz);
        const p = path.resolve(ruta);
        if (p === r) return true;
        const conSep = r.endsWith(path.sep) ? r : r + path.sep;
        return process.platform === 'win32'
            ? p.toLowerCase().startsWith(conSep.toLowerCase())
            : p.startsWith(conSep);
    };
}

const PUERTO_POR_DEFECTO = 8787;
const INTENTOS_PIN = 5;           // fallidos desde una IP antes de bloquearla
const BLOQUEO_MS = 60 * 1000;
const MAX_MENSAJE = 64 * 1024;    // una accion ocupa 200 bytes; esto sobra
const MAX_CLIPS = 1000;           // por sesion; los mas viejos se olvidan

const MIME_VIDEO = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

// ─────────────────────────────────────────────
// IPs DE LA RED LOCAL
// ─────────────────────────────────────────────
// El filtro vive en main/red.js (Agente 7): en Mac los adaptadores falsos son
// otros (utun, awdl, llw, bridge, vmnet, anpi, ap, lo0) y la lista de Windows
// no los frena. Mismo resultado que antes en Windows (test/mac-red.test.js).
// Una lista ordenada: primero la wifi, despues el cable, despues el resto.
// La pantalla muestra todas y deja elegir, pero la primera es la del QR.
const red = require('./red');
const esPrivada = red.esPrivada;
function ipsLocales(interfaces = os.networkInterfaces(), plataforma = process.platform) {
    return red.ipsLocales(interfaces, plataforma);
}

// Si en un minuto no entro ningun iPad, casi siempre es el firewall (o, en
// macOS 15+, el permiso de Red local). estado().ayudaRed lo explica y la
// pantalla muestra el boton tv.sys.abrirAjustesSistema(ayudaRed.pagina).
const ESPERA_AYUDA_MS = 60 * 1000;
function ayudaRed(plataforma = process.platform) {
    if (plataforma === 'darwin') {
        return {
            pagina: 'firewall',
            texto: 'El iPad no llega a esta Mac. Revisá Ajustes del Sistema → Red → Firewall → Opciones… ' +
                'y dejá "Permitir conexiones entrantes" para Tag & View Pro. En macOS 15 o más nuevo, ' +
                'también Privacidad y seguridad → Red local → Tag & View Pro activado. ' +
                'El iPad y la Mac tienen que estar en la misma Wi-Fi.',
            paginaExtra: 'red-local'
        };
    }
    return {
        pagina: 'firewall',
        texto: 'El iPad no llega a esta compu. Revisá que el Firewall de Windows deje entrar a Tag & View Pro ' +
            'en redes privadas, y que la compu y el iPad estén en la misma Wi-Fi.'
    };
}

// ─────────────────────────────────────────────
// ARCHIVOS: la pagina del iPad y el nucleo
// ─────────────────────────────────────────────
// Devuelve la ruta en disco o null. Nunca tira: cualquier cosa rara es 404.
function resolverRuta(urlCruda, raices) {
    let pathname;
    try {
        // Solo el path, sin query ni hash. A proposito NO se pasa por
        // new URL(): esa normaliza "/nucleo/../x" a "/x" y un pedido tramposo
        // terminaria sirviendo otra cosa en vez de dar 404.
        pathname = String(urlCruda || '').split(/[?#]/)[0];
        if (!pathname.startsWith('/')) return null;
        pathname = decodeURIComponent(pathname);
    } catch (_) {
        return null;
    }
    // "..", "%2e%2e", "\" y NUL: aunque URL ya normaliza los ".." literales,
    // uno codificado o con barra invertida llega vivo despues de decodificar.
    // No se intenta "arreglar": se rechaza.
    if (pathname.includes('\0') || pathname.includes('\\')) return null;
    if (pathname.split('/').some(s => s === '..' || s === '.')) return null;

    let raiz = raices.remoto, rel = pathname;
    if (pathname === '/nucleo' || pathname.startsWith('/nucleo/')) {
        raiz = raices.nucleo;
        rel = pathname.slice('/nucleo'.length);
    }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const destino = path.join(raiz, rel);
    if (!dentroDe(raiz, destino) || destino === path.resolve(raiz)) return null;
    return destino;
}

function servirArchivo(req, res, raices) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        return res.end();
    }
    const destino = resolverRuta(req.url, raices);
    const no = () => {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No está');
    };
    if (!destino) return no();
    fs.stat(destino, (err, st) => {
        // Una carpeta sin index.html es 404, nunca un listado.
        if (err || !st.isFile()) return no();
        const tipo = MIME[path.extname(destino).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': tipo,
            'Content-Length': st.size,
            // Sin cache: si la compu se actualiza, el iPad no se queda con la
            // version vieja de la botonera.
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(destino).on('error', () => res.destroy()).pipe(res);
    });
}

// Un video con soporte de Range. Safari no reproduce un <video> sin eso:
// antes de nada pide "bytes=0-1", y para saltar pide el tramo que le falta.
function servirVideo(req, res, ruta) {
    fs.stat(ruta, (err, st) => {
        if (err || !st.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('No está');
        }
        const total = st.size;
        let inicio = 0, fin = total - 1, estadoHttp = 200;
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
        if (m && (m[1] || m[2])) {
            estadoHttp = 206;
            if (m[1]) {
                inicio = parseInt(m[1], 10);
                if (m[2]) fin = Math.min(parseInt(m[2], 10), total - 1);
            } else {
                inicio = Math.max(0, total - parseInt(m[2], 10));
            }
            if (inicio > fin || inicio >= total) {
                res.writeHead(416, { 'Content-Range': `bytes */${total}` });
                return res.end();
            }
        }
        const cabeceras = {
            'Content-Type': MIME_VIDEO[path.extname(ruta).toLowerCase()] || 'video/mp4',
            'Content-Length': total ? fin - inicio + 1 : 0,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        };
        if (estadoHttp === 206) cabeceras['Content-Range'] = `bytes ${inicio}-${fin}/${total}`;
        res.writeHead(estadoHttp, cabeceras);
        if (req.method === 'HEAD' || !total) return res.end();
        fs.createReadStream(ruta, { start: inicio, end: fin }).on('error', () => res.destroy()).pipe(res);
    });
}

// Lo que el iPad puede ver de un clip: sin la ruta, con cada campo acotado
// (los nombres vienen de la plantilla, que puede venir de un archivo).
function clipPublico(c) {
    const texto = (v, max) => (v == null ? '' : String(v)).slice(0, max);
    const numero = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
    return {
        id: c.id,
        nombre: texto(c.nombre, 120),
        etiquetas: (Array.isArray(c.etiquetas) ? c.etiquetas : []).slice(0, 20).map(t => texto(t, 60)).filter(Boolean),
        equipo: c.equipo ? texto(c.equipo, 60) : null,
        inicio: numero(c.inicio),
        duracion: numero(c.duracion)
    };
}

// ─────────────────────────────────────────────
// EL SERVIDOR
// ─────────────────────────────────────────────
// Separado de Electron para poder probarlo con node --test: todo lo de
// ventanas e IPC queda en registrar(), abajo.
//
// opciones:
//   rutaRemoto, rutaNucleo    las dos raices que se sirven
//   alMensaje(msg)            lo que manda el iPad y tiene que ver la rama
//   alCliente(evento)         conexiones, desconexiones, latencias, pedidos
//   ahora()                   reloj (ms); inyectable en las pruebas
//   interfaces()              os.networkInterfaces; inyectable
//   permitirClip(ruta)        si ese archivo se puede servir como clip (la
//                             carpeta de trabajo); sin esto no sale ninguno
function crearServidorRemoto(opciones = {}) {
    const raices = {
        remoto: path.resolve(opciones.rutaRemoto || path.join(__dirname, '..', 'remoto')),
        nucleo: path.resolve(opciones.rutaNucleo || path.join(__dirname, '..', 'src', 'nucleo'))
    };
    const alMensaje = opciones.alMensaje || (() => {});
    const alCliente = opciones.alCliente || (() => {});
    const ahora = opciones.ahora || (() => Date.now());
    const interfaces = opciones.interfaces || (() => os.networkInterfaces());
    // Inyectable: las pruebas simulan adaptadores de Windows en cualquier SO.
    const plataforma = opciones.plataforma || process.platform;
    const permitirClip = opciones.permitirClip || (() => false);
    const vivo = opciones.vivo || null;   // main/vivo.js: la grabacion en curso

    let servidor = null, wss = null;
    let sesion = null;   // {pin, puerto, plantillaId, plantilla, estado, desde, clips}

    // Viven lo que vive el proceso, no una sesion: reiniciar el servidor no
    // tiene que servir para resetear el bloqueo por PIN.
    const fallos = new Map();   // ip → {n, hasta}

    // Por dispositivo (id que genera el iPad y guarda en localStorage).
    // "aplicado" es el n mas alto ya pasado a la rama: lo que sea <= se
    // confirma sin reenviarlo, y asi un toque reenviado al reconectar no
    // entra dos veces.
    const dispositivos = new Map();  // id → {id, nombre, ip, token, aplicado, latenciaMs, socket}
    let activo = null;               // id del iPad que codifica

    function enviarA(socket, msg) {
        if (socket && socket.readyState === 1) {
            try { socket.send(JSON.stringify(msg)); } catch (_) { /* se cerro en el medio */ }
        }
    }

    function resumenClientes() {
        return [...dispositivos.values()].map(d => ({
            dispositivo: d.id,
            nombre: d.nombre,
            ip: d.ip,
            conectado: !!(d.socket && d.socket.readyState === 1),
            activo: d.id === activo,
            rol: d.rol || 'codificar',
            latenciaMs: d.latenciaMs,
            aplicado: d.aplicado
        }));
    }

    function avisarClientes(extra) {
        alCliente({ ...(extra || {}), clientes: resumenClientes() });
    }

    // ── PIN y bloqueo ──
    function bloqueadoHasta(ip) {
        const f = fallos.get(ip);
        return f && f.hasta > ahora() ? f.hasta : 0;
    }

    function sumarFallo(ip) {
        const f = fallos.get(ip) || { n: 0, hasta: 0 };
        // Si el bloqueo anterior ya vencio, se arranca de cero.
        if (f.hasta && f.hasta <= ahora()) { f.n = 0; f.hasta = 0; }
        f.n++;
        if (f.n >= INTENTOS_PIN) { f.hasta = ahora() + BLOQUEO_MS; f.n = 0; }
        fallos.set(ip, f);
        return f;
    }

    // Comparacion en tiempo constante: el PIN es corto, pero no cuesta nada.
    function pinOk(pin) {
        const h = s => crypto.createHash('sha256').update(String(s ?? '')).digest();
        return crypto.timingSafeEqual(h(pin), h(sesion.pin));
    }

    // ── Clips ──
    const clipsPublicos = () => (sesion ? [...sesion.clips.values()].map(c => c.publico) : []);

    // /clip/<id>?d=…&t=…  El token es el mismo del WebSocket: un iPad que no
    // paso el PIN (o de una sesion anterior) no ve nada. 404 para todo lo
    // que no cierre, sin decir por que.
    // ?d=…&t=… de un iPad que ya paso el PIN en esta sesion.
    function autorizado(u) {
        const d = dispositivos.get(u.searchParams.get('d') || '');
        const t = u.searchParams.get('t') || '';
        return !!(sesion && d && d.token && t.length === d.token.length &&
            crypto.timingSafeEqual(Buffer.from(t), Buffer.from(d.token)));
    }

    function servirClip(req, res) {
        const no = () => {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('No está');
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET, HEAD' });
            return res.end();
        }
        let u;
        try { u = new URL(req.url, 'http://x'); } catch (_) { return no(); }
        const m = /^\/clip\/([\w-]{1,64})$/.exec(u.pathname);
        const c = m && sesion && sesion.clips.get(m[1]);
        // Uno que se esta cortando todavia no tiene archivo.
        if (!c || !c.ruta || !autorizado(u)) return no();
        servirVideo(req, res, c.ruta);
    }

    // ── Imagen en vivo ──
    // /vivo?d=…&t=…  La grabacion en curso tal cual sale de MediaRecorder
    // (main/vivo.js): el init y despues un fragmento por segundo, en una
    // respuesta que no termina mientras se grabe. El codec va en X-Codecs,
    // para addSourceBuffer. 503 si no se esta grabando: el iPad reintenta.
    //
    // Si el wifi del iPad no da abasto, los fragmentos no se juntan en la
    // compu: se saltean hasta que se vacia lo pendiente y se retoma en el
    // proximo cuadro clave. El iPad salta al final y sigue en vivo.
    const PENDIENTE_MAX = 3 * 1024 * 1024;
    const PENDIENTE_OK = 512 * 1024;
    const mirandoVivo = new Set();   // respuestas abiertas, para cortarlas en detener()

    function servirVivo(req, res) {
        let u;
        try { u = new URL(req.url, 'http://x'); } catch (_) { u = null; }
        if (req.method !== 'GET' || !u || !autorizado(u)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('No está');
        }
        let saltando = false;
        const s = vivo && vivo.suscribir({
            fragmento(frag, clave) {
                if (saltando) {
                    if (!clave || res.writableLength > PENDIENTE_OK) return;
                    saltando = false;
                }
                if (res.writableLength > PENDIENTE_MAX) { saltando = true; return; }
                res.write(frag);
            },
            fin() { res.end(); }
        });
        if (!s) {
            res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end('Todavía no se graba');
        }
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-store',
            'X-Codecs': s.codecs,
            'X-Content-Type-Options': 'nosniff'
        });
        if (res.socket) res.socket.setNoDelay(true);
        res.write(s.init);
        for (const f of s.gop) res.write(f);
        mirandoVivo.add(res);
        const cerrar = () => { s.salir(); mirandoVivo.delete(res); };
        res.on('close', cerrar);
        res.on('error', cerrar);
    }

    // pendiente: el evento se cerro y se esta cortando. Aparece en la lista
    // al toque, sin archivo; el mismo id con ruta lo completa.
    function ponerClip(c) {
        if (!c || typeof c.id !== 'string' || !/^[\w-]{1,64}$/.test(c.id)) return false;
        const pendiente = !!c.pendiente;
        if (!pendiente && (typeof c.ruta !== 'string' || !permitirClip(c.ruta) || !fs.existsSync(c.ruta))) return false;
        const publico = clipPublico(c);
        if (pendiente) publico.pendiente = true;
        sesion.clips.delete(c.id);   // al final: el orden es el de llegada
        sesion.clips.set(c.id, { ruta: pendiente ? null : c.ruta, publico });
        while (sesion.clips.size > MAX_CLIPS) sesion.clips.delete(sesion.clips.keys().next().value);
        for (const d of dispositivos.values()) enviarA(d.socket, { tipo: 'clip', clip: publico });
        return true;
    }

    function darControl(id) {
        const anterior = activo;
        activo = id;
        for (const d of dispositivos.values()) {
            if (d.id === anterior || d.id === id) enviarA(d.socket, { tipo: 'control', activo: d.id === activo });
        }
        avisarClientes({ evento: 'control', dispositivo: id });
    }

    // ── Una conexion ──
    function alConectar(socket, req) {
        const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        let disp = null;   // se completa con un 'hola' valido

        // Sin 'hola' valido en 10 s, afuera: no quedan sockets colgados.
        const sinHola = setTimeout(() => { if (!disp) socket.close(4001, 'sin hola'); }, 10000);

        socket.on('message', (crudo, esBinario) => {
            if (esBinario) return;
            let msg;
            try { msg = JSON.parse(String(crudo)); } catch (_) { return; }
            if (!msg || typeof msg.tipo !== 'string') return;

            if (!disp) {
                if (msg.tipo !== 'hola') return;   // nada se acepta antes del PIN
                return saludar(msg);
            }
            recibir(msg);
        });

        socket.on('close', () => {
            clearTimeout(sinHola);
            if (disp && disp.socket === socket) {
                disp.socket = null;
                avisarClientes({ evento: 'desconectado', dispositivo: disp.id });
            }
        });
        socket.on('error', () => { /* el 'close' llega igual */ });

        function saludar(msg) {
            const id = String(msg.dispositivo || '').slice(0, 64);
            if (!/^[\w-]{6,64}$/.test(id)) return socket.close(4002, 'dispositivo');

            const espera = bloqueadoHasta(ip);
            if (espera) {
                enviarA(socket, { tipo: 'rechazo', motivo: 'bloqueado', esperaMs: espera - ahora() });
                return socket.close(4003, 'bloqueado');
            }

            const conocido = dispositivos.get(id);
            let ok = false;
            if (msg.token) {
                // El token vale mientras el servidor siga: el iPad se
                // reconecta solo, sin volver a pedir el PIN.
                ok = !!(conocido && conocido.token && msg.token === conocido.token);
                if (!ok && !msg.pin) {
                    enviarA(socket, { tipo: 'rechazo', motivo: 'token' });
                    return socket.close(4004, 'token');
                }
            }
            if (!ok) {
                ok = pinOk(msg.pin);
                if (!ok) {
                    const f = sumarFallo(ip);
                    const bloq = bloqueadoHasta(ip);
                    enviarA(socket, bloq
                        ? { tipo: 'rechazo', motivo: 'bloqueado', esperaMs: bloq - ahora() }
                        : { tipo: 'rechazo', motivo: 'pin', quedan: INTENTOS_PIN - f.n });
                    return socket.close(4005, 'pin');
                }
                fallos.delete(ip);
            }

            clearTimeout(sinHola);
            disp = conocido || { id, aplicado: 0, latenciaMs: null };
            disp.nombre = String(msg.nombre || disp.nombre || 'iPad').slice(0, 40);
            disp.ip = ip;
            disp.token = disp.token || crypto.randomBytes(18).toString('base64url');
            // Si el mismo iPad abre otra pestaña, la vieja se cierra: dos
            // pestañas mandando la misma cola serian toques dobles.
            if (disp.socket && disp.socket !== socket) {
                try { disp.socket.close(4006, 'reemplazado'); } catch (_) {}
            }
            disp.socket = socket;
            // Entro por /clips (o la compu codifica sola): solo mira los
            // clips, nunca codifica, llegue primero o ultimo.
            disp.rol = (msg.rol === 'mirar' || sesion.soloMirar) ? 'mirar' : 'codificar';
            dispositivos.set(id, disp);

            // Un iPad por vez: el primero que entra a codificar codifica, los
            // demas miran y pueden pedir el control (lo confirma la compu).
            const activoVale = activo && dispositivos.has(activo) && dispositivos.get(activo).rol !== 'mirar';
            if (disp.rol !== 'mirar' && !activoVale) activo = id;
            if (disp.rol === 'mirar' && activo === id) activo = null;
            sesion.conectoAlguien = true;   // ya no hace falta la ayuda del firewall

            enviarA(socket, {
                tipo: 'bienvenida',
                token: disp.token,
                sesion: sesion.id,
                rol: disp.rol,
                activo: activo === id,
                aplicado: disp.aplicado,
                plantilla: sesion.plantilla || null,
                estado: sesion.estado || null,
                clips: clipsPublicos(),
                tServidor: ahora()
            });
            avisarClientes({ evento: 'conectado', dispositivo: id });
        }

        function recibir(msg) {
            switch (msg.tipo) {
                case 'ping': {
                    enviarA(socket, { tipo: 'pong', t0: msg.t0, tServidor: ahora() });
                    const lat = Number(msg.latenciaMs);
                    if (Number.isFinite(lat) && lat >= 0 && lat !== disp.latenciaMs) {
                        disp.latenciaMs = Math.round(lat);
                        avisarClientes({ evento: 'latencia', dispositivo: disp.id });
                    }
                    return;
                }
                case 'accion': {
                    const n = Number(msg.n);
                    if (!Number.isInteger(n) || n < 1 || !msg.accion || typeof msg.accion.tipo !== 'string') return;
                    // Solo el iPad activo codifica. Al que mira no se le
                    // confirma: su cola sigue guardada, y si despues le dan
                    // el control, entra.
                    if (disp.id !== activo) return;
                    if (n > disp.aplicado) {
                        disp.aplicado = n;
                        alMensaje({
                            tipo: 'accion',
                            n,
                            accion: msg.accion,
                            dispositivo: disp.id,
                            nombre: disp.nombre,
                            recibido: ahora()
                        });
                    }
                    enviarA(socket, { tipo: 'ack', n });
                    return;
                }
                case 'pedirControl':
                    if (disp.id !== activo && disp.rol !== 'mirar') avisarClientes({ evento: 'pideControl', dispositivo: disp.id, nombre: disp.nombre });
                    return;
                case 'pedirTerminar':
                    if (disp.id === activo) alMensaje({ tipo: 'pedirTerminar', dispositivo: disp.id, nombre: disp.nombre });
                    return;
                default:
                    // Otros mensajes (por ejemplo 'listo') pasan tal cual,
                    // marcados con quien los mando.
                    alMensaje({ ...msg, dispositivo: disp.id, nombre: disp.nombre });
            }
        }
    }

    // ── API ──
    // soloMirar: la compu codifica sola (Captura en vivo) y los que entran
    // son todos para ver los clips, por cualquiera de las dos direcciones.
    async function iniciar({ plantillaId = null, plantilla = null, puerto, soloMirar = false } = {}) {
        if (!WebSocketServer) ({ WebSocketServer } = require('ws'));
        if (qrcode === null) { try { qrcode = require('qrcode'); } catch (_) { qrcode = false; } }

        await detener();

        const pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
        sesion = { id: crypto.randomBytes(9).toString('base64url'), pin, plantillaId, plantilla, estado: null, desde: ahora(), clips: new Map(), soloMirar: !!soloMirar };
        dispositivos.clear();
        activo = null;

        servidor = http.createServer((req, res) => {
            if (/^\/clip\//.test(req.url || '')) return servirClip(req, res);
            if (/^\/vivo(\?|$)/.test(req.url || '')) return servirVivo(req, res);
            // /clips es la misma pagina, que ahi entra a mirar: se sirve el
            // index.html de siempre (sus archivos van con ruta absoluta).
            if (/^\/clips\/?(\?|$)/.test(req.url || '')) req.url = '/';
            servirArchivo(req, res, raices);
        });
        servidor.on('clientError', (_e, s) => { try { s.destroy(); } catch (_) {} });
        wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MENSAJE });
        wss.on('connection', alConectar);

        servidor.on('upgrade', (req, sock, cabeza) => {
            let ruta = '';
            try { ruta = new URL(req.url, 'http://x').pathname; } catch (_) {}
            // Si trae Origin, tiene que ser esta misma pagina: asi una web
            // cualquiera abierta en la red no puede ni intentar el PIN.
            const origen = req.headers.origin;
            let mismoOrigen = true;
            if (origen) {
                try { mismoOrigen = new URL(origen).host === req.headers.host; } catch (_) { mismoOrigen = false; }
            }
            if (ruta !== '/ws' || !mismoOrigen) {
                sock.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
                return sock.destroy();
            }
            wss.handleUpgrade(req, sock, cabeza, ws => wss.emit('connection', ws, req));
        });

        // Si el puerto esta ocupado (otra copia de la app, otro programa),
        // se prueban los 10 siguientes antes de rendirse.
        const base = puerto === 0 ? 0 : (Number(puerto) || PUERTO_POR_DEFECTO);
        let usado = null, ultimoError = null;
        for (let i = 0; i < (base === 0 ? 1 : 10) && usado === null; i++) {
            try {
                usado = await escuchar(servidor, base === 0 ? 0 : base + i);
            } catch (e) {
                ultimoError = e;
                if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') break;
            }
        }
        if (usado === null) {
            servidor = null; wss = null; sesion = null;
            const err = new Error(`No se pudo abrir el puerto ${base}: ${ultimoError && ultimoError.message}`);
            err.code = ultimoError && ultimoError.code;
            throw err;
        }
        sesion.puerto = usado;
        return datosConexion();
    }

    function escuchar(srv, p) {
        return new Promise((ok, mal) => {
            const error = e => { srv.off('listening', listo); mal(e); };
            const listo = () => { srv.off('error', error); ok(srv.address().port); };
            srv.once('error', error);
            srv.once('listening', listo);
            srv.listen(p, '0.0.0.0');
        });
    }

    async function datosConexion() {
        const ips = ipsLocales(interfaces(), plataforma);
        const urls = ips.map(i => `http://${i.ip}:${sesion.puerto}/`);
        // La direccion para mirar los clips: otra, asi el que mira no le
        // gana la botonera al que codifica por llegar primero.
        const urlsClips = urls.map(u => u + 'clips');
        const qrs = {};
        if (qrcode) {
            for (const u of [...urls, ...urlsClips]) {
                try { qrs[u] = await qrcode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }); }
                catch (_) { /* sin QR para esa, queda la direccion escrita */ }
            }
        }
        return {
            url: urls[0] || `http://localhost:${sesion.puerto}/`,
            urls,
            ips: ips.map(i => i.ip),
            adaptadores: ips,
            puerto: sesion.puerto,
            pin: sesion.pin,
            qrSvg: urls[0] ? (qrs[urls[0]] || null) : null,
            qrs,
            urlClips: urlsClips[0] || `http://localhost:${sesion.puerto}/clips`,
            urlsClips,
            soloMirar: !!sesion.soloMirar
        };
    }

    async function detener() {
        const s = servidor, w = wss;
        servidor = null; wss = null; sesion = null;
        activo = null;
        for (const r of mirandoVivo) { try { r.destroy(); } catch (_) {} }
        mirandoVivo.clear();
        for (const d of dispositivos.values()) d.socket = null;
        dispositivos.clear();
        if (w) {
            for (const c of w.clients) { try { c.close(1001, 'fin'); } catch (_) {} }
            // A los que no contestan el cierre, se los corta.
            setTimeout(() => { for (const c of w.clients) { try { c.terminate(); } catch (_) {} } }, 500).unref?.();
            w.close();
        }
        if (s) {
            await new Promise(ok => {
                s.close(() => ok());
                if (s.closeAllConnections) s.closeAllConnections();
            });
        }
    }

    function estado() {
        if (!sesion) return { activo: false, clientes: [], latenciaMs: null };
        const clientes = resumenClientes();
        const act = clientes.find(c => c.activo);
        return {
            activo: true,
            puerto: sesion.puerto,
            pin: sesion.pin,
            plantillaId: sesion.plantillaId,
            ips: ipsLocales(interfaces(), plataforma).map(i => i.ip),
            desde: sesion.desde,
            clientes,
            latenciaMs: act ? act.latenciaMs : null,
            // null hasta que pasa un minuto sin que entre nadie (Agente 7).
            ayudaRed: !sesion.conectoAlguien && ahora() - sesion.desde >= ESPERA_AYUDA_MS ? ayudaRed() : null
        };
    }

    // Lo que manda la rama. Algunos mensajes son para el servidor.
    function enviar(msg) {
        if (!sesion || !msg || typeof msg.tipo !== 'string') return false;
        switch (msg.tipo) {
            case 'plantilla':
                sesion.plantilla = msg.plantilla || null;
                break;   // y se reenvia: el iPad redibuja
            case 'darControl':
                // Al que entro por /clips no se le da: esa pagina no tiene botonera.
                if (dispositivos.has(msg.dispositivo) && dispositivos.get(msg.dispositivo).rol !== 'mirar') darControl(msg.dispositivo);
                return true;
            case 'negarControl': {
                const d = dispositivos.get(msg.dispositivo);
                if (d) enviarA(d.socket, { tipo: 'control', activo: false, negado: true });
                return true;
            }
            case 'estado':
                sesion.estado = msg;
                break;
            case 'clip':
                return ponerClip(msg.clip);
            case 'quitarClip':
                if (!sesion.clips.delete(String(msg.id))) return false;
                for (const d of dispositivos.values()) enviarA(d.socket, { tipo: 'quitarClip', id: String(msg.id) });
                return true;
        }
        // Todo lo demas va a todos los iPads conectados: el que mira tambien
        // tiene que ver el partido.
        for (const d of dispositivos.values()) enviarA(d.socket, msg);
        return true;
    }

    return { iniciar, detener, estado, enviar, _raices: raices };
}

// ─────────────────────────────────────────────
// ELECTRON: IPC
// ─────────────────────────────────────────────
let instancia = null;

// Lo llama main.js (Agente 1) con la base y la ventana listas.
//   ventana    BrowserWindow (o una funcion que la devuelve)
//   bd         la base; si la rama no manda la plantilla, se lee de aca
//   rutaSrc    escritorio/src (de ahi sale src/nucleo)
function registrar({ ipcMain, ventana, bd, carpeta, rutaSrc, vivo } = {}) {
    // Falla temprano si falta 'ws': main.js lo atrapa y la app arranca sin
    // la rama iPad en vez de romperse cuando alguien toca "Conectar iPad".
    require.resolve('ws');

    const laVentana = () => (typeof ventana === 'function' ? ventana() : ventana);
    const mandar = (canal, datos) => {
        const v = laVentana();
        if (v && !v.isDestroyed()) v.webContents.send(canal, datos);
    };

    instancia = crearServidorRemoto({
        rutaRemoto: path.join(__dirname, '..', 'remoto'),
        rutaNucleo: path.join(rutaSrc || path.join(__dirname, '..', 'src'), 'nucleo'),
        alMensaje: m => mandar('remoto:mensaje', m),
        alCliente: e => mandar('remoto:cliente', e),
        // Los clips los corta tv.clips.exportar en la carpeta de trabajo: el
        // servidor no sirve nada de afuera, aunque la pagina se lo pida.
        permitirClip: ruta => !!carpeta && dentroDe(carpeta(), ruta),
        vivo
    });

    ipcMain.handle('remoto:iniciar', async (_e, opciones = {}) => {
        let plantilla = opciones.plantilla || null;
        if (!plantilla && opciones.plantillaId != null) plantilla = await leerPlantilla(bd, opciones.plantillaId);
        return instancia.iniciar({ plantillaId: opciones.plantillaId ?? null, plantilla, puerto: opciones.puerto, soloMirar: !!opciones.soloMirar });
    });
    ipcMain.handle('remoto:detener', () => instancia.detener());
    ipcMain.handle('remoto:estado', () => instancia.estado());
    ipcMain.handle('remoto:enviar', (_e, msg) => instancia.enviar(msg));

    return instancia;
}

// La forma exacta de la base es del Agente 1; se prueba lo razonable y si no
// hay, la rama manda la plantilla con tv.remoto.enviar({tipo:'plantilla'}).
async function leerPlantilla(bd, id) {
    try {
        const f = (bd && bd.plantillas && bd.plantillas.leer) || (bd && bd.leerPlantilla);
        const p = f ? await f.call(bd.plantillas || bd, id) : null;
        return p ? { id: p.id, nombre: p.nombre, datos: typeof p.datos === 'string' ? JSON.parse(p.datos) : p.datos } : null;
    } catch (_) {
        return null;
    }
}

async function detener() {
    if (instancia) await instancia.detener();
}

module.exports = { registrar, detener, crearServidorRemoto, ipsLocales, resolverRuta, esPrivada, ayudaRed };
