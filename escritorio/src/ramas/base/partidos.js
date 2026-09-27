// Pestaña Partidos. Dos modos:
//   · lista: la tabla entera con filtros, a todo el ancho;
//   · partido abierto: la lista se achica a una columna a la izquierda
//     (lista | video | eventos, matriz abajo), así se salta de un partido a
//     otro sin volver atrás.

import { h, boton, crearIcono, intentar, hacer, divisor, guardarDisposicion, fechaCorta, vacio } from './comun.js';
import { filtrarPartidos, ordenarPartidos, formatoTiempo, ORIGENES } from './logica.js';
import { abrirPartido } from './partido.js';
import { textoMostrarEnCarpeta } from '../../ui/plataforma.js';   // "Finder" en Mac, "Explorador" en Windows (Agente 7)

export function crearPestanaPartidos(ctx, { disposicion }) {
    const api = ctx.api;
    let partidos = [];
    let filtro = { texto: '', equipo: '', desde: '', hasta: '', conVideo: null, origen: '' };
    let orden = { columna: 'creado', asc: false };
    let vista = null;           // el partido abierto
    let abriendo = 0;

    // ── Filtros ──
    const texto = h('input', { class: 'tv-campo', type: 'search', placeholder: 'Buscar partido o equipo…' });
    const equipo = h('select', { class: 'tv-campo', title: 'Equipo' }, h('option', { value: '' }, 'Todos los equipos'));
    const desde = h('input', { class: 'tv-campo', type: 'date', title: 'Desde' });
    const hasta = h('input', { class: 'tv-campo', type: 'date', title: 'Hasta' });
    const conVideo = h('select', { class: 'tv-campo', title: 'Video' },
        h('option', { value: '' }, 'Con y sin video'), h('option', { value: 'si' }, 'Con video'), h('option', { value: 'no' }, 'Sin video'));
    const origen = h('select', { class: 'tv-campo', title: 'Origen' },
        h('option', { value: '' }, 'Todos los orígenes'),
        ...Object.entries(ORIGENES).map(([k, v]) => h('option', { value: k }, v)));
    const cuenta = h('span', { class: 'tv-chica tv-texto-2 tv-numeros' });
    const barraFiltros = h('div', { class: 'tv-barra tv-base-filtros-partidos' },
        crearIcono('buscar'), texto, equipo, desde, h('span', { class: 'tv-texto-2' }, '–'), hasta, conVideo, origen,
        h('span', { class: 'tv-barra__espacio' }), cuenta,
        boton('', { icono: 'carpeta', clase: 'tv-btn--icono tv-btn--fantasma', titulo: 'Abrir la carpeta de partidos', alHacer: () => api.archivos.abrirCarpeta('Partidos') }));

    const tabla = h('div', { class: 'tv-base-tabla-partidos' });
    const panelLista = h('div', { class: 'tv-base-lista-partidos' }, barraFiltros, tabla);
    const detalle = h('div', { class: 'tv-base-detalle' });
    const div = divisor('x', {
        medir: () => panelLista.offsetWidth, poner: px => { panelLista.style.width = px + 'px'; }, min: 180, max: 520,
        alTerminar: px => guardarDisposicion(api, { lista: px })
    });
    const el = h('div', { class: 'tv-base-partidos' }, panelLista, div, detalle);

    function ponerModo() {
        const abierto = !!vista;
        el.classList.toggle('es-abierto', abierto);
        panelLista.style.width = abierto ? disposicion.lista + 'px' : '';
        div.hidden = detalle.hidden = !abierto;
    }

    // ── Datos ──
    function filtroApi() {
        return {
            texto: filtro.texto || undefined, equipo: filtro.equipo || undefined,
            desde: filtro.desde || undefined, hasta: filtro.hasta || undefined,
            conVideo: filtro.conVideo === null ? undefined : filtro.conVideo, origen: filtro.origen || undefined
        };
    }

    async function cargar() {
        const r = await intentar(ctx, () => api.partidos.listar(filtroApi()), 'No se pudo leer la lista de partidos');
        partidos = Array.isArray(r) ? r : [];
        pintar();
    }

    async function cargarEquipos() {
        const eqs = (await intentar(ctx, () => api.equipos.listar(), 'No se pudieron leer los equipos')) || [];
        const nombres = new Set(eqs.map(e => e.nombre));
        partidos.forEach(p => { if (p.local) nombres.add(p.local); if (p.visitante) nombres.add(p.visitante); });
        const actual = equipo.value;
        equipo.replaceChildren(h('option', { value: '' }, 'Todos los equipos'),
            ...[...nombres].sort((a, b) => a.localeCompare(b)).map(n => h('option', { value: n }, n)));
        equipo.value = actual;
    }

    function leerFiltro() {
        filtro = {
            texto: texto.value.trim(), equipo: equipo.value, desde: desde.value, hasta: hasta.value,
            conVideo: conVideo.value === 'si' ? true : conVideo.value === 'no' ? false : null, origen: origen.value
        };
        cargar();
    }
    let espera = 0;
    texto.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(leerFiltro, 200); });
    [equipo, desde, hasta, conVideo, origen].forEach(x => x.addEventListener('change', leerFiltro));

    // ── Pintar ──
    const COLUMNAS = [
        ['nombre', 'Partido'], ['creado', 'Fecha'], ['equipos', 'Local / visitante'],
        ['duracion', 'Duración'], ['eventos', 'Eventos'], ['origen', 'Origen'], ['archivos', 'Archivos']
    ];

    function pintar() {
        // Mismo filtro que la API, otra vez: con la API simulada o una base
        // vieja que no filtra, la lista igual sale bien.
        const lista = ordenarPartidos(filtrarPartidos(partidos, filtro), orden.columna, orden.asc);
        cuenta.textContent = lista.length === 1 ? '1 partido' : `${lista.length} partidos`;
        if (!lista.length) {
            tabla.replaceChildren(partidos.length || hayFiltro()
                ? vacio('filtro', 'Ningún partido coincide', 'Probá con otro filtro.')
                : vacio('base', 'Todavía no hay partidos', 'Capturá uno o importá un video con su XML.',
                    boton('Captura en vivo', { icono: 'camara', clase: 'tv-btn--primario', alHacer: () => ctx.navegar('captura', {}) }),
                    boton('Importar', { icono: 'importar', alHacer: () => ctx.navegar('importar', {}) })));
            return;
        }
        const compacta = !!vista;
        const cab = compacta ? null : h('div', { class: 'tv-base-tp__cab' }, ...COLUMNAS.map(([k, t]) => {
            const ordenable = k !== 'archivos';
            return h('button', {
                type: 'button', class: 'tv-base-tp__col tv-base-tp__col--' + k + (orden.columna === k ? ' es-orden' : ''),
                disabled: !ordenable,
                onclick: () => { orden = { columna: k, asc: orden.columna === k ? !orden.asc : k === 'nombre' || k === 'equipos' }; pintar(); }
            }, t, orden.columna === k ? (orden.asc ? ' ▲' : ' ▼') : '');
        }));
        const cuerpo = h('div', { class: 'tv-lista tv-base-tp__cuerpo', role: 'listbox' });
        lista.forEach(p => cuerpo.appendChild(compacta ? filaCompacta(p) : filaTabla(p)));
        tabla.replaceChildren(...[cab, cuerpo].filter(Boolean));
    }

    const hayFiltro = () => !!(filtro.texto || filtro.equipo || filtro.desde || filtro.hasta || filtro.conVideo !== null || filtro.origen);

    function iconosArchivos(p) {
        return h('span', { class: 'tv-base-tp__archivos' },
            h('span', { class: p.video_ruta ? 'es-si' : 'es-no', title: p.video_ruta ? 'Video: ' + p.video_ruta : 'Sin video' }, crearIcono('video')),
            h('span', { class: p.xml_ruta ? 'es-si' : 'es-no', title: p.xml_ruta ? 'XML: ' + p.xml_ruta : 'Sin XML' }, crearIcono('documento')));
    }

    function menuFila(p) {
        return h('span', { class: 'tv-base-tp__acciones' },
            boton('', { icono: 'lapiz', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma', titulo: 'Renombrar', alHacer: e => { e.stopPropagation(); renombrar(p); } }),
            boton('', { icono: 'carpeta', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma', titulo: textoMostrarEnCarpeta(), alHacer: e => { e.stopPropagation(); mostrar(p); } }),
            boton('', { icono: 'basura', clase: 'tv-btn--icono tv-btn--chico tv-btn--fantasma tv-btn--peligro', titulo: 'Borrar de la base', alHacer: e => { e.stopPropagation(); borrar(p); } }));
    }

    function filaTabla(p) {
        return h('div', {
            class: 'tv-lista__fila tv-base-tp__fila', role: 'option', tabindex: '0',
            onclick: () => abrir(p.id), onkeydown: e => { if (e.key === 'Enter') abrir(p.id); }
        },
            h('span', { class: 'tv-base-tp__col--nombre tv-recortar', title: p.nombre }, p.nombre),
            h('span', { class: 'tv-base-tp__col--creado tv-numeros tv-texto-2' }, fechaCorta(p.creado)),
            h('span', { class: 'tv-base-tp__col--equipos tv-recortar' }, p.local || p.visitante ? `${p.local || '—'} vs ${p.visitante || '—'}` : ''),
            h('span', { class: 'tv-base-tp__col--duracion tv-numeros' }, p.duracion ? formatoTiempo(p.duracion) : '—'),
            h('span', { class: 'tv-base-tp__col--eventos tv-numeros' }, String(p.eventos ?? '')),
            h('span', { class: 'tv-base-tp__col--origen' }, h('span', { class: 'tv-chip' }, ORIGENES[p.origen] || ORIGENES.captura)),
            h('span', { class: 'tv-base-tp__col--archivos' }, iconosArchivos(p), menuFila(p)));
    }

    function filaCompacta(p) {
        return h('div', {
            class: 'tv-lista__fila tv-base-tp__compacta', role: 'option', tabindex: '0',
            'aria-selected': String(vista && vista.id === p.id), 'data-id': p.id,
            onclick: () => abrir(p.id), onkeydown: e => { if (e.key === 'Enter') abrir(p.id); }
        },
            h('div', { class: 'tv-base-tp__compacta-texto' },
                h('div', { class: 'tv-recortar', title: p.nombre }, p.nombre),
                h('div', { class: 'tv-chica tv-texto-2 tv-numeros' }, fechaCorta(p.creado) + ' · ' + (p.eventos ?? 0) + ' ev.')),
            iconosArchivos(p));
    }

    // ── Acciones ──
    async function abrir(id) {
        const turno = ++abriendo;
        if (vista) { vista.destruir(); vista = null; }
        vista = { id, destruir() {}, teclas: () => false, pausar() {} };   // lugar tomado mientras carga
        ponerModo();
        pintar();
        detalle.replaceChildren(h('div', { class: 'tv-vacio' }, 'Abriendo…'));
        const v = await abrirPartido(ctx, detalle, id, {
            disposicion,
            alCerrar: borrado => { cerrar(); if (borrado) cargar(); },
            alCambio: cambio => {
                const p = partidos.find(x => x.id === cambio.id);
                if (p) Object.assign(p, cambio);
                pintar();
            }
        });
        if (turno !== abriendo) { if (v) v.destruir(); return; }
        vista = v;
        if (!v) { ponerModo(); }
        pintar();
    }

    function cerrar() {
        abriendo++;
        if (vista) vista.destruir();
        vista = null;
        detalle.replaceChildren();
        ponerModo();
        pintar();
    }

    async function renombrar(p) {
        const n = await ctx.ui.pedirTexto('Renombrar partido', p.nombre, { etiqueta: 'Nombre' });
        if (!n || !n.trim() || n.trim() === p.nombre) return;
        if ((await hacer(ctx, () => api.partidos.actualizar(p.id, { nombre: n.trim() }), 'No se pudo renombrar')).ok) {
            p.nombre = n.trim();
            pintar();
        }
    }

    function mostrar(p) {
        if (p.video_ruta) api.archivos.mostrar(p.video_ruta);
        else if (p.xml_ruta) api.archivos.mostrar(p.xml_ruta);
        else ctx.ui.aviso('Este partido no tiene archivos en el disco', 'info');
    }

    async function borrar(p) {
        const si = await ctx.ui.confirmar(
            `Se borra "${p.nombre}" de la base, con sus ${p.eventos ?? 0} eventos. El video y el XML quedan en el disco.`,
            { titulo: 'Borrar partido', peligro: true });
        if (!si) return;
        if ((await hacer(ctx, () => api.partidos.borrar(p.id), 'No se pudo borrar el partido')).ok) {
            ctx.ui.aviso('Partido borrado de la base', 'ok');
            if (vista && vista.id === p.id) cerrar();
            partidos = partidos.filter(x => x.id !== p.id);
            pintar();
        }
    }

    ponerModo();

    return {
        el,
        async activar(params = {}) {
            await cargar();
            cargarEquipos();
            if (params.partidoId !== undefined && params.partidoId !== null) await abrir(params.partidoId);
        },
        refrescar: cargar,
        abrir,
        teclas(e) { return vista ? vista.teclas(e) : false; },
        pausar() { if (vista) vista.pausar(); },
        tema() { if (vista && vista.tema) vista.tema(); },
        destruir() { if (vista) vista.destruir(); vista = null; el.remove(); }
    };
}
