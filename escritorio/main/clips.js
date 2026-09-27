// Cortar clips sin recomprimir: ffmpeg -ss/-to -c copy.
//
// Copiar los paquetes tal cual es lo que hace que un clip salga en un segundo
// y sin perder calidad. La contra: el corte cae en el keyframe anterior al
// pedido, asi que el clip puede arrancar un poco antes (nunca despues).
//
// Tambien corta sobre el archivo que se esta grabando. MediaRecorder escribe
// MP4 fragmentado (o WebM): ffmpeg lo lee hasta donde hay escrito, con una
// advertencia por el ultimo fragmento a medias que no importa. Si se pide un
// tramo que todavia no llego al disco (cortar "los ultimos 10 segundos" justo
// al marcar), se espera a que llegue en vez de fallar.

const fs = require('fs');
const os = require('os');
const path = require('path');
const ff = require('./ffmpeg');
const { nombreSeguro, nombreLibre } = require('./rutas');

const ESPERA_MAXIMA = 30000;   // ms que se espera a que un tramo en vivo llegue al disco

const disponible = () => !!ff.rutaFfmpeg();

const dormir = ms => new Promise(r => setTimeout(r, ms));

// `enCurso` = la grabacion activa (main/grabacion.js), para saber si el archivo
// todavia crece y hasta donde llego.
async function esperarTramo(ruta, hasta, enCurso, espera) {
    const g = enCurso();
    if (!g || !mismaRuta(g.ruta, ruta)) return;
    const limite = Date.now() + espera;

    // 1) Estimacion barata por reloj: cuanto hace que empezo y cuando llego el
    //    ultimo trozo. Evita llamar a ffprobe cien veces mientras se espera.
    while (Date.now() < limite) {
        const act = enCurso();
        if (!act || !mismaRuta(act.ruta, ruta)) return;          // termino: el archivo esta completo
        if (act.segundosEscritos() >= hasta + 0.3) break;
        await dormir(200);
    }
    // 2) Confirmacion con el archivo: el ultimo paquete que ffmpeg puede leer.
    while (Date.now() < limite) {
        const act = enCurso();
        if (!act || !mismaRuta(act.ruta, ruta)) return;
        const ultimo = await ff.ultimoInstante(ruta, Math.max(0, hasta - 10));
        if (ultimo === null || ultimo >= hasta) return;           // sin ffprobe no se puede saber mas
        await dormir(500);
    }
    const act = enCurso();
    if (act && mismaRuta(act.ruta, ruta)) {
        throw new Error(`El tramo hasta ${hasta.toFixed(1)} s todavia no se grabo`);
    }
}

function mismaRuta(a, b) {
    // NFC: en Mac la misma ruta puede venir en NFD (Agente 7).
    const k = r => path.resolve(r).normalize('NFC').toLowerCase();
    return !!a && !!b && k(a) === k(b);
}

async function cortarUno(entrada, desde, hasta, salida) {
    const args = ['-hide_banner', '-nostdin', '-y',
        '-ss', desde.toFixed(3), '-to', hasta.toFixed(3), '-i', entrada,
        '-map', '0:v:0?', '-map', '0:a:0?',
        '-c', 'copy', '-avoid_negative_ts', 'make_zero'];
    if (/\.(mp4|m4v|mov)$/i.test(salida)) args.push('-movflags', '+faststart');
    args.push(salida);
    const r = await ff.correr(ff.rutaFfmpeg(), args);
    if (r.codigo !== 0 || !fs.existsSync(salida) || fs.statSync(salida).size === 0) {
        try { fs.unlinkSync(salida); } catch (_) {}
        const ultima = r.err.trim().split(/\r?\n/).slice(-2).join(' ');
        throw new Error('ffmpeg no pudo cortar el clip: ' + (ultima || 'codigo ' + r.codigo));
    }
    return salida;
}

// opciones = {ruta, cortes:[{desde, hasta, nombre}], destino:'carpeta'|'uno',
//             subcarpeta?, nombre?}
// dirTrabajo = carpeta de trabajo; enCurso = () => grabacion activa o null.
async function exportar(opciones, { dirTrabajo, subcarpetaSegura, enCurso, espera = ESPERA_MAXIMA }) {
    if (!disponible()) throw new Error('No esta ffmpeg: no se pueden cortar clips');
    const o = opciones || {};
    if (!o.ruta || !fs.existsSync(o.ruta)) throw new Error('No esta el video');
    if (!Array.isArray(o.cortes) || !o.cortes.length) throw new Error('No hay cortes');

    const cortes = o.cortes.map((c, i) => {
        const desde = Math.max(0, Number(c && c.desde));
        const hasta = Number(c && c.hasta);
        if (!isFinite(desde) || !isFinite(hasta) || hasta <= desde) {
            throw new Error(`Corte ${i + 1}: el fin tiene que ser mayor que el inicio`);
        }
        return { desde, hasta, nombre: nombreSeguro(c.nombre, `Clip ${i + 1}`) };
    });

    const dir = path.join(subcarpetaSegura(dirTrabajo, o.subcarpeta || ''), 'Clips');
    fs.mkdirSync(dir, { recursive: true });
    const ext = (path.extname(o.ruta) || '.mp4').toLowerCase();

    // Todo lo que haga falta tiene que estar escrito antes de cortar.
    await esperarTramo(o.ruta, Math.max(...cortes.map(c => c.hasta)), enCurso, espera);

    if (o.destino !== 'uno') {
        const rutas = [];
        for (const c of cortes) {
            rutas.push(await cortarUno(o.ruta, c.desde, c.hasta, nombreLibre(dir, c.nombre + ext)));
        }
        return { rutas };
    }

    // Todos en un archivo: cada corte a un temporal y despues el concat
    // demuxer los pega, tambien sin recomprimir.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tagview-clips-'));
    try {
        const partes = [];
        for (let i = 0; i < cortes.length; i++) {
            partes.push(await cortarUno(o.ruta, cortes[i].desde, cortes[i].hasta,
                path.join(tmp, `parte${String(i).padStart(4, '0')}${ext}`)));
        }
        const lista = path.join(tmp, 'lista.txt');
        // Comillas simples escapadas como pide el concat demuxer.
        fs.writeFileSync(lista, partes.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
        const salida = nombreLibre(dir, nombreSeguro(o.nombre || (cortes.length === 1 ? cortes[0].nombre : 'Clips'), 'Clips') + ext);
        const args = ['-hide_banner', '-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy'];
        if (/\.(mp4|m4v|mov)$/i.test(ext)) args.push('-movflags', '+faststart');
        args.push(salida);
        const r = await ff.correr(ff.rutaFfmpeg(), args);
        if (r.codigo !== 0 || !fs.existsSync(salida)) {
            try { fs.unlinkSync(salida); } catch (_) {}
            throw new Error('ffmpeg no pudo unir los clips: ' + r.err.trim().split(/\r?\n/).pop());
        }
        return { rutas: [salida] };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

module.exports = { disponible, exportar, cortarUno };
