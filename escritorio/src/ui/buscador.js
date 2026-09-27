// Buscador global (Ctrl+K): salta a un partido de la base o arranca a
// capturar con una plantilla, sin pasar por el menú.

import { escapar, fechaCorta, formatoTiempo, normalizar } from './util.js';
import { iconoHTML } from './iconos.js';
import { modal } from './dialogos.js';
import { capturarCon } from './plantillas.js';

const MAX_POR_GRUPO = 6;

export async function abrirBuscador(ctx) {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="tv-buscar__campo">
            ${iconoHTML('buscar')}
            <input class="tv-campo" type="text" placeholder="Buscar partidos y plantillas…" spellcheck="false" aria-label="Buscar">
            <span class="tv-tecla">Esc</span>
        </div>
        <div class="tv-lista tv-buscar__resultados" role="listbox"></div>`;
    const campo = div.querySelector('input');
    const caja = div.querySelector('.tv-buscar__resultados');

    // Se lee todo una vez y se filtra acá: son decenas o cientos de filas, y
    // así cada tecla responde al instante sin ir a la base.
    let partidos = [], plantillas = [];
    const carga = Promise.all([
        ctx.api.partidos.listar().then(x => { partidos = x || []; }).catch(() => {}),
        ctx.api.plantillas.listar().then(x => { plantillas = x || []; }).catch(() => {})
    ]);

    let resultados = [];
    let marcado = 0;

    function pintar() {
        const q = normalizar(campo.value);
        const coincide = (...textos) => !q || textos.some(t => normalizar(t).includes(q));
        const ps = partidos.filter(p => coincide(p.nombre, p.local, p.visitante)).slice(0, MAX_POR_GRUPO);
        const ts = plantillas.filter(t => coincide(t.nombre)).slice(0, MAX_POR_GRUPO);
        resultados = [
            ...ps.map(p => ({ tipo: 'partido', id: p.id, nombre: p.nombre,
                              detalle: [fechaCorta(p.creado), p.duracion ? formatoTiempo(p.duracion) : '', `${p.eventos || 0} eventos`].filter(Boolean).join(' · ') })),
            ...ts.map(t => ({ tipo: 'plantilla', id: t.id, nombre: t.nombre, detalle: 'Capturar con esta plantilla' }))
        ];
        marcado = Math.min(marcado, Math.max(0, resultados.length - 1));
        if (!resultados.length) {
            caja.innerHTML = `<div class="tv-vacio tv-chica">${q ? 'Nada coincide con eso.' : 'Todavía no hay partidos ni plantillas.'}</div>`;
            return;
        }
        let html = '', grupo = '';
        resultados.forEach((r, i) => {
            if (r.tipo !== grupo) {
                grupo = r.tipo;
                html += `<div class="tv-buscar__grupo">${grupo === 'partido' ? 'Partidos' : 'Plantillas'}</div>`;
            }
            html += `<div class="tv-lista__fila tv-buscar__fila" role="option" data-i="${i}" aria-selected="${i === marcado}">
                ${iconoHTML(r.tipo === 'partido' ? 'video' : 'botonera')}
                <span class="tv-recortar">${escapar(r.nombre)}</span>
                <span class="tv-barra__espacio"></span>
                <span class="tv-texto-2 tv-chica">${escapar(r.detalle)}</span>
            </div>`;
        });
        caja.innerHTML = html;
        caja.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }

    const elegir = i => { if (resultados[i]) div.dispatchEvent(new CustomEvent('tv-modal-cerrar', { detail: resultados[i], bubbles: true })); };
    campo.addEventListener('input', () => { marcado = 0; pintar(); });
    campo.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            marcado = Math.max(0, Math.min(resultados.length - 1, marcado + (e.key === 'ArrowDown' ? 1 : -1)));
            pintar();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            elegir(marcado);
        }
    });
    campo.setAttribute('data-tv-enter-propio', '');
    caja.addEventListener('click', e => {
        const f = e.target.closest('[data-i]');
        if (f) elegir(Number(f.dataset.i));
    });

    carga.then(pintar);
    pintar();

    const r = await modal({ contenido: div, ancho: 600, botones: [], clase: 'tv-modal--buscar', titulo: 'Buscar' });
    if (!r) return;
    if (r.tipo === 'partido') ctx.navegar('base', { partidoId: r.id });
    else capturarCon(ctx, r.id, r.nombre);
}
