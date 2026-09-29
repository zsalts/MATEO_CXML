// La imagen en vivo en el iPad que mira los cortes.
//
// La compu manda por /vivo la grabación tal cual sale de MediaRecorder (MP4
// fragmentado, ver main/vivo.js). Acá se lee con fetch a medida que llega y
// se va dando a un <video> con Media Source. Sin recomprimir nada: la misma
// imagen que se graba, uno o dos segundos atrás.
//
// Se queda siempre en el borde: si se atrasa (wifi flojo, la pestaña estuvo
// dormida) salta al final en vez de acumular demora. Lo viejo se borra del
// buffer, así un partido entero no llena la memoria del iPad. Si se corta
// (o todavía no se graba) reintenta solo.
//
// iPad: MediaSource. iPhone: ManagedMediaSource (iOS 17.1 o más nuevo). Sin
// ninguno de los dos no hay imagen en vivo; los cortes se ven igual.
//
// Tiene que correr en Safari viejo: sin ?? ni ?.

const ATRASO_MAX = 2.5;   // s detrás del final antes de saltar
const MARGEN = 0.6;       // s detrás del final al saltar
const GUARDAR = 20;       // s de atrás que quedan en el buffer

export function crearVivo(video, o) {
    const MS = window.ManagedMediaSource || window.MediaSource;
    let prendido = false, corrida = 0, reintento = null, cortar = null;
    let ultimoT = -1, quietoDesde = 0, reloj = null, urlFuente = null;

    function estado(e) { if (o.alEstado) o.alEstado(e); }

    function prender() {
        if (prendido) return;
        prendido = true;
        if (!MS) return estado('sinSoporte');
        conectar();
        reloj = setInterval(vigilar, 1000);
    }

    function apagar() {
        prendido = false;
        corrida++;
        clearTimeout(reintento);
        clearInterval(reloj);
        if (cortar) { try { cortar(); } catch (_) {} }
        try { video.pause(); } catch (_) {}
        video.removeAttribute('src');
        try { video.load(); } catch (_) {}
    }

    function otraVez(mia, ms) {
        if (mia !== corrida || !prendido) return;
        clearTimeout(reintento);
        reintento = setTimeout(() => { if (mia === corrida && prendido) conectar(); }, ms);
    }

    async function conectar() {
        const mia = ++corrida;
        estado('esperando');
        let res;
        try {
            const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            cortar = ctl ? () => ctl.abort() : null;
            res = await fetch(o.url(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
        } catch (_) { return otraVez(mia, 2000); }
        if (mia !== corrida) return;
        // 503: la compu todavía no graba. Se pregunta de nuevo en un rato.
        if (res.status !== 200 || !res.body) return otraVez(mia, res.status === 503 ? 2000 : 4000);

        const tipo = 'video/mp4; codecs="' + (res.headers.get('X-Codecs') || 'avc1.640028,mp4a.40.2') + '"';
        if (MS.isTypeSupported && !MS.isTypeSupported(tipo)) { try { cortar(); } catch (_) {} return estado('sinSoporte'); }

        // Una fuente nueva por conexión: una grabación nueva trae otro init.
        const ms = new MS();
        if (MS === window.ManagedMediaSource) video.disableRemotePlayback = true;
        if (urlFuente) URL.revokeObjectURL(urlFuente);
        urlFuente = URL.createObjectURL(ms);
        video.src = urlFuente;
        await new Promise(ok => ms.addEventListener('sourceopen', ok, { once: true }));
        if (mia !== corrida) return;
        let sb;
        try { sb = ms.addSourceBuffer(tipo); }
        catch (_) { try { cortar(); } catch (e) {} return estado('sinSoporte'); }

        const cola = [];
        function empujar() {
            if (mia !== corrida || sb.updating || ms.readyState !== 'open') return;
            // Primero se borra lo viejo (remove también es asincrónico: al
            // terminar vuelve a llamar acá por updateend).
            const b = sb.buffered;
            if (b.length && video.currentTime - b.start(0) > GUARDAR + 10) {
                try { sb.remove(0, video.currentTime - GUARDAR); return; } catch (_) {}
            }
            if (!cola.length) return;
            const total = cola.reduce((n, x) => n + x.length, 0);
            const junto = new Uint8Array(total);
            let p = 0;
            cola.splice(0).forEach(x => { junto.set(x, p); p += x.length; });
            try { sb.appendBuffer(junto); }
            catch (e) {
                // Lleno: se borra más y se reintenta con lo mismo.
                cola.unshift(junto);
                if (e && e.name === 'QuotaExceededError' && b.length) {
                    try { sb.remove(0, Math.max(b.start(0) + 1, video.currentTime - 3)); } catch (_) {}
                } else {
                    otraVez(mia, 1000);
                }
            }
        }
        sb.addEventListener('updateend', () => { alBorde(); empujar(); });

        const lector = res.body.getReader();
        try {
            for (;;) {
                const r = await lector.read();
                if (r.done || mia !== corrida) break;
                cola.push(r.value);
                empujar();
            }
        } catch (_) { /* cortado */ }
        // Terminó la grabación o se cortó el wifi: se vuelve a preguntar.
        otraVez(mia, 1000);
    }

    // Al final de lo que hay, y andando.
    function alBorde() {
        const b = video.buffered;
        if (!b.length) return;
        const i = b.length - 1, fin = b.end(i);
        if (video.currentTime < b.start(i) || fin - video.currentTime > ATRASO_MAX) {
            try { video.currentTime = Math.max(b.start(i), fin - MARGEN); } catch (_) {}
        }
        if (video.paused) {
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
        }
        estado('vivo');
    }

    // Trabado en un hueco (se saltearon fragmentos) con imagen más adelante.
    function vigilar() {
        const t = video.currentTime, b = video.buffered;
        if (t !== ultimoT) { ultimoT = t; quietoDesde = Date.now(); return; }
        if (b.length && b.end(b.length - 1) - t > 0.3 && Date.now() - quietoDesde > 1500) {
            quietoDesde = Date.now();
            alBorde();
            try { video.currentTime = b.end(b.length - 1) - MARGEN; } catch (_) {}
        }
    }

    return { prender, apagar, hay: () => !!MS };
}
