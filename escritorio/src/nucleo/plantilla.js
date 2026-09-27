// Leer una botonera del iPad.
//
// La plantilla es EXACTAMENTE el state del iPad: { elements, links, hojas }
// (ver STATE, CREATE / DELETE y PESTAÑAS en app.js de la raíz). Este módulo
// no inventa un formato propio: solo lo lee, completa lo que una plantilla
// vieja no traía y responde las preguntas que la botonera hace en vivo
// (qué hay en cada pestaña, qué emergentes abre un evento, qué se excluye).
//
// Puro: sin DOM, sin window.tv, sin Electron. Lo usan la compu, la página
// del iPad por wifi (Safari) y las pruebas de node.

export const ANCHO_BOTON = 120;   // DEFAULT_W de app.js
export const ALTO_BOTON = 52;     // DEFAULT_H de app.js
export const MARGEN_LIENZO = 24;  // MARGEN_LIENZO de app.js

// Lo que createElement() de app.js le pone a cada tipo al nacer. Una
// plantilla vieja, o armada a mano, puede no traer el tamaño: sin esto el
// botón quedaría de 0 × 0 y no se podría tocar.
const TAMANOS = {
    event:        [ANCHO_BOTON, ALTO_BOTON],
    descriptor:   [ANCHO_BOTON, ALTO_BOTON],
    sticky_label: [ANCHO_BOTON, ALTO_BOTON],
    popup_label:  [ANCHO_BOTON, ALTO_BOTON],
    counter:      [80, 60],
    container:    [200, 180],
    line:         [140, 52],
    possession:   [260, 72],
    text:         [180, 44],
    teams:        [300, 56],
    image:        [240, 180]
};

export const TIPOS = Object.keys(TAMANOS);

// defaultColor() de app.js: el color con el que se ve un botón sin color
// propio. El XML usa el mismo para las filas (ROWS).
export function colorPorDefecto(tipo) {
    return { event: '#3a8fd6', popup_label: '#f8d022', descriptor: '#fef08a', sticky_label: '#fdba74',
             counter: null, container: null, line: '#4c51bf', text: '#1c1c1e' }[tipo] || '#3a8fd6';
}

// brightness() de app.js: para elegir letra negra o blanca sobre un color.
export function brillo(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) || 0, g = parseInt(hex.slice(2, 4), 16) || 0, b = parseInt(hex.slice(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
}

const num = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};

const lista = v => Array.isArray(v) ? v : [];

// Las emergentes escritas en el Inspector son un array; alguna copia vieja o
// hecha a mano las trae como "Al arco, Desviado". Se aceptan las dos.
function nombresEmergentes(v) {
    if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
    if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
    return [];
}

// Los ids del iPad son números (Date.now()), pero una copia restaurada o
// importada puede traerlos como texto. Se dejan como número si lo son, así
// comparar con === sigue andando igual que en app.js.
function id(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
    return v;
}

// Deja la plantilla lista para usar, sin tocar la original. Idempotente:
// normalizar(normalizar(x)) da lo mismo que normalizar(x). Acepta:
//   - { elements, links, hojas }                (el formato de siempre)
//   - una plantilla guardada del iPad { name, elements, links, hojas }
//   - el texto JSON de cualquiera de las dos
//   - un array de elementos suelto (copias muy viejas)
// Los campos que no conoce se conservan tal cual (element.atajo, y lo que
// el iPad agregue mañana): la plantilla vuelve al iPad sin perder nada.
export function normalizar(datos) {
    if (typeof datos === 'string') {
        try { datos = JSON.parse(datos); } catch (_) { datos = null; }
    }
    if (Array.isArray(datos)) datos = { elements: datos };
    if (!datos || typeof datos !== 'object') datos = {};
    // Una copia de seguridad trae la botonera en "current".
    if (!datos.elements && datos.current && typeof datos.current === 'object') datos = datos.current;

    const elements = lista(datos.elements)
        .filter(e => e && typeof e === 'object')
        .map((e, i) => {
            const tipo = TIPOS.includes(e.type) ? e.type : 'event';
            const [w, h] = TAMANOS[tipo];
            const n = { ...e };
            n.id = e.id == null ? 'e' + (i + 1) : id(e.id);
            n.type = tipo;
            n.name = e.name == null ? '' : String(e.name);
            n.color = e.color || null;
            n.x = num(e.x, 0);
            n.y = num(e.y, 0);
            n.w = Math.max(1, num(e.w, w));
            n.h = Math.max(1, num(e.h, h));
            n.timeMode = e.timeMode === 'manual' ? 'manual' : 'fixed';
            n.exclusiveIds = lista(e.exclusiveIds).map(id);
            n.isExclusive = !!e.isExclusive;
            n.lead = Math.max(0, num(e.lead, 0));
            // lag 0 es válido en un evento viejo; el Inspector de ahora guarda
            // al menos 1, pero no se "arregla" lo que ya estaba.
            n.lag = Math.max(0, num(e.lag, 1));
            n.popups = nombresEmergentes(e.popups);
            n.lineMemberIds = lista(e.lineMemberIds).map(id);
            n.lineExclusive = e.lineExclusive !== false;
            n.hoja = e.hoja || null;
            if (n.subHojaId === undefined) n.subHojaId = null;
            if (Array.isArray(e.popupPos)) n.popupPos = e.popupPos.slice(0, n.popups.length);
            if (typeof n.atajo === 'string') n.atajo = n.atajo.trim().toLowerCase().slice(0, 1) || undefined;
            if (n.atajo === undefined) delete n.atajo;
            return n;
        });

    const ids = new Set(elements.map(e => e.id));
    const links = lista(datos.links)
        .filter(l => l && ids.has(id(l.fromId)) && ids.has(id(l.toId)))
        .map((l, i) => ({ ...l, id: l.id || 'lnk_' + i, fromId: id(l.fromId), toId: id(l.toId) }));

    const hojas = lista(datos.hojas)
        .filter(h => h && h.id != null)
        .map(h => ({ ...h, id: String(h.id), name: h.name == null ? '' : String(h.name),
                     etiquetas: Math.min(5, Math.max(1, parseInt(h.etiquetas) || 1)) }));
    const idsHojas = new Set(hojas.map(h => h.id));
    // Un botón de una pestaña que ya no existe se ve en la Principal, igual
    // que en el iPad (hojaDe() no mira si la pestaña existe): no se esconde.
    elements.forEach(e => {
        if (e.subHojaId && !idsHojas.has(String(e.subHojaId))) e.subHojaId = null;
    });

    return { elements, links, hojas };
}

// hojaDe() de app.js: sin pestaña = Principal (null).
export const hojaDe = e => (e && e.hoja) || null;

export function elemento(datos, elId) {
    return (datos.elements || []).find(e => e.id === elId || String(e.id) === String(elId)) || null;
}

// elementosDeHoja() de app.js. null = la Principal.
export function elementosDeHoja(datos, hojaId) {
    const h = hojaId || null;
    return (datos.elements || []).filter(e => hojaDe(e) === h);
}

// Qué pestaña abre un evento al tocarlo en vivo, o null. Es la parte de
// plantillaDeDetalle() de app.js que se puede resolver con la plantilla
// sola; "otra plantilla guardada" (subPlantillaId, versiones anteriores) la
// resuelve el motor con la función que le pasen.
export function hojaQueAbre(datos, elId) {
    const e = elemento(datos, elId);
    if (!e || !e.subHojaId) return null;
    return (datos.hojas || []).find(h => h.id === String(e.subHojaId)) || null;
}

// getContainerSiblingPopups() de app.js: el contenedor que tiene adentro al
// evento, buscado solo en la pestaña del evento (un contenedor de otra
// pestaña en el mismo lugar le sumaría emergentes ajenas).
export function contenedorDe(datos, elId) {
    const e = elemento(datos, elId);
    if (!e) return null;
    const mismos = elementosDeHoja(datos, hojaDe(e));
    return mismos.find(c => c.type === 'container' && c.id !== e.id && adentro(e, c)) || null;
}

const adentro = (e, c) => e.x >= c.x && e.y >= c.y && e.x + e.w <= c.x + c.w && e.y + e.h <= c.y + c.h;

// Las etiquetas emergentes de un evento, de las tres formas del README:
//   1. escritas en el evento (Inspector)           → { nombre, indice }
//   2. un botón "Etiqueta emergente" en el mismo contenedor
//   3. un botón "Etiqueta emergente" enlazado con flecha
// Las 2 y 3 son botones de verdad de la plantilla → { nombre, elemento }.
// Sin repetidos. Un popup_label suelto, sin contenedor ni flecha, no sale
// nunca (como en el iPad).
export function emergentesDe(datos, elId) {
    const e = elemento(datos, elId);
    if (!e) return [];
    const out = [];
    const vistos = new Set();

    // 2. Mismo contenedor. app.js recorre TODOS los contenedores que tengan
    // al evento adentro (pueden estar anidados), no solo el primero.
    const mismos = elementosDeHoja(datos, hojaDe(e));
    mismos.filter(c => c.type === 'container' && adentro(e, c)).forEach(c => {
        mismos.filter(x => x.type === 'popup_label' && x.id !== c.id && adentro(x, c)).forEach(pl => {
            if (vistos.has(pl.id)) return;
            vistos.add(pl.id);
            out.push({ nombre: pl.name, elemento: pl });
        });
    });

    // 3. Enlazados con flecha.
    (datos.links || []).filter(l => l.fromId === e.id).forEach(l => {
        const pl = elemento(datos, l.toId);
        if (!pl || pl.type !== 'popup_label' || vistos.has(pl.id)) return;
        vistos.add(pl.id);
        out.push({ nombre: pl.name, elemento: pl });
    });

    // 1. Escritas en el evento: van después, como en handleLiveClick().
    (e.popups || []).forEach((nombre, indice) => out.push({ nombre, indice }));
    return out;
}

// Los ids que un botón corta al encenderse. Es de a dos, como lo arma el
// Inspector: si A excluye a B, B también excluye a A, aunque una plantilla
// hecha a mano lo traiga de un solo lado.
export function excluyentesDe(datos, elId) {
    const e = elemento(datos, elId);
    if (!e) return [];
    const ids = new Set(e.exclusiveIds || []);
    (datos.elements || []).forEach(o => {
        if (o.id !== e.id && (o.exclusiveIds || []).includes(e.id)) ids.add(o.id);
    });
    ids.delete(e.id);
    return [...ids];
}

// Contadores a los que suma un evento (enlazados con flecha).
export function contadoresDe(datos, elId) {
    return (datos.links || [])
        .filter(l => l.fromId === elId)
        .map(l => elemento(datos, l.toId))
        .filter(t => t && t.type === 'counter')
        .map(t => t.id);
}

// Atajos de teclado (element.atajo, campo nuevo que el iPad ignora). Una
// tecla repetida no se asigna a ninguno de los dos: disparar el que "gane"
// sin avisar sería peor que no disparar nada.
export function atajos(datos) {
    const porTecla = new Map();
    (datos.elements || []).forEach(e => {
        const t = typeof e.atajo === 'string' ? e.atajo.trim().toLowerCase() : '';
        if (!t) return;
        if (!porTecla.has(t)) porTecla.set(t, []);
        porTecla.get(t).push(e.id);
    });
    const mapa = new Map();
    const repetidas = [];
    porTecla.forEach((ids, tecla) => {
        if (ids.length === 1) mapa.set(tecla, ids[0]);
        else repetidas.push({ tecla, ids });
    });
    return { mapa, repetidas };
}

// nombresEquipos() de app.js: de la tarjeta Equipos si hay; si no, del botón
// de posesión; si no, Local y Visitante.
export function nombresEquipos(datos) {
    const els = datos.elements || [];
    const fuente = els.find(x => x.type === 'teams') || els.find(x => x.type === 'possession');
    return { A: (fuente && fuente.equipoA) || 'Local', B: (fuente && fuente.equipoB) || 'Visitante' };
}

export function coloresEquipos(datos) {
    const tarjeta = (datos.elements || []).find(x => x.type === 'teams');
    return { A: (tarjeta && tarjeta.colorA) || '#3a8fd6', B: (tarjeta && tarjeta.colorB) || '#dc2626' };
}

// equipoDeBoton() de app.js: 'A' | 'B' si el evento suma a la posesión.
export function equipoDeBoton(datos, elId) {
    const b = elemento(datos, elId);
    return (b && b.type === 'event' && (b.equipo === 'A' || b.equipo === 'B')) ? b.equipo : null;
}

// ─────────────────────────────────────────────
// Dónde caen las cosas en el lienzo
// ─────────────────────────────────────────────

// cajaLienzo() de app.js: lo que ocupa una pestaña, con el margen. Las
// emergentes puestas a mano cuentan como un botón más.
export function cajaDeHoja(elementos) {
    let derecha = 0, abajo = 0;
    const mirar = (x, y, w, h) => {
        if (x + w > derecha) derecha = x + w;
        if (y + h > abajo) abajo = y + h;
    };
    elementos.forEach(e => {
        mirar(e.x, e.y, e.w, e.h);
        (e.popupPos || []).forEach(p => { if (p) mirar(e.x + p.dx, e.y + p.dy, ANCHO_BOTON, ALTO_BOTON); });
    });
    return { w: derecha + MARGEN_LIENZO, h: abajo + MARGEN_LIENZO };
}

// ubicarEmergentesAuto() + ubicarEmergentes() de app.js. `caja` es hasta
// dónde se ve (cajaVisible): lo que no entra abajo va arriba del evento, y
// lo que no entra en una fila se parte en varias. Nunca fuera de la caja.
export function ubicarEmergentes(evento, nombres, caja) {
    const GAP = 10, SEP = 12;
    const paso = ANCHO_BOTON + GAP;
    const porFila = Math.max(1, Math.min(nombres.length, Math.floor((caja.w + GAP) / paso)));
    const ancho = porFila * paso - GAP;
    const alto = Math.ceil(nombres.length / porFila) * (ALTO_BOTON + GAP) - GAP;

    let y = evento.y + evento.h + SEP;
    if (y + alto > caja.h) y = evento.y - SEP - alto;
    y = Math.max(0, Math.min(y, Math.max(0, caja.h - alto)));
    const x = Math.max(0, Math.min(evento.x, Math.max(0, caja.w - ancho)));

    const puestas = evento.popupPos || [];
    return nombres.map((nombre, i) => {
        const p = puestas[i];
        // Las que se arrastraron en el editor van donde las dejaron,
        // guardadas como distancia al evento.
        if (p) return { name: nombre, w: ANCHO_BOTON, h: ALTO_BOTON,
                        x: Math.max(0, evento.x + p.dx), y: Math.max(0, evento.y + p.dy) };
        return { name: nombre, w: ANCHO_BOTON, h: ALTO_BOTON,
                 x: x + (i % porFila) * paso, y: y + Math.floor(i / porFila) * (ALTO_BOTON + GAP) };
    });
}
