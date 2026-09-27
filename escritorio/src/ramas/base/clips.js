// Pestaña Clips: eventos de todos los partidos a la vez. Filtrás por
// categoría, etiqueta, equipo y partido; los reproducís seguidos (el
// reproductor cambia de archivo solo) o los mandás a una playlist.

import { h, llenar, boton, crearIcono, intentar, divisor, guardarDisposicion, leerMargen, vacio } from './comun.js';
import {
    filtrarEventos, filtroVacio, filtroActivo, opcionesDeFiltro, armarCola, seleccionar,
    tramoVideo, formatoTiempo, csvEventos
} from './logica.js';
import { crearReproductor } from './reproductor.js';
import { teclaMod, sumaSeleccion, textoAtajo } from '../../ui/plataforma.js';   // ⌘ en Mac, Ctrl en Windows (Agente 7)
import { exportarClips, clipsDisponibles, MOTIVO_SIN_CLIPS, agregarAPlaylist, guardarCsv, subcarpetaClipsDe } from './acciones.js';

export function crearPestanaClips(ctx, { disposicion }) {
    const api = ctx.api;
    let todos = [];            // todos los eventos de la base (para armar los filtros)
    let clips = [];            // los que devolvió la búsqueda
    let partidos = [];
    let filtro = { ...filtroVacio(), partidos: [] };
    let seleccion = new Set();
    let ancla = null;
    let activo = null;
    let margen = 0;
    let hayClips = false;

    const reproductor = crearReproductor(ctx, {
        alCambioCola: c => { activo = c ? c.item.eventoId : activo; marcar(); }
    });

    const buscador = h('input', { class: 'tv-campo', type: 'search', placeholder: 'Buscar…' });
    const filtrosCaja = h('div', { class: 'tv-base-filtros' });
    const panelFiltros = h('div', { class: 'tv-base-clips__filtros' },
        h('div', { class: 'tv-base-panel__filtros' }, buscador), filtrosCaja);
    panelFiltros.style.width = disposicion.filtrosClips + 'px';

    const resumen = h('span', { class: 'tv-chica tv-texto-2 tv-numeros' });
    const btnCortar = boton('Cortar', { icono: 'tijera', clase: 'tv-btn--chico', alHacer: () => cortar() });
    const lista = h('div', { class: 'tv-lista tv-base-eventos', role: 'listbox', 'aria-multiselectable': 'true' });
    const centro = h('div', { class: 'tv-base-clips__lista' },
        h('div', { class: 'tv-barra' }, resumen, h('span', { class: 'tv-barra__espacio' }),
            boton('Reproducir', { icono: 'play', clase: 'tv-btn--chico tv-btn--primario', titulo: 'Reproducir la selección (o todos) seguidos · Enter', alHacer: () => reproducir() }),
            boton('A playlist', { icono: 'lista', clase: 'tv-btn--chico', alHacer: () => aPlaylist() }),
            btnCortar,
            boton('CSV', { icono: 'descargar', clase: 'tv-btn--chico', alHacer: () => csv() })),
        lista);
    centro.style.width = '420px';

    const el = h('div', { class: 'tv-base-clips' },
        panelFiltros,
        divisor('x', { medir: () => panelFiltros.offsetWidth, poner: px => { panelFiltros.style.width = px + 'px'; }, min: 180, max: 420,
            alTerminar: px => guardarDisposicion(api, { filtrosClips: px }) }),
        centro,
        divisor('x', { medir: () => centro.offsetWidth, poner: px => { centro.style.width = px + 'px'; }, min: 260, max: 900 }),
        reproductor.el);

    // ── Datos ──
    async function cargarTodo() {
        const [evs, ps] = await Promise.all([
            intentar(ctx, () => api.eventos.buscar({}), 'No se pudieron leer los clips'),
            intentar(ctx, () => api.partidos.listar(), 'No se pudo leer la lista de partidos')
        ]);
        todos = Array.isArray(evs) ? evs : [];
        partidos = Array.isArray(ps) ? ps : [];
        margen = await leerMargen(api);
        hayClips = await clipsDisponibles(api);
        btnCortar.disabled = !hayClips;
        btnCortar.title = hayClips ? 'Cortar la selección (o todos) a archivos' : MOTIVO_SIN_CLIPS;
        await buscar();
    }

    // La API filtra (tv.eventos.buscar) y después se vuelve a filtrar acá con
    // la misma regla que la pestaña Partidos (Y entre grupos, O adentro), así
    // varios equipos o grupos de etiquetas se combinan igual en las dos.
    async function buscar() {
        filtro.texto = buscador.value;
        const f = {
            nombres: filtro.categorias.length ? filtro.categorias : undefined,
            etiquetas: filtro.etiquetas.length ? filtro.etiquetas : undefined,
            equipo: filtro.equipos.length === 1 ? filtro.equipos[0] : undefined,
            partidos: filtro.partidos.length ? filtro.partidos : undefined,
            texto: filtro.texto.trim() || undefined
        };
        const hay = filtroActivo(filtro) || filtro.partidos.length;
        const r = hay ? await intentar(ctx, () => api.eventos.buscar(f), 'No se pudo buscar') : todos;
        const base = Array.isArray(r) ? r : [];
        clips = filtrarEventos(base, filtro)
            .filter(ev => !filtro.partidos.length || filtro.partidos.includes(ev.partido_id))
            .sort((a, b) => String(a.partido_nombre).localeCompare(String(b.partido_nombre)) || (a.partido_id - b.partido_id) || tramoVideo(a).desde - tramoVideo(b).desde);
        const ids = new Set(clips.map(c => c.id));
        seleccion = new Set([...seleccion].filter(id => ids.has(id)));
        pintarFiltros();
        pintarLista();
    }

    let espera = 0;
    buscador.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscar, 200); });

    // ── Pintar ──
    function pintarFiltros() {
        const op = opcionesDeFiltro(todos);
        const chip = (texto, activo, alHacer, n) => h('button', {
            type: 'button', class: 'tv-base-chip' + (activo ? ' es-activo' : ''), 'aria-pressed': String(activo), onclick: alHacer
        }, texto, n !== undefined ? h('small', {}, String(n)) : null);
        const grupo = (titulo, items) => items.length ? h('div', { class: 'tv-base-filtro' },
            h('div', { class: 'tv-base-filtro__titulo' }, titulo), h('div', { class: 'tv-base-chips' }, ...items)) : null;
        const alternar = (clave, v) => {
            const l = filtro[clave];
            filtro = { ...filtro, [clave]: l.includes(v) ? l.filter(x => x !== v) : [...l, v] };
            buscar();
        };
        const porGrupo = new Map();
        op.etiquetas.forEach(et => { if (!porGrupo.has(et.grupo)) porGrupo.set(et.grupo, []); porGrupo.get(et.grupo).push(et); });
        const tieneEt = et => filtro.etiquetas.some(x => x.grupo === et.grupo && x.texto === et.texto);
        const conEventos = new Set(todos.map(e => e.partido_id));

        llenar(filtrosCaja,
            filtroActivo(filtro) || filtro.partidos.length
                ? h('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--fantasma', onclick: () => { filtro = { ...filtroVacio(), partidos: [] }; buscador.value = ''; buscar(); } }, 'Limpiar filtros')
                : null,
            grupo('Categorías', op.categorias.map(c => chip(c.nombre, filtro.categorias.includes(c.nombre), () => alternar('categorias', c.nombre), c.n))),
            grupo('Equipo', op.equipos.map(q => chip(q.equipo === 'A' ? 'Local' : q.equipo === 'B' ? 'Visitante' : q.equipo,
                filtro.equipos.includes(q.equipo), () => alternar('equipos', q.equipo), q.n))),
            ...[...porGrupo.entries()].map(([g, ets]) => grupo(g || 'Etiquetas', ets.map(et => chip(et.texto, tieneEt(et), () => {
                filtro = { ...filtro, etiquetas: tieneEt(et) ? filtro.etiquetas.filter(x => !(x.grupo === et.grupo && x.texto === et.texto)) : [...filtro.etiquetas, { grupo: et.grupo, texto: et.texto }] };
                buscar();
            }, et.n)))),
            grupo('Partidos', partidos.filter(p => conEventos.has(p.id)).map(p => chip(p.nombre, filtro.partidos.includes(p.id), () => alternar('partidos', p.id)))));
    }

    let filas = new Map();
    function pintarLista() {
        const conVideo = clips.filter(c => c.video_ruta).length;
        resumen.textContent = `${clips.length} ${clips.length === 1 ? 'clip' : 'clips'}`
            + (clips.length !== conVideo ? ` (${clips.length - conVideo} sin video)` : '')
            + (seleccion.size ? ` · ${seleccion.size} elegidos` : '');
        filas = new Map();
        if (!clips.length) {
            lista.replaceChildren(todos.length ? vacio('filtro', 'Ningún clip coincide', 'Probá con otro filtro.')
                : vacio('tijera', 'No hay clips en la base', 'Los eventos de los partidos aparecen acá.'));
            return;
        }
        const frag = document.createDocumentFragment();
        let partidoAnterior = null;
        clips.forEach(ev => {
            if (ev.partido_id !== partidoAnterior) {
                partidoAnterior = ev.partido_id;
                frag.appendChild(h('div', { class: 'tv-base-separador tv-chica' }, ev.partido_nombre || 'Partido'));
            }
            const t = tramoVideo(ev);
            const fila = h('div', { class: 'tv-lista__fila tv-base-evento' + (ev.video_ruta ? '' : ' es-sin-video'), role: 'option', 'data-id': ev.id },
                h('div', { class: 'tv-base-evento__texto' },
                    h('div', { class: 'tv-recortar' }, ev.nombre),
                    (ev.etiquetas || []).length ? h('div', { class: 'tv-recortar tv-chica tv-texto-2' }, ev.etiquetas.map(et => et.texto).join(' · ')) : null),
                ev.video_ruta ? null : h('span', { title: 'Sin video' }, crearIcono('alerta')),
                h('span', { class: 'tv-numeros tv-chica tv-texto-2' }, formatoTiempo(t.desde)),
                h('span', { class: 'tv-numeros tv-chica tv-texto-2 tv-base-evento__dur' }, Math.round(t.hasta - t.desde) + ' s'));
            filas.set(ev.id, fila);
            frag.appendChild(fila);
        });
        lista.replaceChildren(frag);
        marcar();
    }

    function marcar() {
        filas.forEach((f, id) => {
            f.setAttribute('aria-selected', String(seleccion.has(id)));
            f.classList.toggle('es-reproduciendo', id === activo);
        });
    }

    lista.addEventListener('click', e => {
        const fila = e.target.closest('.tv-base-evento');
        if (!fila) return;
        const ev = clips.find(c => String(c.id) === fila.dataset.id);
        if (!ev) return;
        const r = seleccionar(seleccion, clips.map(c => c.id), ev.id, { shift: e.shiftKey, ctrl: sumaSeleccion(e), ancla });
        seleccion = r.seleccion; ancla = r.ancla;
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) reproducirUno(ev);
        pintarResumenSolo();
        marcar();
    });
    lista.addEventListener('mousedown', e => { if (e.shiftKey) e.preventDefault(); });

    function pintarResumenSolo() {
        const txt = resumen.textContent.replace(/ · \d+ elegidos$/, '');
        resumen.textContent = txt + (seleccion.size ? ` · ${seleccion.size} elegidos` : '');
    }

    // ── Acciones ──
    function elegidos() { return seleccion.size ? clips.filter(c => seleccion.has(c.id)) : clips; }

    async function reproducirUno(ev) {
        activo = ev.id;
        marcar();
        if (!ev.video_ruta) { reproductor.mostrarMensaje('Este clip no tiene video'); return; }
        const { items } = armarCola([ev], { margen });
        reproductor.detenerCola();
        await reproductor.reproducirTramo(items[0].ruta, items[0].desde, items[0].hasta);
    }

    function reproducir() {
        const { items, sinVideo } = armarCola(elegidos(), { margen });
        if (!items.length) { ctx.ui.aviso('Ninguno de estos clips tiene video', 'aviso'); return; }
        if (sinVideo) ctx.ui.aviso(`${sinVideo} ${sinVideo === 1 ? 'clip no tiene' : 'clips no tienen'} video: se saltean`, 'info');
        reproductor.reproducirCola(items);
    }

    async function aPlaylist() {
        if (!seleccion.size) { ctx.ui.aviso(`Elegí clips (clic, ${textoAtajo('Mod')} o Shift) para mandarlos a una playlist`, 'aviso'); return; }
        await agregarAPlaylist(ctx, clips.filter(c => seleccion.has(c.id)).map(c => c.id));
    }

    async function cortar() {
        const { items } = armarCola(elegidos(), { margen });
        const partidoDeRuta = ruta => {
            const ev = clips.find(c => c.video_ruta === ruta);
            return ev ? { video_ruta: ruta, nombre: ev.partido_nombre } : null;
        };
        await exportarClips(ctx, items, { margen, subcarpetaDe: subcarpetaClipsDe(partidoDeRuta) });
    }

    function csv() {
        const sel = elegidos();
        if (!sel.length) { ctx.ui.aviso('No hay clips para exportar', 'aviso'); return; }
        guardarCsv(ctx, { nombre: `Clips ${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')} (${sel.length})`, contenido: csvEventos(sel), subcarpeta: 'Clips' });
    }

    return {
        el,
        activar: cargarTodo,
        teclas(e) {
            if (teclaMod(e) && (e.key === 'a' || e.key === 'A')) { seleccion = new Set(clips.map(c => c.id)); marcar(); pintarResumenSolo(); return true; }
            if (e.ctrlKey || e.metaKey) return false;
            if (e.key === 'Enter') { reproducir(); return true; }
            if (e.key === 'Escape' && seleccion.size) { seleccion = new Set(); marcar(); pintarResumenSolo(); return true; }
            return reproductor.teclas(e);
        },
        pausar: () => reproductor.pausar(),
        destruir() { reproductor.destruir(); el.remove(); }
    };
}
