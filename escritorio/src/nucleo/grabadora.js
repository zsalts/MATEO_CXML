// Cámara + MediaRecorder, escribiendo al disco a medida que llega.
//
// Sin window.tv: el disco es un "destino" que se inyecta, con la forma de
// tv.video → { iniciar(nombre, mime), trozo(Uint8Array), finalizar(),
// descartar(), onError?(cb) }. En la compu es tv.video; en una prueba, un
// objeto que junta los bytes en memoria.
//
// ── Formato ──────────────────────────────────
// MP4 H.264/AAC primero (lo abren Sportscode, Nacsport y cualquier editor).
// El MP4 de MediaRecorder en Chromium sale FRAGMENTADO (moov vacío + un
// moof/mdat por fragmento): lo que ya está en el disco se puede reproducir
// y cortar con ffmpeg mientras el archivo sigue creciendo. Probado en
// Electron 33: el <video> servido con Range abre el archivo a medio grabar
// y salta a cualquier segundo; ffmpeg -c copy corta un tramo sin problema.
// Se pide un keyframe por segundo (videoKeyFrameIntervalDuration): así cada
// fragmento dura ~1 s y un corte sin recomprimir cae a lo sumo a un segundo
// del pedido. Sin eso Chromium pone uno cada ~100 cuadros y el corte podía
// irse 4 segundos.
//
// ── Reconexión: EL MISMO ARCHIVO ─────────────
// El MediaRecorder no graba la cámara directo: graba una pista propia
// (MediaStreamTrackGenerator) a la que se le "bombean" los cuadros de la
// cámara, y el audio pasa por un nodo de WebAudio. Si la placa se
// desenchufa, la pista propia sigue viva (sin cuadros nuevos: el video
// queda congelado en el último, y el audio en silencio) y el MediaRecorder
// ni se entera. Al reconectar se vuelve a bombear a la misma pista. Queda
// UN archivo, continuo, y el reloj del video nunca salta: el mapa de tramos
// no tiene que saber nada de la desconexión (el hueco es tiempo de video
// como cualquier otro). Probado: 5 s grabando, 4 s desenchufada, 5 s más →
// un solo MP4 de 13,6 s, keyframes corridos 4,9 s en el hueco, se
// reproduce y se corta igual.
// La alternativa —cerrar el archivo y abrir otro— deja al partido partido
// en dos videos, y la base, el XML y Sportscode esperan uno.
// Donde no hay MediaStreamTrackGenerator (Safari, Firefox) se hace lo mismo
// dibujando la cámara en un <canvas> y grabando el canvas.

export const FORMATOS = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
];

export const CALIDADES = {
    baja: 3000000,
    media: 6000000,
    alta: 10000000,
    maxima: 16000000
};

// Bits por segundo a partir de lo que venga de tv.ajustes (número, texto
// con el número, o el nombre de la calidad). Ajustes guarda Mb/s (6 = 6 Mb/s):
// un número chico nunca son bits, a 6 b/s no se ve nada.
export function bitsDeCalidad(c) {
    if (typeof c === 'string' && CALIDADES[c.toLowerCase()]) return CALIDADES[c.toLowerCase()];
    const n = typeof c === 'number' ? c : parseFloat(c);
    if (n > 100000) return n;
    if (n > 0 && n < 100) return n * 1000000;   // "6" = 6 Mb
    return CALIDADES.media;
}

export function elegirFormato() {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const f of FORMATOS) {
        try { if (MediaRecorder.isTypeSupported(f)) return f; } catch (_) { /* sigue */ }
    }
    return '';
}

// Las entradas de video y audio. Los nombres recién aparecen después del
// primer permiso: sin él vienen vacíos y se numeran.
export async function listarEntradas() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { video: [], audio: [] };
    const ds = await navigator.mediaDevices.enumerateDevices();
    const armar = (tipo, prefijo) => ds.filter(d => d.kind === tipo)
        .map((d, i) => ({ id: d.deviceId, nombre: d.label || `${prefijo} ${i + 1}`, grupo: d.groupId }));
    return { video: armar('videoinput', 'Cámara'), audio: armar('audioinput', 'Micrófono') };
}

// ── Permisos de macOS (Agente 7) ─────────────
// En Mac, sin permiso la cámara da una vista previa NEGRA sin error claro.
// Antes de getUserMedia se pregunta el estado y, si nunca se preguntó, se
// pide. `sys` es tv.sys (permiso, pedirPermiso); en Windows contesta siempre
// 'concedido', y sin sys (pruebas, navegador) no se chequea nada.
// Tira un Error con .permiso = 'camara' y .estado si la cámara está negada:
// la pantalla muestra panelPermiso() (src/ui/permisos.js). El micrófono
// negado no frena: se graba "Sin audio".
export async function asegurarPermisos(sys, { audio = true } = {}) {
    if (!sys || typeof sys.permiso !== 'function') return { camara: 'concedido', microfono: 'concedido' };
    const pedir = async tipo => {
        let e = await sys.permiso(tipo);
        if (e === 'no-determinado') e = (await sys.pedirPermiso(tipo)) ? 'concedido' : 'denegado';
        return e;
    };
    const camara = await pedir('camara');
    if (camara !== 'concedido') {
        throw Object.assign(new Error(camara === 'restringido'
            ? 'La cámara está bloqueada en esta Mac (control parental o perfil de la empresa).'
            : 'Tag & View Pro no tiene permiso para usar la cámara.'), { permiso: 'camara', estado: camara });
    }
    const microfono = audio ? await pedir('microfono') : 'concedido';
    return { camara, microfono };
}

// ¿Parece una placa de captura? Solo para ordenarla primero en la lista.
export function esPlaca(nombre) {
    return /elgato|cam ?link|capture|captura|hdmi|avermedia|magewell|blackmagic|usb video|game ?capture|hd60|4k ?x/i.test(nombre || '');
}

const hayGenerador = () => typeof MediaStreamTrackGenerator !== 'undefined' && typeof MediaStreamTrackProcessor !== 'undefined';

/**
 * @param opciones.destino   { iniciar, trozo, finalizar, descartar, onError? }
 * @param opciones.calidad   bits por segundo (o 'alta', '6000000'…)
 * @param opciones.trozoMs   cada cuánto se escribe al disco (1000)
 * @param opciones.modo      'generador' | 'lienzo' | 'directo' (auto)
 * @param opciones.sys       tv.sys para los permisos de macOS (por defecto
 *                           window.tv.sys; null = no chequear)
 */
export function crearGrabadora(opciones = {}) {
    const destino = opciones.destino;
    const trozoMs = opciones.trozoMs || 1000;
    let bits = bitsDeCalidad(opciones.calidad);
    const modo = opciones.modo || (hayGenerador() ? 'generador' : 'lienzo');

    const oyentes = new Map();
    const emitir = (ev, dato) => (oyentes.get(ev) || []).forEach(cb => { try { cb(dato); } catch (e) { console.error(e); } });

    const G = {
        pedido: null,          // lo último que se pidió a conectar(), para reconectar igual
        camara: null,          // MediaStream de la cámara (la vista previa)
        conAudio: false,
        conectada: false,
        desconectadaEn: null,  // performance.now() de la desconexión, si está caída
        grabando: false,
        rec: null,
        mime: '',
        ruta: null,
        bytes: 0,
        t0: null,              // performance.now() del primer cuadro grabado = segundo 0 del video
        vEscrito: 0,           // hasta qué segundo del video ya está en el disco
        cola: Promise.resolve(),
        errorDisco: null,
        ultima: null,          // { ruta, bytes, mime } de la grabación cerrada
        deteniendo: null,
        // tubería de grabación
        generador: null, escritor: null, bomba: null,
        audioCtx: null, audioDest: null, audioFuente: null,
        lienzo: null, lienzoVideo: null, lienzoTimer: null,
        tamano: null,          // { w, h } del primer cuadro: el encoder no cambia de tamaño
        quitarErrorDestino: null
    };

    // ── Cámara ───────────────────────────────
    function restricciones(p) {
        const video = {
            deviceId: p.videoId ? { exact: p.videoId } : undefined,
            // Una placa de captura entrega lo que le llega por HDMI: se le
            // pide 1080p y ella baja sola a lo que de verdad tenga.
            width: { ideal: p.ancho || 1920 },
            height: { ideal: p.alto || 1080 }
        };
        if (p.fps) video.frameRate = { ideal: p.fps };
        const audio = p.audioId === 'no' ? false : {
            deviceId: p.audioId ? { exact: p.audioId } : undefined,
            // Es el sonido del partido, no una llamada: nada de filtros.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        };
        return { video, audio };
    }

    /**
     * Abre la cámara (o la cambia). Si se está grabando, la grabación sigue
     * en el mismo archivo con la cámara nueva.
     * @returns {Promise<{ancho, alto, fps, conAudio, aviso?}>}
     */
    async function conectar(p = {}) {
        G.pedido = { ...p };
        const pedido = restricciones(p);
        let stream, aviso = null;
        // Mac: permiso antes de abrir (tira si la cámara está negada).
        const sys = opciones.sys !== undefined ? opciones.sys : (globalThis.tv && globalThis.tv.sys);
        const permisos = await asegurarPermisos(sys, { audio: !!pedido.audio });
        if (pedido.audio && permisos.microfono !== 'concedido') {
            pedido.audio = false;
            aviso = 'Sin audio: Tag & View Pro no tiene permiso para usar el micrófono (Ajustes del Sistema → Privacidad y seguridad → Micrófono).';
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia(pedido);
        } catch (err) {
            // Sin audio la captura casi siempre arranca igual: vale más grabar
            // el partido mudo que no grabarlo.
            if (!pedido.audio) throw err;
            stream = await navigator.mediaDevices.getUserMedia({ ...pedido, audio: false });
            aviso = 'La cámara entró, pero sin audio: ' + ((err && err.message) || err);
        }
        soltarCamara();
        G.camara = stream;
        G.conAudio = stream.getAudioTracks().length > 0;
        G.conectada = true;
        const vt = stream.getVideoTracks()[0];
        if (vt) {
            vt.addEventListener('ended', () => {
                if (G.camara !== stream) return;   // ya se cambió por otra
                G.conectada = false;
                G.desconectadaEn = performance.now();
                soltarBomba();
                emitir('desconectada', { grabando: G.grabando, vAhora: vAhora() });
                emitir('estado', estado());
            });
        }
        const volvio = G.desconectadaEn != null;
        G.desconectadaEn = null;
        if (G.grabando) enchufarAGrabacion();
        const info = infoCamara();
        if (volvio) emitir('reconectada', { ...info, grabando: G.grabando, vAhora: vAhora() });
        emitir('estado', estado());
        return { ...info, aviso };
    }

    function infoCamara() {
        const vt = G.camara && G.camara.getVideoTracks()[0];
        const s = vt && vt.getSettings ? vt.getSettings() : {};
        return { ancho: s.width || null, alto: s.height || null, fps: s.frameRate ? Math.round(s.frameRate) : null,
                 conAudio: G.conAudio, etiqueta: vt ? vt.label : '' };
    }

    function soltarCamara() {
        soltarBomba();
        if (G.camara) G.camara.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        G.camara = null;
    }

    // Soltar la cámara a propósito. Grabando, el video queda congelado hasta
    // que se conecte otra (conectar() de nuevo).
    function desconectar() {
        soltarCamara();
        G.conectada = false;
        emitir('estado', estado());
    }

    // Si la placa vuelve a aparecer (se enchufó de nuevo), se reconecta sola.
    async function alCambiarDispositivos() {
        if (G.conectada || !G.pedido || G.desconectadaEn == null) return;
        const { video } = await listarEntradas();
        const id = G.pedido.videoId;
        if (!id || video.some(v => v.id === id)) {
            try { await conectar(G.pedido); } catch (_) { /* reintenta en el próximo cambio */ }
        }
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', alCambiarDispositivos);
    }

    // ── Tubería de grabación ─────────────────
    function armarTuberia() {
        const pistas = [];
        if (modo === 'generador') {
            G.generador = new MediaStreamTrackGenerator({ kind: 'video' });
            G.escritor = G.generador.writable.getWriter();
            pistas.push(G.generador);
        } else if (modo === 'lienzo') {
            const s = infoCamara();
            G.lienzo = document.createElement('canvas');
            G.lienzo.width = s.ancho || 1280;
            G.lienzo.height = s.alto || 720;
            G.lienzoVideo = document.createElement('video');
            G.lienzoVideo.muted = true;
            G.lienzoVideo.playsInline = true;
            const ctx = G.lienzo.getContext('2d');
            const fps = s.fps || 30;
            // setInterval y no requestAnimationFrame: con la ventana atrás,
            // rAF se frena y el video quedaría a saltos.
            G.lienzoTimer = setInterval(() => {
                const v = G.lienzoVideo;
                if (v.readyState >= 2) {
                    if (G.t0 == null && G.grabando) marcarCero();
                    ctx.drawImage(v, 0, 0, G.lienzo.width, G.lienzo.height);
                }
            }, 1000 / fps);
            pistas.push(G.lienzo.captureStream(fps).getVideoTracks()[0]);
        } else {
            pistas.push(...G.camara.getVideoTracks());
        }
        if (G.conAudio) {
            if (modo === 'directo') {
                pistas.push(...G.camara.getAudioTracks());
            } else {
                const AC = window.AudioContext || window.webkitAudioContext;
                G.audioCtx = new AC();
                G.audioDest = G.audioCtx.createMediaStreamDestination();
                pistas.push(...G.audioDest.stream.getAudioTracks());
            }
        }
        return new MediaStream(pistas);
    }

    function marcarCero() {
        G.t0 = performance.now();
        emitir('inicio', { ruta: G.ruta });
        emitir('estado', estado());
    }

    // Conecta la cámara de ahora a la grabación en curso.
    function enchufarAGrabacion() {
        if (!G.camara) return;
        soltarBomba();
        const vt = G.camara.getVideoTracks()[0];
        if (G.audioCtx && G.audioDest && G.camara.getAudioTracks().length) {
            G.audioFuente = G.audioCtx.createMediaStreamSource(new MediaStream(G.camara.getAudioTracks()));
            G.audioFuente.connect(G.audioDest);
            if (G.audioCtx.state === 'suspended') G.audioCtx.resume().catch(() => {});
        }
        if (modo === 'lienzo') {
            G.lienzoVideo.srcObject = G.camara;
            G.lienzoVideo.play().catch(() => {});
            return;
        }
        if (modo !== 'generador' || !vt) return;
        const lector = new MediaStreamTrackProcessor({ track: vt }).readable.getReader();
        const bomba = { vivo: true, lector };
        G.bomba = bomba;
        let lienzoEscala = null;
        (async () => {
            while (bomba.vivo) {
                let r;
                try { r = await lector.read(); } catch (_) { break; }
                if (r.done) break;
                let cuadro = r.value;
                if (!bomba.vivo || !G.escritor) { cuadro.close(); break; }
                // El encoder arrancó con el tamaño del primer cuadro: una
                // cámara nueva con otra resolución se escala a ese tamaño en
                // vez de cambiarlo a mitad del archivo.
                if (!G.tamano) G.tamano = { w: cuadro.displayWidth, h: cuadro.displayHeight };
                else if (cuadro.displayWidth !== G.tamano.w || cuadro.displayHeight !== G.tamano.h) {
                    try {
                        if (!lienzoEscala) lienzoEscala = new OffscreenCanvas(G.tamano.w, G.tamano.h);
                        lienzoEscala.getContext('2d').drawImage(cuadro, 0, 0, G.tamano.w, G.tamano.h);
                        const escalado = new VideoFrame(lienzoEscala, { timestamp: cuadro.timestamp });
                        cuadro.close();
                        cuadro = escalado;
                    } catch (_) { /* va sin escalar */ }
                }
                if (G.t0 == null && G.grabando) marcarCero();
                try { await G.escritor.write(cuadro); } catch (_) { try { cuadro.close(); } catch (__) {} break; }
            }
        })();
    }

    function soltarBomba() {
        if (G.bomba) {
            G.bomba.vivo = false;
            try { G.bomba.lector.cancel(); } catch (_) {}
            G.bomba = null;
        }
        if (G.audioFuente) {
            try { G.audioFuente.disconnect(); } catch (_) {}
            G.audioFuente = null;
        }
    }

    function desarmarTuberia() {
        soltarBomba();
        if (G.escritor) { try { G.escritor.close(); } catch (_) {} G.escritor = null; }
        if (G.generador) { try { G.generador.stop(); } catch (_) {} G.generador = null; }
        if (G.lienzoTimer) { clearInterval(G.lienzoTimer); G.lienzoTimer = null; }
        if (G.lienzoVideo) { G.lienzoVideo.srcObject = null; G.lienzoVideo = null; }
        G.lienzo = null;
        if (G.audioCtx) { G.audioCtx.close().catch(() => {}); G.audioCtx = null; G.audioDest = null; }
        G.tamano = null;
    }

    // ── Grabación ────────────────────────────
    /**
     * Arranca a grabar al disco. El segundo 0 del video es el primer cuadro
     * que llega (evento 'inicio'): hasta ahí vAhora() es null.
     */
    async function grabar(nombreProvisorio) {
        if (G.grabando) return { ruta: G.ruta };
        if (!G.camara) throw new Error('No hay cámara conectada');
        if (!destino) throw new Error('Falta el destino de la grabación');

        G.mime = elegirFormato();
        const r = await destino.iniciar(nombreProvisorio || ('Partido ' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')), G.mime);
        G.ruta = r && r.ruta;
        G.bytes = 0;
        G.vEscrito = 0;
        G.t0 = null;
        G.errorDisco = null;
        G.ultima = null;
        G.cola = Promise.resolve();
        if (destino.onError && !G.quitarErrorDestino) {
            G.quitarErrorDestino = destino.onError(err => fallaDisco(err));
        }

        const salida = armarTuberia();
        const opc = { videoBitsPerSecond: bits, audioBitsPerSecond: 128000, videoKeyFrameIntervalDuration: 1000 };
        if (G.mime) opc.mimeType = G.mime;
        try {
            G.rec = new MediaRecorder(salida, opc);
        } catch (err) {
            desarmarTuberia();
            try { await destino.descartar(); } catch (_) {}
            throw err;
        }
        G.mime = G.rec.mimeType || G.mime;

        G.rec.ondataavailable = e => {
            if (!e.data || !e.data.size) return;
            const hasta = vAhora() || 0;
            const blob = e.data;
            // En fila y no en paralelo: leer el Blob es asincrónico, y dos
            // lecturas sueltas pueden terminar al revés y escribir el archivo
            // desordenado. Un video con los trozos cambiados de lugar no se
            // abre en ningún lado.
            G.cola = G.cola.then(async () => {
                let u8 = new Uint8Array(await blob.arrayBuffer());
                if (G.mime.indexOf('mp4') >= 0) u8 = repararFragmento(u8);
                const res = await destino.trozo(u8);
                G.bytes = (res && res.bytes) || (G.bytes + u8.length);
                G.vEscrito = Math.max(G.vEscrito, hasta);
                emitir('trozo', { bytes: G.bytes, vEscrito: G.vEscrito });
            }).catch(err => fallaDisco(err));
        };
        G.rec.onerror = e => emitir('error', { tipo: 'grabacion', mensaje: (e.error && e.error.message) || String(e.error || e) });

        G.grabando = true;
        G.rec.start(trozoMs);
        if (modo === 'directo') marcarCero();   // sin tubería no hay "primer cuadro" que mirar
        enchufarAGrabacion();
        emitir('estado', estado());
        return { ruta: G.ruta, mime: G.mime };
    }

    // El disco falló (lleno, desenchufado). No se corta nada: la codificación
    // sigue, y se avisa una vez (la pantalla lo muestra en rojo).
    function fallaDisco(err) {
        const mensaje = (err && err.message) || String(err);
        const primera = !G.errorDisco;
        G.errorDisco = mensaje;
        if (primera) emitir('error', { tipo: 'disco', mensaje });
        emitir('estado', estado());
    }

    function detener() {
        if (G.deteniendo) return G.deteniendo;
        if (!G.grabando) return Promise.resolve(G.ultima);
        G.deteniendo = (async () => {
            const vFinal = vAhora();
            await new Promise(res => {
                G.rec.onstop = res;
                try { G.rec.stop(); } catch (_) { res(); }
            });
            G.grabando = false;
            // El último ondataavailable llega pegado al onstop: se le da
            // lugar, y después se espera a que la fila de escritura se vacíe.
            // Cerrar el archivo antes le cortaría la cola al partido.
            await new Promise(r => setTimeout(r, 300));
            await G.cola;
            let res = null;
            try { res = await destino.finalizar(); } catch (err) { fallaDisco(err); }
            G.ultima = res ? { ...res, duracion: vFinal } : null;
            G.rec = null;
            desarmarTuberia();
            if (G.quitarErrorDestino) { try { G.quitarErrorDestino(); } catch (_) {} G.quitarErrorDestino = null; }
            G.deteniendo = null;
            G.vEscrito = vFinal || G.vEscrito;
            emitir('estado', estado());
            return G.ultima;
        })();
        return G.deteniendo;
    }

    async function descartar() {
        if (G.grabando) {
            try { G.rec.stop(); } catch (_) {}
            G.grabando = false;
            G.rec = null;
            await G.cola.catch(() => {});
        }
        desarmarTuberia();
        try { await destino.descartar(); } catch (_) {}
        G.ultima = null;
        emitir('estado', estado());
    }

    // Segundo del video que se está grabando ahora, o null.
    function vAhora() {
        if (!G.grabando || G.t0 == null) return null;
        return (performance.now() - G.t0) / 1000;
    }

    function estado() {
        return {
            conectada: G.conectada,
            desconectada: G.desconectadaEn != null,
            grabando: G.grabando,
            deteniendo: !!G.deteniendo,
            modo,
            mime: G.mime,
            ruta: G.ruta,
            bytes: G.bytes,
            vAhora: vAhora(),
            vEscrito: G.vEscrito,
            errorDisco: G.errorDisco,
            ultima: G.ultima,
            ...infoCamara()
        };
    }

    function destruir() {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
            navigator.mediaDevices.removeEventListener('devicechange', alCambiarDispositivos);
        }
        if (G.grabando) { try { G.rec.stop(); } catch (_) {} }
        desarmarTuberia();
        soltarCamara();
        oyentes.clear();
    }

    return {
        conectar,
        desconectar,
        grabar,
        detener,
        descartar,
        vAhora,
        vEscrito: () => G.vEscrito,
        vistaPrevia: () => G.camara,
        estado,
        ponerCalidad(c) { bits = bitsDeCalidad(c); },
        on(ev, cb) {
            if (!oyentes.has(ev)) oyentes.set(ev, []);
            oyentes.get(ev).push(cb);
            return () => oyentes.set(ev, (oyentes.get(ev) || []).filter(x => x !== cb));
        },
        destruir
    };
}

// ── El último fragmento ──────────────────────
// Al parar, el MP4 de Chromium termina con un fragmento cuya pista de audio
// viene vacía (un 'trun' con 0 muestras). ffmpeg 6 lo tolera, pero el
// ffprobe 4 que trae la app (tv.video.info) y demultiplexores más viejos
// rechazan el archivo ENTERO por eso ("error reading header"). Probado con
// una grabación de 3 min: sin ese traf vacío, ffprobe 4 lo lee completo.
//
// repararFragmento() saca de cada 'moof' los 'traf' sin muestras y corrige
// los tamaños y el data_offset de los que quedan. Solo toca un trozo que es
// una secuencia completa de cajas y cuyas pistas usan el moof como base
// (lo que escribe Chromium); ante cualquier otra cosa devuelve el trozo tal
// cual: un archivo que un reproductor viejo no abre es mejor que uno roto.
const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const tipoCaja = (b, i) => String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
function ponerU32(b, i, v) { b[i] = v >>> 24; b[i + 1] = (v >>> 16) & 255; b[i + 2] = (v >>> 8) & 255; b[i + 3] = v & 255; }

function hijos(b, desde, hasta) {
    const out = [];
    for (let i = desde; i < hasta;) {
        if (i + 8 > hasta) return null;
        const t = u32(b, i);
        if (t < 8 || i + t > hasta) return null;
        out.push({ tipo: tipoCaja(b, i), ini: i, fin: i + t });
        i += t;
    }
    return out;
}

function moofReparado(b, moof) {
    const cajas = hijos(b, moof.ini + 8, moof.fin);
    if (!cajas) return null;
    const trafs = cajas.filter(c => c.tipo === 'traf');
    const info = [];
    for (const t of trafs) {
        const hs = hijos(b, t.ini + 8, t.fin);
        if (!hs) return null;
        const tfhd = hs.find(h => h.tipo === 'tfhd');
        const truns = hs.filter(h => h.tipo === 'trun');
        if (!tfhd || !truns.length) return null;
        const fl = u32(b, tfhd.ini + 8) & 0xffffff;
        // Base = el moof (default-base-is-moof, sin base-data-offset): solo así
        // se sabe cuánto correr el data_offset.
        if (!(fl & 0x020000) || (fl & 0x000001)) return null;
        const muestras = truns.reduce((n, r) => n + u32(b, r.ini + 12), 0);
        info.push({ caja: t, truns, vacio: muestras === 0 });
    }
    const quedan = info.filter(x => !x.vacio);
    if (quedan.length === info.length || !quedan.length) return null;
    const quitar = info.filter(x => x.vacio).reduce((n, x) => n + (x.caja.fin - x.caja.ini), 0);
    const partes = [];
    let i = moof.ini;
    info.filter(x => x.vacio).forEach(x => { partes.push(b.slice(i, x.caja.ini)); i = x.caja.fin; });
    partes.push(b.slice(i, moof.fin));
    const nuevo = new Uint8Array(moof.fin - moof.ini - quitar);
    let p = 0;
    partes.forEach(x => { nuevo.set(x, p); p += x.length; });
    ponerU32(nuevo, 0, nuevo.length);
    // El data_offset cuenta desde el principio del moof: se corre lo quitado.
    const base = moof.ini;
    const corrido = pos => {
        let q = pos - base;
        info.filter(x => x.vacio && x.caja.fin <= pos).forEach(x => { q -= x.caja.fin - x.caja.ini; });
        return q;
    };
    for (const x of quedan) {
        for (const r of x.truns) {
            if (!(u32(b, r.ini + 8) & 0x000001)) continue;
            const donde = corrido(r.ini + 16);
            ponerU32(nuevo, donde, u32(b, r.ini + 16) - quitar);
        }
    }
    return nuevo;
}

export function repararFragmento(trozo) {
    const b = trozo instanceof Uint8Array ? trozo : new Uint8Array(trozo);
    const cajas = hijos(b, 0, b.length);
    if (!cajas || !cajas.some(c => c.tipo === 'moof')) return b;
    let cambio = false;
    const partes = cajas.map(c => {
        if (c.tipo !== 'moof') return b.subarray(c.ini, c.fin);
        const r = moofReparado(b, c);
        if (!r) return b.subarray(c.ini, c.fin);
        cambio = true;
        return r;
    });
    if (!cambio) return b;
    const out = new Uint8Array(partes.reduce((n, x) => n + x.length, 0));
    let p = 0;
    partes.forEach(x => { out.set(x, p); p += x.length; });
    return out;
}

export function formatoBytes(b) {
    if (!b) return '0 MB';
    return b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : Math.round(b / 1048576) + ' MB';
}
