// Lógica pura de la rama Base de datos: sin DOM, sin window.tv.
//
// Todo lo que se puede equivocar sin que se vea (qué eventos pasan un filtro,
// cómo se arma la matriz, qué cuenta la estadística, qué se reproduce y en qué
// orden) vive acá, para probarlo con `node --test` sin abrir la app.

// ─────────────────────────────────────────────
// TIEMPOS Y TEXTOS
// ─────────────────────────────────────────────

// "1:02:03" / "2:05" / "0:07". Igual que formatoTiempo de src/ui, pero acá
// también, para que las pruebas no dependan de otra carpeta.
export function formatoTiempo(seg, { decimas = false } = {}) {
    if (!Number.isFinite(seg)) return '—';
    const neg = seg < 0;
    let s = Math.abs(seg);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const p = n => String(n).padStart(2, '0');
    let seg2 = decimas ? r.toFixed(1).padStart(4, '0') : p(Math.floor(r));
    // 59.96 redondea a "60.0": se deja en 59.9 antes que mostrar un minuto 60
    if (decimas && seg2 === '60.0') seg2 = '59.9';
    const cuerpo = h ? `${h}:${p(m)}:${seg2}` : `${m}:${seg2}`;
    return (neg ? '-' : '') + cuerpo;
}

// Lo inverso: "1:02:03.5", "62.5", "2:05" → segundos. null si no se entiende.
export function parsearTiempo(texto) {
    const t = String(texto ?? '').trim().replace(',', '.');
    if (!t) return null;
    const partes = t.split(':');
    if (partes.length > 3 || partes.some(x => x === '' || isNaN(Number(x)))) return null;
    return partes.reduce((acc, x) => acc * 60 + Number(x), 0);
}

// Nombres limpios para Windows: ni \ / : * ? " < > | ni puntos o espacios al
// final (Windows los come y el archivo queda con otro nombre).
export function nombreLimpio(texto, porDefecto = 'Partido') {
    const limpio = String(texto ?? '')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '');
    return limpio || porDefecto;
}

// La subcarpeta de un partido dentro de la carpeta de trabajo. Si el video ya
// está en Partidos/<carpeta>/, esa carpeta manda (puede tener un "(2)" que el
// nombre del partido no tiene); si no, sale del nombre.
export function subcarpetaDePartido(partido) {
    for (const ruta of [partido.video_ruta, partido.xml_ruta]) {
        const m = /[\\/]Partidos[\\/]([^\\/]+)[\\/][^\\/]+$/.exec(ruta || '');
        if (m) return 'Partidos/' + m[1];
    }
    return 'Partidos/' + nombreLimpio(partido.nombre);
}

// El nombre (sin extensión) que llevan los archivos del partido: el del video
// si hay, así el XML se llama igual y Sportscode los empareja solo.
export function nombreBaseDePartido(partido) {
    for (const ruta of [partido.video_ruta, partido.xml_ruta]) {
        const m = /([^\\/]+?)(\.[^.\\/]*)?$/.exec(ruta || '');
        if (m && m[1]) return m[1];
    }
    return nombreLimpio(partido.nombre);
}

export function csvCampo(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Punto y coma: el Excel en español abre así el CSV sin preguntar nada (con
// coma lo mete todo en una columna, porque la coma es el decimal).
export function armarCsv(filas) {
    return filas.map(f => f.map(csvCampo).join(';')).join('\r\n') + '\r\n';
}

const numCsv = n => Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '';

// ─────────────────────────────────────────────
// PLANTILLA → COLORES Y ORDEN
// ─────────────────────────────────────────────

// Los mismos colores por defecto que defaultColor() del iPad (app.js): un
// botón que nunca se pintó sale igual en la matriz que en la botonera.
const COLOR_POR_TIPO = {
    event: '#3a8fd6', popup_label: '#f8d022', descriptor: '#fef08a',
    sticky_label: '#fdba74', line: '#4c51bf', text: '#1c1c1e'
};

// La columna `plantilla` de la base es el JSON de {elements, links, hojas};
// puede venir ya parseada (api simulada) o no venir.
export function datosDePlantilla(valor) {
    if (!valor) return { elements: [], links: [], hojas: [] };
    let d = valor;
    if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (_) { return { elements: [], links: [], hojas: [] }; }
    }
    return {
        elements: Array.isArray(d.elements) ? d.elements : [],
        links: Array.isArray(d.links) ? d.links : [],
        hojas: Array.isArray(d.hojas) ? d.hojas : []
    };
}

export function coloresEquipos(datos) {
    const tarjeta = (datos.elements || []).find(x => x.type === 'teams');
    return { A: (tarjeta && tarjeta.colorA) || '#3a8fd6', B: (tarjeta && tarjeta.colorB) || '#dc2626' };
}

// Mismo criterio que rgbDeEvento del iPad: primero el botón por id, después
// un evento con ese nombre; la posesión toma el color de cada equipo.
export function colorDeEvento(datos, ev) {
    const els = datos.elements || [];
    const bid = ev.boton_id ?? ev.botonId;
    let e = bid !== null && bid !== undefined ? els.find(x => String(x.id) === String(bid)) : null;
    if (!e) e = els.find(x => x.type === 'event' && x.name === ev.nombre);
    let hex = (e && e.color) || COLOR_POR_TIPO[e ? e.type : 'event'] || '#3a8fd6';
    if (ev.equipo === 'A' || ev.equipo === 'B') hex = coloresEquipos(datos)[ev.equipo];
    return normalizarHex(hex);
}

export function normalizarHex(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : '#3a8fd6';
}

// Letra legible sobre un color de botón (misma cuenta que brightness() del iPad).
export function textoSobre(hex) {
    const h = normalizarHex(hex).slice(1);
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000' : '#fff';
}

export function nombreEquipo(partido, equipo) {
    if (equipo === 'A') return partido.local || 'Local';
    if (equipo === 'B') return partido.visitante || 'Visitante';
    return equipo || '';
}

// ─────────────────────────────────────────────
// EVENTOS: RELOJ DE VIDEO
// ─────────────────────────────────────────────

// Dónde cae el evento en el archivo de video. v_inicio es la verdad; un
// evento sin v_inicio (codificado sin video, o importado de un XML) cae en
// inicio + desfase, que es la definición de desfase del contrato.
export function tramoVideo(ev, desfase = 0) {
    const vi = Number.isFinite(ev.v_inicio) ? ev.v_inicio : (Number(ev.inicio) || 0) + (desfase || 0);
    let vf = Number.isFinite(ev.v_fin) ? ev.v_fin
        : Number.isFinite(ev.fin) ? ev.fin + (desfase || 0) : vi + 1;
    if (vf < vi) vf = vi;
    return { desde: vi, hasta: vf };
}

// ─────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────

// filtro = { categorias:[nombre], etiquetas:[{grupo,texto}], equipos:[A|B|…],
//            texto:'' }
// Y entre grupos, O dentro del grupo: "Tiro O Córner" Y "Resultado: Gol".
// Las etiquetas se agrupan por su propio `grupo`: dos textos del mismo grupo
// se suman (O), dos grupos distintos se exigen (Y).
export function filtroVacio() {
    return { categorias: [], etiquetas: [], equipos: [], texto: '' };
}

export function filtroActivo(f) {
    return !!(f && ((f.categorias || []).length || (f.etiquetas || []).length
        || (f.equipos || []).length || String(f.texto || '').trim()));
}

const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function pasaFiltro(ev, f) {
    if (!f) return true;
    if ((f.categorias || []).length && !f.categorias.includes(ev.nombre)) return false;
    if ((f.equipos || []).length && !f.equipos.includes(ev.equipo || '')) return false;

    if ((f.etiquetas || []).length) {
        const porGrupo = new Map();
        f.etiquetas.forEach(et => {
            if (!porGrupo.has(et.grupo)) porGrupo.set(et.grupo, new Set());
            porGrupo.get(et.grupo).add(et.texto);
        });
        const tiene = ev.etiquetas || [];
        for (const [grupo, textos] of porGrupo) {
            if (!tiene.some(et => et.grupo === grupo && textos.has(et.texto))) return false;
        }
    }

    const texto = sinTildes(f.texto).trim();
    if (texto) {
        const pajar = sinTildes([ev.nombre, ev.linea, ev.partido_nombre,
            ...(ev.etiquetas || []).map(et => et.grupo + ' ' + et.texto)].join(' '));
        // Cada palabra tiene que estar, en cualquier orden
        if (!texto.split(/\s+/).every(p => pajar.includes(p))) return false;
    }
    return true;
}

export function filtrarEventos(eventos, f) {
    return filtroActivo(f) ? eventos.filter(ev => pasaFiltro(ev, f)) : eventos.slice();
}

// Qué se puede elegir en el panel de filtros, con cuántos eventos hay de cada
// cosa. Las categorías vienen en el orden de la matriz.
export function opcionesDeFiltro(eventos, orden = []) {
    const cats = new Map(), ets = new Map(), eqs = new Map();
    eventos.forEach(ev => {
        cats.set(ev.nombre, (cats.get(ev.nombre) || 0) + 1);
        if (ev.equipo) eqs.set(ev.equipo, (eqs.get(ev.equipo) || 0) + 1);
        (ev.etiquetas || []).forEach(et => {
            const k = et.grupo + '\u0000' + et.texto;
            ets.set(k, (ets.get(k) || 0) + 1);
        });
    });
    const categorias = ordenarCategorias([...cats.keys()], orden).map(n => ({ nombre: n, n: cats.get(n) }));
    const etiquetas = [...ets.entries()]
        .map(([k, n]) => { const [grupo, texto] = k.split('\u0000'); return { grupo, texto, n }; })
        .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.texto.localeCompare(b.texto));
    const equipos = [...eqs.entries()].map(([equipo, n]) => ({ equipo, n }))
        .sort((a, b) => String(a.equipo).localeCompare(String(b.equipo)));
    return { categorias, etiquetas, equipos };
}

// Filtro de la lista de partidos. La API ya filtra, pero la simulada puede no
// hacerlo y aplicar dos veces el mismo filtro no cambia nada.
// f = { texto, equipo, desde:'AAAA-MM-DD', hasta, conVideo: true|false|null, origen }
export function filtrarPartidos(partidos, f = {}) {
    const texto = sinTildes(f.texto).trim();
    const equipo = sinTildes(f.equipo).trim();
    return partidos.filter(p => {
        if (texto) {
            const pajar = sinTildes([p.nombre, p.local, p.visitante].join(' '));
            if (!texto.split(/\s+/).every(x => pajar.includes(x))) return false;
        }
        if (equipo && sinTildes(p.local) !== equipo && sinTildes(p.visitante) !== equipo) return false;
        const dia = fechaLocal(p.creado);
        if (f.desde && dia && dia < f.desde) return false;
        if (f.hasta && dia && dia > f.hasta) return false;
        if (f.conVideo === true && !p.video_ruta) return false;
        if (f.conVideo === false && p.video_ruta) return false;
        if (f.origen && (p.origen || 'captura') !== f.origen) return false;
        return true;
    });
}

// "AAAA-MM-DD" en hora local: es lo que devuelve un <input type=date>.
export function fechaLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const ORIGENES = {
    'captura': 'Captura',
    'ipad-vivo': 'iPad en vivo',
    'ipad-importado': 'iPad importado',
    'importado': 'Importado'
};

// Ordena la lista de partidos por una columna. Los vacíos van al final.
export function ordenarPartidos(partidos, columna = 'creado', asc = false) {
    const valor = p => {
        if (columna === 'equipos') return sinTildes((p.local || '') + ' ' + (p.visitante || ''));
        if (columna === 'nombre' || columna === 'origen') return sinTildes(p[columna] || '');
        return p[columna] ?? null;
    };
    return partidos.slice().sort((a, b) => {
        const va = valor(a), vb = valor(b);
        if (va === vb) return 0;
        if (va === null || va === '') return 1;
        if (vb === null || vb === '') return -1;
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return asc ? c : -c;
    });
}

// ─────────────────────────────────────────────
// MATRIZ (línea de tiempo)
// ─────────────────────────────────────────────

// Las categorías en el orden en que están en la botonera (arriba a la
// izquierda primero, como se leen), y las que no están en la plantilla
// (renombradas, importadas) al final, alfabéticas.
export function ordenDePlantilla(datos) {
    const hojas = [null, ...(datos.hojas || []).map(h => h.id)];
    const indiceHoja = e => Math.max(0, hojas.indexOf(e.hoja ?? null));
    return (datos.elements || [])
        .filter(e => e.type === 'event' && e.name)
        .sort((a, b) => indiceHoja(a) - indiceHoja(b) || (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0))
        .map(e => e.name)
        .filter((n, i, arr) => arr.indexOf(n) === i);
}

export function ordenarCategorias(nombres, orden = []) {
    const pos = new Map(orden.map((n, i) => [n, i]));
    return nombres.slice().sort((a, b) => {
        const pa = pos.has(a) ? pos.get(a) : Infinity, pb = pos.has(b) ? pos.get(b) : Infinity;
        return pa !== pb ? pa - pb : String(a).localeCompare(String(b));
    });
}

// Una fila por categoría, con sus eventos ordenados por tiempo de video y ya
// convertidos a {desde, hasta}. La matriz dibuja esto sin volver a calcular.
export function agruparMatriz(eventos, { datos = { elements: [] }, desfase = 0, orden = null } = {}) {
    const filas = new Map();
    eventos.forEach(ev => {
        if (!filas.has(ev.nombre)) filas.set(ev.nombre, []);
        const { desde, hasta } = tramoVideo(ev, desfase);
        filas.get(ev.nombre).push({ ev, desde, hasta, color: colorDeEvento(datos, ev) });
    });
    const nombres = ordenarCategorias([...filas.keys()], orden || ordenDePlantilla(datos));
    return nombres.map(nombre => {
        const barras = filas.get(nombre).sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
        // La fila lleva el color del botón; cada barra, el suyo (la posesión
        // pinta cada tramo del color de su equipo, como el iPad)
        const color = colorDeEvento(datos, { ...barras[0].ev, equipo: null });
        return { nombre, color, barras };
    });
}

// Las barras de una fila que tocan el instante t, con tolerancia (en
// segundos) para que una barra de un píxel se pueda agarrar.
export function barrasEn(fila, t, tolerancia = 0) {
    const out = [];
    for (const b of fila.barras) {
        if (b.desde - tolerancia > t) break;       // ordenadas por desde
        if (b.hasta + tolerancia >= t) out.push(b);
    }
    return out;
}

// Paso de las marcas de la regla para que queden a ~80 px o más.
export function pasoDeRegla(pxPorSeg, minPx = 80) {
    const pasos = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    return pasos.find(p => p * pxPorSeg >= minPx) || 3600;
}

// Zoom alrededor de un punto: el segundo que estaba bajo el mouse sigue ahí.
export function zoomEn({ pxPorSeg, scroll }, factor, xMouse, { min = 0.05, max = 400 } = {}) {
    const t = (scroll + xMouse) / pxPorSeg;
    const nuevo = Math.min(max, Math.max(min, pxPorSeg * factor));
    return { pxPorSeg: nuevo, scroll: Math.max(0, t * nuevo - xMouse) };
}

// ─────────────────────────────────────────────
// ESTADÍSTICAS
// ─────────────────────────────────────────────

// Conteo categoría × etiqueta y categoría × equipo, más la posesión.
export function estadisticas(eventos, { posesion = [], orden = [] } = {}) {
    const categorias = ordenarCategorias([...new Set(eventos.map(e => e.nombre))], orden);
    const clave = et => et.grupo ? et.grupo + ': ' + et.texto : et.texto;
    const columnas = [...new Set(eventos.flatMap(e => (e.etiquetas || []).map(clave)))].sort();
    const equipos = [...new Set(eventos.map(e => e.equipo).filter(Boolean))].sort();

    const filas = categorias.map(nombre => {
        const deCat = eventos.filter(e => e.nombre === nombre);
        const porEtiqueta = {}, porEquipo = {};
        columnas.forEach(c => { porEtiqueta[c] = 0; });
        equipos.forEach(q => { porEquipo[q] = 0; });
        let duracion = 0;
        deCat.forEach(e => {
            // Un evento con dos veces la misma etiqueta cuenta una
            new Set((e.etiquetas || []).map(clave)).forEach(c => { porEtiqueta[c]++; });
            if (e.equipo) porEquipo[e.equipo]++;
            const t = tramoVideo(e);
            duracion += Math.max(0, t.hasta - t.desde);
        });
        return { nombre, total: deCat.length, duracion, porEtiqueta, porEquipo };
    });

    return { filas, columnas, equipos, posesion: resumenPosesion(posesion), total: eventos.length };
}

// Tiempo y % de posesión por equipo, a partir de los tramos cerrados.
export function resumenPosesion(tramos = []) {
    const por = new Map();
    tramos.forEach(t => {
        const d = Math.max(0, (Number(t.fin) || 0) - (Number(t.inicio) || 0));
        const k = t.equipo || '';
        por.set(k, (por.get(k) || 0) + d);
    });
    const total = [...por.values()].reduce((a, b) => a + b, 0);
    return [...por.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        .map(([equipo, segundos]) => ({
            equipo, segundos, porcentaje: total ? Math.round(segundos / total * 1000) / 10 : 0
        }));
}

export function csvEstadisticas(est, partido = {}) {
    const eq = q => nombreEquipo(partido, q);
    const filas = [['Categoría', 'Total', 'Duración (s)', ...est.equipos.map(eq), ...est.columnas]];
    est.filas.forEach(f => filas.push([
        f.nombre, f.total, numCsv(f.duracion),
        ...est.equipos.map(q => f.porEquipo[q]), ...est.columnas.map(c => f.porEtiqueta[c])
    ]));
    if (est.posesion.length) {
        filas.push([]);
        filas.push(['Posesión', 'Segundos', '%']);
        est.posesion.forEach(p => filas.push([eq(p.equipo), numCsv(p.segundos), numCsv(p.porcentaje)]));
    }
    return armarCsv(filas);
}

export function csvEventos(eventos, partido = {}) {
    const filas = [['Partido', 'Categoría', 'Equipo', 'Línea', 'Inicio', 'Fin', 'Duración (s)',
        'Inicio video (s)', 'Fin video (s)', 'Etiquetas']];
    eventos.forEach(ev => {
        const t = tramoVideo(ev, partido.desfase);
        filas.push([
            ev.partido_nombre || partido.nombre || '', ev.nombre, nombreEquipo(partido, ev.equipo),
            ev.linea || '', formatoTiempo(ev.inicio, { decimas: true }),
            Number.isFinite(ev.fin) ? formatoTiempo(ev.fin, { decimas: true }) : '',
            numCsv(t.hasta - t.desde), numCsv(t.desde), numCsv(t.hasta),
            (ev.etiquetas || []).map(et => et.grupo + ': ' + et.texto).join(' | ')
        ]);
    });
    return armarCsv(filas);
}

// ─────────────────────────────────────────────
// COLA DE REPRODUCCIÓN
// ─────────────────────────────────────────────

// Lista de tramos a reproducir seguidos, con el margen de los ajustes. Cada
// tramo sabe de qué archivo es: una playlist mezcla partidos y el reproductor
// cambia de video solo. Los que no tienen video se saltean (y se cuentan).
// Dos tramos del mismo archivo que se pisan por el margen no se juntan: cada
// clip se ve entero, que es lo que se pidió.
export function armarCola(eventos, { margen = 0, videoDe = ev => ev.video_ruta, desfaseDe = () => 0 } = {}) {
    const items = [];
    let sinVideo = 0;
    eventos.forEach(ev => {
        const ruta = videoDe(ev);
        if (!ruta) { sinVideo++; return; }
        const t = tramoVideo(ev, desfaseDe(ev));
        items.push({
            ruta, eventoId: ev.id,
            desde: Math.max(0, t.desde - margen),
            hasta: Math.max(t.hasta + margen, t.desde + 0.5),
            titulo: ev.nombre + (ev.partido_nombre ? ' · ' + ev.partido_nombre : '')
        });
    });
    return { items, sinVideo };
}

// La cola de una presentación: la de armarCola, y cada clip con lo que se
// muestra en pantalla grande (nombre, de qué partido, etiquetas y la nota de
// la playlist si tiene). `notaDe(ev)` y `partidoDe(ev)` son opcionales.
export function armarPresentacion(eventos, { notaDe = () => '', partidoDe = ev => ev.partido_nombre || '', ...opciones } = {}) {
    const { items, sinVideo } = armarCola(eventos, opciones);
    // Un mismo evento puede estar dos veces (una playlist lo permite): se
    // empareja por orden, no por id.
    const conVideo = eventos.filter(ev => (opciones.videoDe || (e => e.video_ruta))(ev));
    return {
        sinVideo,
        items: items.map((it, i) => {
            const ev = conVideo[i];
            const etiquetas = (ev.etiquetas || []).map(et => et.texto).filter(Boolean);
            return {
                ...it,
                nombre: ev.nombre || 'Clip',
                detalle: [partidoDe(ev), ev.equipo ? (ev.equipo === 'A' ? 'Local' : ev.equipo === 'B' ? 'Visitante' : ev.equipo) : '',
                          etiquetas.join(', ')].filter(Boolean).join(' · '),
                nota: String(notaDe(ev) || '').trim()
            };
        })
    };
}

// Índice siguiente / anterior sin salirse. -1 si no hay a dónde ir.
export function pasoCola(cola, indice, delta) {
    const i = indice + delta;
    return i >= 0 && i < cola.length ? i : -1;
}

// Cortes para tv.clips.exportar, agrupados por archivo (la API corta de a un
// video por vez). Los nombres llevan el orden para que el Explorador los
// muestre en el orden de la lista.
export function cortesPorVideo(items, nombreDe = it => it.titulo) {
    const por = new Map();
    const ancho = String(items.length).length;
    items.forEach((it, i) => {
        if (!por.has(it.ruta)) por.set(it.ruta, []);
        por.get(it.ruta).push({
            desde: round2(it.desde), hasta: round2(it.hasta),
            nombre: nombreLimpio(String(i + 1).padStart(ancho, '0') + ' ' + nombreDe(it), 'Clip')
        });
    });
    return [...por.entries()].map(([ruta, cortes]) => ({ ruta, cortes }));
}

const round2 = n => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────
// SELECCIÓN (clic, Shift, Ctrl)
// ─────────────────────────────────────────────

// ids = el orden visible de la lista. Devuelve la selección nueva y el ancla.
export function seleccionar(actual, ids, id, { shift = false, ctrl = false, ancla = null } = {}) {
    const sel = new Set(actual);
    if (shift && ancla !== null && ids.includes(ancla)) {
        const a = ids.indexOf(ancla), b = ids.indexOf(id);
        const [i, j] = a < b ? [a, b] : [b, a];
        if (!ctrl) sel.clear();
        ids.slice(i, j + 1).forEach(x => sel.add(x));
        return { seleccion: sel, ancla };
    }
    if (ctrl) {
        if (sel.has(id)) sel.delete(id); else sel.add(id);
        return { seleccion: sel, ancla: id };
    }
    return { seleccion: new Set([id]), ancla: id };
}

// Mover un elemento de una lista (reordenar arrastrando).
export function mover(lista, desde, hasta) {
    const out = lista.slice();
    if (desde < 0 || desde >= out.length) return out;
    const [x] = out.splice(desde, 1);
    out.splice(Math.max(0, Math.min(out.length, hasta)), 0, x);
    return out;
}

// ─────────────────────────────────────────────
// DESHACER
// ─────────────────────────────────────────────

// Pila simple de cambios. Cada entrada sabe deshacerse sola (la función la
// pone quien la apila, porque sabe hablar con la base).
export function crearHistorial(limite = 100) {
    const pila = [];
    return {
        apilar(entrada) { pila.push(entrada); if (pila.length > limite) pila.shift(); },
        sacar() { return pila.pop() || null; },
        get largo() { return pila.length; },
        // Un evento borrado vuelve con otro id: las entradas viejas se corrigen
        cambiarId(viejo, nuevo) { pila.forEach(e => { if (e.id === viejo) e.id = nuevo; }); },
        vaciar() { pila.length = 0; }
    };
}

// ─────────────────────────────────────────────
// PLANTILLAS
// ─────────────────────────────────────────────

const TIPOS_CON_ATAJO = new Set(['event', 'descriptor', 'sticky_label', 'popup_label', 'line', 'possession', 'counter']);

export const NOMBRE_TIPO = {
    event: 'Evento', descriptor: 'Etiqueta', sticky_label: 'Etiqueta fija',
    popup_label: 'Etiqueta emergente', counter: 'Contador', container: 'Contenedor',
    line: 'Línea', teams: 'Equipos', possession: 'Posesión', text: 'Texto', image: 'Imagen'
};

// Los botones que se tocan en vivo, en orden de lectura, con su atajo.
export function botonesDePlantilla(datos) {
    const hojas = new Map((datos.hojas || []).map(h => [h.id, h.name]));
    return (datos.elements || [])
        .filter(e => TIPOS_CON_ATAJO.has(e.type))
        .map(e => ({
            id: e.id, nombre: e.name || NOMBRE_TIPO[e.type] || e.type, tipo: e.type,
            color: e.type === 'counter' ? null : normalizarHex(e.color || COLOR_POR_TIPO[e.type]),
            atajo: e.atajo || '', hoja: e.hoja ? (hojas.get(e.hoja) || 'Pestaña') : 'Principal'
        }));
}

// Teclas usadas por más de un botón. Mayúsculas y minúsculas son la misma.
export function atajosRepetidos(datos) {
    const por = new Map();
    (datos.elements || []).forEach(e => {
        const k = String(e.atajo || '').toLowerCase();
        if (!k) return;
        if (!por.has(k)) por.set(k, []);
        por.get(k).push(e.id);
    });
    return new Map([...por.entries()].filter(([, ids]) => ids.length > 1));
}

// Una tecla sirve de atajo si es una sola letra, número o símbolo, o F1-F12.
// Espacio y las flechas quedan para el reproductor y el PLAY.
export function atajoValido(tecla) {
    const t = String(tecla || '');
    if (!t) return true;                           // vacío = sin atajo
    if (/^F([1-9]|1[0-2])$/.test(t)) return true;
    return t.length === 1 && t !== ' ';
}

// Copia de los datos con el atajo cambiado en un elemento.
export function conAtajo(datos, elementoId, tecla) {
    return {
        ...datos,
        elements: datos.elements.map(e => {
            if (String(e.id) !== String(elementoId)) return e;
            const nuevo = { ...e };
            if (tecla) nuevo.atajo = tecla.length === 1 ? tecla.toLowerCase() : tecla;
            else delete nuevo.atajo;
            return nuevo;
        })
    };
}

// Rectángulos de la miniatura cuando no está botonera-vista.js: solo la hoja
// principal, escalada para entrar en ancho × alto.
export function rectangulosMiniatura(datos, ancho, alto) {
    const els = (datos.elements || []).filter(e => !e.hoja && e.type !== 'text' && Number.isFinite(e.x));
    if (!els.length) return [];
    const x0 = Math.min(...els.map(e => e.x)), y0 = Math.min(...els.map(e => e.y));
    const x1 = Math.max(...els.map(e => e.x + (e.w || 0))), y1 = Math.max(...els.map(e => e.y + (e.h || 0)));
    const k = Math.min(ancho / Math.max(1, x1 - x0), alto / Math.max(1, y1 - y0));
    return els.map(e => ({
        x: (e.x - x0) * k, y: (e.y - y0) * k, w: Math.max(1, (e.w || 0) * k), h: Math.max(1, (e.h || 0) * k),
        color: e.type === 'container' ? null : normalizarHex(e.color || COLOR_POR_TIPO[e.type]),
        contenedor: e.type === 'container'
    }));
}

// ─────────────────────────────────────────────
// PARTIDO DE LA BASE → FORMATO DEL CONTRATO
// ─────────────────────────────────────────────

// tv.partidos.leer devuelve snake_case; xmlSportscode (nucleo/exportar.js) y
// tv.eventos.agregar hablan el formato PARTIDO del contrato, en camelCase.
export function eventoAContrato(ev) {
    return {
        nombre: ev.nombre, botonId: ev.boton_id ?? ev.botonId ?? null, equipo: ev.equipo || null,
        linea: ev.linea || null, inicio: ev.inicio, fin: ev.fin ?? null,
        vInicio: ev.v_inicio ?? ev.vInicio ?? null, vFin: ev.v_fin ?? ev.vFin ?? null,
        etiquetas: (ev.etiquetas || []).map(et => ({ grupo: et.grupo, texto: et.texto }))
    };
}

// El partido listo para xmlSportscode. Ese XML va al lado del video y con su
// mismo nombre, para que Sportscode los empareje: sus <start>/<end> tienen
// que ser segundos DEL VIDEO, no del reloj del partido (que se frena en las
// pausas). xmlSportscode escribe inicio/fin, así que acá se reemplazan por
// el tramo de video de cada evento.
export function partidoParaXml(p, eventos = p.eventos || []) {
    const c = partidoAContrato(p, eventos);
    c.eventos = c.eventos.map((ev, i) => {
        const t = tramoVideo(eventos[i], p.desfase);
        return { ...ev, inicio: round2(t.desde), fin: round2(t.hasta) };
    });
    return c;
}

export function partidoAContrato(p, eventos = p.eventos || []) {
    return {
        id: p.id, nombre: p.nombre, inicioReal: p.inicio_real ?? p.inicioReal ?? null,
        duracion: p.duracion, videoRuta: p.video_ruta ?? p.videoRuta ?? null,
        videoMime: p.video_mime ?? null, videoBytes: p.video_bytes ?? null,
        xmlRuta: p.xml_ruta ?? p.xmlRuta ?? null, local: p.local, visitante: p.visitante,
        plantilla: typeof p.plantilla === 'string' ? p.plantilla : JSON.stringify(p.plantilla || null),
        plantillaId: p.plantilla_id ?? p.plantillaId ?? null, origen: p.origen || 'captura',
        desfase: p.desfase || 0,
        eventos: eventos.map(eventoAContrato),
        posesion: (p.posesion || []).map(t => ({ equipo: t.equipo, inicio: t.inicio, fin: t.fin }))
    };
}
