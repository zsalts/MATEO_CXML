// Piezas chicas que usan todas las pestañas de la rama Base de datos.

import { escapar } from '../../ui/util.js';
import { iconoHTML, crearIcono } from '../../ui/iconos.js';
import { hayModalAbierto } from '../../ui/dialogos.js';

export { escapar, iconoHTML, crearIcono };

// h('div', {class: 'x', onclick}, hijo, 'texto', …): armar DOM sin innerHTML,
// así ningún texto de la base se interpreta como HTML.
export function h(tag, attrs = {}, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;             // solo con texto ya escapado
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
    }
    hijos.flat().forEach(x => {
        if (x === null || x === undefined || x === false) return;
        el.appendChild(x instanceof Node ? x : document.createTextNode(String(x)));
    });
    return el;
}

// replaceChildren convierte null en el texto "null": esto saltea lo vacío,
// igual que h(), para armar listas con partes opcionales.
export function llenar(el, ...hijos) {
    el.replaceChildren(...hijos.flat().filter(x => x !== null && x !== undefined && x !== false));
    return el;
}

export function boton(texto, { icono, clase = '', titulo, alHacer, deshabilitado } = {}) {
    const b = h('button', {
        type: 'button', class: 'tv-btn ' + clase, title: titulo || null,
        disabled: !!deshabilitado, onclick: alHacer
    });
    if (icono) b.appendChild(crearIcono(icono));
    if (texto) b.appendChild(h('span', {}, texto));
    return b;
}

export function vacio(icono, titulo, texto, ...acciones) {
    return h('div', { class: 'tv-vacio' }, crearIcono(icono),
        h('div', { class: 'tv-vacio__titulo' }, titulo),
        texto ? h('div', { class: 'tv-chica' }, texto) : null,
        acciones.length ? h('div', { class: 'tv-base-fila' }, ...acciones) : null);
}

// ¿La tecla es para un campo de texto? Entonces los atajos no la tocan.
export function esCampo(el) {
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return !['button', 'checkbox', 'radio', 'range', 'color'].includes(el.type);
}

// Los atajos de la rama no corren con un modal abierto ni escribiendo.
export function tecladoLibre(e) {
    return !hayModalAbierto() && !esCampo(e.target) && !e.altKey;
}

// Envuelve una llamada a la API: si falla, aviso de error con el motivo y
// devuelve undefined. Así un error de disco no deja la pantalla a medias.
export async function intentar(ctx, fn, mensaje = 'No se pudo completar') {
    return (await hacer(ctx, fn, mensaje)).valor;
}

// Igual, pero dice si anduvo: muchas llamadas de la API no devuelven nada,
// y "no devolvió nada" no es lo mismo que "falló".
export async function hacer(ctx, fn, mensaje = 'No se pudo completar') {
    try {
        return { ok: true, valor: await fn() };
    } catch (err) {
        console.error('[base]', mensaje, err);
        ctx.ui.aviso(mensaje + ': ' + ((err && err.message) || err), 'error');
        return { ok: false, valor: undefined };
    }
}

// Aviso con "Mostrar en la carpeta". El aviso de src/ui acepta una acción;
// si el ctx es otro y la ignora, el texto igual dice dónde quedó.
export function avisoConCarpeta(ctx, texto, ruta) {
    ctx.ui.aviso(texto, 'ok', ruta ? {
        accion: { texto: 'Mostrar en la carpeta', alHacer: () => ctx.api.archivos.mostrar(ruta) }
    } : {});
}

// Lo del Agente 4 se carga cuando hace falta y sin romper si todavía no está:
// la rama tiene que andar igual (sin miniatura real, sin XML).
const cache = new Map();
export function cargarNucleo(nombre) {
    if (!cache.has(nombre)) {
        cache.set(nombre, import(`../../nucleo/${nombre}.js`).catch(err => {
            console.warn(`[base] no está src/nucleo/${nombre}.js`, err);
            cache.delete(nombre);
            return null;
        }));
    }
    return cache.get(nombre);
}

// Divisor arrastrable entre paneles. `medir()` da el tamaño actual del panel
// que se ajusta y `poner(px)` lo cambia; `signo` -1 cuando el panel está del
// otro lado del divisor (a la derecha o abajo).
export function divisor(eje, { medir, poner, signo = 1, min = 120, max = 2000, alTerminar }) {
    const el = h('div', {
        class: `tv-base-divisor tv-base-divisor--${eje}`, role: 'separator',
        'aria-orientation': eje === 'x' ? 'vertical' : 'horizontal'
    });
    el.addEventListener('pointerdown', e => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('es-activo');
        const inicio = eje === 'x' ? e.clientX : e.clientY;
        const base = medir();
        let valor = base;
        const mover = ev => {
            const d = ((eje === 'x' ? ev.clientX : ev.clientY) - inicio) * signo;
            valor = Math.round(Math.max(min, Math.min(max, base + d)));
            poner(valor);
        };
        const soltar = () => {
            el.removeEventListener('pointermove', mover);
            el.classList.remove('es-activo');
            if (valor !== base && alTerminar) alTerminar(valor);
        };
        el.addEventListener('pointermove', mover);
        el.addEventListener('pointerup', soltar, { once: true });
        el.addEventListener('pointercancel', soltar, { once: true });
    });
    return el;
}

// Las proporciones de los paneles viven en tv.ajustes: se leen una vez y se
// guardan juntas, un rato después del último arrastre.
let disposicion = null;
let guardarLuego = null;
export async function leerDisposicion(api) {
    if (disposicion) return disposicion;
    let aj = {};
    try { aj = (await api.ajustes.leer()) || {}; } catch (_) { /* sin ajustes: valores por defecto */ }
    disposicion = { lista: 260, eventos: 340, matriz: 210, filtrosClips: 240, ...(aj.baseDisposicion || {}) };
    return disposicion;
}
export function guardarDisposicion(api, parcial) {
    disposicion = { ...(disposicion || {}), ...parcial };
    clearTimeout(guardarLuego);
    guardarLuego = setTimeout(() => {
        Promise.resolve(api.ajustes.guardar({ baseDisposicion: disposicion })).catch(() => {});
    }, 400);
}

export async function leerMargen(api) {
    try {
        const aj = await api.ajustes.leer();
        const m = Number(aj && aj.margen);
        return Number.isFinite(m) && m >= 0 ? m : 0;
    } catch (_) { return 0; }
}

export function fechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
