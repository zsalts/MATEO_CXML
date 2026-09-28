// Pestaña Playlists: listas de clips de cualquier partido, en el orden que
// quieras, con una nota por clip. Se reproducen enteras (el reproductor
// cambia de video solo) y se pueden cortar a archivos.

import { h, boton, crearIcono, intentar, hacer, vacio, leerMargen } from './comun.js';
import { armarCola, armarPresentacion, mover, tramoVideo, formatoTiempo, nombreLimpio } from './logica.js';
import { crearReproductor } from './reproductor.js';
import { presentar } from './presentacion.js';
import { exportarClips, clipsDisponibles, MOTIVO_SIN_CLIPS } from './acciones.js';

export function crearPestanaPlaylists(ctx) {
    const api = ctx.api;
    let playlists = [];
    let actual = null;          // { id, nombre, items: [{evento_id, nota, ev}] }
    let activo = -1;            // índice del item que suena
    let margen = 0;
    let arrastrando = -1;

    const reproductor = crearReproductor(ctx, {
        // La cola saltea los clips sin video: cada item sabe su lugar en la lista
        alCambioCola: c => { activo = c ? c.item.indiceLista : -1; marcar(); }
    });

    const listaPl = h('div', { class: 'tv-lista tv-base-pl__listas' });
    const izquierda = h('div', { class: 'tv-base-pl__izq' },
        h('div', { class: 'tv-barra' }, h('span', { class: 'tv-barra__titulo' }, 'Playlists'), h('span', { class: 'tv-barra__espacio' }),
            boton('Nueva', { icono: 'mas', clase: 'tv-btn--chico', alHacer: () => nueva() })),
        listaPl);

    const titulo = h('span', { class: 'tv-barra__titulo tv-recortar' });
    const btnCortar = boton('Cortar', { icono: 'tijera', clase: 'tv-btn--chico', alHacer: () => cortar() });
    const barra = h('div', { class: 'tv-barra' }, titulo, h('span', { class: 'tv-barra__espacio' }),
        boton('Reproducir', { icono: 'play', clase: 'tv-btn--chico tv-btn--primario', titulo: 'Reproducir la playlist entera · Enter', alHacer: () => reproducir(0) }),
        boton('Presentar', { icono: 'video', clase: 'tv-btn--chico', titulo: 'La playlist en pantalla completa, de a un clip, con sus notas', alHacer: () => presentarPlaylist() }),
        btnCortar,
        boton('', { icono: 'lapiz', clase: 'tv-btn--icono tv-btn--chico', titulo: 'Renombrar', alHacer: () => renombrar() }),
        boton('', { icono: 'basura', clase: 'tv-btn--icono tv-btn--chico tv-btn--peligro', titulo: 'Borrar la playlist', alHacer: () => borrar() }));
    const items = h('div', { class: 'tv-lista tv-base-pl__items' });
    const centro = h('div', { class: 'tv-base-pl__centro' }, barra, items);
    const el = h('div', { class: 'tv-base-pl' }, izquierda, centro, reproductor.el);

    // ── Datos ──
    async function cargar() {
        playlists = (await intentar(ctx, () => api.playlists.listar(), 'No se pudieron leer las playlists')) || [];
        margen = await leerMargen(api);
        const hay = await clipsDisponibles(api);
        btnCortar.disabled = !hay;
        btnCortar.title = hay ? 'Cortar la playlist a archivos' : MOTIVO_SIN_CLIPS;
        pintarListas();
        if (actual && playlists.some(p => p.id === actual.id)) await abrir(actual.id);
        else if (playlists.length) await abrir(playlists[0].id);
        else { actual = null; pintarItems(); }
    }

    // tv.playlists.leer puede devolver los items con el evento adentro o solo
    // con evento_id: en ese caso se completan con tv.eventos.buscar.
    let cacheEventos = null;
    async function abrir(id) {
        const pl = await intentar(ctx, () => api.playlists.leer(id), 'No se pudo abrir la playlist');
        if (!pl) return;
        const crudos = pl.items || [];
        const faltan = crudos.some(it => !it.nombre && !(it.evento && it.evento.nombre));
        if (faltan && !cacheEventos) {
            const todos = (await intentar(ctx, () => api.eventos.buscar({}), 'No se pudieron leer los clips')) || [];
            cacheEventos = new Map(todos.map(e => [e.id, e]));
        }
        actual = {
            id: pl.id, nombre: pl.nombre,
            items: crudos.map(it => ({
                evento_id: it.evento_id, nota: it.nota || '',
                ev: it.evento || (it.nombre ? { ...it, id: it.evento_id } : (cacheEventos && cacheEventos.get(it.evento_id))) || null
            }))
        };
        activo = -1;
        reproductor.detenerCola();
        pintarListas();
        pintarItems();
    }

    async function guardar() {
        if (!actual) return false;
        const r = await hacer(ctx, () => api.playlists.guardar({
            id: actual.id, nombre: actual.nombre,
            items: actual.items.map(it => ({ evento_id: it.evento_id, nota: it.nota }))
        }), 'No se pudo guardar la playlist');
        return r.ok;
    }

    // ── Pintar ──
    function pintarListas() {
        if (!playlists.length) {
            listaPl.replaceChildren(vacio('lista', 'Sin playlists', 'Elegí clips en un partido o en Clips y tocá "A playlist".'));
            return;
        }
        listaPl.replaceChildren(...playlists.map(p => h('div', {
            class: 'tv-lista__fila', role: 'option', tabindex: '0', 'aria-selected': String(!!actual && actual.id === p.id),
            onclick: () => abrir(p.id), onkeydown: e => { if (e.key === 'Enter') abrir(p.id); }
        }, crearIcono('lista'), h('span', { class: 'tv-recortar' }, p.nombre),
            p.items !== undefined || p.cantidad !== undefined
                ? h('span', { class: 'tv-chica tv-texto-2' }, String(p.cantidad ?? (Array.isArray(p.items) ? p.items.length : p.items))) : null)));
    }

    function pintarItems() {
        titulo.textContent = actual ? actual.nombre : '';
        barra.hidden = !actual;
        if (!actual) { items.replaceChildren(vacio('lista', 'Elegí o creá una playlist', '')); return; }
        if (!actual.items.length) {
            items.replaceChildren(vacio('tijera', 'La playlist está vacía', 'Agregá clips desde un partido o desde la pestaña Clips.'));
            return;
        }
        items.replaceChildren(...actual.items.map((it, i) => {
            const ev = it.ev;
            const t = ev ? tramoVideo(ev) : null;
            const nota = h('input', { class: 'tv-campo tv-base-pl__nota', value: it.nota, placeholder: 'Nota…' });
            nota.addEventListener('change', async () => { it.nota = nota.value; await guardar(); });
            nota.addEventListener('click', e => e.stopPropagation());
            const fila = h('div', {
                class: 'tv-lista__fila tv-base-pl__item' + (ev && ev.video_ruta ? '' : ' es-sin-video'), draggable: 'true', 'data-i': i
            },
                h('span', { class: 'tv-base-pl__asa', title: 'Arrastrá para reordenar' }, '⋮⋮'),
                h('span', { class: 'tv-numeros tv-texto-2 tv-chica' }, String(i + 1)),
                h('div', { class: 'tv-base-evento__texto' },
                    h('div', { class: 'tv-recortar' }, ev ? ev.nombre : 'Evento borrado'),
                    h('div', { class: 'tv-recortar tv-chica tv-texto-2' }, ev ? `${ev.partido_nombre || ''} · ${formatoTiempo(t.desde)}` : 'Ya no está en la base')),
                nota,
                boton('', { icono: 'cerrar', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma', titulo: 'Quitar de la playlist', alHacer: e => { e.stopPropagation(); quitar(i); } }));
            fila.addEventListener('click', () => reproducir(i));
            fila.addEventListener('dragstart', e => { arrastrando = i; fila.classList.add('es-arrastrando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
            fila.addEventListener('dragend', () => { arrastrando = -1; fila.classList.remove('es-arrastrando'); items.querySelectorAll('.es-destino').forEach(x => x.classList.remove('es-destino')); });
            fila.addEventListener('dragover', e => { if (arrastrando < 0) return; e.preventDefault(); fila.classList.add('es-destino'); });
            fila.addEventListener('dragleave', () => fila.classList.remove('es-destino'));
            fila.addEventListener('drop', async e => {
                e.preventDefault();
                const desde = arrastrando;
                if (desde < 0 || desde === i) return;
                actual.items = mover(actual.items, desde, i);
                pintarItems();
                await guardar();
            });
            return fila;
        }));
        marcar();
    }

    function marcar() {
        items.querySelectorAll('.tv-base-pl__item').forEach((f, i) => f.classList.toggle('es-reproduciendo', i === activo));
    }

    // ── Acciones ──
    function colaDesde(i) {
        // Los clips borrados o sin video se saltean; el índice de la cola
        // apunta al de la lista para marcar el que suena
        const validos = actual.items.map((it, j) => ({ it, j })).filter(x => x.it.ev && x.it.ev.video_ruta);
        const { items: cola } = armarCola(validos.map(x => x.it.ev), { margen });
        cola.forEach((c, k) => { c.indiceLista = validos[k].j; });
        const inicio = Math.max(0, validos.findIndex(x => x.j >= i));
        return { cola, inicio, saltados: actual.items.length - validos.length };
    }

    function reproducir(i) {
        if (!actual || !actual.items.length) return;
        const { cola, inicio, saltados } = colaDesde(i);
        if (!cola.length) { ctx.ui.aviso('Ningún clip de la playlist tiene video', 'aviso'); return; }
        if (saltados && i === 0) ctx.ui.aviso(`${saltados} ${saltados === 1 ? 'clip se saltea' : 'clips se saltean'}: sin video o borrados`, 'info');
        reproductor.reproducirCola(cola, inicio);
    }

    // Presentar: la playlist entera, en su orden, con la nota de cada clip
    // en pantalla grande. Los borrados o sin video se saltean.
    function presentarPlaylist() {
        if (!actual || !actual.items.length) return;
        reproductor.pausar();
        const eventos = actual.items.filter(it => it.ev).map(it => ({ ...it.ev, nota_playlist: it.nota }));
        const { items: lista, sinVideo } = armarPresentacion(eventos, { margen, notaDe: ev => ev.nota_playlist });
        const faltan = sinVideo + (actual.items.length - eventos.length);
        if (faltan && lista.length) ctx.ui.aviso(`${faltan} ${faltan === 1 ? 'clip queda afuera' : 'clips quedan afuera'}: sin video o borrados`, 'info');
        presentar(ctx, lista, { titulo: actual.nombre });
    }

    async function quitar(i) {
        actual.items.splice(i, 1);
        pintarItems();
        await guardar();
        actualizarCantidad();
    }

    function actualizarCantidad() {
        const p = playlists.find(x => x.id === actual.id);
        if (p) { p.cantidad = actual.items.length; pintarListas(); }
    }

    async function nueva() {
        const n = await ctx.ui.pedirTexto('Nueva playlist', 'Playlist ' + new Date().toLocaleDateString('es-AR'), { etiqueta: 'Nombre' });
        if (!n || !n.trim()) return;
        const id = await intentar(ctx, () => api.playlists.guardar({ nombre: n.trim(), items: [] }), 'No se pudo crear la playlist');
        if (id === undefined) return;
        actual = { id, nombre: n.trim(), items: [] };
        await cargar();
    }

    async function renombrar() {
        if (!actual) return;
        const n = await ctx.ui.pedirTexto('Renombrar playlist', actual.nombre, { etiqueta: 'Nombre' });
        if (!n || !n.trim()) return;
        actual.nombre = n.trim();
        if (await guardar()) {
            const p = playlists.find(x => x.id === actual.id);
            if (p) p.nombre = actual.nombre;
            pintarListas(); pintarItems();
        }
    }

    async function borrar() {
        if (!actual) return;
        const si = await ctx.ui.confirmar(`¿Borrar la playlist "${actual.nombre}"? Los clips siguen en sus partidos.`, { titulo: 'Borrar playlist', peligro: true });
        if (!si) return;
        if ((await hacer(ctx, () => api.playlists.borrar(actual.id), 'No se pudo borrar la playlist')).ok) {
            reproductor.detenerCola();
            actual = null;
            await cargar();
        }
    }

    async function cortar() {
        if (!actual) return;
        const { cola } = colaDesde(0);
        await exportarClips(ctx, cola, { margen, titulo: `Cortar "${actual.nombre}"`, subcarpetaDe: () => 'Playlists/' + nombreLimpio(actual.nombre, 'Playlist') });
    }

    return {
        el,
        async activar() { cacheEventos = null; await cargar(); },
        teclas(e) {
            if (e.ctrlKey || e.metaKey) return false;
            if (e.key === 'Enter') { reproducir(0); return true; }
            return reproductor.teclas(e);
        },
        pausar: () => reproductor.pausar(),
        destruir() { reproductor.destruir(); el.remove(); }
    };
}
