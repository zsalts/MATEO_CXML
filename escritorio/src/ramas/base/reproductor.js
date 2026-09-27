// Reproductor de la base: un <video> con controles propios y una cola de
// tramos que puede saltar de un archivo a otro (playlist de varios partidos).
//
// El fin de cada tramo se vigila con requestAnimationFrame y no con
// 'timeupdate': ese evento llega cada ~250 ms y un clip de 3 s terminaría
// con un cuarto de segundo de más, que en una jugada se nota.

import { h, crearIcono, boton, intentar } from './comun.js';
import { formatoTiempo, pasoCola } from './logica.js';

const VELOCIDADES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const CUADRO = 1 / 30;     // sin saber los fps del archivo, un cuadro de 30p

// Tres íconos que el set de src/ui no trae. Mismo trazo, currentColor.
const TRAZOS = {
    sonido: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mudo: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    completa: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
};
function iconoLocal(nombre) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'tv-icono');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = TRAZOS[nombre];
    return s;
}

export function crearReproductor(ctx, { alTiempo, alCambioCola, alFaltaVideo } = {}) {
    const api = ctx.api;
    const video = h('video', { class: 'tv-base-video', preload: 'auto', playsinline: true });
    const mensaje = h('div', { class: 'tv-base-video__mensaje', hidden: true });
    const pantalla = h('div', { class: 'tv-base-pantalla' }, video, mensaje);

    const btnPlay = h('button', { type: 'button', class: 'tv-btn tv-btn--icono tv-btn--fantasma', title: 'Reproducir / pausa (Espacio)' }, crearIcono('play'));
    const tiempo = h('span', { class: 'tv-base-tiempo tv-numeros' }, '0:00 / 0:00');
    const barra = h('input', { type: 'range', class: 'tv-base-busqueda', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'Posición' });
    const velocidad = h('select', { class: 'tv-campo tv-base-velocidad', title: 'Velocidad' },
        ...VELOCIDADES.map(v => h('option', { value: v, selected: v === 1 }, String(v).replace('.', ',') + '×')));
    const btnMudo = h('button', { type: 'button', class: 'tv-btn tv-btn--icono tv-btn--fantasma tv-btn--chico', title: 'Silenciar (M)' }, iconoLocal('sonido'));
    const volumen = h('input', { type: 'range', class: 'tv-base-volumen', min: 0, max: 1, step: 0.05, value: 1, 'aria-label': 'Volumen' });

    // Cola: "Clip 3 de 12 · Tiro · Lomas vs GEBA"
    const colaTexto = h('span', { class: 'tv-recortar tv-chica' });
    const colaBarra = h('div', { class: 'tv-base-cola', hidden: true },
        boton('', { icono: 'chevron-izq', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma', titulo: 'Anterior (P)', alHacer: () => anterior() }),
        colaTexto,
        boton('', { icono: 'chevron-der', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma', titulo: 'Siguiente (N)', alHacer: () => siguiente() }),
        boton('', { icono: 'cerrar', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma', titulo: 'Salir de la cola', alHacer: () => detenerCola() }));

    const chico = 'tv-btn--icono tv-btn--fantasma';
    const controles = h('div', { class: 'tv-base-controles' },
        barra,
        h('div', { class: 'tv-base-controles__fila' },
            boton('', { icono: 'flecha-izq', clase: chico, titulo: '−5 s (←)', alHacer: () => saltar(-5) }),
            btnPlay,
            boton('', { icono: 'flecha-der', clase: chico, titulo: '+5 s (→)', alHacer: () => saltar(5) }),
            h('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--fantasma tv-mono', title: 'Cuadro anterior (,)', onclick: () => cuadro(-1) }, '‹|'),
            h('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--fantasma tv-mono', title: 'Cuadro siguiente (.)', onclick: () => cuadro(1) }, '|›'),
            tiempo,
            h('span', { class: 'tv-barra__espacio' }),
            btnMudo, volumen, velocidad,
            h('button', { type: 'button', class: 'tv-btn ' + chico, title: 'Pantalla completa (F)', onclick: () => pantallaCompleta() }, iconoLocal('completa'))));

    const el = h('div', { class: 'tv-base-reproductor' }, pantalla, colaBarra, controles);

    let ruta = null;             // archivo cargado
    let fin = null;              // segundo donde frena el tramo actual
    let cola = [];
    let indice = -1;
    let cuadroPedido = 0;
    let arrastrando = false;
    let destruido = false;

    function mostrarMensaje(texto) {
        mensaje.textContent = texto || '';
        mensaje.hidden = !texto;
        pantalla.classList.toggle('es-sin-video', !!texto);
    }

    // Cargar un archivo. Devuelve false si no se puede (sin ruta, movido o
    // borrado): la pantalla sigue andando sin reproductor.
    async function cargar(nueva) {
        if (nueva === ruta && video.src) return !video.error;
        ruta = nueva || null;
        fin = null;
        video.pause();
        if (!ruta) {
            video.removeAttribute('src'); video.load();
            mostrarMensaje('Este partido no tiene video enlazado');
            return false;
        }
        const url = await intentar(ctx, () => api.video.url(ruta), 'No se pudo abrir el video');
        if (destruido || ruta !== nueva) return false;
        if (!url) {
            video.removeAttribute('src'); video.load();
            mostrarMensaje('No se encuentra el video. ¿Se movió o se borró?');
            if (alFaltaVideo) alFaltaVideo(ruta);
            return false;
        }
        mostrarMensaje('');
        video.src = url;
        const ok = await new Promise(res => {
            const listo = () => { limpiar(); res(true); };
            const mal = () => { limpiar(); res(false); };
            const limpiar = () => { video.removeEventListener('loadedmetadata', listo); video.removeEventListener('error', mal); };
            video.addEventListener('loadedmetadata', listo);
            video.addEventListener('error', mal);
        });
        if (!ok && ruta === nueva) {
            mostrarMensaje('No se puede reproducir este video. ¿Se movió o se borró?');
            if (alFaltaVideo) alFaltaVideo(ruta);
        }
        return ok;
    }

    function irA(t) {
        if (!video.src || !Number.isFinite(t)) return;
        const max = Number.isFinite(video.duration) ? video.duration : t;
        video.currentTime = Math.max(0, Math.min(max, t));
        avisarTiempo();
    }

    // Un tramo suelto: arranca en `desde` y frena en `hasta`.
    async function reproducirTramo(r, desde, hasta) {
        if (r !== undefined && r !== ruta && !(await cargar(r))) return false;
        if (!video.src) return false;
        fin = Number.isFinite(hasta) ? hasta : null;
        irA(desde);
        await video.play().catch(() => {});
        return true;
    }

    async function reproducirCola(items, desde = 0) {
        cola = items.slice();
        indice = -1;
        if (!cola.length) { detenerCola(); return; }
        await irACola(desde);
    }

    async function irACola(i) {
        if (i < 0 || i >= cola.length) { detenerCola(true); return; }
        indice = i;
        const it = cola[i];
        pintarCola();
        const ok = await reproducirTramo(it.ruta, it.desde, it.hasta);
        // Un archivo que no abre no frena la playlist: se pasa al que sigue
        if (!ok && indice === i) {
            ctx.ui.aviso(`No se pudo abrir el video de "${it.titulo}": se saltea`, 'error');
            await irACola(pasoCola(cola, i, 1));
        }
    }

    function siguiente() { if (cola.length) irACola(pasoCola(cola, indice, 1)); }
    function anterior() { if (cola.length) irACola(Math.max(0, indice - 1)); }

    function detenerCola(terminada = false) {
        if (terminada) video.pause();
        cola = []; indice = -1; fin = null;
        pintarCola();
    }

    function pintarCola() {
        const hay = indice >= 0 && cola.length > 0;
        colaBarra.hidden = !hay;
        if (hay) colaTexto.textContent = `Clip ${indice + 1} de ${cola.length} · ${cola[indice].titulo}`;
        if (alCambioCola) alCambioCola(hay ? { indice, item: cola[indice], total: cola.length } : null);
    }

    function alternar() {
        if (!video.src) return;
        if (video.paused) {
            // Play después de terminar un tramo: sigue de largo, sin frenar
            if (fin !== null && video.currentTime >= fin - 0.05) fin = null;
            video.play().catch(() => {});
        } else video.pause();
    }

    function saltar(d) { fin = null; irA(video.currentTime + d); }

    function cuadro(dir) {
        if (!video.src) return;
        video.pause();
        fin = null;
        irA(video.currentTime + dir * CUADRO);
        cuadroPedido = dir;
    }

    function ponerVelocidad(v) {
        video.playbackRate = v;
        velocidad.value = String(v);
    }

    function cambiarVelocidad(dir) {
        const i = VELOCIDADES.indexOf(video.playbackRate);
        const j = Math.max(0, Math.min(VELOCIDADES.length - 1, (i < 0 ? 3 : i) + dir));
        ponerVelocidad(VELOCIDADES[j]);
    }

    function pantallaCompleta() {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else el.requestFullscreen().catch(() => {});
    }

    function pintarMudo() {
        btnMudo.replaceChildren(iconoLocal(video.muted || video.volume === 0 ? 'mudo' : 'sonido'));
        btnMudo.title = video.muted ? 'Activar sonido (M)' : 'Silenciar (M)';
    }

    // ── Tiempo: un solo lazo mientras reproduce ──
    let rafId = 0;
    function lazo() {
        rafId = 0;
        if (destruido) return;
        if (fin !== null && video.currentTime >= fin) {
            if (indice >= 0 && indice < cola.length - 1) { irACola(indice + 1); }
            else if (indice >= 0) { video.pause(); fin = null; detenerCola(); }
            else { video.pause(); fin = null; }
        }
        avisarTiempo();
        if (!video.paused) rafId = requestAnimationFrame(lazo);
    }

    function avisarTiempo() {
        const t = video.currentTime || 0;
        const d = Number.isFinite(video.duration) ? video.duration : 0;
        tiempo.textContent = `${formatoTiempo(t)} / ${formatoTiempo(d)}`;
        if (!arrastrando && d) barra.value = String(Math.round(t / d * 1000));
        if (alTiempo) alTiempo(t, !video.paused);
    }

    video.addEventListener('play', () => { btnPlay.replaceChildren(crearIcono('pausa')); if (!rafId) rafId = requestAnimationFrame(lazo); });
    video.addEventListener('pause', () => { btnPlay.replaceChildren(crearIcono('play')); avisarTiempo(); });
    video.addEventListener('seeked', avisarTiempo);
    video.addEventListener('loadedmetadata', avisarTiempo);
    video.addEventListener('volumechange', pintarMudo);
    video.addEventListener('click', alternar);
    video.addEventListener('dblclick', pantallaCompleta);
    btnPlay.addEventListener('click', alternar);
    btnMudo.addEventListener('click', () => { video.muted = !video.muted; });
    volumen.addEventListener('input', () => { video.volume = Number(volumen.value); video.muted = false; });
    velocidad.addEventListener('change', () => ponerVelocidad(Number(velocidad.value)));
    barra.addEventListener('pointerdown', () => { arrastrando = true; });
    barra.addEventListener('input', () => {
        const d = video.duration;
        if (Number.isFinite(d)) { fin = null; irA(Number(barra.value) / 1000 * d); }
    });
    barra.addEventListener('change', () => { arrastrando = false; });
    pintarMudo();
    mostrarMensaje('Elegí un partido o un clip');

    // Teclas del reproductor. Devuelve true si la usó.
    function teclas(e) {
        if (e.ctrlKey || e.metaKey) return false;
        switch (e.key) {
            case ' ': alternar(); return true;
            case 'ArrowLeft': saltar(e.shiftKey ? -1 : -5); return true;
            case 'ArrowRight': saltar(e.shiftKey ? 1 : 5); return true;
            case ',': cuadro(-1); return true;
            case '.': cuadro(1); return true;
            case 'f': case 'F': pantallaCompleta(); return true;
            case 'm': case 'M': video.muted = !video.muted; return true;
            case 'n': case 'N': if (cola.length) { siguiente(); return true; } return false;
            case 'p': case 'P': if (cola.length) { anterior(); return true; } return false;
            case '+': cambiarVelocidad(1); return true;
            case '-': cambiarVelocidad(-1); return true;
            case 'ArrowUp': video.volume = Math.min(1, video.volume + 0.1); volumen.value = video.volume; return true;
            case 'ArrowDown': video.volume = Math.max(0, video.volume - 0.1); volumen.value = video.volume; return true;
            default: return false;
        }
    }

    return {
        el, video,
        cargar, irA, reproducirTramo, reproducirCola, siguiente, anterior, detenerCola, alternar, teclas,
        pausar() { video.pause(); },
        get tiempo() { return video.currentTime || 0; },
        get duracion() { return Number.isFinite(video.duration) ? video.duration : 0; },
        get ruta() { return ruta; },
        get enCola() { return indice >= 0; },
        get cuadroPedido() { return cuadroPedido; },
        mostrarMensaje,
        destruir() {
            destruido = true;
            cancelAnimationFrame(rafId);
            video.pause();
            video.removeAttribute('src');
            video.load();
            el.remove();
        }
    };
}
