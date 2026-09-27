// Línea de tiempo tipo matriz: una fila por categoría, una barra por evento.
//
// Va en un <canvas> y no en un div por barra: con 800 eventos en dos horas,
// 800 nodos que se reubican en cada zoom traban el scroll. El canvas se
// redibuja solo cuando cambia algo que se ve (datos, filtro, zoom, scroll,
// selección, arrastre); el cabezal es un div aparte que se corre con un
// transform, así que seguir al video no redibuja nada.
//
// El scroll es nativo: un div transparente encima del canvas, con un
// "relleno" del tamaño total, da las barras de desplazamiento y la rueda;
// el canvas mide lo que se ve y se dibuja corrido según scrollLeft/Top.

import { h } from './comun.js';
import { esZoomRueda } from '../../ui/plataforma.js';   // ⌘ en Mac, Ctrl en Windows (Agente 7)
import { formatoTiempo, pasoDeRegla, zoomEn, barrasEn } from './logica.js';

const REGLA = 24;       // alto de la regla, px
const FILA = 24;        // alto de cada fila
const BORDE_PX = 5;     // cuánto cerca del borde de una barra agarra para estirar

export function crearMatriz({ alSaltar, alClicBarra, alDobleClic, alEditarBorde, alClicFila } = {}) {
    const canvas = h('canvas', { class: 'tv-base-matriz__lienzo' });
    const relleno = h('div', { class: 'tv-base-matriz__relleno' });
    const scroller = h('div', { class: 'tv-base-matriz__scroll', tabindex: '-1' }, relleno);
    const cabezal = h('div', { class: 'tv-base-matriz__cabezal' });
    const el = h('div', { class: 'tv-base-matriz' }, canvas, cabezal, scroller);

    let filas = [];
    let duracion = 60;
    let pxPorSeg = 0;          // 0 = todavía no se ajustó al ancho
    let anchoEtiquetas = 130;
    let seleccion = new Set();
    let activo = null;
    let tCabezal = 0;
    let arrastre = null;       // { barra, lado:'desde'|'hasta', desde, hasta, x0, movio }
    let colores = {};
    let pendiente = 0;
    let ancho = 0, alto = 0;

    const ctx2d = canvas.getContext('2d');

    function leerColores() {
        const cs = getComputedStyle(el);
        const v = (n, porDefecto) => (cs.getPropertyValue(n) || '').trim() || porDefecto;
        colores = {
            fondo: v('--tv-panel', '#161920'), fila2: v('--tv-panel-2', '#1e222b'),
            borde: v('--tv-borde', '#2d323d'), texto: v('--tv-texto', '#e7e9ee'),
            texto2: v('--tv-texto-2', '#9ba2b0'), acento: v('--tv-acento', '#5aa9ff'),
            fuente: v('--tv-fuente', 'system-ui')
        };
    }

    function medirEtiquetas() {
        ctx2d.font = `12px ${colores.fuente}`;
        const mas = filas.reduce((m, f) => Math.max(m, ctx2d.measureText(f.nombre).width), 60);
        anchoEtiquetas = Math.min(200, Math.ceil(mas) + 30);
    }

    function anchoUtil() { return Math.max(50, ancho - anchoEtiquetas); }

    function ajustarAlAncho() {
        if (ancho > 0) pxPorSeg = anchoUtil() / Math.max(1, duracion);
    }

    function actualizarRelleno() {
        relleno.style.width = (anchoEtiquetas + duracion * pxPorSeg + 40) + 'px';
        relleno.style.height = (REGLA + filas.length * FILA + 8) + 'px';
    }

    function pedirDibujo() {
        if (!pendiente) pendiente = requestAnimationFrame(dibujar);
    }

    function redimensionar() {
        const r = el.getBoundingClientRect();
        ancho = Math.floor(r.width);
        alto = Math.floor(r.height);
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, ancho * dpr);
        canvas.height = Math.max(1, alto * dpr);
        canvas.style.width = ancho + 'px';
        canvas.style.height = alto + 'px';
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!pxPorSeg) ajustarAlAncho();
        actualizarRelleno();
        moverCabezal();
        dibujar();
    }

    // x de pantalla (relativa a la matriz) ↔ segundo del video
    const xDe = t => anchoEtiquetas + t * pxPorSeg - scroller.scrollLeft;
    const tDe = x => (x - anchoEtiquetas + scroller.scrollLeft) / pxPorSeg;

    function dibujar() {
        pendiente = 0;
        if (!ancho || !alto) return;
        const c = ctx2d;
        const sl = scroller.scrollLeft, st = scroller.scrollTop;
        c.clearRect(0, 0, ancho, alto);
        c.fillStyle = colores.fondo;
        c.fillRect(0, 0, ancho, alto);

        const t0 = Math.max(0, tDe(anchoEtiquetas));
        const t1 = tDe(ancho);

        // Filas
        c.save();
        c.beginPath(); c.rect(0, REGLA, ancho, alto - REGLA); c.clip();
        const primera = Math.max(0, Math.floor(st / FILA));
        const ultima = Math.min(filas.length - 1, Math.ceil((st + alto - REGLA) / FILA));
        for (let i = primera; i <= ultima; i++) {
            const f = filas[i];
            const y = REGLA + i * FILA - st;
            if (i % 2) { c.fillStyle = colores.fila2; c.fillRect(anchoEtiquetas, y, ancho, FILA); }
            // Barras de la fila, solo las que se ven
            for (const b of f.barras) {
                if (b.hasta < t0) continue;
                if (b.desde > t1) break;
                const esArr = arrastre && arrastre.barra === b;
                const d = esArr ? arrastre.desde : b.desde, hh = esArr ? arrastre.hasta : b.hasta;
                const x = anchoEtiquetas + d * pxPorSeg - sl;
                const w = Math.max(2, (hh - d) * pxPorSeg);
                c.fillStyle = b.color;
                c.globalAlpha = seleccion.size && !seleccion.has(b.ev.id) ? 0.55 : 1;
                redondeado(c, x, y + 4, w, FILA - 8, 3);
                c.fill();
                c.globalAlpha = 1;
                if (seleccion.has(b.ev.id) || activo === b.ev.id) {
                    c.lineWidth = 2;
                    c.strokeStyle = activo === b.ev.id ? colores.texto : colores.acento;
                    redondeado(c, x - 1, y + 3, w + 2, FILA - 6, 4);
                    c.stroke();
                }
            }
        }
        c.restore();

        // Columna de nombres, fija a la izquierda
        c.fillStyle = colores.fondo;
        c.fillRect(0, REGLA, anchoEtiquetas, alto - REGLA);
        c.save();
        c.beginPath(); c.rect(0, REGLA, anchoEtiquetas, alto - REGLA); c.clip();
        c.font = `12px ${colores.fuente}`;
        c.textBaseline = 'middle';
        for (let i = primera; i <= ultima; i++) {
            const f = filas[i];
            const y = REGLA + i * FILA - st;
            c.fillStyle = f.color;
            redondeado(c, 8, y + 7, 10, 10, 2); c.fill();
            c.fillStyle = colores.texto;
            c.fillText(recortar(c, f.nombre, anchoEtiquetas - 34), 24, y + FILA / 2);
            c.fillStyle = colores.texto2;
            c.textAlign = 'right';
            c.fillText(String(f.barras.length), anchoEtiquetas - 6, y + FILA / 2);
            c.textAlign = 'left';
        }
        c.restore();
        c.fillStyle = colores.borde;
        c.fillRect(anchoEtiquetas - 1, REGLA, 1, alto - REGLA);

        // Regla
        c.fillStyle = colores.fila2;
        c.fillRect(0, 0, ancho, REGLA);
        c.fillStyle = colores.borde;
        c.fillRect(0, REGLA - 1, ancho, 1);
        const paso = pasoDeRegla(pxPorSeg);
        c.font = `11px ${colores.fuente}`;
        c.textBaseline = 'middle';
        c.save();
        c.beginPath(); c.rect(anchoEtiquetas, 0, ancho, REGLA); c.clip();
        for (let t = Math.floor(t0 / paso) * paso; t <= t1; t += paso) {
            const x = Math.round(xDe(t)) + 0.5;
            c.fillStyle = colores.borde;
            c.fillRect(x, REGLA - 7, 1, 7);
            c.fillStyle = colores.texto2;
            c.fillText(formatoTiempo(t), x + 4, REGLA / 2);
        }
        c.restore();
        c.fillStyle = colores.texto2;
        c.fillText(filas.reduce((n, f) => n + f.barras.length, 0) + ' eventos', 8, REGLA / 2);
    }

    function moverCabezal() {
        const x = xDe(tCabezal);
        cabezal.hidden = x < anchoEtiquetas || x > ancho;
        cabezal.style.transform = `translateX(${Math.round(x)}px)`;
    }

    // ── Mouse ──
    function aQue(e) {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (y < REGLA) return { zona: 'regla', t: tDe(x), x };
        const i = Math.floor((y - REGLA + scroller.scrollTop) / FILA);
        const fila = filas[i];
        if (!fila) return { zona: 'nada' };
        if (x < anchoEtiquetas) return { zona: 'nombre', fila };
        const t = tDe(x);
        const tol = BORDE_PX / pxPorSeg;
        const cerca = barrasEn(fila, t, tol);
        if (!cerca.length) return { zona: 'fila', fila, t };
        // Preferir la que tiene el borde más cerca; si no, la más corta
        let mejor = null;
        for (const b of cerca) {
            const dDesde = Math.abs(xDe(b.desde) - x), dHasta = Math.abs(xDe(b.hasta) - x);
            const lado = dHasta <= BORDE_PX && (b.hasta - b.desde) * pxPorSeg > 6 ? 'hasta'
                : dDesde <= BORDE_PX && (b.hasta - b.desde) * pxPorSeg > 6 ? 'desde' : null;
            const cand = { barra: b, lado, d: Math.min(dDesde, dHasta) };
            if (!mejor || (cand.lado && !mejor.lado) || (!!cand.lado === !!mejor.lado && b.hasta - b.desde < mejor.barra.hasta - mejor.barra.desde)) mejor = cand;
        }
        return { zona: 'barra', fila, t, ...mejor };
    }

    scroller.addEventListener('pointermove', e => {
        if (arrastre) {
            const d = (e.clientX - arrastre.x0) / pxPorSeg;
            if (Math.abs(e.clientX - arrastre.x0) > 2) arrastre.movio = true;
            const b = arrastre.barra;
            if (arrastre.lado === 'desde') arrastre.desde = Math.max(0, Math.min(b.hasta - 0.1, b.desde + d));
            else arrastre.hasta = Math.max(b.desde + 0.1, b.hasta + d);
            pedirDibujo();
            return;
        }
        const q = aQue(e);
        scroller.style.cursor = q.zona === 'barra' && q.lado && alEditarBorde ? 'ew-resize'
            : q.zona === 'barra' || q.zona === 'regla' || q.zona === 'nombre' ? 'pointer' : 'default';
        scroller.title = q.zona === 'barra'
            ? `${q.barra.ev.nombre} · ${formatoTiempo(q.barra.desde)}–${formatoTiempo(q.barra.hasta)}`
            : '';
    });

    scroller.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const r = scroller.getBoundingClientRect();
        // Clic sobre las barras de desplazamiento nativas: que scrolleen
        if (e.clientX - r.left > scroller.clientWidth || e.clientY - r.top > scroller.clientHeight) return;
        const q = aQue(e);
        if (q.zona === 'regla') {
            if (alSaltar) alSaltar(Math.max(0, q.t));
            // Arrastrar por la regla = buscar
            scroller.setPointerCapture(e.pointerId);
            const mover = ev => { const rr = el.getBoundingClientRect(); alSaltar && alSaltar(Math.max(0, tDe(ev.clientX - rr.left))); };
            scroller.addEventListener('pointermove', mover);
            scroller.addEventListener('pointerup', () => scroller.removeEventListener('pointermove', mover), { once: true });
            return;
        }
        if (q.zona === 'nombre') { if (alClicFila) alClicFila(q.fila.nombre, e); return; }
        if (q.zona !== 'barra') return;
        if (q.lado && alEditarBorde) {
            scroller.setPointerCapture(e.pointerId);
            arrastre = { barra: q.barra, lado: q.lado, desde: q.barra.desde, hasta: q.barra.hasta, x0: e.clientX, movio: false };
            scroller.addEventListener('pointerup', () => {
                const a = arrastre;
                arrastre = null;
                if (a.movio && (a.desde !== a.barra.desde || a.hasta !== a.barra.hasta)) {
                    alEditarBorde(a.barra.ev, { desde: round2(a.desde), hasta: round2(a.hasta) });
                } else if (alClicBarra) alClicBarra(a.barra.ev, e);
                pedirDibujo();
            }, { once: true });
            return;
        }
        if (alClicBarra) alClicBarra(q.barra.ev, e);
    });

    scroller.addEventListener('dblclick', e => {
        const q = aQue(e);
        if (q.zona === 'barra' && alDobleClic) alDobleClic(q.barra.ev);
    });

    scroller.addEventListener('wheel', e => {
        // Ctrl+rueda en Windows; ⌘+rueda y pellizco del trackpad en Mac.
        if (!esZoomRueda(e)) return;       // sin Ctrl/⌘: scroll nativo
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const xm = Math.max(0, e.clientX - r.left - anchoEtiquetas);
        const z = zoomEn({ pxPorSeg, scroll: scroller.scrollLeft }, e.deltaY < 0 ? 1.25 : 0.8, xm,
            { min: anchoUtil() / Math.max(1, duracion) / 2, max: 200 });
        pxPorSeg = z.pxPorSeg;
        actualizarRelleno();
        scroller.scrollLeft = z.scroll;
        moverCabezal();
        pedirDibujo();
    }, { passive: false });

    scroller.addEventListener('scroll', () => { moverCabezal(); pedirDibujo(); });

    const obs = new ResizeObserver(() => redimensionar());
    obs.observe(el);
    leerColores();

    return {
        el,
        // filas = agruparMatriz(...). Mantiene el zoom si ya había uno.
        poner(nuevas, { duracion: dur } = {}) {
            filas = nuevas || [];
            const antes = duracion;
            const maxBarra = filas.reduce((m, f) => Math.max(m, ...f.barras.map(b => b.hasta)), 0);
            duracion = Math.max(10, dur || 0, maxBarra);
            leerColores();
            medirEtiquetas();
            if (!pxPorSeg || antes !== duracion && pxPorSeg * antes <= anchoUtil() + 1) ajustarAlAncho();
            actualizarRelleno();
            moverCabezal();
            pedirDibujo();
        },
        marcar(sel, act = null) {
            seleccion = new Set(sel || []);
            activo = act;
            pedirDibujo();
        },
        // Llamado muchas veces por segundo mientras reproduce: solo mueve el
        // div. Si el cabezal se va de la vista reproduciendo, la vista lo sigue.
        cabezal(t, siguiendo = false) {
            tCabezal = t;
            const x = xDe(t);
            if (siguiendo && !arrastre && (x > ancho - 20 || x < anchoEtiquetas)) {
                scroller.scrollLeft = Math.max(0, t * pxPorSeg - anchoUtil() * 0.15);
            }
            moverCabezal();
        },
        // Que el evento se vea (al elegirlo en la lista)
        mostrar(t) {
            const x = xDe(t);
            if (x < anchoEtiquetas || x > ancho - 20) scroller.scrollLeft = Math.max(0, t * pxPorSeg - anchoUtil() * 0.3);
        },
        zoom(factor) {
            if (factor === 0) { ajustarAlAncho(); scroller.scrollLeft = 0; }
            else {
                const z = zoomEn({ pxPorSeg, scroll: scroller.scrollLeft }, factor, xDe(tCabezal) - anchoEtiquetas,
                    { min: anchoUtil() / Math.max(1, duracion) / 2, max: 200 });
                pxPorSeg = z.pxPorSeg;
                actualizarRelleno();
                scroller.scrollLeft = z.scroll;
            }
            actualizarRelleno();
            moverCabezal();
            pedirDibujo();
        },
        tema() { leerColores(); pedirDibujo(); },
        destruir() { obs.disconnect(); cancelAnimationFrame(pendiente); el.remove(); }
    };
}

function redondeado(c, x, y, w, hh, r) {
    r = Math.min(r, w / 2, hh / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + hh, r);
    c.arcTo(x + w, y + hh, x, y + hh, r);
    c.arcTo(x, y + hh, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function recortar(c, texto, max) {
    if (c.measureText(texto).width <= max) return texto;
    let s = texto;
    while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
}

const round2 = n => Math.round(n * 100) / 100;
