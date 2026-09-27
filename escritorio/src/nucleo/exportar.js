// XML de Sportscode y CSV, exactamente como los saca el iPad.
//
// Portado de EXPORT XML de app.js (exportCustomXML, fechaSportscode,
// a16bits, rgbDeEvento, blobUtf16). El archivo tiene que ser el MISMO byte a
// byte: Sportscode, Nacsport y LongoMatch lo importan igual venga de donde
// venga, y un XML de la compu y uno del iPad del mismo partido se pueden
// comparar con un diff.
//
// Puro: sin DOM ni window.tv. Lo usan la Captura (Agente 4), la Base de
// datos (Agente 3) e Importar (Agente 6).
//
// Los eventos pueden venir en cualquiera de las tres formas que andan por la
// app, y salen iguales:
//   - del iPad / del motor: { name, start, end, buttonId, line, descriptors }
//   - PARTIDO del contrato:  { nombre, inicio, fin, botonId, etiquetas:[{grupo,texto}] }
//   - fila de la base:       { nombre, inicio, fin, boton_id, etiquetas:[…] }

import { normalizar, elemento, colorPorDefecto, coloresEquipos, nombresEquipos, equipoDeBoton } from './plantilla.js';
import { tramosDePosesion, tiemposPosesion, unirTramos, fmt } from './codificacion.js';

// Sportscode escribe la fecha en UTC con este formato exacto.
export function fechaSportscode(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
         + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds())
         + ' +0000';
}

// Los colores de ROWS van en 16 bits (0-65535), no en 0-255.
export function a16bits(v) { return Math.round(v / 255 * 65535); }

export function xmlEsc(v) {
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// rgbDeEvento() de app.js: el color del botón que marcó el evento; si no se
// encuentra por id, el primer evento con ese nombre. Los tramos de posesión
// viejos (equipo 'A'/'B') toman el color de su equipo.
export function rgbDeEvento(datos, nombre, botonId, equipo) {
    const els = datos.elements || [];
    let e = botonId != null ? elemento(datos, botonId) : null;
    if (!e) e = els.find(x => x.type === 'event' && x.name === nombre);
    let hex = (e && e.color) || colorPorDefecto(e ? e.type : 'event') || '#3a8fd6';
    if (equipo === 'A') hex = coloresEquipos(datos).A;
    if (equipo === 'B') hex = coloresEquipos(datos).B;
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return {
        r: parseInt(hex.slice(0, 2), 16) || 0,
        g: parseInt(hex.slice(2, 4), 16) || 0,
        b: parseInt(hex.slice(4, 6), 16) || 0
    };
}

// Un evento de cualquiera de las tres formas, en una sola.
export function eventoComun(ev) {
    const nombre = ev.name != null ? ev.name : ev.nombre;
    const inicio = Number(ev.start != null ? ev.start : ev.inicio);
    const finCrudo = ev.end !== undefined ? ev.end : ev.fin;
    let etiquetas;
    if (Array.isArray(ev.etiquetas)) {
        etiquetas = ev.etiquetas.map(et => ({ grupo: et.grupo || 'Etiqueta', texto: et.texto }));
    } else {
        etiquetas = [
            ...(ev.line ? [{ grupo: 'Linea', texto: ev.line }] : []),
            ...(ev.descriptors || []).map(d => ({ grupo: 'Etiqueta', texto: d }))
        ];
    }
    const boton = ev.buttonId != null ? ev.buttonId : (ev.botonId != null ? ev.botonId : ev.boton_id);
    return {
        nombre: nombre == null ? '' : String(nombre),
        inicio,
        fin: finCrudo == null ? null : Number(finCrudo),
        botonId: boton == null ? null : boton,
        // Solo el 'A'/'B' de los tramos de posesión viejos cambia el color;
        // el nombre de un equipo (lo que guarda la base) no.
        equipo: ev.equipo === 'A' || ev.equipo === 'B' ? ev.equipo : null,
        posesionDe: ev.posesionDe || null,
        etiquetas
    };
}

function eventosDe(partido) {
    if (Array.isArray(partido)) return partido;
    return (partido && (partido.eventos || partido.events)) || [];
}

function inicioDe(partido) {
    if (!partido || Array.isArray(partido)) return null;
    const v = partido.inicioReal || partido.inicio_real || partido.startedAt || partido.inicio || null;
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
    return isNaN(d.getTime()) ? null : d;
}

/**
 * exportCustomXML() de app.js, pero devuelve el texto en vez de guardarlo.
 * @param partido  PARTIDO, fila de la base, sesión del iPad, o un array de eventos
 * @param datosPlantilla  la botonera con la que se codificó (para los colores)
 * @returns el XML, o null si no hay eventos (el iPad no saca archivo vacío)
 */
export function xmlSportscode(partido, datosPlantilla) {
    const datos = normalizar(datosPlantilla || (partido && partido.plantilla) || {});
    // La posesión es estadística, no clips: una codificación vieja puede
    // traer sus tramos como eventos y se dejan afuera.
    const eventos = eventosDe(partido).map(eventoComun).filter(ev => !ev.posesionDe);
    if (!eventos.length) return null;

    // IDs por orden cronológico; el archivo va agrupado por código, como lo
    // escribe Sportscode.
    const porTiempo = [...eventos].sort((a, b) => a.inicio - b.inicio);
    const idDe = new Map();
    porTiempo.forEach((ev, i) => idDe.set(ev, i + 1));
    const ordenado = [...eventos].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.inicio - b.inicio);

    const T = '\t';
    let xml = '<file>\n';
    xml += T + '<SESSION_INFO>\n';
    xml += T + T + '<start_time>' + fechaSportscode(inicioDe(partido) || new Date()) + '</start_time>\n';
    xml += T + '</SESSION_INFO>\n';

    xml += T + '<ALL_INSTANCES>\n';
    ordenado.forEach(ev => {
        const fin = ev.fin != null ? ev.fin : ev.inicio + 1;
        xml += T + T + '<instance>\n';
        xml += T + T + T + '<ID>' + idDe.get(ev) + '</ID>\n';
        xml += T + T + T + '<start>' + Number(ev.inicio).toFixed(2) + '</start>\n';
        xml += T + T + T + '<end>' + Number(fin).toFixed(2) + '</end>\n';
        xml += T + T + T + '<code>' + xmlEsc(ev.nombre) + '</code>\n';
        // Las etiquetas solo salen si de verdad se usaron.
        ev.etiquetas.forEach(et => {
            xml += T + T + T + '<label>\n';
            xml += T + T + T + T + '<group>' + xmlEsc(et.grupo) + '</group>\n';
            xml += T + T + T + T + '<text>' + xmlEsc(et.texto) + '</text>\n';
            xml += T + T + T + '</label>\n';
        });
        xml += T + T + '</instance>\n';
    });
    xml += T + '</ALL_INSTANCES>\n';

    // Un renglón por código, en orden alfabético, con su color.
    const codigos = [...new Set(ordenado.map(e => e.nombre))].sort((a, b) => a.localeCompare(b));
    xml += T + '<ROWS>\n';
    codigos.forEach(c => {
        const ev = ordenado.find(e => e.nombre === c);
        const rgb = rgbDeEvento(datos, c, ev && ev.botonId, ev && ev.equipo);
        xml += T + T + '<row>\n';
        xml += T + T + T + '<code>' + xmlEsc(c) + '</code>\n';
        xml += T + T + T + '<R>' + a16bits(rgb.r) + '</R>\n';
        xml += T + T + T + '<G>' + a16bits(rgb.g) + '</G>\n';
        xml += T + T + T + '<B>' + a16bits(rgb.b) + '</B>\n';
        xml += T + T + '</row>\n';
    });
    xml += T + '</ROWS>\n';
    xml += '</file>\n';
    return xml;
}

// blobUtf16() de app.js: Sportscode espera UTF-16 LE con BOM, no UTF-8.
// Devuelve los bytes; en el navegador, new Blob([bytes]) si hace falta.
export function bytesUtf16(texto) {
    const buf = new Uint8Array(2 + texto.length * 2);
    const vista = new DataView(buf.buffer);
    vista.setUint16(0, 0xFEFF, true);
    for (let i = 0; i < texto.length; i++) vista.setUint16(2 + i * 2, texto.charCodeAt(i), true);
    return buf;
}

// Nombre del archivo como lo arma el iPad (sin tildes ni signos).
export function nombreArchivoIpad(titulo) {
    return String(titulo || 'Tagging').replace(/[^a-z0-9_\- ]/gi, '_') + '.xml';
}

// fechaPartido() de app.js: "15-09-2026 20h30", con h y no ":" porque el
// nombre de archivo no admite los dos puntos.
export function fechaPartido(cuando) {
    const d = cuando ? new Date(cuando) : new Date();
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

const csvTexto = v => '"' + String(v).replace(/"/g, '""') + '"';

/**
 * exportToiCSV() de app.js: tiempo en hielo por jugador, sumado sin contar
 * dos veces lo que se pisa. Recibe un partido (cualquier forma) y su
 * plantilla, o directamente las filas de filasTiempoEnHielo().
 * @returns el CSV, o null si no hay tiempo acumulado
 */
export function csvTiempoEnHielo(partidoOFilas, datosPlantilla) {
    let filas;
    if (Array.isArray(partidoOFilas) && partidoOFilas.length && 'turnos' in partidoOFilas[0]) {
        filas = partidoOFilas;
    } else {
        const datos = normalizar(datosPlantilla || (partidoOFilas && partidoOFilas.plantilla) || {});
        const porBoton = new Map();
        eventosDe(partidoOFilas).map(eventoComun).forEach(ev => {
            if (ev.posesionDe || ev.fin == null) return;
            const k = String(ev.botonId);
            if (!porBoton.has(k)) porBoton.set(k, []);
            porBoton.get(k).push([ev.inicio, ev.fin]);
        });
        filas = datos.elements.filter(e => e.type === 'event').map(e => {
            const h = unirTramos(porBoton.get(String(e.id)) || []);
            return { nombre: e.name, turnos: h.cantidad, total: h.total };
        }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
    }
    if (!filas.length) return null;
    let csv = 'Jugador,Turnos,Total (s),Total (mm:ss)\n';
    filas.forEach(r => {
        csv += `${csvTexto(r.nombre)},${r.turnos},${r.total.toFixed(1)},${fmt(r.total)}\n`;
    });
    return csv;
}

/**
 * exportPosesionCSV() de app.js. Los tramos del botón de Posesión vienen en
 * partido.posesion ({equipo, inicio, fin}, 'A'/'B' o el nombre del equipo) o
 * partido.tramosPos (formato del iPad); los eventos que suman a un equipo
 * también cuentan, como en el iPad.
 * @returns el CSV, o null si no hay posesión
 */
export function csvPosesion(partido, datosPlantilla) {
    const datos = normalizar(datosPlantilla || (partido && partido.plantilla) || {});
    const nombres = {
        A: (partido && partido.local) || nombresEquipos(datos).A,
        B: (partido && partido.visitante) || nombresEquipos(datos).B
    };
    const aLetra = eq => eq === 'A' || eq === 'B' ? eq : (eq === nombres.A ? 'A' : eq === nombres.B ? 'B' : null);
    const tramos = ((partido && (partido.tramosPos || partido.posesion)) || []).map(t => ({
        equipo: aLetra(t.equipo),
        start: Number(t.start != null ? t.start : t.inicio),
        end: Number(t.end != null ? t.end : t.fin)
    }));
    const eventos = eventosDe(partido).map(ev => {
        const c = eventoComun(ev);
        return { buttonId: c.botonId, start: c.inicio, end: c.fin, posesionDe: c.posesionDe, equipo: c.equipo };
    }).map(ev => {
        // equipoDeBoton compara por id: el de la base viene como texto.
        const b = ev.buttonId != null ? elemento(datos, ev.buttonId) : null;
        return { ...ev, buttonId: b ? b.id : ev.buttonId };
    });
    const t = tiemposPosesion(tramosDePosesion(datos, eventos, tramos, null, null, null), 0);
    if (!t.tramos) return null;
    let csv = 'Equipo,Posesión (%),Tiempo (s),Tiempo (mm:ss)\n';
    ['A', 'B'].forEach(eq => {
        const pct = t['pct' + eq];
        csv += `${csvTexto(nombres[eq])},${pct === null ? '' : pct},${t[eq].toFixed(1)},${fmt(t[eq])}\n`;
    });
    return csv;
}

// Para quien quiera saber si un evento suma a la posesión sin importar el motor.
export { equipoDeBoton };
