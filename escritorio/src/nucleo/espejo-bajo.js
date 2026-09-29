// La copia en calidad reducida de lo que se graba, para el que mira los
// cortes por internet (Compartir por internet).
//
// La imagen en vivo en la wifi de la cancha es la misma grabación (varios
// Mb/s). Por internet eso no pasa por la subida de una cancha: acá se graba
// aparte una copia chica (720p, ~1,5 Mb/s) con un segundo MediaRecorder
// sobre la misma cámara, achicada en un <canvas>. No va al disco: los trozos
// van a main/vivo.js (vivoBajo) y de ahí a /vivo para los de afuera.
//
// El MediaRecorder usa el codificador de la placa de video cuando hay, así
// que pesa poco; igual solo corre mientras se comparte por internet y se
// está grabando (revisar(true/false) cada vez que cambia algo).
//
// La grabación de verdad (grabadora.js) no se toca: si esta copia falla,
// solo se pierde la imagen de afuera.

import { FORMATOS, repararFragmento } from './grabadora.js';

const BITS = 1400000;
const ALTO = 720;

/**
 * @param o.grabadora   la de la captura (vistaPrevia() = la cámara)
 * @param o.api         window.tv (video.espejoIniciar/Trozo/Terminar)
 */
export function crearEspejoBajo({ grabadora, api }) {
    let E = null;   // {rec, video, lienzo, timer, fuente}

    function formato() {
        if (typeof MediaRecorder === 'undefined') return null;
        // Solo MP4: es lo que el iPad sabe mostrar en vivo.
        for (const f of FORMATOS) {
            if (f.indexOf('mp4') < 0) continue;
            try { if (MediaRecorder.isTypeSupported(f)) return f; } catch (_) { /* sigue */ }
        }
        return null;
    }

    function prender() {
        if (E) return;
        const camara = grabadora.vistaPrevia();
        const mime = formato();
        if (!camara || !camara.getVideoTracks().length || !mime) return;

        const s = camara.getVideoTracks()[0].getSettings ? camara.getVideoTracks()[0].getSettings() : {};
        const alto = Math.min(ALTO, s.height || ALTO);
        const ancho = Math.round(alto * ((s.width && s.height) ? s.width / s.height : 16 / 9) / 2) * 2;
        const fps = Math.min(30, Math.round(s.frameRate || 30));

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = camara;
        video.play().catch(() => {});
        const lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx = lienzo.getContext('2d');
        // setInterval y no requestAnimationFrame: con la ventana atrás, rAF se
        // frena (igual que en grabadora.js).
        const timer = setInterval(() => {
            if (video.readyState >= 2) ctx.drawImage(video, 0, 0, ancho, alto);
        }, 1000 / fps);

        const pistas = [lienzo.captureStream(fps).getVideoTracks()[0]];
        camara.getAudioTracks().forEach(t => pistas.push(t.clone()));
        let rec;
        try {
            rec = new MediaRecorder(new MediaStream(pistas), {
                mimeType: mime, videoBitsPerSecond: BITS, audioBitsPerSecond: 64000, videoKeyFrameIntervalDuration: 1000
            });
        } catch (err) {
            console.warn('Copia para internet:', err);
            clearInterval(timer);
            pistas.forEach(t => { try { t.stop(); } catch (_) {} });
            return;
        }
        E = { rec, video, timer, pistas, cola: Promise.resolve() };
        const este = E;
        api.video.espejoIniciar(mime).catch(() => {});
        rec.ondataavailable = ev => {
            if (!ev.data || !ev.data.size) return;
            const blob = ev.data;
            // En fila, como en grabadora.js: dos lecturas sueltas pueden
            // terminar al revés.
            este.cola = este.cola.then(async () => {
                if (E !== este) return;
                const u8 = repararFragmento(new Uint8Array(await blob.arrayBuffer()));
                await api.video.espejoTrozo(u8);
            }).catch(() => {});
        };
        rec.start(1000);
    }

    function apagar() {
        if (!E) return;
        const e = E;
        E = null;
        try { e.rec.stop(); } catch (_) {}
        clearInterval(e.timer);
        e.pistas.forEach(t => { try { t.stop(); } catch (_) {} });
        e.video.srcObject = null;
        api.video.espejoTerminar().catch(() => {});
    }

    // La cámara se desenchufó y volvió: la copia sigue con la nueva.
    const quitar = grabadora.on('reconectada', () => {
        if (E) E.video.srcObject = grabadora.vistaPrevia();
    });

    return {
        // true: se comparte por internet y se graba.
        revisar(hace) { if (hace) prender(); else apagar(); },
        activo: () => !!E,
        destruir() { apagar(); quitar(); }
    };
}
