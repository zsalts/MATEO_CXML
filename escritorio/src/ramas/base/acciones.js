// Acciones que se hacen desde más de una pestaña: exportar XML, CSV y clips,
// mandar clips a una playlist y editar un evento.

import { h, intentar, avisoConCarpeta, cargarNucleo } from './comun.js';
import {
    partidoParaXml, datosDePlantilla, subcarpetaDePartido, nombreBaseDePartido, nombreLimpio,
    cortesPorVideo, formatoTiempo, parsearTiempo, tramoVideo
} from './logica.js';

// ─────────────────────────────────────────────
// XML DE SPORTSCODE
// ─────────────────────────────────────────────

// entero = el partido completo: el archivo lleva el mismo nombre que el video
// (Sportscode y Nacsport los emparejan solos) y pisa el xml_ruta del partido.
// Si no, es lo filtrado, con otro nombre para no pisar el del partido.
export async function exportarXml(ctx, partido, eventos, { entero = true } = {}) {
    const mod = await cargarNucleo('exportar');
    if (!mod || typeof mod.xmlSportscode !== 'function') {
        ctx.ui.aviso('Todavía no está src/nucleo/exportar.js (xmlSportscode): no se puede armar el XML', 'error');
        return null;
    }
    const sinPosesion = eventos.filter(e => !e.posesion_de);
    if (!sinPosesion.length) { ctx.ui.aviso('No hay eventos para exportar', 'aviso'); return null; }

    const contenido = await intentar(ctx,
        () => mod.xmlSportscode(partidoParaXml(partido, sinPosesion), datosDePlantilla(partido.plantilla)),
        'No se pudo armar el XML');
    if (typeof contenido !== 'string') { if (contenido === null) ctx.ui.aviso('No hay eventos para exportar', 'aviso'); return null; }

    const base = nombreBaseDePartido(partido);
    const ruta = await intentar(ctx, () => ctx.api.archivos.guardarTexto({
        nombre: entero ? base : `${base} (${sinPosesion.length} eventos)`,
        extension: 'xml', contenido, subcarpeta: subcarpetaDePartido(partido),
        // Re-exportar el partido entero reemplaza su XML en vez de sumar un "(2)"
        pisar: entero
    }), 'No se pudo guardar el XML');
    if (!ruta) return null;

    if (entero) {
        await intentar(ctx, () => ctx.api.partidos.actualizar(partido.id, { xml_ruta: ruta }),
            'El XML quedó en el disco, pero no se pudo enlazar al partido');
        partido.xml_ruta = ruta;
    }
    avisoConCarpeta(ctx, entero ? 'XML del partido exportado' : `XML con ${sinPosesion.length} eventos exportado`, ruta);
    return ruta;
}

// ─────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────

export async function guardarCsv(ctx, { nombre, contenido, subcarpeta }) {
    const ruta = await intentar(ctx, () => ctx.api.archivos.guardarTexto({
        nombre: nombreLimpio(nombre), extension: 'csv', contenido, subcarpeta
    }), 'No se pudo guardar el CSV');
    if (ruta) avisoConCarpeta(ctx, 'CSV exportado', ruta);
    return ruta;
}

// ─────────────────────────────────────────────
// CLIPS
// ─────────────────────────────────────────────

export async function clipsDisponibles(api) {
    try { return !!(await api.clips.disponible()); } catch (_) { return false; }
}
export const MOTIVO_SIN_CLIPS = 'Cortar clips necesita ffmpeg, y no está disponible en esta instalación';

// items = cola armada con armarCola (ya con el margen). subcarpetaDe(ruta)
// dice dónde van los de cada video; por defecto, a Clips/ del partido.
export async function exportarClips(ctx, items, { subcarpetaDe, titulo = 'Cortar clips', margen = 0 } = {}) {
    if (!items.length) { ctx.ui.aviso('No hay clips con video para cortar', 'aviso'); return; }
    if (!(await clipsDisponibles(ctx.api))) { ctx.ui.aviso(MOTIVO_SIN_CLIPS, 'error'); return; }

    const grupos = cortesPorVideo(items);
    const sueltos = h('input', { type: 'radio', name: 'tv-base-destino', value: 'carpeta', checked: true });
    const uno = h('input', { type: 'radio', name: 'tv-base-destino', value: 'uno' });
    const contenido = h('div', { class: 'tv-base-form' },
        h('p', {}, `${items.length} ${items.length === 1 ? 'clip' : 'clips'}` +
            (grupos.length > 1 ? ` de ${grupos.length} videos` : '') +
            ` · margen de ${margen} s antes y después`),
        h('label', { class: 'tv-base-opcion' }, sueltos, ' Un archivo por clip'),
        h('label', { class: 'tv-base-opcion' }, uno, ' Todos juntos en un solo video' +
            (grupos.length > 1 ? ' (uno por partido)' : '')),
        h('p', { class: 'tv-chica tv-texto-2' }, 'Se cortan sin recomprimir: sale al toque y con la misma calidad.'));
    const ok = await ctx.ui.modal({
        titulo, contenido,
        botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Cortar', valor: true, primario: true }]
    });
    if (!ok) return;
    const destino = uno.checked ? 'uno' : 'carpeta';

    ctx.ui.aviso(`Cortando ${items.length} ${items.length === 1 ? 'clip' : 'clips'}…`, 'info');
    const rutas = [];
    let fallidos = 0;
    for (const g of grupos) {
        const subcarpeta = subcarpetaDe ? subcarpetaDe(g.ruta) : 'Clips';
        try {
            const r = await ctx.api.clips.exportar({ ruta: g.ruta, cortes: g.cortes, destino, subcarpeta });
            rutas.push(...((r && r.rutas) || []));
        } catch (err) {
            fallidos += g.cortes.length;
            console.error('[base] cortar clips', g.ruta, err);
            ctx.ui.aviso('No se pudieron cortar los clips de un video: ' + ((err && err.message) || err), 'error');
        }
    }
    if (rutas.length) {
        avisoConCarpeta(ctx, destino === 'uno'
            ? `Listo: ${rutas.length === 1 ? 'un video' : rutas.length + ' videos'} con los clips`
            : `Listo: ${rutas.length} ${rutas.length === 1 ? 'clip cortado' : 'clips cortados'}` +
              (fallidos ? ` (${fallidos} fallaron)` : ''), rutas[0]);
    }
}

// La carpeta de clips de un video: Partidos/<carpeta>/Clips si el video vive
// en su carpeta de partido; si no, la del nombre del partido.
export function subcarpetaClipsDe(partidoDeRuta) {
    return ruta => subcarpetaDePartido(partidoDeRuta(ruta) || { video_ruta: ruta, nombre: 'Clips' }) + '/Clips';
}

// ─────────────────────────────────────────────
// PLAYLISTS
// ─────────────────────────────────────────────

// Elegir una playlist (o crear una) y sumarle los eventos. Devuelve el id.
export async function agregarAPlaylist(ctx, eventoIds) {
    const ids = [...eventoIds];
    if (!ids.length) { ctx.ui.aviso('Elegí uno o más eventos primero', 'aviso'); return null; }
    const listas = (await intentar(ctx, () => ctx.api.playlists.listar(), 'No se pudieron leer las playlists')) || [];

    const NUEVA = '__nueva__';
    const sel = h('select', { class: 'tv-campo' },
        h('option', { value: NUEVA }, 'Nueva playlist…'),
        ...listas.map(p => h('option', { value: String(p.id) }, p.nombre)));
    const nombre = h('input', { class: 'tv-campo', placeholder: 'Nombre de la playlist', value: 'Playlist ' + new Date().toLocaleDateString('es-AR') });
    const filaNombre = h('div', {}, h('label', { class: 'tv-etiqueta' }, 'Nombre'), nombre);
    sel.addEventListener('change', () => { filaNombre.hidden = sel.value !== NUEVA; });
    if (listas.length) { sel.value = String(listas[0].id); filaNombre.hidden = true; }

    const contenido = h('div', { class: 'tv-base-form' },
        h('p', {}, `${ids.length} ${ids.length === 1 ? 'clip' : 'clips'}`),
        h('div', {}, h('label', { class: 'tv-etiqueta' }, 'Playlist'), sel), filaNombre);
    const ok = await ctx.ui.modal({
        titulo: 'Agregar a playlist', contenido, foco: listas.length ? sel : nombre,
        botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Agregar', valor: true, primario: true }]
    });
    if (!ok) return null;

    return intentar(ctx, async () => {
        let pl = { nombre: nombre.value.trim() || 'Playlist', items: [] };
        if (sel.value !== NUEVA) {
            const leida = await ctx.api.playlists.leer(Number(sel.value) || sel.value);
            pl = { id: leida.id, nombre: leida.nombre, items: (leida.items || []).map(it => ({ evento_id: it.evento_id, nota: it.nota || '' })) };
        }
        pl.items.push(...ids.map(id => ({ evento_id: id, nota: '' })));
        const id = await ctx.api.playlists.guardar(pl);
        ctx.ui.aviso(`${ids.length} ${ids.length === 1 ? 'clip agregado' : 'clips agregados'} a "${pl.nombre}"`, 'ok');
        return id ?? pl.id;
    }, 'No se pudo guardar la playlist');
}

// ─────────────────────────────────────────────
// EDITAR UN EVENTO
// ─────────────────────────────────────────────

// Modal con nombre, inicio y fin (en el video) y etiquetas. Devuelve los
// cambios {nombre, v_inicio, v_fin, etiquetas} o null.
// El reloj de partido (inicio/fin) no se toca: es lo que se marcó en vivo;
// lo que se corrige es dónde cae en el video.
export async function editarEvento(ctx, ev, { categorias = [], grupos = [], desfase = 0, ahora = null } = {}) {
    const t = tramoVideo(ev, desfase);
    const idLista = 'tv-base-cats-' + Math.random().toString(36).slice(2, 7);
    const idGrupos = idLista + 'g';
    const nombre = h('input', { class: 'tv-campo', value: ev.nombre, list: idLista });
    const inicio = h('input', { class: 'tv-campo tv-numeros', value: formatoTiempo(t.desde, { decimas: true }) });
    const fin = h('input', { class: 'tv-campo tv-numeros', value: formatoTiempo(t.hasta, { decimas: true }) });
    const error = h('div', { class: 'tv-base-error tv-chica' });

    const usarAhora = campo => ahora === null ? null
        : h('button', { type: 'button', class: 'tv-btn tv-btn--chico', title: 'Poner el tiempo del cabezal',
            onclick: () => { campo.value = formatoTiempo(ahora, { decimas: true }); } }, 'Cabezal');

    const listaEt = h('div', { class: 'tv-base-etiquetas-edit' });
    const filaEtiqueta = (grupo = '', texto = '') => {
        const g = h('input', { class: 'tv-campo', value: grupo, placeholder: 'Grupo', list: idGrupos });
        const x = h('input', { class: 'tv-campo', value: texto, placeholder: 'Texto' });
        const fila = h('div', { class: 'tv-base-etiqueta-fila' }, g, x,
            h('button', { type: 'button', class: 'tv-btn tv-btn--icono tv-btn--chico tv-btn--fantasma', title: 'Quitar', onclick: () => fila.remove() }, '×'));
        listaEt.appendChild(fila);
        return g;
    };
    (ev.etiquetas || []).forEach(et => filaEtiqueta(et.grupo, et.texto));

    const contenido = h('div', { class: 'tv-base-form' },
        h('datalist', { id: idLista }, ...categorias.map(c => h('option', { value: c }))),
        h('datalist', { id: idGrupos }, ...grupos.map(c => h('option', { value: c }))),
        h('div', {}, h('label', { class: 'tv-etiqueta' }, 'Categoría'), nombre),
        h('div', { class: 'tv-base-dos' },
            h('div', {}, h('label', { class: 'tv-etiqueta' }, 'Inicio en el video'), h('div', { class: 'tv-base-fila' }, inicio, usarAhora(inicio))),
            h('div', {}, h('label', { class: 'tv-etiqueta' }, 'Fin en el video'), h('div', { class: 'tv-base-fila' }, fin, usarAhora(fin)))),
        h('div', {}, h('label', { class: 'tv-etiqueta' }, 'Etiquetas'), listaEt,
            h('button', { type: 'button', class: 'tv-btn tv-btn--chico', onclick: () => filaEtiqueta('Etiqueta').focus() }, '+ Etiqueta')),
        error);

    let cambios = null;
    const valor = await ctx.ui.modal({
        titulo: 'Editar evento', contenido, foco: nombre, ancho: 480,
        botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar', valor: true, primario: true }],
        antesDeCerrar: v => {
            if (!v) return true;
            const n = nombre.value.trim();
            const vi = parsearTiempo(inicio.value), vf = parsearTiempo(fin.value);
            if (!n) { error.textContent = 'La categoría no puede quedar vacía'; return false; }
            if (vi === null || vf === null) { error.textContent = 'Los tiempos van como 1:02:03 o 62,5'; return false; }
            if (vf < vi) { error.textContent = 'El fin tiene que ser después del inicio'; return false; }
            const etiquetas = [...listaEt.querySelectorAll('.tv-base-etiqueta-fila')]
                .map(f => { const [g, x] = f.querySelectorAll('input'); return { grupo: g.value.trim() || 'Etiqueta', texto: x.value.trim() }; })
                .filter(et => et.texto);
            cambios = { nombre: n, v_inicio: vi, v_fin: vf, etiquetas };
            return true;
        }
    });
    return valor ? cambios : null;
}
