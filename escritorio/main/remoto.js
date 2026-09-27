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
// Solo GET/HEAD, sin listados de carpetas, sin salir de esas dos raices.
//
// Protocolo (todo JSON por el WebSocket):
//   iPad → compu
//     {tipo:'hola', dispositivo, nombre, pin?, token?}
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
//     lo que mande la rama con tv.remoto.enviar() (estado, guardado…)
//
// Mensajes de la rama que entiende el servidor (no se reenvian):
//   {tipo:'plantilla', plantilla:{nombre, datos}}   la que baja el iPad
//   {tipo:'darControl', dispositivo} / {tipo:'negarControl', dispositivo}
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

    let servidor = null, wss = null;
    let sesion = null;   // {pin, puerto, plantillaId, plantilla, estado, desde}

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
            dispositivos.set(id, disp);

            // Un iPad por vez: el primero codifica, los demas miran y pueden
            // pedir el control (lo confirma la compu).
            if (!activo || !dispositivos.has(activo)) activo = id;
            sesion.conectoAlguien = true;   // ya no hace falta la ayuda del firewall

            enviarA(socket, {
                tipo: 'bienvenida',
                token: disp.token,
                sesion: sesion.id,
                activo: activo === id,
                aplicado: disp.aplicado,
                plantilla: sesion.plantilla || null,
                estado: sesion.estado || null,
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
                    if (disp.id !== activo) avisarClientes({ evento: 'pideControl', dispositivo: disp.id, nombre: disp.nombre });
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
    async function iniciar({ plantillaId = null, plantilla = null, puerto } = {}) {
        if (!WebSocketServer) ({ WebSocketServer } = require('ws'));
        if (qrcode === null) { try { qrcode = require('qrcode'); } catch (_) { qrcode = false; } }

        await detener();

        const pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
        sesion = { id: crypto.randomBytes(9).toString('base64url'), pin, plantillaId, plantilla, estado: null, desde: ahora() };
        dispositivos.clear();
        activo = null;

        servidor = http.createServer((req, res) => servirArchivo(req, res, raices));
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
        const qrs = {};
        if (qrcode) {
            for (const u of urls) {
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
            qrs
        };
    }

    async function detener() {
        const s = servidor, w = wss;
        servidor = null; wss = null; sesion = null;
        activo = null;
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
                if (dispositivos.has(msg.dispositivo)) darControl(msg.dispositivo);
                return true;
            case 'negarControl': {
                const d = dispositivos.get(msg.dispositivo);
                if (d) enviarA(d.socket, { tipo: 'control', activo: false, negado: true });
                return true;
            }
            case 'estado':
                sesion.estado = msg;
                break;
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
function registrar({ ipcMain, ventana, bd, carpeta, rutaSrc } = {}) {
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
        alCliente: e => mandar('remoto:cliente', e)
    });

    ipcMain.handle('remoto:iniciar', async (_e, opciones = {}) => {
        let plantilla = opciones.plantilla || null;
        if (!plantilla && opciones.plantillaId != null) plantilla = await leerPlantilla(bd, opciones.plantillaId);
        return instancia.iniciar({ plantillaId: opciones.plantillaId ?? null, plantilla, puerto: opciones.puerto });
    });
    ipcMain.handle('remoto:detener', () => instancia.detener());
    ipcMain.handle('remoto:estado', () => instancia.estado());
    ipcMain.handle('remoto:enviar', (_e, msg) => instancia.enviar(msg));

    void carpeta;   // hoy no hace falta: el servidor no toca la carpeta de trabajo
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
