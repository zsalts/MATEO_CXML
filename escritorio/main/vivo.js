// La imagen en vivo para el iPad que mira los cortes.
//
// No se vuelve a comprimir nada: MediaRecorder ya escribe MP4 fragmentado
// (un 'moov' al principio y después un 'moof'+'mdat' por segundo), que es
// justo lo que Safari sabe reproducir con Media Source. Cada trozo que llega
// para el disco (main/video.js) pasa también por acá; se parte en cajas y se
// reparte a los que miran (main/remoto.js, /vivo).
//
//   inicio (init)   ftyp + moov: lo primero que necesita el reproductor
//   fragmentos      moof + mdat, con la marca de si arranca en un cuadro
//                   clave: uno que entra tarde, o que se atrasó y se saltea
//                   fragmentos, tiene que retomar en uno clave (si no, se ve
//                   gris o verde hasta el próximo)
//
// Los trozos de MediaRecorder no siempre terminan justo en el borde de una
// caja: lo que sobra espera al trozo siguiente.
//
// Solo MP4. Con WebM (una compu donde MediaRecorder no da MP4) no hay imagen
// en vivo; los cortes llegan igual.
//
// Sin Electron: lo prueba node --test.

'use strict';

const MAX_GOP = 12 * 1024 * 1024;   // lo que se guarda desde el último cuadro clave

const u32 = (b, i) => b.readUInt32BE(i);
const tipo = (b, i) => b.toString('latin1', i + 4, i + 8);

// Las cajas hijas de [desde, hasta). null si algo no cierra.
function cajas(b, desde, hasta) {
    const out = [];
    for (let i = desde; i < hasta;) {
        if (i + 8 > hasta) return null;
        const t = u32(b, i);
        if (t < 8 || i + t > hasta) return null;
        out.push({ tipo: tipo(b, i), ini: i, fin: i + t });
        i += t;
    }
    return out;
}
const hija = (b, caja, nombre) => {
    const hs = caja && cajas(b, caja.ini + 8, caja.fin);
    return hs ? hs.find(h => h.tipo === nombre) || null : null;
};
const hex2 = n => n.toString(16).padStart(2, '0');

// Del moov: qué pista es el video, sus flags por defecto (trex) y los
// códecs para addSourceBuffer ("avc1.640028,mp4a.40.2").
function leerMoov(b, moov) {
    const info = { video: null, trex: new Map(), codecs: [] };
    for (const c of cajas(b, moov.ini + 8, moov.fin) || []) {
        if (c.tipo === 'trak') {
            const tkhd = hija(b, c, 'tkhd');
            const mdia = hija(b, c, 'mdia');
            const hdlr = hija(b, mdia, 'hdlr');
            if (!tkhd || !hdlr) continue;
            const id = u32(b, tkhd.ini + (b[tkhd.ini + 8] === 1 ? 28 : 20));
            const manejo = b.toString('latin1', hdlr.ini + 16, hdlr.ini + 20);
            const stsd = hija(b, hija(b, hija(b, mdia, 'minf'), 'stbl'), 'stsd');
            const entrada = stsd && stsd.ini + 24 <= stsd.fin ? { tipo: tipo(b, stsd.ini + 16), ini: stsd.ini + 16, fin: stsd.ini + 16 + u32(b, stsd.ini + 16) } : null;
            if (manejo === 'vide') {
                info.video = id;
                if (entrada && /^(avc1|avc3)$/.test(entrada.tipo)) {
                    // Las cajas de una entrada de video empiezan a los 86 bytes.
                    const avcC = (cajas(b, entrada.ini + 86, Math.min(entrada.fin, stsd.fin)) || []).find(h => h.tipo === 'avcC');
                    info.codecs.push(avcC ? `${entrada.tipo}.${hex2(b[avcC.ini + 9])}${hex2(b[avcC.ini + 10])}${hex2(b[avcC.ini + 11])}` : 'avc1.640028');
                } else if (entrada) {
                    info.codecs.push(entrada.tipo);
                }
            } else if (manejo === 'soun' && entrada) {
                info.codecs.push(entrada.tipo === 'mp4a' ? 'mp4a.40.2' : entrada.tipo === 'Opus' ? 'opus' : entrada.tipo);
            }
        } else if (c.tipo === 'mvex') {
            for (const t of cajas(b, c.ini + 8, c.fin) || []) {
                if (t.tipo === 'trex' && t.fin - t.ini >= 32) info.trex.set(u32(b, t.ini + 12), u32(b, t.ini + 28));
            }
        }
    }
    return info;
}

// ¿El fragmento arranca en un cuadro clave? Se mira la primera muestra de
// la pista de video: first_sample_flags del trun, o el default del tfhd, o
// el del trex. Sin pista de video conocida se da por clave.
function esClave(b, moof, info) {
    if (info.video == null) return true;
    for (const traf of cajas(b, moof.ini + 8, moof.fin) || []) {
        if (traf.tipo !== 'traf') continue;
        const hs = cajas(b, traf.ini + 8, traf.fin) || [];
        const tfhd = hs.find(h => h.tipo === 'tfhd');
        const trun = hs.find(h => h.tipo === 'trun');
        if (!tfhd || !trun || u32(b, tfhd.ini + 12) !== info.video) continue;
        let flags = info.trex.has(info.video) ? info.trex.get(info.video) : null;
        const ft = u32(b, tfhd.ini + 8) & 0xffffff;
        let p = tfhd.ini + 16;
        if (ft & 0x01) p += 8;
        if (ft & 0x02) p += 4;
        if (ft & 0x08) p += 4;
        if (ft & 0x10) p += 4;
        if (ft & 0x20) flags = u32(b, p);
        const fr = u32(b, trun.ini + 8) & 0xffffff;
        if (fr & 0x04) flags = u32(b, trun.ini + 16 + (fr & 0x01 ? 4 : 0));
        if (flags == null) return true;
        return !(flags & 0x10000);   // sample_is_non_sync_sample
    }
    return true;
}

function crearVivo() {
    let g = null;              // la grabación en curso
    const oyentes = new Set(); // {fragmento(buf, clave), fin()}

    function iniciar(mime) {
        terminar();
        const mp4 = !mime || /mp4/i.test(mime);
        g = mp4 ? { resto: Buffer.alloc(0), antes: [], init: null, info: null, grupo: [], gop: [], gopBytes: 0 } : null;
    }

    function publicar(frag, clave) {
        if (clave) { g.gop = []; g.gopBytes = 0; }
        if (g.gop.length || clave) {
            g.gop.push(frag);
            g.gopBytes += frag.length;
            // Un GOP enorme (sin cuadros clave) no se guarda entero en memoria.
            if (g.gopBytes > MAX_GOP) { g.gop = []; g.gopBytes = 0; }
        }
        for (const o of oyentes) { try { o.fragmento(frag, clave); } catch (_) {} }
    }

    function caja(buf) {
        const t = tipo(buf, 0);
        if (!g.init) {
            if (t === 'moof') { g = null; return; }   // un MP4 sin moov no se puede mostrar
            g.antes.push(buf);
            // Con el moov completo ya se puede mirar (ftyp + moov).
            if (t === 'moov') {
                g.info = leerMoov(buf, { ini: 0, fin: buf.length });
                g.init = Buffer.concat(g.antes);
                g.antes = null;
            }
            return;
        }
        if (t === 'moof') {
            g.grupo = [buf];
            g.clave = esClave(buf, { ini: 0, fin: buf.length }, g.info);
        } else if (g.grupo.length) {
            g.grupo.push(buf);
            if (t === 'mdat') {
                const frag = Buffer.concat(g.grupo);
                g.grupo = [];
                publicar(frag, g.clave);
            }
        }
    }

    function trozo(datos) {
        if (!g) return;
        let b = g.resto.length ? Buffer.concat([g.resto, datos]) : Buffer.from(datos);
        let i = 0;
        while (g && b.length - i >= 8) {
            let t = u32(b, i);
            if (t === 1) {
                if (b.length - i < 16) break;
                t = Number(b.readBigUInt64BE(i + 8));
            }
            if (t < 8) { g = null; return; }   // algo raro: sin imagen en vivo en esta grabación
            if (b.length - i < t) break;
            caja(b.subarray(i, i + t));
            i += t;
        }
        if (g) g.resto = Buffer.from(b.subarray(i));
    }

    function terminar() {
        g = null;
        for (const o of oyentes) { try { o.fin(); } catch (_) {} }
        oyentes.clear();
    }

    // Un nuevo que mira: recibe el init y lo que va desde el último cuadro
    // clave (así arranca al toque), y después cada fragmento nuevo. null si
    // no se está grabando o todavía no hay imagen.
    function suscribir(o) {
        if (!g || !g.init) return null;
        oyentes.add(o);
        return {
            init: g.init,
            codecs: g.info.codecs.join(','),
            gop: g.gop.slice(),
            salir: () => oyentes.delete(o)
        };
    }

    return {
        iniciar, trozo, terminar, suscribir,
        hay: () => !!(g && g.init),
        cuantos: () => oyentes.size
    };
}

module.exports = { crearVivo, leerMoov, esClave, cajas };
