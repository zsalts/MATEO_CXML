// ffmpeg y ffprobe que vienen con la app (ffmpeg-static / ffprobe-static).
//
// Empaquetada, los .exe no pueden correr desde adentro de app.asar (es un
// archivo, no una carpeta): el package.json los deja afuera con asarUnpack y
// aca se corrige la ruta a app.asar.unpacked.
//
// Si no estan (alguien los borro, o una instalacion rara), todo sigue: la app
// no corta clips y tv.video.info devuelve null.

const fs = require('fs');
const { spawn } = require('child_process');

function desempaquetada(ruta) {
    return ruta ? ruta.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') : ruta;
}

let _ffmpeg, _ffprobe;

function rutaFfmpeg() {
    if (_ffmpeg !== undefined) return _ffmpeg;
    try {
        const r = desempaquetada(require('ffmpeg-static'));
        _ffmpeg = r && fs.existsSync(r) ? r : null;
    } catch (_) { _ffmpeg = null; }
    return _ffmpeg;
}

function rutaFfprobe() {
    if (_ffprobe !== undefined) return _ffprobe;
    try {
        const r = desempaquetada(require('ffprobe-static').path);
        _ffprobe = r && fs.existsSync(r) ? r : null;
    } catch (_) { _ffprobe = null; }
    return _ffprobe;
}

// Corre un binario y junta la salida. Nunca por shell: los nombres de archivo
// con espacios, comillas o & no rompen nada.
function correr(bin, args, { timeout = 10 * 60 * 1000 } = {}) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { windowsHide: true });
        let out = '', err = '';
        const t = setTimeout(() => { p.kill(); }, timeout);
        p.stdout.on('data', d => { out += d; if (out.length > 5e6) out = out.slice(-5e6); });
        p.stderr.on('data', d => { err += d; if (err.length > 2e5) err = err.slice(-2e5); });
        p.on('error', e => { clearTimeout(t); reject(e); });
        p.on('close', codigo => { clearTimeout(t); resolve({ codigo, out, err }); });
    });
}

// {duracion, ancho, alto, bytes} o null.
async function info(ruta) {
    const bin = rutaFfprobe();
    if (!bin || !ruta || !fs.existsSync(ruta)) return null;
    try {
        const r = await correr(bin, ['-v', 'error', '-print_format', 'json',
            '-show_format', '-show_streams', ruta], { timeout: 30000 });
        if (r.codigo !== 0) return null;
        const j = JSON.parse(r.out);
        const video = (j.streams || []).find(s => s.codec_type === 'video') || {};
        let duracion = parseFloat(j.format && j.format.duration);
        if (!isFinite(duracion)) duracion = parseFloat(video.duration);
        return {
            duracion: isFinite(duracion) ? duracion : null,
            ancho: video.width || null,
            alto: video.height || null,
            bytes: fs.statSync(ruta).size,
            codec: video.codec_name || null,
            fps: fps(video.avg_frame_rate || video.r_frame_rate)
        };
    } catch (_) {
        return null;
    }
}

function fps(txt) {
    const m = /^(\d+)\/(\d+)$/.exec(txt || '');
    if (!m || !+m[2]) return null;
    return Math.round((+m[1] / +m[2]) * 100) / 100;
}

// Hasta que segundo se puede leer un archivo (tambien uno que se esta
// escribiendo): el pts del ultimo paquete de video. Se leen solo los ultimos
// paquetes (-read_intervals) para que no cueste leer un partido entero.
async function ultimoInstante(ruta, desde) {
    const bin = rutaFfprobe();
    if (!bin) return null;
    const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time',
        '-of', 'csv=p=0'];
    if (desde > 0) args.push('-read_intervals', `${Math.max(0, desde)}%`);
    args.push(ruta);
    try {
        const r = await correr(bin, args, { timeout: 60000 });
        let max = null;
        r.out.split(/\r?\n/).forEach(l => {
            const v = parseFloat(l);
            if (isFinite(v) && (max === null || v > max)) max = v;
        });
        return max;
    } catch (_) {
        return null;
    }
}

module.exports = { rutaFfmpeg, rutaFfprobe, correr, info, ultimoInstante };
