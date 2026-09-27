// Lógica de la Captura en vivo que no toca pantalla ni window.tv: nombres,
// carpetas, qué segundos de video tiene un clip, el PARTIDO que va a la base,
// el XML que va al lado del video, la cola de cortes y el respaldo por si se
// cierra la ventana. Todo se prueba con node (test/captura-rama.test.js).

import { eventosParaPartido, clipDeVideo, filasTiempoEnHielo, fmt } from '../../nucleo/codificacion.js';
import { xmlSportscode, csvTiempoEnHielo, csvPosesion, fechaPartido } from '../../nucleo/exportar.js';
import { normalizar, nombresEquipos, elemento, colorPorDefecto } from '../../nucleo/plantilla.js';

// ─────────────────────────────────────────────
// NOMBRES Y CARPETAS
// ─────────────────────────────────────────────

// Lo que Windows no deja en un nombre de archivo o carpeta. Se limpia acá y
// no solo en main (nombreSeguro): el nombre que se ve en pantalla tiene que
// ser el mismo que el de la carpeta, si no "Partidos/<nombre>" no se
// encuentra después.
export function limpiarNombre(texto, porDefecto = 'Partido') {
    let s = String(texto ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        // Windows no admite un nombre que termine en punto o espacio.
        .replace(/[. ]+$/, '');
    if (s.length > 120) s = s.slice(0, 120).trim();
    // CON, PRN, AUX, NUL, COM1… son nombres reservados de Windows.
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = s + '_';
    return s || porDefecto;
}

// "LOCAL vs VISITANTE"; sin equipos, la fecha como la pone el iPad.
export function nombrePropuesto(local, visitante, cuando = new Date()) {
    const a = String(local || '').trim(), b = String(visitante || '').trim();
    if (a && b) return limpiarNombre(`${a} vs ${b}`);
    if (a || b) return limpiarNombre(a || b);
    return limpiarNombre('Partido ' + fechaPartido(cuando));
}

// Si ya hay un partido con ese nombre, "(2)", "(3)"… Así cada partido tiene
// su carpeta y no se mezclan los clips de dos partidos iguales.
export function nombreUnico(nombre, existentes) {
    const usados = new Set((existentes || []).map(n => String(n).trim().toLowerCase()));
    if (!usados.has(nombre.toLowerCase())) return nombre;
    for (let i = 2; i < 1000; i++) {
        const otro = `${nombre} (${i})`;
        if (!usados.has(otro.toLowerCase())) return otro;
    }
    return `${nombre} (${Date.now()})`;
}

export const subcarpetaDe = nombre => 'Partidos/' + limpiarNombre(nombre);

// La subcarpeta (relativa a la carpeta de trabajo) donde está un archivo, o
// null si está afuera. Para dejar el XML al lado de un video que ya estaba.
export function subcarpetaDeRuta(ruta, carpeta) {
    if (!ruta || !carpeta) return null;
    const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '');
    const r = norm(ruta), c = norm(carpeta);
    if (r.toLowerCase().indexOf(c.toLowerCase() + '/') !== 0) return null;
    const partes = r.slice(c.length + 1).split('/');
    partes.pop();
    return partes.join('/');
}

export const nombreDeArchivo = ruta => String(ruta || '').split(/[\\/]/).pop();

// "007 Gol 12m34s": el número ordena los clips en el Explorador en el orden
// del partido, y el minuto dice cuál es sin abrirlo.
export function nombreDeClip(n, nombreEvento, segundoPartido) {
    const t = fmt(Math.max(0, segundoPartido || 0)).replace(':', 'm') + 's';
    return limpiarNombre(`${String(n).padStart(3, '0')} ${nombreEvento || 'Clip'} ${t}`, 'Clip');
}

// ─────────────────────────────────────────────
// CLIPS
// ─────────────────────────────────────────────

// Los segundos de VIDEO de un evento del motor (con su margen de aire antes
// y después), o null si se marcó sin video. Un evento manual que sigue
// grabando dura hasta `vAhora`.
export function rangoDeClip(ev, mapa, { margen = 2, vAhora = null, minimo = 3 } = {}) {
    if (!ev) return null;
    let { vInicio, vFin } = 'vInicio' in ev && !('start' in ev) ? ev : clipDeVideo(ev, mapa || []);
    if (vInicio == null) return null;
    if (vFin == null) vFin = vAhora != null ? Math.max(vAhora, vInicio) : vInicio + minimo;
    const desde = Math.max(0, vInicio - margen);
    let hasta = vFin + margen;
    if (hasta - desde < minimo) hasta = desde + minimo;
    return { desde, hasta, vInicio, vFin };
}

// El color con el que se ve el botón que marcó un evento (registro y tira).
export function colorDeEvento(datos, ev) {
    const b = ev && elemento(datos, ev.buttonId != null ? ev.buttonId : ev.botonId);
    return (b && b.color) || colorPorDefecto(b ? b.type : 'event');
}

// ─────────────────────────────────────────────
// PARTIDO Y ARCHIVOS AL TERMINAR
// ─────────────────────────────────────────────

/**
 * El PARTIDO del contrato (lo que va a tv.partidos.guardar).
 * @param o.datos        plantilla con la que se codificó
 * @param o.estado       motor.estado() ya terminado
 * @param o.local, o.visitante, o.nombre, o.plantillaId, o.origen
 * @param o.video        { ruta, mime, bytes } o null
 * @param o.xmlRuta
 * @param o.desfase      segundos: video = partido + desfase
 * @param o.previos      eventos que el partido ya tenía (con id): se conservan
 */
export function armarPartido(o) {
    const datos = normalizar(o.datos);
    const est = o.estado;
    const eq = nombresEquipos(datos);
    const nombresEq = { A: o.local || eq.A, B: o.visitante || eq.B };
    const eventos = eventosParaPartido(datos, est, nombresEq);
    const posesion = (est.tramosPos || []).map(t => ({
        equipo: nombresEq[t.equipo] || t.equipo,
        inicio: t.start,
        fin: t.end
    }));
    return {
        ...(o.id != null ? { id: o.id } : {}),
        nombre: o.nombre,
        inicioReal: est.inicioReal != null ? new Date(est.inicioReal).toISOString() : null,
        duracion: Math.round((est.tiempo || 0) * 100) / 100,
        videoRuta: o.video ? o.video.ruta : null,
        videoMime: o.video ? o.video.mime || null : null,
        videoBytes: o.video ? o.video.bytes || null : null,
        xmlRuta: o.xmlRuta || null,
        local: o.local || null,
        visitante: o.visitante || null,
        plantilla: datos,
        plantillaId: o.plantillaId ?? null,
        origen: o.origen || 'captura',
        desfase: o.desfase || 0,
        eventos: [...(o.previos || []), ...eventos],
        posesion
    };
}

// Los eventos del XML que va AL LADO del video, con los tiempos del VIDEO:
// Sportscode y Nacsport emparejan el XML con el .mp4 por el nombre, y si los
// tiempos fueran los del reloj del partido cada pausa correría todos los
// clips que vienen después. Los eventos marcados sin video no tienen dónde
// caer en ese archivo: quedan en la base, no en el XML.
// Sin video (se codificó sin cámara) va el reloj del partido, como el iPad.
export function eventosParaXml(eventosPartido, conVideo) {
    if (!conVideo) return eventosPartido;
    return eventosPartido
        .filter(ev => ev.vInicio != null)
        .map(ev => ({ ...ev, inicio: ev.vInicio, fin: ev.vFin }));
}

// Los archivos de texto que van en Partidos/<nombre>/: el XML y, si hay,
// los CSV. [{ nombre, extension, contenido }]
export function archivosDelPartido({ datos, estado, partido, nombre, conVideo }) {
    const d = normalizar(datos);
    const out = [];
    const xml = xmlSportscode({ inicioReal: partido.inicioReal, eventos: eventosParaXml(partido.eventos, conVideo) }, d);
    if (xml) out.push({ tipo: 'xml', nombre, extension: 'xml', contenido: xml });
    const hielo = csvTiempoEnHielo(filasTiempoEnHielo(d, estado).map(r => ({ nombre: r.nombre, turnos: r.turnos, total: r.total })));
    const pos = csvPosesion({ ...partido, tramosPos: estado.tramosPos, eventos: partido.eventos }, d);
    // Uno solo va como <nombre>.csv; si están los dos, el de posesión lleva
    // el apellido (el tiempo en hielo es el que se pide por jugador).
    if (hielo) out.push({ tipo: 'csv', nombre, extension: 'csv', contenido: hielo });
    if (pos) out.push({ tipo: 'csv', nombre: hielo ? `${nombre} - Posesion` : nombre, extension: 'csv', contenido: pos });
    return out;
}

// ─────────────────────────────────────────────
// COLA DE CORTES
// ─────────────────────────────────────────────
// Los clips pedidos mientras se graba se cortan de a uno (ffmpeg sobre el
// mismo archivo, dos a la vez se pisan el disco) y solo cuando lo que piden
// ya está escrito: un corte que espera el futuro no puede trabar a los que
// ya se pueden hacer. Si uno falla queda marcado y se reintenta al terminar,
// sobre el archivo ya cerrado y en su lugar final.
//
// La ruta del video NO se guarda en cada corte: se pide al cortar
// (rutaActual), porque al terminar el archivo cambia de nombre y de carpeta.

/**
 * @param o.cortar     async (corte) => rutas  (tv.clips.exportar)
 * @param o.listo      (corte) => boolean: ya está en el disco lo que pide
 * @param o.alCambiar  (resumen) => void
 */
export function crearColaCortes(o) {
    const cortes = [];
    let seq = 0, corriendo = false, frenada = false, destruida = false;
    let temporizador = null;
    const esperando = new Set();
    const oyentes = new Set(o.alCambiar ? [o.alCambiar] : []);

    const resumen = () => {
        const n = e => cortes.filter(c => c.estado === e).length;
        return {
            pendientes: n('pendiente'), cortando: n('cortando'), hechos: n('hecho'), fallidos: n('fallido'),
            cortes: cortes.map(c => ({ ...c }))
        };
    };
    const avisar = () => { const r = resumen(); oyentes.forEach(cb => { try { cb(r); } catch (e) { console.error(e); } }); };

    function agregar(corte) {
        const c = { id: ++seq, estado: 'pendiente', intentos: 0, error: null, rutas: null, ...corte };
        cortes.push(c);
        avisar();
        seguir();
        return c.id;
    }

    function siguiente() {
        return cortes.find(c => c.estado === 'pendiente' && (!o.listo || o.listo(c)));
    }

    async function seguir() {
        if (corriendo || frenada || destruida) return;
        const c = siguiente();
        if (!c) {
            // Hay pendientes que todavía no se pueden cortar: se mira de nuevo
            // en un rato (lo que falta llega al disco a razón de 1 s por segundo).
            if (cortes.some(x => x.estado === 'pendiente') && !temporizador) {
                temporizador = setTimeout(() => { temporizador = null; seguir(); }, 500);
            }
            despertar();
            return;
        }
        corriendo = true;
        c.estado = 'cortando';
        c.intentos++;
        avisar();
        try {
            c.rutas = await o.cortar(c);
            c.estado = 'hecho';
            c.error = null;
        } catch (err) {
            c.estado = 'fallido';
            c.error = (err && err.message) || String(err);
        }
        corriendo = false;
        avisar();
        seguir();
    }

    function despertar() {
        if (corriendo || cortes.some(c => c.estado === 'pendiente' || c.estado === 'cortando')) return;
        esperando.forEach(r => r());
        esperando.clear();
    }

    return {
        agregar,
        // Frenar: no se empieza ningún corte nuevo (el que está en curso
        // termina). Para mover el archivo al terminar sin cortar a la vez.
        async frenar() {
            frenada = true;
            while (corriendo) await new Promise(r => setTimeout(r, 50));
        },
        seguir() { frenada = false; seguir(); },
        // Los fallidos vuelven a la cola (al terminar, sobre el archivo final).
        reintentarFallidos() {
            let n = 0;
            cortes.forEach(c => { if (c.estado === 'fallido') { c.estado = 'pendiente'; n++; } });
            if (n) { avisar(); seguir(); }
            return n;
        },
        // Se resuelve cuando no queda nada pendiente ni cortándose.
        vaciar() {
            return new Promise(r => { esperando.add(r); seguir(); despertar(); });
        },
        resumen,
        alCambiar(cb) { oyentes.add(cb); return () => oyentes.delete(cb); },
        destruir() { destruida = true; clearTimeout(temporizador); esperando.forEach(r => r()); esperando.clear(); oyentes.clear(); }
    };
}

// ─────────────────────────────────────────────
// RESPALDO (si se cierra la ventana en medio del partido)
// ─────────────────────────────────────────────
// El video ya está a salvo: es MP4 fragmentado escrito de a un segundo, y
// main lo cierra al salir. Lo que se perdería es la codificación, que vive
// en memoria. Cada pocos segundos se guarda (respaldo.js, en IndexedDB); al
// volver a abrir la rama se ofrece guardar lo que había.

// La clave del plan B (localStorage) de respaldo.js.
export const CLAVE_RESPALDO = 'tv_captura_respaldo';

export function armarRespaldo({ meta, motor, ruta, ahora = Date.now() }) {
    return JSON.stringify({ version: 1, guardadoEn: ahora, meta, ruta: ruta || null, motor });
}

export function leerRespaldo(texto) {
    if (!texto) return null;
    try {
        const r = JSON.parse(texto);
        if (!r || r.version !== 1 || !r.motor || !r.meta) return null;
        return r;
    } catch (_) { return null; }
}

// El estado del motor guardado, listo para importarEstado() sin que el
// reloj le sume las horas que la ventana estuvo cerrada: se congela en el
// último segundo guardado y el tramo de video abierto se cierra ahí.
export function estadoParaRecuperar(motor) {
    const e = JSON.parse(JSON.stringify(motor));
    e.andando = false;
    e.desde = null;
    const t = e.acumulado || 0;
    e.mapa = (e.mapa || []).map(tr => (tr.m1 == null ? { ...tr, m1: Math.max(tr.m0, t) } : tr));
    return e;
}
