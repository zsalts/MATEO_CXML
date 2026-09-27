// Motor de codificación: todas las reglas del modo Codificación del iPad,
// sin pantalla.
//
// Es la lógica de TIMER, TIME ON ICE, LIVE CLICK, PESTAÑAS, PLANTILLA DE
// DETALLE y POSESIÓN de app.js, portada a un módulo sin estado global. El
// iPad hace todo eso contra `state` y el DOM; acá vive adentro de
// crearCodificacion() y la pantalla se entera por alCambiar().
//
// Puro: el reloj se inyecta (`ahora`), no hay DOM ni window.tv. Así corre
// igual en la compu, en las pruebas con un reloj falso, y el Agente 5 lo usa
// como única fuente de verdad mientras el iPad le manda toques por wifi.
//
// Toda acción es un objeto serializable ({tipo:'tocar', elementoId,
// momento}) y aplicar(accion) es exactamente llamar al método: el iPad
// manda acciones, la compu las aplica, y el resultado es el mismo que si se
// hubiera tocado acá.
//
// DOS RELOJES
//   - el del partido (tiempo), que se frena en PAUSA;
//   - el del video, que sigue corriendo porque la cámara no se entera.
// El mapa de tramos dice qué segundo de video corresponde a cada segundo de
// partido. Además, cada evento guarda su ANCLA: el segundo de partido y el
// de video del momento exacto del toque. El clip sale de ahí, en segundos
// reales: el "previo" de un evento marcado justo después de reanudar son los
// segundos de video anteriores al toque (lo que pasó de verdad), no los de
// antes de la pausa, que es donde caería pasándolo por el mapa.

import {
    normalizar, elemento, elementosDeHoja, hojaDe, hojaQueAbre, emergentesDe, excluyentesDe,
    contadoresDe, equipoDeBoton
} from './plantilla.js';

// ─────────────────────────────────────────────
// MAPA DE TRAMOS (reloj de partido → reloj de video)
// Funciones puras: reciben un mapa y devuelven uno nuevo. Un tramo es
// { m0, m1, v0 }: del segundo m0 al m1 del partido, que en el video
// arranca en v0. El abierto tiene m1 = Infinity (en JSON viaja como null).
// ─────────────────────────────────────────────
export function abrirTramo(mapa, m, v) {
    // Nunca dos tramos abiertos a la vez: dos tramos pisándose darían el
    // segundo de video equivocado para todo lo que caiga en el solape.
    const cerrado = cerrarTramo(mapa, m);
    return [...cerrado, { m0: m, m1: Infinity, v0: v }];
}

export function cerrarTramo(mapa, m) {
    const ult = mapa[mapa.length - 1];
    if (!ult || !abierto(ult)) return mapa.slice();
    return [...mapa.slice(0, -1), { ...ult, m1: Math.max(ult.m0, m) }];
}

const abierto = t => t.m1 === Infinity || t.m1 == null;

// Segundo de video de un segundo de partido, o null si en ese momento no se
// estaba grabando. Un momento antes del primer tramo que cae adentro del
// video (la grabación arrancó antes que el reloj) se calcula hacia atrás;
// uno de antes de que existiera el video, null. Dentro de una pausa, el
// borde del tramo anterior.
export function videoDe(mapa, m) {
    if (!mapa || !mapa.length || m == null) return null;
    for (const t of mapa) {
        const fin = abierto(t) ? Infinity : t.m1;
        if (m >= t.m0 && m <= fin) return t.v0 + (m - t.m0);
    }
    const primero = mapa[0];
    if (m < primero.m0) {
        const v = primero.v0 - (primero.m0 - m);
        return v >= 0 ? v : null;
    }
    let ant = primero;
    for (const t of mapa) if (t.m0 <= m) ant = t;
    return ant.v0 + ((abierto(ant) ? m : ant.m1) - ant.m0);
}

// Los segundos de video de un evento. Con ancla (lo normal) se mide desde el
// toque en segundos reales; sin ancla (un evento de una sesión vieja), por
// el mapa. null si el evento es de antes de que hubiera video.
export function clipDeVideo(ev, mapa) {
    const ini = ev.start, fin = ev.end;
    const a = ev.vAncla && ev.vAncla.v != null ? ev.vAncla : null;
    let vInicio = null, vFin = null;
    if (a) {
        vInicio = a.v - (a.m - ini);
        const af = ev.vAnclaFin && ev.vAnclaFin.v != null ? ev.vAnclaFin : a;
        vFin = fin == null ? null : af.v + (fin - af.m);
    } else {
        vInicio = videoDe(mapa, ini);
        vFin = fin == null ? null : videoDe(mapa, fin);
        // Arrancó antes de que hubiera video pero terminó con video: desde 0.
        if (vInicio == null && vFin != null) vInicio = 0;
    }
    if (vInicio == null) return { vInicio: null, vFin: null };
    // Un previo más largo que lo grabado hasta ahí arranca en el cero.
    vInicio = Math.max(0, vInicio);
    if (vFin != null && vFin < vInicio) vFin = vInicio;
    return { vInicio, vFin };
}

// ─────────────────────────────────────────────
// CUENTAS (puras, sobre un estado)
// ─────────────────────────────────────────────

// unirTramos() de app.js: largo total contando UNA vez lo que se superpone.
export function unirTramos(tramos) {
    const ordenados = [];
    for (const [a0, b] of tramos) {
        const a = Math.max(0, a0);
        if (b > a) ordenados.push([a, b]);
    }
    ordenados.sort((x, y) => x[0] - y[0]);
    let total = 0, cantidad = 0, ini = null, fin = null;
    ordenados.forEach(([a, b]) => {
        if (ini === null || a > fin) {
            if (ini !== null) { total += fin - ini; cantidad++; }
            ini = a; fin = b;
        } else if (b > fin) {
            fin = b;
        }
    });
    if (ini !== null) { total += fin - ini; cantidad++; }
    return { total, cantidad };
}

// indicePorBoton() de app.js: tramos y toques por botón, de una pasada.
export function indicePorBoton(estado) {
    const idx = new Map();
    const fila = id => {
        let f = idx.get(id);
        if (!f) { f = { tramos: [], toques: 0 }; idx.set(id, f); }
        return f;
    };
    (estado.eventos || []).forEach(ev => {
        if (ev.posesionDe) return;
        const f = fila(ev.buttonId);
        f.toques++;
        if (ev.end != null) f.tramos.push([ev.start, ev.end]);
    });
    (estado.abiertos || []).forEach(o => {
        const f = fila(o.buttonId);
        f.toques++;
        f.tramos.push([o.start, estado.tiempo]);
    });
    return idx;
}

// vecesMarcado() de app.js: el número del contador que muestra un evento.
export function vecesMarcado(estado, botonId, idx) {
    const f = (idx || indicePorBoton(estado)).get(botonId);
    return f ? f.toques : 0;
}

// toiRows() de app.js: tiempo en hielo por jugador, el que más jugó arriba.
export function filasTiempoEnHielo(datos, estado) {
    const abiertos = new Set((estado.abiertos || []).map(o => o.buttonId));
    const idx = indicePorBoton(estado);
    return (datos.elements || [])
        .filter(e => e.type === 'event')
        .map(e => {
            const f = idx.get(e.id);
            const h = unirTramos(f ? f.tramos : []);
            return { id: e.id, nombre: e.name, enHielo: abiertos.has(e.id), turnos: h.cantidad, total: h.total };
        })
        .filter(r => r.total > 0 || r.enHielo)
        .sort((a, b) => b.total - a.total);
}

// tramosDePosesion() de app.js. Reparte el tiempo entre los dos equipos sin
// contar nada dos veces: si se pisan eventos de los dos, ese rato es del que
// se marcó último. `tramos` son los del botón de Posesión.
export function tramosDePosesion(datos, eventos, tramos, abiertos, posesion, ahora) {
    const marcas = [];
    (eventos || []).forEach(ev => {
        const eq = ev.posesionDe ? ev.equipo : equipoDeBoton(datos, ev.buttonId);
        if ((eq === 'A' || eq === 'B') && ev.end != null && ev.end > ev.start) {
            marcas.push({ a: Math.max(0, ev.start), b: ev.end, eq });
        }
    });
    (tramos || []).forEach(t => {
        if ((t.equipo === 'A' || t.equipo === 'B') && t.end > t.start) {
            marcas.push({ a: Math.max(0, t.start), b: t.end, eq: t.equipo });
        }
    });
    if (ahora != null) {
        (abiertos || []).forEach(o => {
            const eq = equipoDeBoton(datos, o.buttonId);
            if (eq && ahora > o.start) marcas.push({ a: Math.max(0, o.start), b: ahora, eq });
        });
        Object.keys(posesion || {}).forEach(k => {
            const p = posesion[k];
            if (ahora > p.desde) marcas.push({ a: p.desde, b: ahora, eq: p.equipo });
        });
    }
    if (!marcas.length) return [];

    marcas.sort((x, y) => x.a - y.a);
    const cortes = [...new Set(marcas.flatMap(m => [m.a, m.b]))].sort((x, y) => x - y);
    const segmentos = [];
    let activos = [], p = 0;
    for (let i = 0; i < cortes.length - 1; i++) {
        const a = cortes[i], b = cortes[i + 1];
        while (p < marcas.length && marcas[p].a <= a) activos.push(marcas[p++]);
        activos = activos.filter(m => m.b > a);
        if (!activos.length) continue;
        let dueno = activos[0];
        activos.forEach(m => { if (m.a > dueno.a) dueno = m; });
        const ultimo = segmentos[segmentos.length - 1];
        if (ultimo && ultimo.eq === dueno.eq && ultimo.b === a) ultimo.b = b;
        else segmentos.push({ a, b, eq: dueno.eq });
    }
    return segmentos;
}

// tiemposPosesion() de app.js. Lo que todavía no pasó no cuenta; con el
// reloj en cero (un partido ya terminado) va todo.
export function tiemposPosesion(segmentos, tiempo) {
    const hasta = tiempo > 0 ? tiempo : Infinity;
    const t = { A: 0, B: 0, tramos: 0 };
    segmentos.forEach(s => {
        const b = Math.min(s.b, hasta);
        if (b > s.a) { t[s.eq] += b - s.a; t.tramos++; }
    });
    const total = t.A + t.B;
    t.pctA = total > 0 ? Math.round(t.A / total * 100) : null;
    t.pctB = total > 0 ? 100 - t.pctA : null;
    return t;
}

// Posesión de un estado en vivo: porcentajes y quién tiene la pelota ahora.
export function posesionDe(datos, estado) {
    const ahora = estado.terminado ? null : estado.tiempo;
    const seg = tramosDePosesion(datos, estado.eventos, estado.tramosPos, estado.abiertos, estado.posesion, ahora);
    const t = tiemposPosesion(seg, estado.terminado ? 0 : estado.tiempo);
    let conPelota = null;
    if (!estado.terminado) {
        for (let i = seg.length - 1; i >= 0; i--) {
            if (seg[i].a <= estado.tiempo && seg[i].b >= estado.tiempo) { conPelota = seg[i].eq; break; }
        }
    }
    return { ...t, conPelota };
}

// ─────────────────────────────────────────────
// EL MOTOR
// ─────────────────────────────────────────────

// Cuánto antes de arrancar la grabación puede haber caído un toque y
// todavía pegarse al video: lo que tarda en abrir el archivo después del
// PLAY. Más que eso es "la cámara llegó tarde": esos eventos no tienen video.
const ESPERA_GRABACION = 5;

const copia = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => x === Infinity ? null : x));

/**
 * @param datosPlantilla  { elements, links, hojas } (se normaliza)
 * @param opciones.ahora          () => milisegundos (Date.now por defecto)
 * @param opciones.relojExterno   () => segundos: el reloj del partido ES
 *        este (codificar un video ya grabado: el partido es el video).
 * @param opciones.relojVideo     () => segundo del archivo que se está
 *        grabando, o null si no se graba.
 * @param opciones.buscarPlantilla (id) => { name, elements, etiquetas }:
 *        para eventos que abren OTRA plantilla (subPlantillaId, versiones
 *        viejas del iPad). Sin esto, esos eventos funcionan como comunes.
 */
export function crearCodificacion(datosPlantilla, opciones = {}) {
    const ahora = opciones.ahora || (() => Date.now());
    const relojExterno = opciones.relojExterno || null;
    const relojVideo = opciones.relojVideo || (() => null);
    const buscarPlantilla = opciones.buscarPlantilla || null;
    const datos = normalizar(datosPlantilla);

    let s = estadoInicial();
    const oyentes = new Set();

    function estadoInicial() {
        return {
            acumulado: 0,       // segundos de partido hasta el último PLAY
            desde: null,        // ahora() del último PLAY, si está andando
            andando: false,
            inicioReal: null,   // ahora() del primer PLAY
            eventos: [],        // archivados, el último primero (como el iPad)
            abiertos: [],       // openEvents: manuales grabando
            pendiente: null,    // pendingEvent: esperando etiqueta
            emergentes: null,   // { botonId, lista: [{ id, nombre, elementoId?, indice? }] }
            detalle: null,      // pestaña de detalle abierta
            contadores: {},
            posesion: {},       // tramo en curso por botón de posesión
            tramosPos: [],
            fijas: [],          // etiquetas fijas encendidas, en orden
            mapa: [],
            terminado: false,
            seq: 0
        };
    }

    // ── Reloj ────────────────────────────────
    function tiempo() {
        if (relojExterno) return Math.max(0, relojExterno());
        return s.acumulado + (s.andando && s.desde != null ? (ahora() - s.desde) / 1000 : 0);
    }

    // El momento de un toque: el que viene con la acción (un toque del iPad
    // que llegó con demora) o ahora. Nunca en el futuro.
    function momentoDe(o) {
        const t = tiempo();
        if (o && o.momento != null && Number.isFinite(Number(o.momento))) return Math.max(0, Math.min(Number(o.momento), t));
        return t;
    }

    // Segundo de video de un momento de partido. El de ahora se le pregunta a
    // la grabadora (lo más preciso); uno pasado, al mapa.
    function videoDelMomento(m) {
        const t = tiempo();
        if (Math.abs(t - m) < 0.05) {
            const v = relojVideo();
            if (v != null) return v;
        }
        return videoDe(s.mapa, m);
    }

    function play() {
        if (s.terminado || s.andando) return false;
        const t = tiempo();
        if (s.inicioReal == null) s.inicioReal = ahora();
        s.andando = true;
        s.desde = ahora();
        s.acumulado = relojExterno ? 0 : t;
        const v = relojVideo();
        if (v != null) s.mapa = abrirTramo(s.mapa, t, v);
        return true;
    }

    function pausa() {
        if (!s.andando) return false;
        const t = tiempo();
        s.acumulado = relojExterno ? 0 : t;
        s.andando = false;
        s.desde = null;
        s.mapa = cerrarTramo(s.mapa, t);
        return true;
    }

    // La grabación arrancó (después del PLAY, porque abrir el archivo tarda,
    // o porque la cámara se conectó con el partido empezado). Abre el tramo
    // ahora, y los toques de los últimos segundos que quedaron sin video se
    // pegan al principio del archivo.
    function sincronizarVideo() {
        const v = relojVideo();
        if (v == null) return false;
        const t = tiempo();
        if (s.andando) {
            const ult = s.mapa[s.mapa.length - 1];
            if (!ult || !abierto(ult)) s.mapa = abrirTramo(s.mapa, t, v);
        }
        const pegar = ancla => {
            if (!ancla || ancla.v != null) return;
            if (t - ancla.m <= ESPERA_GRABACION) ancla.v = Math.max(0, v - (t - ancla.m));
        };
        [...s.eventos, ...s.abiertos, ...(s.pendiente ? [s.pendiente] : [])].forEach(ev => {
            pegar(ev.vAncla);
            pegar(ev.vAnclaFin);
        });
        return true;
    }

    // ── Eventos ──────────────────────────────
    // makeEventInstance() de app.js, con el ancla de video.
    function nuevaInstancia(e, t) {
        const manual = e.timeMode === 'manual';
        return {
            id: ++s.seq,
            buttonId: e.id,
            name: e.name,
            start: Math.max(0, t - (e.lead || 0)),
            end: manual ? null : t + (e.lag || 1),
            timestamp: fmt(t),
            lead: e.lead || 0,
            lag: e.lag || 0,
            exclusiveIds: excluyentesDe(datos, e.id),
            isExclusive: !!e.isExclusive,
            timeMode: e.timeMode || 'fixed',
            line: null,
            descriptors: fijasActivas(),
            vAncla: { m: t, v: videoDelMomento(t) }
        };
    }

    function fijasActivas() {
        const nombres = [];
        s.fijas.forEach(id => {
            const f = elemento(datos, id);
            if (f && !nombres.includes(f.name)) nombres.push(f.name);
        });
        return nombres;
    }

    function sumarContadores(botonId) {
        s.contadores[botonId] = (s.contadores[botonId] || 0) + 1;
        contadoresDe(datos, botonId).forEach(c => { s.contadores[c] = (s.contadores[c] || 0) + 1; });
    }

    function archivar(ev) {
        if (s.eventos.some(x => x.id === ev.id)) return;
        s.eventos.unshift(ev);
        sumarContadores(ev.buttonId);
    }

    // closeOpenEventAt() de app.js. `sinPosterior` corta justo ahora.
    function cerrarAbierto(i, t, sinPosterior) {
        const ev = s.abiertos[i];
        if (!ev) return null;
        ev.end = sinPosterior ? t : t + (ev.lag || 0);
        ev.vAnclaFin = { m: t, v: videoDelMomento(t) };
        archivar(ev);
        s.abiertos.splice(i, 1);
        if (s.pendiente === ev) s.pendiente = null;
        return ev;
    }

    // finalizeEvent() de app.js.
    function finalizarPendiente() {
        const ev = s.pendiente;
        if (!ev) return;
        if (!s.abiertos.includes(ev)) archivar(ev);
        s.pendiente = null;
        s.emergentes = null;
    }

    // cortarRival() de app.js: lo que hace un equipo corta lo del otro.
    function cortarRival(equipo, t) {
        if (equipo !== 'A' && equipo !== 'B') return;
        const rival = equipo === 'A' ? 'B' : 'A';
        for (let i = s.abiertos.length - 1; i >= 0; i--) {
            if (equipoDeBoton(datos, s.abiertos[i].buttonId) === rival) cerrarAbierto(i, t, true);
        }
        s.eventos.forEach(ev => {
            if (!ev.posesionDe && ev.end != null && ev.start < t && ev.end > t && equipoDeBoton(datos, ev.buttonId) === rival) {
                ev.end = t;
                ev.vAnclaFin = { m: t, v: videoDelMomento(t) };
            }
        });
        Object.keys(s.posesion).forEach(id => {
            if (s.posesion[id].equipo === rival) cerrarTramoPosesion(id, t);
        });
    }

    function cerrarTramoPosesion(botonId, t) {
        const tramo = s.posesion[botonId];
        if (!tramo) return;
        delete s.posesion[botonId];
        // Un doble toque sin querer no deja medio segundo sumando.
        if (t - tramo.desde < 0.5) return;
        const b = elemento(datos, botonId);
        s.tramosPos.push({ buttonId: b ? b.id : botonId, equipo: tramo.equipo, start: tramo.desde, end: t });
    }

    // handleLiveClick() de app.js para un evento.
    function tocarEvento(e, t) {
        const i = s.abiertos.findIndex(o => o.buttonId === e.id);
        // Segundo toque de un manual que está grabando: lo corta.
        if (i !== -1) {
            cerrarAbierto(i, t);
            s.emergentes = null;
            s.pendiente = null;
            return;
        }

        // Diferencia a propósito con el iPad: ahí un evento de tiempo fijo
        // que esperaba su emergente se pierde si tocás otro evento antes de
        // elegirla. Acá queda registrado sin etiqueta: en un partido real se
        // toca rápido, y un evento perdido no se recupera.
        if (s.pendiente && s.pendiente.timeMode !== 'manual') finalizarPendiente();

        cortarRival(equipoDeBoton(datos, e.id), t);
        const excl = excluyentesDe(datos, e.id);
        for (let k = s.abiertos.length - 1; k >= 0; k--) {
            const o = s.abiertos[k];
            if (excl.includes(o.buttonId) || (o.exclusiveIds || []).includes(e.id) || e.isExclusive || o.isExclusive) {
                cerrarAbierto(k, t);
            }
        }

        const ev = nuevaInstancia(e, t);
        s.pendiente = ev;
        s.emergentes = null;

        const lista = emergentesDe(datos, e.id).map(x => x.elemento
            ? { id: x.elemento.id, nombre: x.nombre, elementoId: x.elemento.id }
            : { id: e.id + '#' + x.indice, nombre: x.nombre, indice: x.indice });
        if (lista.length) s.emergentes = { botonId: e.id, lista };

        // Pestaña de detalle: se abre en lugar de las emergentes.
        const det = detalleDe(e);
        if (det) {
            s.emergentes = null;
            s.detalle = { botonId: e.id, evento: e.name, plantilla: det.name, hojaId: det.hojaId,
                          elementos: det.elementos, max: det.max, elegidas: [] };
        }

        if (e.timeMode === 'manual') {
            s.abiertos.push(ev);
        } else if (!det && !s.emergentes) {
            // Tiempo fijo sin nada que elegir: queda registrado ya.
            finalizarPendiente();
        }
    }

    // plantillaDeDetalle() de app.js.
    function detalleDe(e) {
        const hoja = hojaQueAbre(datos, e.id);
        if (hoja) return { name: hoja.name, hojaId: hoja.id, elementos: null, max: hoja.etiquetas || 1 };
        if (e.subPlantillaId && buscarPlantilla) {
            const p = buscarPlantilla(e.subPlantillaId);
            if (p) return { name: p.name || p.nombre || '', hojaId: null,
                            elementos: normalizar(p.datos || p).elements, max: Math.max(1, parseInt(p.etiquetas) || 1) };
        }
        return null;
    }

    // El destino de una etiqueta suelta: el pendiente, si no el último que
    // está grabando, si no el último registrado (handleLiveClick/descriptor,
    // handlePopupLabelClick y pegarEtiquetas de app.js).
    function destinoEtiqueta() {
        return s.pendiente || s.abiertos[s.abiertos.length - 1] || s.eventos[0] || null;
    }

    function etiquetar(nombres) {
        const d = destinoEtiqueta();
        if (d) nombres.forEach(n => { if (!d.descriptors.includes(n)) d.descriptors.push(n); });
        return d;
    }

    // handlePopupLabelClick() de app.js.
    function elegirEmergente(emId) {
        const em = s.emergentes && s.emergentes.lista.find(x => String(x.id) === String(emId));
        let nombre = em ? em.nombre : null;
        if (!nombre) {
            // Un botón emergente de la plantilla tocado sin estar a la vista
            // (un atajo de teclado): vale su nombre.
            const e = elemento(datos, emId);
            if (!e || e.type !== 'popup_label') return false;
            nombre = e.name;
        }
        etiquetar([nombre]);
        if (s.pendiente && s.pendiente.timeMode !== 'manual') finalizarPendiente();
        s.emergentes = null;
        return true;
    }

    // tocarEnDetalle() de app.js: cada pestaña dice cuántas se eligen.
    function tocarEnDetalle(nombre) {
        const d = s.detalle;
        const i = d.elegidas.indexOf(nombre);
        if (i >= 0) d.elegidas.splice(i, 1);
        else d.elegidas.push(nombre);
        if (d.elegidas.length >= d.max) cerrarDetalle();
    }

    // terminarDetalle() de app.js: sin nada elegido es "volver sin elegir";
    // el evento de tiempo fijo queda igual, sin etiqueta, y el manual sigue.
    function cerrarDetalle() {
        const d = s.detalle;
        if (!d) return false;
        s.detalle = null;
        etiquetar(d.elegidas);
        if (s.pendiente && s.pendiente.timeMode !== 'manual') finalizarPendiente();
        s.emergentes = null;
        return true;
    }

    // handleLineClick() de app.js.
    function tocarLinea(e, t) {
        const miembros = (e.lineMemberIds || []).map(id => elemento(datos, id)).filter(Boolean);
        if (!miembros.length) return { error: 'linea-vacia' };
        const idsMiembros = miembros.map(m => m.id);
        const abiertosIds = s.abiertos.map(o => o.buttonId);
        if (miembros.some(m => abiertosIds.includes(m.id))) {
            for (let i = s.abiertos.length - 1; i >= 0; i--) {
                if (idsMiembros.includes(s.abiertos[i].buttonId)) cerrarAbierto(i, t);
            }
        } else {
            if (e.lineExclusive !== false) {
                const otras = new Set();
                datos.elements.filter(x => x.type === 'line' && x.id !== e.id)
                    .forEach(ol => (ol.lineMemberIds || []).forEach(id => otras.add(id)));
                for (let i = s.abiertos.length - 1; i >= 0; i--) {
                    const bid = s.abiertos[i].buttonId;
                    // Un jugador que también está en la línea que entra no baja.
                    if (otras.has(bid) && !idsMiembros.includes(bid)) cerrarAbierto(i, t);
                }
            }
            miembros.forEach(m => {
                if (s.abiertos.some(o => o.buttonId === m.id)) return;
                const ev = nuevaInstancia(m, t);
                ev.end = null;
                ev.timeMode = 'manual';
                ev.line = e.name;
                s.abiertos.push(ev);
            });
        }
        return {};
    }

    // tocarEtiquetaFija() de app.js. No arranca el reloj.
    function tocarFija(e) {
        const i = s.fijas.findIndex(id => id === e.id);
        if (i >= 0) s.fijas.splice(i, 1);
        else {
            s.fijas.push(e.id);
            const excl = excluyentesDe(datos, e.id);
            if (excl.length) s.fijas = s.fijas.filter(id => id === e.id || !excl.includes(id));
        }
    }

    // tocarPosesion() de app.js.
    function tocarPosesion(e, equipo, t) {
        if (equipo !== 'A' && equipo !== 'B') return { error: 'falta-equipo' };
        const actual = s.posesion[e.id];
        if (actual) cerrarTramoPosesion(e.id, t);
        if (!actual || actual.equipo !== equipo) {
            cortarRival(equipo, t);
            s.posesion[e.id] = { equipo, desde: t };
        }
        return {};
    }

    // El toque de un botón, sea del tipo que sea: lo que hacen los click de
    // renderElements() en vivo.
    function tocar(elementoId, o = {}) {
        if (s.terminado) return { ok: false, error: 'terminado' };

        // Con una pestaña de detalle abierta, lo que se toca es una opción.
        if (s.detalle) {
            const enDetalle = s.detalle.elementos
                ? s.detalle.elementos.find(x => String(x.id) === String(elementoId))
                : elementosDeHoja(datos, s.detalle.hojaId).find(x => String(x.id) === String(elementoId));
            if (enDetalle) {
                if (['text', 'teams', 'image', 'container'].includes(enDetalle.type)) return { ok: false };
                tocarEnDetalle(enDetalle.name);
                return avisar({ ok: true });
            }
            // Un atajo de la Principal con el detalle abierto: se cierra con
            // lo elegido y el toque sigue.
            cerrarDetalle();
        }

        const e = elemento(datos, elementoId);
        if (!e) return { ok: false, error: 'no-existe' };
        // Emergente escrita en un evento, tocada en pantalla.
        if (s.emergentes && s.emergentes.lista.some(x => String(x.id) === String(elementoId))) {
            elegirEmergente(elementoId);
            return avisar({ ok: true });
        }
        if (hojaDe(e)) return { ok: false, error: 'otra-pestana' };

        const t = momentoDe(o);
        let r = {};
        switch (e.type) {
            case 'event':
                if (!s.andando) play();
                tocarEvento(e, t);
                break;
            case 'descriptor':
                if (!s.andando) play();
                etiquetar([e.name]);
                break;
            case 'counter':
                if (!s.andando) play();
                s.contadores[e.id] = (s.contadores[e.id] || 0) + 1;
                break;
            case 'line':
                if (!s.andando) play();
                r = tocarLinea(e, t);
                break;
            case 'possession':
                if (!s.andando) play();
                r = tocarPosesion(e, o.equipo, t);
                break;
            case 'sticky_label':
                tocarFija(e);
                break;
            case 'popup_label':
                if (!elegirEmergente(e.id)) return { ok: false };
                break;
            default:
                return { ok: false, error: 'no-se-toca' };
        }
        if (r.error) return { ok: false, error: r.error };
        return avisar({ ok: true });
    }

    // Borrar un evento marcado por error (desde el registro).
    function borrarEvento(id) {
        const i = s.eventos.findIndex(e => e.id === id);
        if (i < 0) return false;
        const ev = s.eventos[i];
        s.eventos.splice(i, 1);
        if (s.contadores[ev.buttonId]) s.contadores[ev.buttonId]--;
        contadoresDe(datos, ev.buttonId).forEach(c => { if (s.contadores[c]) s.contadores[c]--; });
        return true;
    }

    // setMode('setup') de app.js: se cierran los turnos sin tiempo posterior
    // y la posesión que siga corriendo, para que todo llegue al XML.
    function terminar() {
        if (s.terminado) return estado();
        if (s.detalle) cerrarDetalle();
        if (s.pendiente && s.pendiente.timeMode !== 'manual') finalizarPendiente();
        const t = tiempo();
        for (let i = s.abiertos.length - 1; i >= 0; i--) cerrarAbierto(i, t, true);
        Object.keys(s.posesion).forEach(id => cerrarTramoPosesion(id, t));
        s.pendiente = null;
        s.emergentes = null;
        pausa();
        s.acumulado = t;
        s.terminado = true;
        return estado();
    }

    // ── Estado y acciones ────────────────────
    function estado() {
        return {
            tiempo: tiempo(),
            andando: s.andando,
            inicioReal: s.inicioReal,
            terminado: s.terminado,
            eventos: copia(s.eventos),
            abiertos: copia(s.abiertos),
            pendiente: copia(s.pendiente) || null,
            emergentes: copia(s.emergentes) || null,
            detalle: copia(s.detalle) || null,
            contadores: { ...s.contadores },
            posesion: copia(s.posesion),
            tramosPos: copia(s.tramosPos),
            fijas: s.fijas.slice(),
            mapa: s.mapa.map(t => ({ ...t }))
        };
    }

    function avisar(r) {
        if (oyentes.size) {
            const e = estado();
            oyentes.forEach(cb => { try { cb(e); } catch (err) { console.error(err); } });
        }
        return r;
    }

    const conAviso = fn => (...a) => { const r = fn(...a); avisar(); return r; };

    const metodos = {
        play: conAviso(play),
        pausa: conAviso(pausa),
        alternar: conAviso(() => s.andando ? pausa() : play()),
        tocar,
        elegirEmergente: conAviso(elegirEmergente),
        cerrarDetalle: conAviso(cerrarDetalle),
        etiquetar: conAviso(nombres => !!etiquetar([].concat(nombres || []))),
        borrarEvento: conAviso(borrarEvento),
        sincronizarVideo: conAviso(sincronizarVideo),
        terminar: conAviso(terminar)
    };

    // Toda acción es un objeto: { tipo, ...argumentos }. Es lo que manda el
    // iPad por wifi, y lo que se guardaría para rehacer un partido.
    function aplicar(a) {
        if (!a || typeof a !== 'object') return { ok: false, error: 'accion' };
        switch (a.tipo) {
            case 'play': return metodos.play();
            case 'pausa': return metodos.pausa();
            case 'alternar': return metodos.alternar();
            case 'tocar': return metodos.tocar(a.elementoId, { momento: a.momento, equipo: a.equipo });
            case 'elegirEmergente': return metodos.elegirEmergente(a.id != null ? a.id : a.elementoId);
            case 'cerrarDetalle': return metodos.cerrarDetalle();
            case 'etiquetar': return metodos.etiquetar(a.nombres || a.nombre);
            case 'borrarEvento': return metodos.borrarEvento(a.id);
            case 'terminar': return metodos.terminar();
            default: return { ok: false, error: 'accion-desconocida' };
        }
    }

    // Todo lo necesario para seguir exactamente donde estaba (si se cierra
    // la ventana en medio del partido) o para mandarlo a otro lado. El reloj
    // sigue corriendo mientras tanto: al importar se le suma lo que pasó.
    function exportarEstado() {
        const e = copia({ ...s, acumulado: tiempo(), desde: null });
        e.exportadoEn = ahora();
        e.version = 1;
        return e;
    }

    function importarEstado(e) {
        if (!e || typeof e !== 'object') return false;
        const nuevo = { ...estadoInicial(), ...copia(e) };
        delete nuevo.exportadoEn;
        delete nuevo.version;
        nuevo.mapa = (nuevo.mapa || []).map(t => ({ ...t, m1: t.m1 == null ? Infinity : t.m1 }));
        if (nuevo.andando && !relojExterno) {
            nuevo.acumulado = (e.acumulado || 0) + Math.max(0, (ahora() - (e.exportadoEn || ahora())) / 1000);
            nuevo.desde = ahora();
        }
        // El pendiente es el mismo objeto que en abiertos (si es manual).
        if (nuevo.pendiente) {
            const mismo = nuevo.abiertos.find(x => x.id === nuevo.pendiente.id);
            if (mismo) nuevo.pendiente = mismo;
        }
        s = nuevo;
        avisar();
        return true;
    }

    return {
        ...metodos,
        aplicar,
        estado,
        tiempo,
        exportarEstado,
        importarEstado,
        datos: () => datos,
        alCambiar(cb) { oyentes.add(cb); return () => oyentes.delete(cb); }
    };
}

export function fmt(seg) {
    const m = Math.floor(seg / 60), ss = Math.floor(seg % 60);
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

// Los eventos de un estado terminado, en el formato PARTIDO del contrato
// (lo que va a tv.partidos.guardar), en orden cronológico y con sus
// segundos de video. `nombresEq` = { A, B } para el campo equipo.
export function eventosParaPartido(datos, estado, nombresEq) {
    const d = normalizar(datos);
    return [...(estado.eventos || [])]
        .filter(ev => !ev.posesionDe)
        .sort((a, b) => a.start - b.start)
        .map(ev => {
            const { vInicio, vFin } = clipDeVideo(ev, estado.mapa || []);
            const eq = equipoDeBoton(d, ev.buttonId);
            return {
                nombre: ev.name,
                botonId: ev.buttonId != null ? String(ev.buttonId) : null,
                equipo: eq && nombresEq ? nombresEq[eq] : null,
                linea: ev.line || null,
                inicio: ev.start,
                fin: ev.end == null ? null : ev.end,
                vInicio,
                vFin,
                etiquetas: [
                    ...(ev.line ? [{ grupo: 'Linea', texto: ev.line }] : []),
                    ...(ev.descriptors || []).map(t => ({ grupo: 'Etiqueta', texto: t }))
                ]
            };
        });
}
