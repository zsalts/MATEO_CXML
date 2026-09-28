// El partido abierto: reproductor, panel de eventos (filtros, lista,
// estadísticas) y la matriz abajo. Editar, borrar, deshacer y exportar.
//
// Los eventos del partido viven en memoria mientras está abierto: cada cambio
// va a la base (tv.eventos.*) y se aplica acá igual, sin volver a leer el
// partido entero, así editar un borde con 800 eventos no parpadea.

import { h, llenar, boton, crearIcono, intentar, hacer, divisor, guardarDisposicion, leerMargen, fechaCorta, vacio } from './comun.js';
import {
    datosDePlantilla, ordenDePlantilla, agruparMatriz, filtrarEventos, filtroVacio, filtroActivo,
    opcionesDeFiltro, colorDeEvento, tramoVideo, formatoTiempo, nombreEquipo, estadisticas,
    csvEstadisticas, csvEventos, armarCola, armarPresentacion, seleccionar, crearHistorial, eventoAContrato,
    subcarpetaDePartido, nombreBaseDePartido, ORIGENES
} from './logica.js';
import { crearReproductor } from './reproductor.js';
import { presentar } from './presentacion.js';
import { teclaMod, sumaSeleccion, textoAtajo } from '../../ui/plataforma.js';   // ⌘ en Mac, Ctrl en Windows (Agente 7)
import { crearMatriz } from './matriz.js';
import {
    exportarXml, guardarCsv, exportarClips, clipsDisponibles, MOTIVO_SIN_CLIPS,
    agregarAPlaylist, editarEvento
} from './acciones.js';

export async function abrirPartido(ctx, contenedor, id, { alCerrar, alCambio, disposicion } = {}) {
    const api = ctx.api;
    const partido = await intentar(ctx, () => api.partidos.leer(id), 'No se pudo abrir el partido');
    if (!partido) { if (alCerrar) alCerrar(false); return null; }

    const datos = datosDePlantilla(partido.plantilla);
    const orden = ordenDePlantilla(datos);
    const desfase = Number(partido.desfase) || 0;
    const margen = await leerMargen(api);
    const hayClips = await clipsDisponibles(api);
    let eventos = (partido.eventos || []).filter(e => !e.posesion_de);

    let filtro = filtroVacio();
    let filtrados = [];
    let seleccion = new Set();
    let ancla = null;
    let activo = null;
    let pestana = 'eventos';
    let videoFalta = false;
    const historial = crearHistorial();
    const porId = () => new Map(eventos.map(e => [e.id, e]));

    // ── Piezas ──
    const reproductor = crearReproductor(ctx, {
        alTiempo: (t, reproduciendo) => matriz.cabezal(t, reproduciendo),
        alCambioCola: c => { activo = c ? c.item.eventoId : activo; marcarActivo(); },
        alFaltaVideo: () => { videoFalta = true; pintarArchivos(); }
    });
    const matriz = crearMatriz({
        alSaltar: t => { reproductor.detenerCola(); reproductor.irA(t); },
        alClicBarra: (ev, e) => clicEvento(ev, e),
        alDobleClic: ev => editar(ev),
        alEditarBorde: (ev, { desde, hasta }) => cambiar(ev, { v_inicio: desde, v_fin: hasta }),
        alClicFila: nombre => alternarFiltro('categorias', nombre)
    });

    // ── Encabezado ──
    const titulo = h('span', { class: 'tv-barra__titulo tv-recortar' });
    const chips = h('span', { class: 'tv-base-fila' });
    const btnClips = boton('Clips', {
        icono: 'tijera', titulo: hayClips ? 'Cortar la selección (o lo filtrado) a archivos' : MOTIVO_SIN_CLIPS,
        deshabilitado: !hayClips, alHacer: () => cortarClips()
    });
    const encabezado = h('div', { class: 'tv-barra tv-base-partido__barra' },
        boton('', { icono: 'flecha-izq', clase: 'tv-btn--icono tv-btn--fantasma', titulo: 'Volver a la lista', alHacer: () => alCerrar && alCerrar(false) }),
        titulo,
        boton('', { icono: 'lapiz', clase: 'tv-btn--icono tv-btn--fantasma tv-btn--chico', titulo: 'Renombrar el partido', alHacer: () => renombrar() }),
        chips,
        h('span', { class: 'tv-barra__espacio' }),
        boton('Presentar', { icono: 'video', titulo: 'Los elegidos (o lo filtrado) en pantalla completa, de a uno', alHacer: () => presentarSeleccion() }),
        boton('A playlist', { icono: 'lista', titulo: 'Agregar la selección a una playlist', alHacer: () => aPlaylist() }),
        boton('Exportar', { icono: 'descargar', titulo: 'XML de Sportscode o CSV', alHacer: () => menuExportar() }),
        hayClips ? btnClips : h('span', { title: MOTIVO_SIN_CLIPS }, btnClips),
        boton('', { icono: 'basura', clase: 'tv-btn--icono tv-btn--peligro', titulo: 'Borrar el partido de la base', alHacer: () => borrarPartido() }));

    const archivos = h('div', { class: 'tv-base-archivos tv-chica' });

    // ── Panel de eventos ──
    const tabEventos = h('button', { type: 'button', class: 'tv-base-subtab es-activa', onclick: () => cambiarPestana('eventos') }, 'Eventos');
    const tabEst = h('button', { type: 'button', class: 'tv-base-subtab', onclick: () => cambiarPestana('estadisticas') }, 'Estadísticas');
    const buscador = h('input', { class: 'tv-campo', type: 'search', placeholder: 'Buscar (nombre, etiqueta, línea)…' });
    const filtrosCaja = h('div', { class: 'tv-base-filtros' });
    const resumen = h('span', { class: 'tv-chica tv-texto-2 tv-numeros' });
    const lista = h('div', { class: 'tv-lista tv-base-eventos', role: 'listbox', 'aria-multiselectable': 'true', tabindex: '0' });
    const acciones = h('div', { class: 'tv-base-fila tv-base-eventos__acciones' },
        resumen, h('span', { class: 'tv-barra__espacio' }),
        boton('', { icono: 'play', clase: 'tv-btn--icono tv-btn--chico', titulo: 'Reproducir la selección seguida (Enter) · N / P: siguiente / anterior', alHacer: () => reproducirSeleccion() }),
        boton('', { icono: 'lapiz', clase: 'tv-btn--icono tv-btn--chico', titulo: 'Editar (E)', alHacer: () => { const ev = unoElegido(); if (ev) editar(ev); } }),
        boton('', { icono: 'basura', clase: 'tv-btn--icono tv-btn--chico tv-btn--peligro', titulo: 'Borrar (Supr)', alHacer: () => borrarSeleccion() }));
    const vistaEventos = h('div', { class: 'tv-base-panel__cuerpo' },
        h('div', { class: 'tv-base-panel__filtros' }, buscador, filtrosCaja), acciones, lista);
    const vistaEst = h('div', { class: 'tv-base-panel__cuerpo tv-base-est', hidden: true });
    const panel = h('div', { class: 'tv-base-panel' },
        h('div', { class: 'tv-base-subtabs' }, tabEventos, tabEst), vistaEventos, vistaEst);

    // ── Disposición: video | eventos, matriz abajo ──
    const medio = h('div', { class: 'tv-base-partido__medio' });
    panel.style.width = disposicion.eventos + 'px';
    matriz.el.style.height = disposicion.matriz + 'px';
    medio.append(reproductor.el,
        divisor('x', { medir: () => panel.offsetWidth, poner: px => { panel.style.width = px + 'px'; }, signo: -1, min: 240, max: 700,
            alTerminar: px => guardarDisposicion(api, { eventos: px }) }),
        panel);
    const raiz = h('div', { class: 'tv-base-partido' }, encabezado, archivos, medio,
        divisor('y', { medir: () => matriz.el.offsetHeight, poner: px => { matriz.el.style.height = px + 'px'; }, signo: -1, min: 90, max: 700,
            alTerminar: px => guardarDisposicion(api, { matriz: px }) }),
        matriz.el);
    contenedor.replaceChildren(raiz);

    // ── Pintar ──
    function pintarEncabezado() {
        titulo.textContent = partido.nombre;
        titulo.title = partido.nombre;
        const ch = (t, clase = '') => h('span', { class: 'tv-chip ' + clase }, t);
        llenar(chips,
            partido.local || partido.visitante ? ch(`${partido.local || '—'} vs ${partido.visitante || '—'}`) : null,
            ch(fechaCorta(partido.inicio_real || partido.creado)),
            partido.duracion ? ch(formatoTiempo(partido.duracion)) : null,
            ch(ORIGENES[partido.origen] || ORIGENES.captura, 'tv-chip--acento'));
    }

    function pintarArchivos() {
        const fila = (nombre, ruta, faltaTexto, accionFalta) => h('span', { class: 'tv-base-archivo' + (ruta && !(nombre === 'Video' && videoFalta) ? '' : ' es-falta') },
            crearIcono(nombre === 'Video' ? 'video' : 'documento'),
            h('b', {}, nombre + ':'),
            ruta ? h('span', { class: 'tv-recortar tv-mono', title: ruta }, ruta) : h('span', {}, faltaTexto),
            nombre === 'Video' && videoFalta ? h('span', {}, ' — no se encuentra') : null,
            ruta && !(nombre === 'Video' && videoFalta)
                ? h('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--fantasma', onclick: () => api.archivos.mostrar(ruta) }, 'Mostrar en la carpeta')
                : null,
            accionFalta);
        const faltaVideo = !partido.video_ruta || videoFalta;
        archivos.replaceChildren(
            fila('Video', partido.video_ruta, 'sin video enlazado', faltaVideo
                ? h('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--primario', onclick: () => ctx.navegar('importar', { partidoId: partido.id }) }, 'Vincular video…')
                : null),
            fila('XML', partido.xml_ruta, 'sin XML', !partido.xml_ruta
                ? h('button', { type: 'button', class: 'tv-btn tv-btn--chico', onclick: () => exportarXml(ctx, partido, eventos).then(r => { if (r) { pintarArchivos(); avisarCambio(); } }) }, 'Exportar XML')
                : null));
    }

    function pintarFiltros() {
        const op = opcionesDeFiltro(eventos, orden);
        const grupo = (titulo, items) => items.length ? h('div', { class: 'tv-base-filtro' },
            h('div', { class: 'tv-base-filtro__titulo' }, titulo), h('div', { class: 'tv-base-chips' }, ...items)) : null;
        const chip = (texto, activo, alHacer, color, n) => h('button', {
            type: 'button', class: 'tv-base-chip' + (activo ? ' es-activo' : ''), 'aria-pressed': String(activo), onclick: alHacer
        }, color ? h('i', { class: 'tv-base-punto', style: { background: color } }) : null, texto, h('small', {}, String(n)));

        const porGrupo = new Map();
        op.etiquetas.forEach(et => { if (!porGrupo.has(et.grupo)) porGrupo.set(et.grupo, []); porGrupo.get(et.grupo).push(et); });
        const tiene = (lista, x) => lista.includes(x);
        const tieneEt = et => filtro.etiquetas.some(x => x.grupo === et.grupo && x.texto === et.texto);

        llenar(filtrosCaja,
            grupo('Categorías', op.categorias.map(c => chip(c.nombre, tiene(filtro.categorias, c.nombre),
                () => alternarFiltro('categorias', c.nombre), colorDeEvento(datos, { nombre: c.nombre }), c.n))),
            grupo('Equipo', op.equipos.map(q => chip(nombreEquipo(partido, q.equipo), tiene(filtro.equipos, q.equipo),
                () => alternarFiltro('equipos', q.equipo), null, q.n))),
            ...[...porGrupo.entries()].map(([g, ets]) => grupo(g || 'Etiquetas', ets.map(et => chip(et.texto, tieneEt(et),
                () => alternarEtiqueta(et), null, et.n)))),
            filtroActivo(filtro) ? h('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--fantasma', onclick: () => { filtro = filtroVacio(); buscador.value = ''; refrescar(); } }, 'Limpiar filtros') : null);
    }

    function alternarFiltro(clave, valor) {
        const l = filtro[clave];
        filtro = { ...filtro, [clave]: l.includes(valor) ? l.filter(x => x !== valor) : [...l, valor] };
        refrescar();
    }
    function alternarEtiqueta(et) {
        const ya = filtro.etiquetas.some(x => x.grupo === et.grupo && x.texto === et.texto);
        filtro = { ...filtro, etiquetas: ya ? filtro.etiquetas.filter(x => !(x.grupo === et.grupo && x.texto === et.texto)) : [...filtro.etiquetas, { grupo: et.grupo, texto: et.texto }] };
        refrescar();
    }

    // Filas de la lista, por id: marcar selección y activo sin re-armar todo
    let filasPorId = new Map();
    function pintarLista() {
        filasPorId = new Map();
        if (!filtrados.length) {
            lista.replaceChildren(eventos.length
                ? vacio('filtro', 'Ningún evento pasa el filtro', 'Probá sacando algún filtro.')
                : vacio('lista', 'Este partido no tiene eventos', ''));
            return;
        }
        const frag = document.createDocumentFragment();
        filtrados.forEach(ev => {
            const t = tramoVideo(ev, desfase);
            const fila = h('div', { class: 'tv-lista__fila tv-base-evento', role: 'option', 'data-id': ev.id },
                h('i', { class: 'tv-base-punto', style: { background: colorDeEvento(datos, ev) } }),
                h('div', { class: 'tv-base-evento__texto' },
                    h('div', { class: 'tv-recortar' }, ev.nombre,
                        ev.equipo ? h('span', { class: 'tv-texto-2' }, ' · ' + nombreEquipo(partido, ev.equipo)) : null,
                        ev.linea ? h('span', { class: 'tv-texto-2' }, ' · ' + ev.linea) : null),
                    (ev.etiquetas || []).length ? h('div', { class: 'tv-recortar tv-chica tv-texto-2' },
                        ev.etiquetas.map(et => et.texto).join(' · ')) : null),
                h('span', { class: 'tv-numeros tv-chica tv-texto-2' }, formatoTiempo(t.desde)),
                h('span', { class: 'tv-numeros tv-chica tv-texto-2 tv-base-evento__dur' }, Math.round(t.hasta - t.desde) + ' s'));
            filasPorId.set(ev.id, fila);
            frag.appendChild(fila);
        });
        lista.replaceChildren(frag);
        marcarSeleccion();
    }

    function marcarSeleccion() {
        filasPorId.forEach((fila, id) => fila.setAttribute('aria-selected', String(seleccion.has(id))));
        marcarActivo();
    }
    function marcarActivo() {
        filasPorId.forEach((fila, id) => fila.classList.toggle('es-reproduciendo', id === activo));
        matriz.marcar(seleccion, activo);
    }

    function pintarResumen() {
        const n = filtrados.length, m = eventos.length;
        resumen.textContent = (filtroActivo(filtro) ? `${n} de ${m} eventos` : `${m} eventos`)
            + (seleccion.size ? ` · ${seleccion.size} elegidos` : '');
    }

    function pintarEstadisticas() {
        if (pestana !== 'estadisticas') return;
        const est = estadisticas(filtrados, { posesion: partido.posesion || [], orden });
        const eq = q => nombreEquipo(partido, q);
        const tabla = h('table', { class: 'tv-base-tabla tv-numeros' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Categoría'), h('th', {}, 'Total'),
                ...est.equipos.map(q => h('th', {}, eq(q))), ...est.columnas.map(c => h('th', {}, c)))),
            h('tbody', {}, ...est.filas.map(f => h('tr', {},
                h('td', {}, h('i', { class: 'tv-base-punto', style: { background: colorDeEvento(datos, { nombre: f.nombre }) } }), ' ', f.nombre),
                h('td', {}, String(f.total)),
                ...est.equipos.map(q => h('td', {}, String(f.porEquipo[q] || ''))),
                ...est.columnas.map(c => h('td', { class: f.porEtiqueta[c] ? '' : 'tv-texto-2' }, String(f.porEtiqueta[c] || '·')))))));
        const pos = est.posesion.length ? h('div', { class: 'tv-base-posesion' },
            h('div', { class: 'tv-base-filtro__titulo' }, 'Posesión'),
            h('div', { class: 'tv-base-posesion__barra' }, ...est.posesion.map((p, i) => h('span', {
                style: { flex: String(p.segundos || 0.0001) }, class: 'tv-base-posesion__tramo tv-base-posesion__tramo--' + i,
                title: `${eq(p.equipo)} ${p.porcentaje}%`
            }, `${eq(p.equipo)} ${String(p.porcentaje).replace('.', ',')}%`))),
            ...est.posesion.map(p => h('div', { class: 'tv-chica' }, `${eq(p.equipo)}: ${formatoTiempo(p.segundos)} (${String(p.porcentaje).replace('.', ',')}%)`)))
            : null;
        llenar(vistaEst,
            h('div', { class: 'tv-base-fila' },
                h('span', { class: 'tv-chica tv-texto-2' }, filtroActivo(filtro) ? `Sobre ${filtrados.length} eventos filtrados` : `Sobre los ${eventos.length} eventos`),
                h('span', { class: 'tv-barra__espacio' }),
                boton('CSV', { icono: 'descargar', clase: 'tv-btn--chico', titulo: 'Exportar esta tabla a CSV',
                    alHacer: () => guardarCsv(ctx, { nombre: nombreBaseDePartido(partido) + ' estadísticas', contenido: csvEstadisticas(est, partido), subcarpeta: subcarpetaDePartido(partido) }) })),
            est.filas.length ? h('div', { class: 'tv-base-tabla__caja' }, tabla) : vacio('lista', 'Sin eventos', ''),
            pos);
    }

    function refrescar() {
        filtro.texto = buscador.value;
        filtrados = filtrarEventos(eventos, filtro)
            .sort((a, b) => tramoVideo(a, desfase).desde - tramoVideo(b, desfase).desde);
        // Lo elegido que quedó afuera del filtro deja de estar elegido
        const visibles = new Set(filtrados.map(e => e.id));
        seleccion = new Set([...seleccion].filter(id => visibles.has(id)));
        pintarFiltros();
        pintarLista();
        pintarResumen();
        pintarEstadisticas();
        matriz.poner(agruparMatriz(filtrados, { datos, desfase, orden }), { duracion: duracionTotal() });
        matriz.marcar(seleccion, activo);
    }

    function duracionTotal() {
        return Math.max((Number(partido.duracion) || 0) + desfase, reproductor.duracion || 0);
    }

    function cambiarPestana(p) {
        pestana = p;
        tabEventos.classList.toggle('es-activa', p === 'eventos');
        tabEst.classList.toggle('es-activa', p === 'estadisticas');
        vistaEventos.hidden = p !== 'eventos';
        vistaEst.hidden = p !== 'estadisticas';
        pintarEstadisticas();
    }

    // ── Reproducir ──
    async function reproducirEvento(ev) {
        activo = ev.id;
        marcarActivo();
        if (!partido.video_ruta || videoFalta) return;
        const t = tramoVideo(ev, desfase);
        matriz.mostrar(t.desde);
        reproductor.detenerCola();
        await reproductor.reproducirTramo(partido.video_ruta, Math.max(0, t.desde - margen), t.hasta + margen);
    }

    // Presentar: los elegidos, o lo que pasa el filtro, en el orden del partido.
    function presentarSeleccion() {
        const lista = elegidosOFiltrados();
        if (!lista.length) { ctx.ui.aviso('No hay eventos para presentar', 'aviso'); return; }
        if (!partido.video_ruta || videoFalta) { ctx.ui.aviso('Este partido no tiene video para presentar', 'aviso'); return; }
        const { items } = armarPresentacion(lista, {
            margen, videoDe: () => partido.video_ruta, desfaseDe: () => desfase, partidoDe: () => partido.nombre
        });
        reproductor.pausar();
        presentar(ctx, items, { titulo: partido.nombre });
    }

    function reproducirSeleccion() {
        const lista = seleccion.size ? filtrados.filter(e => seleccion.has(e.id)) : filtrados;
        if (!lista.length) return;
        if (!partido.video_ruta || videoFalta) { ctx.ui.aviso('Este partido no tiene video para reproducir', 'aviso'); return; }
        const { items } = armarCola(lista, { margen, videoDe: () => partido.video_ruta, desfaseDe: () => desfase });
        reproductor.reproducirCola(items);
    }

    function clicEvento(ev, e = {}) {
        const ids = filtrados.map(x => x.id);
        const r = seleccionar(seleccion, ids, ev.id, { shift: e.shiftKey, ctrl: sumaSeleccion(e), ancla });
        seleccion = r.seleccion; ancla = r.ancla;
        marcarSeleccion();
        pintarResumen();
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) reproducirEvento(ev);
    }

    lista.addEventListener('click', e => {
        const fila = e.target.closest('.tv-base-evento');
        if (!fila) return;
        const ev = porId().get(Number(fila.dataset.id)) || porId().get(fila.dataset.id);
        if (ev) clicEvento(ev, e);
    });
    lista.addEventListener('dblclick', e => {
        const fila = e.target.closest('.tv-base-evento');
        const ev = fila && (porId().get(Number(fila.dataset.id)) || porId().get(fila.dataset.id));
        if (ev) editar(ev);
    });
    lista.addEventListener('mousedown', e => { if (e.shiftKey) e.preventDefault(); });  // sin selección de texto
    let esperaBusqueda = 0;
    buscador.addEventListener('input', () => { clearTimeout(esperaBusqueda); esperaBusqueda = setTimeout(refrescar, 150); });

    // ── Editar, borrar, deshacer ──
    function unoElegido() {
        if (seleccion.size === 1) return porId().get([...seleccion][0]);
        if (seleccion.size === 0 && activo !== null) return porId().get(activo);
        ctx.ui.aviso(seleccion.size ? 'Elegí un solo evento' : 'Elegí un evento primero', 'aviso');
        return null;
    }

    const copia = ev => ({ nombre: ev.nombre, v_inicio: ev.v_inicio ?? null, v_fin: ev.v_fin ?? null,
        etiquetas: (ev.etiquetas || []).map(et => ({ grupo: et.grupo, texto: et.texto })) });

    async function cambiar(ev, cambios, { apilar = true } = {}) {
        // Un evento sin v_inicio (sin video) pasa a tenerlo al editarlo
        const antes = copia(ev);
        const r = await hacer(ctx, () => api.eventos.actualizar(ev.id, cambios), 'No se pudo guardar el evento');
        if (!r.ok) { refrescar(); return false; }     // la barra arrastrada vuelve a su lugar
        Object.assign(ev, cambios);
        if (apilar) historial.apilar({ tipo: 'cambio', id: ev.id, antes });
        refrescar();
        return true;
    }

    async function editar(ev) {
        const grupos = [...new Set(eventos.flatMap(e => (e.etiquetas || []).map(et => et.grupo)))];
        const cambios = await editarEvento(ctx, ev, {
            categorias: [...new Set(eventos.map(e => e.nombre))], grupos, desfase,
            ahora: partido.video_ruta && !videoFalta ? reproductor.tiempo : null
        });
        if (cambios) await cambiar(ev, cambios);
    }

    async function marcarBorde(lado) {
        const ev = unoElegido();
        if (!ev) return;
        if (!partido.video_ruta || videoFalta) { ctx.ui.aviso('Sin video no hay cabezal para marcar', 'aviso'); return; }
        const t = tramoVideo(ev, desfase);
        const ahora = Math.round(reproductor.tiempo * 100) / 100;
        const c = lado === 'inicio'
            ? { v_inicio: ahora, v_fin: Math.max(ahora + 0.1, t.hasta) }
            : { v_inicio: Math.min(t.desde, ahora - 0.1), v_fin: ahora };
        if (c.v_inicio < 0) c.v_inicio = 0;
        if (await cambiar(ev, c)) ctx.ui.aviso(`${lado === 'inicio' ? 'Inicio' : 'Fin'} de "${ev.nombre}" en ${formatoTiempo(ahora, { decimas: true })} · ${textoAtajo('Mod+Z')} deshace`, 'ok');
    }

    async function borrarSeleccion() {
        const lista = seleccion.size ? eventos.filter(e => seleccion.has(e.id)) : (activo !== null ? [porId().get(activo)].filter(Boolean) : []);
        if (!lista.length) { ctx.ui.aviso('Elegí qué eventos borrar', 'aviso'); return; }
        const si = await ctx.ui.confirmar(lista.length === 1 ? `¿Borrar "${lista[0].nombre}" en ${formatoTiempo(tramoVideo(lista[0], desfase).desde)}?` : `¿Borrar ${lista.length} eventos?`,
            { titulo: 'Borrar eventos', peligro: true });
        if (!si) return;
        const borrados = [];
        for (const ev of lista) {
            try { await api.eventos.borrar(ev.id); borrados.push(ev); }
            catch (err) { ctx.ui.aviso('No se pudo borrar un evento: ' + ((err && err.message) || err), 'error'); break; }
        }
        const fuera = new Set(borrados.map(e => e.id));
        eventos = eventos.filter(e => !fuera.has(e.id));
        seleccion = new Set();
        if (fuera.has(activo)) activo = null;
        if (borrados.length) historial.apilar({ tipo: 'borrado', eventos: borrados });
        refrescar();
        avisarCambio();
        if (borrados.length) ctx.ui.aviso(`${borrados.length === 1 ? 'Evento borrado' : borrados.length + ' eventos borrados'} · ${textoAtajo('Mod+Z')} deshace`, 'ok');
    }

    async function deshacer() {
        const e = historial.sacar();
        if (!e) { ctx.ui.aviso('No hay nada para deshacer', 'info'); return; }
        if (e.tipo === 'cambio') {
            const ev = porId().get(e.id);
            if (ev) await cambiar(ev, e.antes, { apilar: false });
        } else if (e.tipo === 'borrado') {
            for (const ev of e.eventos) {
                const r = await hacer(ctx, () => api.eventos.agregar(partido.id, eventoAContrato(ev)), 'No se pudo recuperar el evento');
                if (!r.ok) break;
                const viejo = ev.id;
                const recuperado = { ...ev, id: r.valor ?? viejo };
                historial.cambiarId(viejo, recuperado.id);
                eventos.push(recuperado);
            }
            refrescar();
            avisarCambio();
        }
        ctx.ui.aviso('Deshecho', 'info');
    }

    // ── Partido ──
    async function renombrar() {
        const n = await ctx.ui.pedirTexto('Renombrar partido', partido.nombre, { etiqueta: 'Nombre' });
        if (!n || !n.trim() || n.trim() === partido.nombre) return;
        if (!(await hacer(ctx, () => api.partidos.actualizar(partido.id, { nombre: n.trim() }), 'No se pudo renombrar')).ok) return;
        partido.nombre = n.trim();
        pintarEncabezado();
        avisarCambio();
    }

    async function borrarPartido() {
        const si = await ctx.ui.confirmar(
            `Se borra "${partido.nombre}" de la base, con sus ${eventos.length} eventos. El video y el XML quedan en el disco.`,
            { titulo: 'Borrar partido', peligro: true });
        if (!si) return;
        if (!(await hacer(ctx, () => api.partidos.borrar(partido.id), 'No se pudo borrar el partido')).ok) return;
        ctx.ui.aviso('Partido borrado de la base', 'ok');
        if (alCerrar) alCerrar(true);
    }

    function elegidosOFiltrados() {
        return seleccion.size ? filtrados.filter(e => seleccion.has(e.id)) : filtrados;
    }

    async function menuExportar() {
        const sel = elegidosOFiltrados();
        const parcial = seleccion.size || filtroActivo(filtro);
        const que = seleccion.size ? `los ${sel.length} elegidos` : `los ${sel.length} filtrados`;
        const opcion = (valor, titulo, detalle) => h('button', {
            type: 'button', class: 'tv-base-opcion-grande',
            onclick: e => e.currentTarget.dispatchEvent(new CustomEvent('tv-modal-cerrar', { detail: valor, bubbles: true }))
        }, h('b', {}, titulo), h('span', { class: 'tv-chica tv-texto-2' }, detalle));
        const contenido = h('div', { class: 'tv-base-form' },
            opcion('xml', 'XML del partido entero', `${eventos.length} eventos · reemplaza el XML enlazado al partido`),
            parcial ? opcion('xml-parcial', 'XML de ' + que, 'Otro archivo, al lado del XML del partido') : null,
            opcion('csv', 'CSV de ' + (parcial ? que : 'todos los eventos'), 'Para Excel: categoría, tiempos, etiquetas'));
        const valor = await ctx.ui.modal({ titulo: 'Exportar', contenido, botones: [{ texto: 'Cancelar', valor: null }] });
        if (valor === 'xml') { if (await exportarXml(ctx, partido, eventos)) { pintarArchivos(); avisarCambio(); } }
        else if (valor === 'xml-parcial') await exportarXml(ctx, partido, sel, { entero: false });
        else if (valor === 'csv') await guardarCsv(ctx, {
            nombre: nombreBaseDePartido(partido) + (parcial ? ` (${sel.length} eventos)` : ' eventos'),
            contenido: csvEventos(sel, partido), subcarpeta: subcarpetaDePartido(partido)
        });
    }

    async function cortarClips() {
        if (!partido.video_ruta || videoFalta) { ctx.ui.aviso('Este partido no tiene video para cortar', 'aviso'); return; }
        const sel = elegidosOFiltrados();
        const { items } = armarCola(sel, { margen, videoDe: () => partido.video_ruta, desfaseDe: () => desfase });
        await exportarClips(ctx, items, { margen, titulo: `Cortar clips de ${partido.nombre}`, subcarpetaDe: () => subcarpetaDePartido(partido) + '/Clips' });
    }

    async function aPlaylist() {
        const ids = seleccion.size ? [...seleccion] : (activo !== null ? [activo] : []);
        if (!ids.length) { ctx.ui.aviso(`Elegí eventos en la lista o en la matriz (${textoAtajo('Mod')}/Shift para varios)`, 'aviso'); return; }
        await agregarAPlaylist(ctx, filtrados.filter(e => ids.includes(e.id)).map(e => e.id));
    }

    function avisarCambio() {
        if (alCambio) alCambio({ id: partido.id, nombre: partido.nombre, eventos: eventos.length, xml_ruta: partido.xml_ruta });
    }

    // ── Teclado ──
    function teclas(e) {
        const k = e.key;
        if (teclaMod(e) && (k === 'z' || k === 'Z')) { deshacer(); return true; }
        if (teclaMod(e) && (k === 'a' || k === 'A')) {
            seleccion = new Set(filtrados.map(x => x.id)); marcarSeleccion(); pintarResumen(); return true;
        }
        if (e.ctrlKey || e.metaKey) return false;
        if (k === 'Enter') { reproducirSeleccion(); return true; }
        if (k === 'i' || k === 'I') { marcarBorde('inicio'); return true; }
        if (k === 'o' || k === 'O') { marcarBorde('fin'); return true; }
        if (k === 'Delete') { borrarSeleccion(); return true; }
        if (k === 'e' || k === 'E' || k === 'F2') { const ev = unoElegido(); if (ev) editar(ev); return true; }
        if (k === 'Escape' && seleccion.size) { seleccion = new Set(); marcarSeleccion(); pintarResumen(); return true; }
        return reproductor.teclas(e);
    }

    // ── Arranque ──
    pintarEncabezado();
    pintarArchivos();
    refrescar();
    if (partido.video_ruta) {
        reproductor.cargar(partido.video_ruta).then(ok => {
            if (ok) matriz.poner(agruparMatriz(filtrados, { datos, desfase, orden }), { duracion: duracionTotal() });
        });
    } else reproductor.cargar(null);

    return {
        id: partido.id,
        teclas,
        pausar: () => reproductor.pausar(),
        tema: () => matriz.tema(),
        destruir() { reproductor.destruir(); matriz.destruir(); raiz.remove(); }
    };
}
