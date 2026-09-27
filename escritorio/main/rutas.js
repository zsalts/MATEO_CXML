// Rutas, nombres de archivo y tipos MIME. Funciones puras, sin Electron:
// las usan el esquema app://, la grabacion, las pruebas y el servidor wifi
// del iPad (main/remoto.js), que tiene que decidir lo mismo que aca.

const path = require('path');
const fs = require('fs');

// ¿`ruta` cae dentro de `raiz` (o es la raiz misma)?
//
// El chequeo viejo era `destino.startsWith(RAIZ)`, y eso deja pasar carpetas
// hermanas: con raiz "C:\app\src", "C:\app\src2\secreto" empieza igual. Se
// compara contra la raiz con el separador al final, despues de resolver los
// "..". En Windows las rutas no distinguen mayusculas.
//
// Mac (Agente 7): el disco tampoco distingue mayusculas por defecto (APFS), y
// macOS puede devolver los nombres en Unicode NFD ("n" + tilde en vez de
// "ñ"): el mismo "Peñarol" escrito y leido del disco no es igual byte a
// byte. Se pasan las dos a NFC y se compara sin mayusculas tambien en darwin.
// En Linux, tal cual. `plataforma` es para las pruebas.
function dentroDe(raiz, ruta, plataforma = process.platform) {
    if (typeof raiz !== 'string' || typeof ruta !== 'string') return false;
    if (!raiz || !ruta || raiz.includes('\0') || ruta.includes('\0')) return false;
    let r = path.resolve(raiz);
    let p = path.resolve(ruta);
    if (plataforma === 'win32' || plataforma === 'darwin') {
        r = r.normalize('NFC').toLowerCase();
        p = p.normalize('NFC').toLowerCase();
    }
    if (p === r) return true;
    const conSep = r.endsWith(path.sep) ? r : r + path.sep;
    return p.startsWith(conSep);
}

// De la parte de ruta de una url ("/ramas/base/index.js", "/x%20y.css") al
// archivo en el disco, o null si se sale de la raiz. Decodifica UNA vez: un
// "%2e%2e" llega aca como ".." y lo frena dentroDe().
function archivoDeUrl(raiz, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname || '/'); } catch (_) { return null; }
    if (rel.includes('\0')) return null;
    if (rel === '' || rel === '/') rel = '/index.html';
    // "\" tambien separa en Windows: "/..\\..\\x" no puede colarse.
    const destino = path.resolve(raiz, '.' + path.sep + rel.replace(/^[\\/]+/, ''));
    return dentroDe(raiz, destino) ? destino : null;
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm':  'text/html; charset=utf-8',
    // Los ES modules exigen un MIME de JavaScript: con text/plain el import
    // falla sin decir mucho.
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':  'font/ttf',
    '.txt':  'text/plain; charset=utf-8',
    '.map':  'application/json; charset=utf-8',
    '.mp4':  'video/mp4',
    '.m4v':  'video/mp4',
    '.mov':  'video/quicktime',
    '.webm': 'video/webm',
    '.mkv':  'video/x-matroska',
    '.mp3':  'audio/mpeg',
    '.wav':  'audio/wav'
};

function mimeDe(ruta) {
    return MIME[path.extname(ruta || '').toLowerCase()] || 'application/octet-stream';
}

// Nombre valido para Windows: sin \ / : * ? " < > |, sin control, sin puntos
// ni espacios al final (Windows los come y despues no encuentra el archivo) y
// sin los nombres reservados (CON, PRN, NUL, COM1...).
//
// Mac (Agente 7): "/" y ":" ya estan cubiertos. Ademas NFC (el mismo nombre
// siempre con los mismos bytes: la base lo encuentra y no sale un "(2)" de
// mas) y sin punto al principio (en Mac seria un archivo oculto).
function nombreSeguro(s, porDefecto = 'Partido') {
    let n = String(s == null ? '' : s)
        .normalize('NFC')
        .replace(/^[\s.]+/, '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '');
    if (!n) n = porDefecto;
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = '_' + n;
    // 150 deja lugar para la carpeta de trabajo + "Partidos\<nombre>\Clips\".
    return n.slice(0, 150).trim();
}

// "Partido.mp4" libre dentro de `dir`; si ya existe, "Partido (2).mp4"...
function nombreLibre(dir, nombre) {
    const ext = path.extname(nombre);
    const base = path.basename(nombre, ext);
    let intento = nombre, n = 2;
    while (fs.existsSync(path.join(dir, intento))) {
        intento = `${base} (${n++})${ext}`;
    }
    return path.join(dir, intento);
}

// Subcarpeta relativa pedida por la pantalla ("Partidos/LOMAS vs GEBA") a una
// ruta real dentro de la carpeta de trabajo. Cada tramo se limpia: la pantalla
// no puede escribir fuera de la carpeta aunque mande "../../Windows".
function subcarpetaSegura(carpeta, sub) {
    if (sub == null || sub === '') return carpeta;
    if (typeof sub !== 'string') throw new Error('subcarpeta tiene que ser texto');
    const tramos = sub.split(/[\\/]+/).filter(t => t && t !== '.' && t !== '..')
        .map(t => nombreSeguro(t, 'Carpeta'));
    const destino = path.join(carpeta, ...tramos);
    if (!dentroDe(carpeta, destino)) throw new Error('Subcarpeta fuera de la carpeta de trabajo');
    return destino;
}

// Texto de un archivo cualquiera: UTF-8 (con o sin BOM), UTF-16 con BOM (asi
// sale el XML de Sportscode) y, si no es UTF-8 valido, Windows-1252 (los CSV
// que guarda Excel en una PC en castellano).
function decodificarTexto(buf) {
    if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return buf.subarray(3).toString('utf8');
    }
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
        return buf.subarray(2).toString('utf16le');
    }
    if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
        // Node no trae utf16be: se dan vuelta los pares y se lee como LE.
        const le = Buffer.from(buf.subarray(2));
        for (let i = 0; i + 1 < le.length; i += 2) { const a = le[i]; le[i] = le[i + 1]; le[i + 1] = a; }
        return le.toString('utf16le');
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (_) {
        return new TextDecoder('windows-1252').decode(buf);
    }
}

// Texto a bytes para guardar. El XML va en UTF-16 LE con BOM porque asi lo
// quiere Sportscode (igual que blobUtf16() de la web); el CSV en UTF-8 con BOM
// para que Excel no rompa los acentos.
function codificarTexto(texto, extension, codificacion) {
    const cod = codificacion || ({ xml: 'utf16', csv: 'utf8bom' })[String(extension || '').toLowerCase()] || 'utf8';
    const s = String(texto == null ? '' : texto);
    if (cod === 'utf16' || cod === 'utf16le') {
        return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, 'utf16le')]);
    }
    if (cod === 'utf8bom') return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(s, 'utf8')]);
    return Buffer.from(s, 'utf8');
}

module.exports = {
    dentroDe, archivoDeUrl, mimeDe, MIME,
    nombreSeguro, nombreLibre, subcarpetaSegura,
    decodificarTexto, codificarTexto
};
