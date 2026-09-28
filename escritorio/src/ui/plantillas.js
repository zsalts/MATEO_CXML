// Miniatura de una botonera y el diálogo para elegir con qué plantilla
// capturar. Lo usan el menú principal, la captura en vivo y la del iPad.

import { escapar, fechaCorta, normalizar, plural } from './util.js';
import { iconoHTML } from './iconos.js';
import { modal, aviso } from './dialogos.js';

// Los mismos colores por defecto que defaultColor() de la app del iPad: un
// botón sin color elegido se ve igual acá que allá.
const COLOR_POR_TIPO = {
    event: '#3a8fd6', popup_label: '#f8d022', descriptor: '#fef08a',
    sticky_label: '#fdba74', line: '#4c51bf', possession: '#475569'
};

// Los colores vienen de un archivo importado: solo pasan los que son un
// color de verdad, así no se cuela nada raro en el atributo del SVG.
function colorSeguro(c, porDefecto) {
    const s = String(c || '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(s) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(s) ? s : porDefecto;
}

// Qué se ve en vivo de la pestaña Principal: todo lo que no tiene hoja.
// Las etiquetas emergentes quedan afuera porque en vivo aparecen recién al
// tocar su evento: en la miniatura serían ruido.
function visiblesEnPrincipal(datos) {
    const els = (datos && Array.isArray(datos.elements)) ? datos.elements : [];
    return els.filter(e => e && !e.hoja && e.type !== 'popup_label' &&
                          Number.isFinite(+e.x) && Number.isFinite(+e.y) && +e.w > 0 && +e.h > 0);
}

// "12 botones · 2 pestañas". Cuenta lo que se toca en vivo, no cajas ni textos.
export function resumenPlantilla(datos) {
    const els = (datos && Array.isArray(datos.elements)) ? datos.elements : [];
    const tocables = els.filter(e => ['event', 'descriptor', 'sticky_label', 'line', 'possession', 'counter'].includes(e.type)).length;
    const hojas = (datos && Array.isArray(datos.hojas)) ? datos.hojas.length : 0;
    return plural(tocables, 'botón', 'botones') + (hojas ? ' · ' + plural(hojas, 'pestaña') : '');
}

// Botonera → SVG como texto, con la disposición real a escala. Puro: sirve
// en listas largas sin crear una vista viva por fila.
export function miniaturaSVG(datos, { clase = 'tv-miniatura' } = {}) {
    const els = visiblesEnPrincipal(datos);
    if (!els.length) {
        return `<svg class="${clase}" viewBox="0 0 160 100" aria-hidden="true"><rect x="1" y="1" width="158" height="98" rx="6" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/></svg>`;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach(e => {
        x0 = Math.min(x0, +e.x); y0 = Math.min(y0, +e.y);
        x1 = Math.max(x1, +e.x + +e.w); y1 = Math.max(y1, +e.y + +e.h);
    });
    const m = 12;
    const ancho = x1 - x0 + m * 2, alto = y1 - y0 + m * 2;
    const r = n => Math.round(n * 10) / 10;

    // Contenedores e imágenes primero, como en el iPad: van detrás.
    const orden = e => (e.type === 'container' || e.type === 'image') ? 0 : 1;
    const partes = [...els].sort((a, b) => orden(a) - orden(b)).map(e => {
        const x = r(+e.x - x0 + m), y = r(+e.y - y0 + m), w = r(+e.w), h = r(+e.h);
        switch (e.type) {
            case 'container':
                return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${colorSeguro(e.color, 'currentColor')}" fill-opacity=".10" stroke="currentColor" stroke-opacity=".3"/>`;
            case 'image':
                return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="currentColor" fill-opacity=".12"/>`;
            case 'text':
                return `<rect x="${x}" y="${r(y + h * 0.35)}" width="${r(w * 0.7)}" height="${r(h * 0.3)}" rx="3" fill="currentColor" fill-opacity=".35"/>`;
            case 'counter':
                return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="3"/>`;
            case 'teams': {
                const a = colorSeguro(e.colorA, '#3a8fd6'), b = colorSeguro(e.colorB, '#dc2626');
                return `<rect x="${x}" y="${y}" width="${r(w / 2)}" height="${h}" rx="6" fill="${a}"/><rect x="${r(x + w / 2)}" y="${y}" width="${r(w / 2)}" height="${h}" rx="6" fill="${b}"/>`;
            }
            default:
                return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${colorSeguro(e.color, COLOR_POR_TIPO[e.type] || '#3a8fd6')}"/>`;
        }
    });
    return `<svg class="${clase}" viewBox="0 0 ${r(ancho)} ${r(alto)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${partes.join('')}</svg>`;
}

// La vista real de la botonera, si el Agente 4 ya la dejó (nucleo/
// botonera-vista.js). Si no está o falla, null y se usa la miniatura SVG.
let moduloVista;
async function cargarVista() {
    if (moduloVista === undefined) {
        try { moduloVista = await import('../nucleo/botonera-vista.js'); }
        catch { moduloVista = null; }
    }
    return moduloVista && typeof moduloVista.crearVista === 'function' ? moduloVista : null;
}

// Datos de cada plantilla ya leída. Se invalida por "actualizado": si el
// iPad trajo una versión nueva, se vuelve a leer.
const cacheDatos = new Map();
export async function datosDePlantilla(api, p) {
    const clave = p.id + '|' + (p.actualizado || '');
    if (!cacheDatos.has(clave)) {
        cacheDatos.set(clave, api.plantillas.leer(p.id).then(x => (x && x.datos) || null).catch(() => null));
    }
    return cacheDatos.get(clave);
}

// ─────────────────────────────────────────────
// elegirPlantilla(ctx) → Promise<plantillaId | null>
// ─────────────────────────────────────────────
export async function elegirPlantilla(ctx, { titulo = 'Elegí la plantilla', textoBoton = 'Usar esta' } = {}) {
    const api = ctx.api;
    let lista;
    try { lista = await api.plantillas.listar(); }
    catch (err) { aviso('No se pudieron leer las plantillas: ' + (err && err.message || err), 'error'); return null; }

    if (!lista.length) return sinPlantillas(ctx, titulo);

    const div = document.createElement('div');
    div.className = 'tv-elegir';
    div.innerHTML = `
        <div class="tv-elegir__izq">
            <div class="tv-elegir__buscar">
                ${iconoHTML('buscar')}
                <input class="tv-campo" type="search" placeholder="Buscar plantilla" spellcheck="false" aria-label="Buscar plantilla">
            </div>
            <div class="tv-lista tv-elegir__lista" role="listbox" aria-label="Plantillas"></div>
        </div>
        <div class="tv-elegir__der">
            <div class="tv-elegir__vista"></div>
            <div class="tv-elegir__info">
                <div class="tv-elegir__nombre tv-recortar"></div>
                <div class="tv-elegir__detalle tv-texto-2 tv-chica"></div>
            </div>
        </div>`;

    const buscador = div.querySelector('input');
    const cajaLista = div.querySelector('.tv-elegir__lista');
    const cajaVista = div.querySelector('.tv-elegir__vista');
    const nombre = div.querySelector('.tv-elegir__nombre');
    const detalle = div.querySelector('.tv-elegir__detalle');

    let visibles = lista;
    let elegida = lista[0] ? lista[0].id : null;
    let vistaViva = null;
    let turnoVista = 0;

    function pintarLista() {
        const q = normalizar(buscador.value);
        visibles = q ? lista.filter(p => normalizar(p.nombre).includes(q)) : lista;
        if (!visibles.some(p => p.id === elegida)) elegida = visibles[0] ? visibles[0].id : null;
        cajaLista.innerHTML = visibles.length ? visibles.map(p => `
            <div class="tv-lista__fila tv-elegir__fila" role="option" data-id="${escapar(p.id)}" aria-selected="${p.id === elegida}">
                <span class="tv-elegir__mini" data-mini="${escapar(p.id)}"></span>
                <span class="tv-elegir__texto">
                    <span class="tv-recortar">${escapar(p.nombre)}</span>
                    <span class="tv-texto-2 tv-chica">${escapar(fechaCorta(p.actualizado))}${p.origen ? ' · ' + escapar(p.origen) : ''}</span>
                </span>
            </div>`).join('')
            : `<div class="tv-vacio tv-chica">Ninguna plantilla se llama así.</div>`;
        // Miniaturas: se leen de a una y se pintan cuando llegan.
        visibles.forEach(p => datosDePlantilla(api, p).then(datos => {
            const hueco = cajaLista.querySelector(`[data-mini="${CSS.escape(String(p.id))}"]`);
            if (hueco) hueco.innerHTML = miniaturaSVG(datos);
        }));
        pintarVista();
    }

    async function pintarVista() {
        const turno = ++turnoVista;
        if (vistaViva) { try { vistaViva.destruir(); } catch {} vistaViva = null; }
        const p = visibles.find(x => x.id === elegida);
        cajaVista.innerHTML = '';
        nombre.textContent = p ? p.nombre : '';
        detalle.textContent = '';
        if (!p) return;
        const datos = await datosDePlantilla(api, p);
        if (turno !== turnoVista) return;       // ya eligieron otra mientras leía
        detalle.textContent = datos ? resumenPlantilla(datos) : 'No se pudo leer';
        const mod = await cargarVista();
        if (turno !== turnoVista) return;
        if (mod && datos) {
            try {
                const lienzo = document.createElement('div');
                lienzo.className = 'tv-elegir__lienzo';
                cajaVista.appendChild(lienzo);
                vistaViva = mod.crearVista(lienzo, datos, { hoja: null, ajustar: true, tactil: false, alTocar() {} });
                return;
            } catch (err) {
                console.warn('elegirPlantilla: la vista de la botonera falló, uso la miniatura', err);
                cajaVista.innerHTML = '';
            }
        }
        cajaVista.innerHTML = miniaturaSVG(datos, { clase: 'tv-miniatura tv-miniatura--grande' });
    }

    function marcar(id) {
        elegida = id;
        cajaLista.querySelectorAll('.tv-elegir__fila').forEach(f => f.setAttribute('aria-selected', String(f.dataset.id === String(id))));
        const fila = cajaLista.querySelector(`[aria-selected="true"]`);
        if (fila) fila.scrollIntoView({ block: 'nearest' });
        pintarVista();
    }

    const idDeFila = f => {
        const p = lista.find(x => String(x.id) === f.dataset.id);
        return p ? p.id : null;
    };
    cajaLista.addEventListener('click', e => {
        const f = e.target.closest('.tv-elegir__fila');
        if (f) marcar(idDeFila(f));
    });
    cajaLista.addEventListener('dblclick', e => {
        const f = e.target.closest('.tv-elegir__fila');
        if (f) div.dispatchEvent(new CustomEvent('tv-modal-cerrar', { detail: idDeFila(f), bubbles: true }));
    });
    buscador.addEventListener('input', pintarLista);
    // Flechas desde el buscador: se elige sin soltar el teclado.
    buscador.addEventListener('keydown', e => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const i = visibles.findIndex(p => p.id === elegida);
        const j = Math.max(0, Math.min(visibles.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        if (visibles[j]) marcar(visibles[j].id);
    });

    pintarLista();
    const r = await modal({
        titulo, contenido: div, ancho: 760, clase: 'tv-modal--elegir',
        botones: [{ texto: 'Cancelar', valor: null }, { texto: textoBoton, valor: 'usar', primario: true }],
        antesDeCerrar: v => v !== 'usar' || elegida != null
    });
    if (vistaViva) { try { vistaViva.destruir(); } catch {} }
    if (r === 'usar') return elegida;
    return r ?? null;
}

// Sin plantillas no hay con qué codificar: se ofrece traerlas del iPad ahí mismo.
async function sinPlantillas(ctx, titulo) {
    const div = document.createElement('div');
    div.className = 'tv-vacio';
    div.innerHTML = `${iconoHTML('botonera')}
        <div class="tv-vacio__titulo">Todavía no hay plantillas</div>
        <div>Armá una botonera en la compu (Base de datos › Plantillas), o exportá<br>una copia de seguridad o una plantilla desde el iPad e importala acá.</div>`;
    const r = await modal({
        titulo, contenido: div, ancho: 480,
        botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Armar una', valor: 'armar' },
                  { texto: 'Importar del iPad', valor: 'importar', primario: true }]
    });
    if (r === 'armar') { ctx.navegar('base', { pestana: 'plantillas', nueva: true }); return null; }
    if (r !== 'importar') return null;
    try {
        const res = await ctx.api.plantillas.importarArchivo();
        if (!res || res.cancelado) return null;   // cerró el diálogo
        if (!res.plantillas) { aviso('El archivo no traía plantillas nuevas.', 'info'); return null; }
        aviso(resumenImportacion(res), 'ok');
    } catch (err) {
        aviso('No se pudo importar: ' + (err && err.message || err), 'error');
        return null;
    }
    return elegirPlantilla(ctx, { titulo });
}

// Un clic en una plantilla: ¿con qué se captura? Navega a la rama con
// {plantillaId}. Devuelve el id de la rama elegida o null.
export async function capturarCon(ctx, plantillaId, nombrePlantilla = '') {
    const div = document.createElement('div');
    div.className = 'tv-destino';
    div.innerHTML = `
        ${nombrePlantilla ? `<p class="tv-texto-2 tv-destino__con">Con <b>${escapar(nombrePlantilla)}</b></p>` : ''}
        <div class="tv-destino__opciones">
            <button type="button" class="tv-destino__opcion" data-rama="captura">
                ${iconoHTML('camara')}
                <span><b>Captura en vivo</b><span class="tv-texto-2 tv-chica">Cámara o placa HDMI en esta compu. Codificás acá.</span></span>
                <span class="tv-tecla">1</span>
            </button>
            <button type="button" class="tv-destino__opcion" data-rama="ipad">
                ${iconoHTML('ipad')}
                <span><b>Captura desde iPad</b><span class="tv-texto-2 tv-chica">La compu graba, el iPad codifica por wifi.</span></span>
                <span class="tv-tecla">2</span>
            </button>
        </div>`;
    div.addEventListener('click', e => {
        const b = e.target.closest('[data-rama]');
        if (b) div.dispatchEvent(new CustomEvent('tv-modal-cerrar', { detail: b.dataset.rama, bubbles: true }));
    });
    // 1 / 2 desde el teclado, sin tener que tabular.
    div.addEventListener('keydown', e => {
        const rama = { '1': 'captura', '2': 'ipad' }[e.key];
        if (rama) { e.preventDefault(); div.dispatchEvent(new CustomEvent('tv-modal-cerrar', { detail: rama, bubbles: true })); }
    });
    const rama = await modal({ titulo: '¿Cómo vas a capturar?', contenido: div, ancho: 460, botones: [{ texto: 'Cancelar', valor: null }] });
    if (rama === 'captura' || rama === 'ipad') {
        ctx.navegar(rama, { plantillaId });
        return rama;
    }
    return null;
}

// {plantillas:3, equipos:2, partidos:5} → "3 plantillas, 2 equipos, 5 partidos"
export function resumenImportacion(r) {
    if (!r) return 'No se importó nada.';
    const partes = [];
    if (r.plantillas) partes.push(plural(r.plantillas, 'plantilla'));
    if (r.equipos) partes.push(plural(r.equipos, 'equipo'));
    if (r.partidos) partes.push(plural(r.partidos, 'partido'));
    return partes.length ? 'Importado: ' + partes.join(', ') : 'No había nada nuevo para importar.';
}
