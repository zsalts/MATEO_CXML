// Video: grabar al disco, ubicar y copiar archivos, servirlos al <video> y
// cortar clips. Tambien la lista blanca de archivos que la pagina puede ver.

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { manejar, v } = require('./ipc');
const { dentroDe, nombreSeguro, nombreLibre, subcarpetaSegura, mimeDe } = require('./rutas');
const ff = require('./ffmpeg');
const clips = require('./clips');

const FILTRO_VIDEOS = [
    { name: 'Videos', extensions: ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'mts', 'm2ts', 'ts'] },
    { name: 'Todos los archivos', extensions: ['*'] }
];

function extDe(mime) {
    if (!mime) return '.webm';
    if (mime.indexOf('mp4') >= 0) return '.mp4';
    if (mime.indexOf('webm') >= 0) return '.webm';
    if (mime.indexOf('matroska') >= 0) return '.mkv';
    return '.bin';
}

// vivo: main/vivo.js, que reparte la grabación en curso a los que miran.
function crearVideo({ carpeta, ventana, dialog, origen, vivo = null }) {
    // ─── Lista blanca ───
    // /__video sirve solo lo que esta en la carpeta de trabajo o lo que el
    // usuario eligio con un dialogo (o se enlazo a un partido). Sin esto,
    // cualquier codigo en la pagina podria leer cualquier archivo del disco.
    const permitidos = new Set();
    // NFC: en Mac la misma ruta puede llegar en NFD desde el dialogo y en NFC
    // desde la base ("Peñarol"); sin esto /__video la rechaza (Agente 7).
    const clave = r => path.resolve(r).normalize('NFC').toLowerCase();
    function permitir(ruta) { if (ruta) permitidos.add(clave(ruta)); }
    function permitido(ruta) {
        if (!ruta || typeof ruta !== 'string') return false;
        return dentroDe(carpeta(), ruta) || permitidos.has(clave(ruta));
    }

    const enviar = (canal, dato) => {
        const w = ventana();
        if (w && !w.isDestroyed()) w.webContents.send(canal, dato);
    };

    // ─── Grabacion ───
    // La pagina manda el video en trozos de un segundo y aca se van pegando
    // al archivo. Un partido de dos horas nunca esta entero en memoria.
    let grabacion = null;   // {ruta, mime, bytes, stream, inicio, ultimoTrozo, error}

    function enCurso() {
        if (!grabacion) return null;
        const g = grabacion;
        return {
            ruta: g.ruta,
            bytes: g.bytes,
            // El archivo arranca cuando arranca MediaRecorder (≈ iniciar) y
            // cada trozo que llega trae hasta "ahora". Es una estimacion; la
            // confirma ffprobe antes de cortar.
            segundosEscritos: () => g.ultimoTrozo ? (g.ultimoTrozo - g.inicio) / 1000 : 0
        };
    }

    function alFallar(g, err) {
        if (g.error) return;
        g.error = err;
        const lleno = err && (err.code === 'ENOSPC');
        const mensaje = lleno
            ? 'El disco se lleno. La grabacion se corto; lo grabado hasta aca quedo guardado.'
            : 'No se pudo seguir escribiendo el video (' + (err.code || err.message) + '). Lo grabado hasta aca quedo guardado.';
        console.error('Grabacion:', err);
        enviar('video:error', { mensaje, codigo: err.code || null, ruta: g.ruta, bytes: g.bytes });
    }

    function iniciar(nombre, mime) {
        v.texto(nombre, 'nombre', { opcional: true, max: 300 });
        v.texto(mime, 'mime', { opcional: true, max: 200 });
        if (grabacion) throw new Error('Ya hay una grabacion en curso');
        const ruta = nombreLibre(carpeta(), nombreSeguro(nombre, 'Grabacion') + extDe(mime));
        const stream = fs.createWriteStream(ruta);
        const g = { ruta, mime: mime || null, bytes: 0, stream, inicio: Date.now(), ultimoTrozo: 0, error: null };
        stream.on('error', err => alFallar(g, err));
        grabacion = g;
        if (vivo) vivo.iniciar(mime);
        permitir(ruta);
        return { ruta, nombre: path.basename(ruta) };
    }

    async function trozo(datos) {
        const g = grabacion;
        if (!g) return { bytes: 0 };
        if (g.error) return { bytes: g.bytes, error: g.error.message };
        if (datos instanceof ArrayBuffer) datos = new Uint8Array(datos);
        if (!(datos instanceof Uint8Array)) throw new Error('trozo espera un Uint8Array');
        const buf = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
        g.bytes += buf.length;
        // Antes que el disco: el que mira lo ve sin esperar la escritura.
        if (vivo) vivo.trozo(buf);
        // Backpressure: si el disco va mas lento que la camara (un pendrive, un
        // disco de red) no se juntan trozos en memoria sin limite.
        const sigue = g.stream.write(buf);
        if (!sigue && !g.error) {
            await new Promise(resolve => {
                const listo = () => { g.stream.off('drain', listo); g.stream.off('error', listo); g.stream.off('close', listo); resolve(); };
                g.stream.once('drain', listo);
                g.stream.once('error', listo);
                g.stream.once('close', listo);
            });
        }
        g.ultimoTrozo = Date.now();
        return g.error ? { bytes: g.bytes, error: g.error.message } : { bytes: g.bytes };
    }

    // El UNICO lugar que cierra la grabacion: finalizar, descartar y salir de
    // la app pasan por aca.
    function cerrarGrabacion() {
        return new Promise(resolve => {
            if (!grabacion) return resolve(null);
            const g = grabacion;
            grabacion = null;
            if (vivo) vivo.terminar();
            const listo = () => {
                let bytes = g.bytes;
                try { bytes = fs.statSync(g.ruta).size; } catch (_) {}
                resolve({ ruta: g.ruta, bytes, mime: g.mime, ...(g.error ? { error: g.error.message } : {}) });
            };
            if (g.stream.destroyed || g.stream.closed) return listo();
            g.stream.end(listo);
            // Si el disco se desconecto, end() puede no llamar nunca: se
            // resuelve igual al cerrarse o fallar el stream.
            g.stream.once('close', listo);
            g.stream.once('error', listo);
        });
    }

    let cerrando = null;
    function finalizar() {
        if (!cerrando) cerrando = cerrarGrabacion().finally(() => { cerrando = null; });
        return cerrando;
    }

    async function descartar() {
        const g = await finalizar();
        if (g) { try { fs.unlinkSync(g.ruta); } catch (_) {} }
        return true;
    }

    // ─── Mover / copiar ───
    function destinoDe(ruta, opciones) {
        const o = v.objeto(opciones, 'opciones', { opcional: true });
        const dir = subcarpetaSegura(carpeta(), v.texto(o.subcarpeta, 'subcarpeta', { opcional: true, max: 400 }) || '');
        fs.mkdirSync(dir, { recursive: true });
        const ext = path.extname(ruta);
        const nombre = o.nombre ? nombreSeguro(o.nombre) + ext : path.basename(ruta);
        return { dir, nombre };
    }

    async function ubicar(ruta, opciones) {
        v.texto(ruta, 'ruta', { max: 1000 });
        if (!fs.existsSync(ruta)) throw new Error('No esta el video');
        if (!permitido(ruta)) throw new Error('Ese archivo no es de la app');
        if (grabacion && clave(grabacion.ruta) === clave(ruta)) throw new Error('Ese video se esta grabando todavia');
        const { dir, nombre } = destinoDe(ruta, opciones);
        if (clave(path.join(dir, nombre)) === clave(ruta)) return { ruta };
        const destino = nombreLibre(dir, nombre);
        try {
            fs.renameSync(ruta, destino);
        } catch (err) {
            // Entre discos distintos no se puede renombrar: copiar y borrar.
            if (err.code !== 'EXDEV') throw err;
            await copiarConProgreso(ruta, destino);
            fs.unlinkSync(ruta);
        }
        permitir(destino);
        return { ruta: destino };
    }

    // La copia en curso (una a la vez: la hace Importar). cancelarCopia la
    // corta por el mismo camino que un error, asi la copia a medias se borra.
    let copiaEnCurso = null;

    function cancelarCopia() {
        if (!copiaEnCurso) return false;
        copiaEnCurso(new Error('Copia cancelada'));
        return true;
    }

    function copiarConProgreso(origen, destino) {
        return new Promise((resolve, reject) => {
            const total = fs.statSync(origen).size;
            let hecho = 0, ultimo = 0;
            const lee = fs.createReadStream(origen, { highWaterMark: 4 * 1024 * 1024 });
            const escribe = fs.createWriteStream(destino);
            const fallo = err => {
                lee.destroy(); escribe.destroy();
                // Una copia a medias no sirve y confunde: se borra.
                copiaEnCurso = null;
                fs.rm(destino, { force: true }, () => reject(err));
            };
            copiaEnCurso = fallo;
            lee.on('data', d => {
                hecho += d.length;
                const t = Date.now();
                if (t - ultimo >= 250) { ultimo = t; enviar('video:progreso', { hecho, total }); }
            });
            lee.on('error', fallo);
            escribe.on('error', fallo);
            escribe.on('finish', () => { copiaEnCurso = null; enviar('video:progreso', { hecho: total, total }); resolve(destino); });
            lee.pipe(escribe);
        });
    }

    async function copiarACarpeta(ruta, opciones) {
        v.texto(ruta, 'ruta', { max: 1000 });
        if (!fs.existsSync(ruta)) throw new Error('No esta el video');
        if (!permitido(ruta)) throw new Error('Ese archivo no fue elegido desde la app');
        const { dir, nombre } = destinoDe(ruta, opciones);
        const destino = nombreLibre(dir, nombre);
        await copiarConProgreso(ruta, destino);
        permitir(destino);
        return { ruta: destino };
    }

    // ─── Servir al <video> ───
    // Con soporte de Range: sin eso el <video> no puede saltar a un clip sin
    // descargar el partido entero primero.
    function servirVideo(ruta, range) {
        if (!ruta || !permitido(ruta)) return new Response('No permitido', { status: 403 });
        let total;
        try {
            const st = fs.statSync(ruta);
            if (!st.isFile()) return new Response('No esta el video', { status: 404 });
            total = st.size;
        } catch (_) {
            return new Response('No esta el video', { status: 404 });
        }
        let inicio = 0, fin = total - 1, estado = 200;

        const m = range && /bytes=(\d*)-(\d*)/.exec(range);
        if (m && (m[1] || m[2])) {
            estado = 206;
            if (m[1]) {
                inicio = parseInt(m[1], 10);
                if (m[2]) fin = Math.min(parseInt(m[2], 10), total - 1);
            } else {
                inicio = Math.max(0, total - parseInt(m[2], 10));
            }
            if (inicio > fin || inicio >= total) {
                return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
            }
        }

        const cabeceras = {
            'content-type': mimeDe(ruta).startsWith('video/') || mimeDe(ruta).startsWith('audio/') ? mimeDe(ruta) : 'video/mp4',
            'accept-ranges': 'bytes',
            'content-length': String(total ? fin - inicio + 1 : 0),
            'cache-control': 'no-store'
        };
        if (estado === 206) cabeceras['content-range'] = `bytes ${inicio}-${fin}/${total}`;
        if (!total) return new Response('', { status: 200, headers: cabeceras });
        return new Response(Readable.toWeb(fs.createReadStream(ruta, { start: inicio, end: fin })),
            { status: estado, headers: cabeceras });
    }

    function url(ruta) {
        if (!ruta || typeof ruta !== 'string' || !fs.existsSync(ruta) || !permitido(ruta)) return null;
        return origen + '/__video?p=' + encodeURIComponent(ruta);
    }

    async function elegirArchivo() {
        const r = await dialog.showOpenDialog(ventana(), {
            title: 'Elegir video', properties: ['openFile'], filters: FILTRO_VIDEOS
        });
        if (r.canceled || !r.filePaths.length) return null;
        permitir(r.filePaths[0]);
        return r.filePaths[0];
    }

    // ─── IPC ───
    function registrar(ipcMain) {
        manejar(ipcMain, 'video:iniciar',   (nombre, mime) => iniciar(nombre, mime));
        manejar(ipcMain, 'video:trozo',     datos => trozo(datos));
        manejar(ipcMain, 'video:finalizar', () => finalizar());
        manejar(ipcMain, 'video:descartar', () => descartar());
        manejar(ipcMain, 'video:ubicar',    (ruta, o) => ubicar(ruta, o));
        manejar(ipcMain, 'video:url',       ruta => url(ruta));
        manejar(ipcMain, 'video:elegirArchivo', () => elegirArchivo());
        manejar(ipcMain, 'video:copiarACarpeta', (ruta, o) => copiarACarpeta(ruta, o));
        manejar(ipcMain, 'video:cancelarCopia', () => cancelarCopia());
        manejar(ipcMain, 'video:info', ruta => {
            v.texto(ruta, 'ruta', { max: 1000 });
            return permitido(ruta) ? ff.info(ruta) : null;
        });

        manejar(ipcMain, 'clips:disponible', () => clips.disponible());
        manejar(ipcMain, 'clips:exportar', o => {
            v.objeto(o, 'opciones');
            v.texto(o.ruta, 'ruta', { max: 1000 });
            v.lista(o.cortes, 'cortes', { max: 5000 });
            if (!permitido(o.ruta)) throw new Error('Ese video no es de la app');
            return clips.exportar(o, { dirTrabajo: carpeta(), subcarpetaSegura, enCurso })
                .then(r => { r.rutas.forEach(permitir); return r; });
        });
    }

    return { registrar, permitir, permitido, servirVideo, url, finalizar, enCurso, ubicar, copiarACarpeta };
}

module.exports = { crearVideo, extDe };
