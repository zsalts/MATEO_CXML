// Lógica pura del editor de plantillas de la compu: sin DOM, sin window.tv.
//
// El editor trabaja sobre una copia de la plantilla ya normalizada (el mismo
// { elements, links, hojas } del iPad) y estas funciones la cambian EN EL
// LUGAR: el que llama se encarga de copiar antes si quiere deshacer. Así la
// plantilla que sale de acá la abre el iPad sin enterarse de dónde se armó.

import { TIPOS, ANCHO_BOTON, ALTO_BOTON, MARGEN_LIENZO, elementosDeHoja } from '../../nucleo/plantilla.js';

// El nombre con el que nace cada tipo, el mismo texto que en la paleta.
export const NOMBRE_NUEVO = {
    event: 'Evento', descriptor: 'Etiqueta', sticky_label: 'Etiqueta fija',
    popup_label: 'Emergente', counter: 'Contador', container: '',
    line: 'Línea', possession: 'Posesión', text: 'Texto', teams: 'Equipos', image: ''
};

// Lo que createElement() de app.js le pone a cada tipo. Los tamaños los
// completa normalizar(); acá van los campos que el Inspector del iPad trae
// cargados desde el principio.
const TAMANO = {
    event: [ANCHO_BOTON, ALTO_BOTON], descriptor: [ANCHO_BOTON, ALTO_BOTON],
    sticky_label: [ANCHO_BOTON, ALTO_BOTON], popup_label: [ANCHO_BOTON, ALTO_BOTON],
    counter: [80, 60], container: [200, 180], line: [140, 52], possession: [260, 72],
    text: [180, 44], teams: [300, 56], image: [240, 180]
};

export const PASO_REJILLA = 4;

export function plantillaVacia() {
    return { elements: [], links: [], hojas: [] };
}

// Ids numéricos como los del iPad (Date.now()), sin repetir aunque se creen
// diez en el mismo milisegundo.
export function nuevoId(datos, ahora = Date.now()) {
    let max = ahora;
    (datos.elements || []).forEach(e => { if (typeof e.id === 'number' && e.id >= max) max = e.id + 1; });
    return max;
}

export function nuevoIdHoja(datos, ahora = Date.now()) {
    const usados = new Set((datos.hojas || []).map(h => h.id));
    let n = ahora;
    while (usados.has('h_' + n)) n++;
    return 'h_' + n;
}

export const rejilla = (v, paso = PASO_REJILLA) => Math.round(v / paso) * paso;

const seTocan = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// El primer hueco libre de la pestaña, leyendo como un texto: de izquierda a
// derecha y de arriba abajo, sin pasarse del ancho que ya tiene la botonera
// (o `anchoMax`, si está vacía). Un botón nuevo nunca cae encima de otro ni
// a medias sobre un contenedor: para meterlo adentro, se arrastra.
export function lugarLibre(datos, hoja, w, h, { anchoMax = 900 } = {}) {
    const otros = elementosDeHoja(datos, hoja);
    const ancho = Math.max(anchoMax, ...otros.map(e => e.x + e.w));
    const pasoX = w + 10, pasoY = h + 10;
    for (let y = MARGEN_LIENZO; y < 5000; y += pasoY) {
        for (let x = MARGEN_LIENZO; x + w <= ancho; x += pasoX) {
            const caja = { x, y, w, h };
            if (!otros.some(o => seTocan(caja, o))) return { x, y };
        }
    }
    return { x: MARGEN_LIENZO, y: MARGEN_LIENZO };
}

// Un elemento nuevo del tipo pedido, en `donde` o en el primer hueco libre.
export function crearElemento(datos, tipo, { hoja = null, donde = null, ahora } = {}) {
    if (!TIPOS.includes(tipo)) throw new Error('Tipo desconocido: ' + tipo);
    const [w, h] = TAMANO[tipo];
    const lugar = donde ? { x: rejilla(Math.max(0, donde.x)), y: rejilla(Math.max(0, donde.y)) }
                        : lugarLibre(datos, hoja, w, h);
    const e = {
        id: nuevoId(datos, ahora), type: tipo, name: NOMBRE_NUEVO[tipo] ?? '', color: null,
        x: lugar.x, y: lugar.y, w, h,
        timeMode: 'fixed', exclusiveIds: [], isExclusive: false,
        lead: 0, lag: 1, popups: [], lineMemberIds: [], lineExclusive: true,
        hoja: hoja || null, subHojaId: null
    };
    // Un evento nace con margen para que el clip se entienda solo: 5 s antes
    // de tocarlo y 5 después.
    if (tipo === 'event') { e.lead = 5; e.lag = 5; }
    if (tipo === 'possession' || tipo === 'teams') { e.equipoA = 'Local'; e.equipoB = 'Visitante'; }
    if (tipo === 'teams') { e.colorA = '#3a8fd6'; e.colorB = '#dc2626'; }
    if (tipo === 'text') e.fontSize = 18;
    if (tipo === 'image') { e.src = ''; e.ajuste = 'contain'; e.opacidad = 100; }
    datos.elements.push(e);
    return e;
}

const mismo = (a, b) => a === b || String(a) === String(b);

export function buscar(datos, id) {
    return (datos.elements || []).find(e => mismo(e.id, id)) || null;
}

export function moverElementos(datos, ids, dx, dy) {
    ids.forEach(id => {
        const e = buscar(datos, id);
        if (!e) return;
        e.x = Math.max(0, e.x + dx);
        e.y = Math.max(0, e.y + dy);
    });
}

// Contenedor: lo que tiene adentro se mueve con él, como en el iPad. Devuelve
// los ids que hay que mover juntos al arrastrar `ids`.
export function idsQueSeMueven(datos, ids) {
    const out = new Set(ids.map(String));
    ids.forEach(id => {
        const c = buscar(datos, id);
        if (!c || c.type !== 'container') return;
        elementosDeHoja(datos, c.hoja || null).forEach(e => {
            if (e.id !== c.id && e.x >= c.x && e.y >= c.y && e.x + e.w <= c.x + c.w && e.y + e.h <= c.y + c.h) out.add(String(e.id));
        });
    });
    return [...out].map(s => (buscar(datos, s) || {}).id).filter(x => x !== undefined);
}

export function redimensionar(datos, id, w, h) {
    const e = buscar(datos, id);
    if (!e) return;
    e.w = Math.max(24, Math.round(w));
    e.h = Math.max(20, Math.round(h));
}

// Borrar no deja referencias colgando: flechas, excluyentes, jugadores de
// una línea. Un botón que no existe más no puede cortar ni sumar a nadie.
export function borrarElementos(datos, ids) {
    const fuera = new Set(ids.map(String));
    datos.elements = datos.elements.filter(e => !fuera.has(String(e.id)));
    datos.links = (datos.links || []).filter(l => !fuera.has(String(l.fromId)) && !fuera.has(String(l.toId)));
    datos.elements.forEach(e => {
        if (Array.isArray(e.exclusiveIds)) e.exclusiveIds = e.exclusiveIds.filter(x => !fuera.has(String(x)));
        if (Array.isArray(e.lineMemberIds)) e.lineMemberIds = e.lineMemberIds.filter(x => !fuera.has(String(x)));
    });
}

// Copias corridas un poco, con ids nuevos y sin atajo (dos botones con la
// misma tecla no disparan ninguno). Las referencias entre los copiados se
// pasan a las copias; las que apuntan afuera quedan igual.
export function duplicarElementos(datos, ids, { dx = 16, dy = 16, ahora } = {}) {
    const originales = ids.map(id => buscar(datos, id)).filter(Boolean);
    const mapa = new Map();
    const copias = originales.map(o => {
        const c = JSON.parse(JSON.stringify(o));
        c.id = nuevoId(datos, ahora);
        datos.elements.push(c);          // antes del próximo nuevoId: no repite
        mapa.set(String(o.id), c.id);
        c.x = o.x + dx;
        c.y = o.y + dy;
        delete c.atajo;
        return c;
    });
    const traducir = x => mapa.has(String(x)) ? mapa.get(String(x)) : x;
    copias.forEach(c => {
        c.exclusiveIds = (c.exclusiveIds || []).map(traducir);
        c.lineMemberIds = (c.lineMemberIds || []).map(traducir);
    });
    (datos.links || []).filter(l => mapa.has(String(l.fromId)) && mapa.has(String(l.toId))).forEach(l => {
        datos.links.push({ ...l, id: 'lnk_' + mapa.get(String(l.fromId)) + '_' + mapa.get(String(l.toId)),
                           fromId: mapa.get(String(l.fromId)), toId: mapa.get(String(l.toId)) });
    });
    return copias;
}

// ── Flechas (emergentes y contadores enlazados) ──
export function enlazado(datos, desde, hasta) {
    return (datos.links || []).some(l => mismo(l.fromId, desde) && mismo(l.toId, hasta));
}

export function enlazar(datos, desde, hasta, si = true) {
    datos.links = (datos.links || []).filter(l => !(mismo(l.fromId, desde) && mismo(l.toId, hasta)));
    if (si) datos.links.push({ id: 'lnk_' + desde + '_' + hasta, fromId: desde, toId: hasta });
}

// Excluyentes de a dos, como los guarda el Inspector: marcar A→B marca B→A.
export function ponerExcluyente(datos, a, b, si = true) {
    const ea = buscar(datos, a), eb = buscar(datos, b);
    if (!ea || !eb || mismo(a, b)) return;
    const poner = (x, y) => {
        x.exclusiveIds = (x.exclusiveIds || []).filter(id => !mismo(id, y.id));
        if (si) x.exclusiveIds.push(y.id);
    };
    poner(ea, eb);
    poner(eb, ea);
}

export function ponerEnLinea(datos, lineaId, jugadorId, si = true) {
    const l = buscar(datos, lineaId);
    if (!l) return;
    l.lineMemberIds = (l.lineMemberIds || []).filter(id => !mismo(id, jugadorId));
    if (si) l.lineMemberIds.push(buscar(datos, jugadorId) ? buscar(datos, jugadorId).id : jugadorId);
}

// ── Pestañas ──
export function agregarHoja(datos, nombre, { ahora } = {}) {
    const h = { id: nuevoIdHoja(datos, ahora), name: String(nombre || 'Pestaña'), etiquetas: 1 };
    datos.hojas.push(h);
    return h;
}

// Una pestaña se va con sus botones, y los eventos que la abrían dejan de
// abrir nada.
export function borrarHoja(datos, hojaId) {
    const ids = datos.elements.filter(e => e.hoja === hojaId).map(e => e.id);
    borrarElementos(datos, ids);
    datos.hojas = datos.hojas.filter(h => h.id !== hojaId);
    datos.elements.forEach(e => { if (e.subHojaId != null && String(e.subHojaId) === String(hojaId)) e.subHojaId = null; });
}

// ── Atajos ──
// La tecla de un atajo a partir del keydown: una letra, número o símbolo, o
// F1–F12. Espacio, Esc y las flechas son de la captura. '' = no sirve.
export function teclaDeEvento(e) {
    if (!e || e.ctrlKey || e.metaKey) return '';
    if (/^F([1-9]|1[0-2])$/.test(e.key)) return e.key;
    // En Mac, ⌥+Q escribe "œ": vale la tecla física.
    if (e.altKey && /^Key[A-Z]$/.test(e.code || '')) return e.code.slice(3).toLowerCase();
    if (e.altKey && /^Digit\d$/.test(e.code || '')) return e.code.slice(5);
    return e.key && e.key.length === 1 && e.key !== ' ' ? e.key.toLowerCase() : '';
}

// Qué botón ya usa esa tecla (para avisar antes de pisarla), o null.
export function quienUsa(datos, tecla, salvo = null) {
    if (!tecla) return null;
    const t = tecla.length === 1 ? tecla.toLowerCase() : tecla.toUpperCase();
    return datos.elements.find(e => !mismo(e.id, salvo) && typeof e.atajo === 'string' &&
        (e.atajo.length === 1 ? e.atajo.toLowerCase() : e.atajo.toUpperCase()) === t) || null;
}

// Pone la tecla en un botón y se la saca a cualquier otro que la tuviera:
// en el editor, la última que elegiste gana y no quedan repetidas.
export function ponerAtajo(datos, id, tecla) {
    const e = buscar(datos, id);
    if (!e) return null;
    const antes = quienUsa(datos, tecla, id);
    if (antes) delete antes.atajo;
    if (tecla) e.atajo = tecla.length === 1 ? tecla.toLowerCase() : tecla.toUpperCase();
    else delete e.atajo;
    return antes;
}

// Letras libres para los botones que no tienen tecla, en orden de lectura.
// Primero la inicial del nombre si está libre; si no, la primera letra del
// teclado que nadie usa. 'r' no, que es "ver el último" en la captura.
const TECLADO = 'qwetyuiopasdfghjklzxcvbnm1234567890';
const TIPOS_CON_TECLA = new Set(['event', 'descriptor', 'sticky_label', 'popup_label', 'line', 'counter']);

export function atajosAutomaticos(datos) {
    const usadas = new Set(datos.elements.map(e => typeof e.atajo === 'string' ? e.atajo.toLowerCase() : '').filter(Boolean));
    const hojas = [null, ...(datos.hojas || []).map(h => h.id)];
    const sin = datos.elements
        .filter(e => TIPOS_CON_TECLA.has(e.type) && !e.atajo)
        .sort((a, b) => hojas.indexOf(a.hoja || null) - hojas.indexOf(b.hoja || null) || a.y - b.y || a.x - b.x);
    let puestas = 0;
    sin.forEach(e => {
        const inicial = String(e.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]/);
        let t = inicial && inicial[0] !== 'r' && !usadas.has(inicial[0]) ? inicial[0] : null;
        if (!t) t = [...TECLADO].find(c => !usadas.has(c)) || null;
        if (!t) return;
        e.atajo = t;
        usadas.add(t);
        puestas++;
    });
    return puestas;
}
