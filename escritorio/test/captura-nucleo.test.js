// src/nucleo/: plantilla, mapa de tramos, motor de codificación y XML.
//   node --test escritorio/test/captura*.test.js
//
// La plantilla de prueba tiene de todo lo del formato del iPad: pestaña de
// detalle, emergentes de las tres formas, líneas, posesión, excluyentes,
// fijas y contadores. El XML se compara contra el que saca exportCustomXML()
// del app.js del iPad, corrido tal cual: tienen que ser iguales byte a byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
    normalizar, elementosDeHoja, hojaQueAbre, emergentesDe, contenedorDe, excluyentesDe, atajos
} from '../src/nucleo/plantilla.js';
import {
    abrirTramo, cerrarTramo, videoDe, clipDeVideo, crearCodificacion, eventosParaPartido, posesionDe
} from '../src/nucleo/codificacion.js';
import { xmlSportscode, bytesUtf16, csvTiempoEnHielo, csvPosesion } from '../src/nucleo/exportar.js';
import { repararFragmento, bitsDeCalidad } from '../src/nucleo/grabadora.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────
// Plantilla de prueba (formato del iPad)
// ─────────────────────────────────────────────
const ev = (id, name, extra = {}) => ({ id, type: 'event', name, x: 0, y: 0, w: 120, h: 52, color: null, lead: 0, lag: 1, ...extra });
const PLANTILLA = {
    elements: [
        ev(1, 'Gol', { x: 10, y: 10, lead: 5, lag: 3, color: '#ff0000', atajo: 'G' }),
        ev(2, 'Tiro', { x: 140, y: 10, lead: 2, lag: 2, popups: ['Al arco', 'Desviado'], color: '#00aa55' }),
        { id: 3, type: 'container', name: '', x: 0, y: 100, w: 400, h: 200 },
        ev(4, 'Pase', { x: 10, y: 110, lead: 1, lag: 1 }),
        { id: 5, type: 'popup_label', name: 'Corto', x: 150, y: 110, w: 120, h: 52 },
        { id: 6, type: 'popup_label', name: 'Largo', x: 600, y: 600, w: 120, h: 52 },
        { id: 7, type: 'popup_label', name: 'Suelto', x: 800, y: 800, w: 120, h: 52 },
        ev(8, 'Ataque A', { timeMode: 'manual', equipo: 'A', exclusiveIds: [9], x: 300, y: 10 }),
        ev(9, 'Ataque B', { timeMode: 'manual', equipo: 'B', x: 430, y: 10 }),
        { id: 10, type: 'sticky_label', name: '1T', exclusiveIds: [11], x: 560, y: 10, w: 120, h: 52 },
        { id: 11, type: 'sticky_label', name: '2T', x: 690, y: 10, w: 120, h: 52 },
        { id: 12, type: 'counter', name: 'Tiros', x: 820, y: 10, w: 80, h: 60 },
        ev(13, 'Falta', { subHojaId: 'h1', x: 10, y: 320 }),
        { id: 14, type: 'descriptor', name: 'Mano', hoja: 'h1', x: 10, y: 10, w: 120, h: 52 },
        { id: 15, type: 'descriptor', name: 'Codo', hoja: 'h1', x: 140, y: 10, w: 120, h: 52 },
        { id: 16, type: 'descriptor', name: 'Empujón', hoja: 'h1', x: 270, y: 10, w: 120, h: 52 },
        ev(20, 'J1', { timeMode: 'manual', x: 10, y: 400 }),
        ev(21, 'J2', { timeMode: 'manual', x: 140, y: 400 }),
        ev(22, 'J3', { timeMode: 'manual', x: 270, y: 400 }),
        { id: 30, type: 'line', name: 'L1', lineMemberIds: [20, 21], x: 10, y: 470, w: 140, h: 52 },
        { id: 31, type: 'line', name: 'L2', lineMemberIds: [21, 22], x: 160, y: 470, w: 140, h: 52 },
        { id: 40, type: 'possession', name: 'Posesión', x: 10, y: 540, w: 260, h: 72 },
        { id: 50, type: 'teams', name: '', equipoA: 'Norte', equipoB: 'Sur', colorA: '#112233', colorB: '#445566', x: 300, y: 540, w: 300, h: 56 }
    ],
    links: [{ id: 'l1', fromId: 2, toId: 6 }, { id: 'l2', fromId: 2, toId: 12 }],
    hojas: [{ id: 'h1', name: 'Tipo de falta', etiquetas: 2 }]
};
const copia = x => JSON.parse(JSON.stringify(x));

// ─────────────────────────────────────────────
// plantilla.js
// ─────────────────────────────────────────────
test('plantilla: normalizar es idempotente y no toca la original', () => {
    const antes = JSON.stringify(PLANTILLA);
    const n1 = normalizar(PLANTILLA);
    assert.equal(JSON.stringify(PLANTILLA), antes);
    assert.deepEqual(normalizar(n1), n1);
    assert.deepEqual(normalizar(JSON.stringify(PLANTILLA)), n1, 'acepta el texto JSON');
    assert.equal(n1.elements.find(e => e.id === 1).atajo, 'g', 'la tecla va en minúscula');
});

test('plantilla: tolera plantillas viejas o hechas a mano', () => {
    const vieja = normalizar({ current: { elements: [
        { id: '7', type: 'event', name: 'A', popups: 'Uno, Dos' },   // id texto, emergentes como texto, sin tamaño
        { id: 8, type: 'raro', name: 'B', subHojaId: 'no-existe' },    // tipo desconocido, pestaña que no está
        null
    ], links: [{ fromId: 7, toId: 99 }] } });
    assert.equal(vieja.elements.length, 2);
    assert.equal(vieja.elements[0].id, 7);
    assert.deepEqual(vieja.elements[0].popups, ['Uno', 'Dos']);
    assert.equal(vieja.elements[0].w, 120);
    assert.equal(vieja.elements[1].type, 'event');
    assert.equal(vieja.elements[1].subHojaId, null);
    assert.deepEqual(vieja.links, [], 'un enlace a un botón que no está se va');
    assert.deepEqual(normalizar(null), { elements: [], links: [], hojas: [] });
    assert.equal(normalizar([{ id: 1, type: 'event' }]).elements.length, 1, 'array suelto de elementos');
});

test('plantilla: pestañas', () => {
    const d = normalizar(PLANTILLA);
    assert.deepEqual(elementosDeHoja(d, 'h1').map(e => e.id), [14, 15, 16]);
    assert.ok(!elementosDeHoja(d, null).some(e => e.hoja));
    assert.equal(hojaQueAbre(d, 13).name, 'Tipo de falta');
    assert.equal(hojaQueAbre(d, 1), null);
});

test('plantilla: emergentes de las tres formas, sin repetir, sin la suelta', () => {
    const d = normalizar(PLANTILLA);
    const tiro = emergentesDe(d, 2);
    assert.deepEqual(tiro.map(x => x.nombre), ['Largo', 'Al arco', 'Desviado'], 'flecha primero, escritas después');
    assert.equal(tiro[0].elemento.id, 6);
    assert.equal(tiro[1].indice, 0);
    assert.deepEqual(emergentesDe(d, 4).map(x => x.nombre), ['Corto'], 'mismo contenedor');
    assert.equal(contenedorDe(d, 4).id, 3);
    assert.ok(![1, 2, 4, 8, 13].some(id => emergentesDe(d, id).some(x => x.nombre === 'Suelto')));
    // Enlazada con flecha Y en el mismo contenedor: una sola vez.
    const doble = normalizar({ ...copia(PLANTILLA), links: [...PLANTILLA.links, { fromId: 4, toId: 5 }] });
    assert.deepEqual(emergentesDe(doble, 4).map(x => x.nombre), ['Corto']);
});

test('plantilla: excluyentes de a dos y atajos repetidos', () => {
    const d = normalizar(PLANTILLA);
    assert.deepEqual(excluyentesDe(d, 9), [8], 'B excluye a A aunque solo A lo diga');
    assert.deepEqual(excluyentesDe(d, 11), [10]);
    const a = atajos(d);
    assert.equal(a.mapa.get('g'), 1);
    const rep = atajos(normalizar({ elements: [ev(1, 'A', { atajo: 'q' }), ev(2, 'B', { atajo: 'Q' })] }));
    assert.equal(rep.mapa.size, 0, 'una tecla repetida no dispara ninguno');
    assert.deepEqual(rep.repetidas[0], { tecla: 'q', ids: [1, 2] });
});

// ─────────────────────────────────────────────
// Mapa de tramos
// ─────────────────────────────────────────────
test('mapa de tramos: pausas, antes del primero y dentro de una pausa', () => {
    let m = abrirTramo([], 2, 0);            // el video arrancó con el partido en 2 s
    m = cerrarTramo(m, 10);                  // PAUSA en 10 (video 8)
    m = abrirTramo(m, 10, 13);               // PLAY 5 s después: video 13
    assert.equal(videoDe(m, 5), 3);
    assert.equal(videoDe(m, 10), 8, 'el borde de la pausa es el del primer tramo');
    assert.equal(videoDe(m, 12), 15);
    assert.equal(videoDe(m, 1.5), null, 'antes de que existiera el video');
    assert.equal(videoDe(abrirTramo([], 5, 3), 4), 2, 'antes del primer tramo, hacia atrás si hay video');
    // Nunca dos tramos abiertos a la vez.
    const dos = abrirTramo(abrirTramo([], 0, 0), 4, 4);
    assert.equal(dos.filter(t => t.m1 === Infinity).length, 1);
    assert.equal(dos[0].m1, 4);
    assert.equal(videoDe([], 3), null);
});

// Reloj falso: ms del motor y segundo del video que "graba" desde ms0.
function relojes(ms0Video) {
    const r = { ms: 0, videoDesde: ms0Video };
    r.ahora = () => r.ms;
    r.video = () => (r.videoDesde != null && r.ms >= r.videoDesde ? (r.ms - r.videoDesde) / 1000 : null);
    return r;
}

test('motor: previo antes de que arranque el video, dentro de una pausa y reconexión', () => {
    const r = relojes(2000);                 // el archivo tarda 2 s en abrirse
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    m.play();                                // PLAY en 0: todavía sin video
    assert.equal(m.estado().mapa.length, 0);
    r.ms = 1000;
    m.tocar(1);                              // Gol en 1 (previo 5, posterior 3): sin video todavía
    r.ms = 2000;
    m.sincronizarVideo();                    // primer cuadro: tramo desde el partido 2 = video 0
    assert.deepEqual(m.estado().mapa, [{ m0: 2, m1: Infinity, v0: 0 }]);
    const gol = m.estado().eventos[0];
    assert.equal(gol.vAncla.v, 0, 'el toque sin video se pega al principio del archivo');
    assert.deepEqual(clipDeVideo(gol, m.estado().mapa), { vInicio: 0, vFin: 3 });

    r.ms = 10000; m.pausa();                 // pausa en 10 (video 8)
    r.ms = 15000; m.play();                  // sigue en 10 (video 13)
    r.ms = 16000; m.tocar(1);                // Gol en 11: el previo son los 5 s de VIDEO de antes del toque
    const e2 = m.estado();
    const gol2 = e2.eventos[0];
    assert.equal(gol2.start, 6);
    assert.deepEqual(clipDeVideo(gol2, e2.mapa), { vInicio: 9, vFin: 17 });
    // Un evento viejo sin ancla va por el mapa: su previo cae antes de la pausa.
    assert.deepEqual(clipDeVideo({ start: 6, end: 14 }, e2.mapa), { vInicio: 4, vFin: 17 });

    // La cámara se desenchufa de 20 a 24: la grabadora sigue en el mismo
    // archivo (congelado), el reloj del video no salta y el mapa no cambia.
    r.ms = 20000;
    const mapaAntes = JSON.stringify(m.estado().mapa);
    r.ms = 24000; m.sincronizarVideo();      // 'inicio' de nuevo no abre otro tramo
    assert.equal(JSON.stringify(m.estado().mapa), mapaAntes);
    r.ms = 26000; m.tocar(1);                // Gol en 21 → video 24 (previo 5)
    const gol3 = m.estado().eventos[0];
    assert.equal(gol3.vAncla.v, 24);
    assert.deepEqual(clipDeVideo(gol3, m.estado().mapa), { vInicio: 19, vFin: 27 });
});

test('motor: tocar con un momento pasado (toque del iPad que llegó tarde)', () => {
    const r = relojes(0);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    m.play();
    r.ms = 5000; m.pausa();
    r.ms = 8000; m.play();                   // partido 5 = video 8
    r.ms = 30000;                            // partido 27, video 30
    m.tocar(1, { momento: 20 });             // Gol marcado en 20 (video 23)
    const p = m.estado().eventos[0];
    assert.equal(p.start, 15);
    assert.equal(p.vAncla.m, 20);
    assert.equal(p.vAncla.v, 23, 'el video del momento pasado sale del mapa');
    m.tocar(1, { momento: 999 });
    assert.equal(m.estado().eventos[0].vAncla.m, 27, 'un momento futuro se recorta a ahora');
});

test('motor: aplicar(accion) es lo mismo que llamar al método', () => {
    const correr = porAccion => {
        const r = relojes(0);
        const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
        const pasos = [
            [0, { tipo: 'play' }],
            [1000, { tipo: 'tocar', elementoId: 10 }],
            [2000, { tipo: 'tocar', elementoId: 2 }],
            [2500, { tipo: 'elegirEmergente', id: '2#1' }],
            [4000, { tipo: 'tocar', elementoId: 8 }],
            [6000, { tipo: 'tocar', elementoId: 9 }],
            [7000, { tipo: 'tocar', elementoId: 40, equipo: 'A' }],
            [8000, { tipo: 'tocar', elementoId: 13 }],
            [8500, { tipo: 'tocar', elementoId: 16 }],
            [8600, { tipo: 'cerrarDetalle' }],
            [9000, { tipo: 'pausa' }],
            [9500, { tipo: 'etiquetar', nombres: ['Revisar'] }],
            [12000, { tipo: 'terminar' }]
        ];
        for (const [ms, a] of pasos) {
            r.ms = ms;
            if (porAccion) m.aplicar(JSON.parse(JSON.stringify(a)));
            else if (a.tipo === 'tocar') m.tocar(a.elementoId, { equipo: a.equipo });
            else if (a.tipo === 'elegirEmergente') m.elegirEmergente(a.id);
            else if (a.tipo === 'etiquetar') m.etiquetar(a.nombres);
            else m[a.tipo]();
        }
        return m.estado();
    };
    assert.deepEqual(correr(true), correr(false));
    assert.deepEqual(crearCodificacion(PLANTILLA).aplicar({ tipo: 'volar' }), { ok: false, error: 'accion-desconocida' });
});

test('motor: reglas del iPad (emergentes, detalle, fijas, excluyentes, líneas, posesión, contadores)', () => {
    const r = relojes(null);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora });

    // Emergentes: el tiro espera su etiqueta; al elegir queda registrado y suma al contador.
    r.ms = 1000; m.tocar(2);
    let e = m.estado();
    assert.ok(e.andando, 'un toque arranca el reloj');
    assert.deepEqual(e.emergentes.lista.map(x => x.nombre), ['Largo', 'Al arco', 'Desviado']);
    assert.equal(e.eventos.length, 0);
    m.elegirEmergente('2#0');
    e = m.estado();
    assert.deepEqual(e.eventos[0].descriptors, ['Al arco']);
    assert.equal(e.contadores[12], 1);
    assert.equal(e.emergentes, null);

    // Tocar otro evento sin elegir: el tiro queda igual, sin etiqueta.
    m.tocar(2); m.tocar(4);
    e = m.estado();
    assert.equal(e.eventos[0].name, 'Tiro');
    assert.deepEqual(e.eventos[0].descriptors, []);
    assert.deepEqual(e.emergentes.lista.map(x => x.nombre), ['Corto']);
    m.tocar(5);                              // la emergente de la plantilla, tocada en pantalla
    assert.deepEqual(m.estado().eventos[0].descriptors, ['Corto']);

    // Pestaña de detalle con 2 etiquetas: se cierra sola al elegir la segunda.
    m.tocar(13);
    assert.equal(m.estado().detalle.max, 2);
    m.tocar(14); m.tocar(15);
    e = m.estado();
    assert.equal(e.detalle, null);
    assert.deepEqual(e.eventos[0].descriptors, ['Mano', 'Codo']);

    // Fijas excluyentes: 2T apaga 1T, y va en los eventos que siguen.
    m.tocar(10); m.tocar(11);
    assert.deepEqual(m.estado().fijas, [11]);
    r.ms = 3000; m.tocar(1);
    assert.deepEqual(m.estado().eventos[0].descriptors, ['2T']);

    // Manuales excluyentes / de equipos rivales.
    r.ms = 4000; m.tocar(8);
    assert.deepEqual(m.estado().abiertos.map(x => x.buttonId), [8]);
    r.ms = 6000; m.tocar(9);
    e = m.estado();
    assert.deepEqual(e.abiertos.map(x => x.buttonId), [9]);
    const a = e.eventos.find(x => x.buttonId === 8);
    assert.equal(a.end, 5, 'Ataque A se corta justo cuando empieza el de B');
    r.ms = 8000; m.tocar(9);
    assert.equal(m.estado().abiertos.length, 0, 'segundo toque del manual lo corta');

    // Líneas, como handleLineClick() del iPad: si algún jugador de la línea
    // está en cancha, tocarla la baja; si no, entra y baja a las otras
    // líneas, salvo a quien también esté en la que entra (doble turno).
    r.ms = 10000; m.tocar(30);
    assert.deepEqual(m.estado().abiertos.map(x => x.buttonId).sort(), [20, 21]);
    r.ms = 12000; m.tocar(31);               // J2 está en cancha: L2 "se baja" (solo J2)
    assert.deepEqual(m.estado().abiertos.map(x => x.buttonId), [20]);
    r.ms = 13000; m.tocar(31);               // ahora sí entra L2: J1 baja
    e = m.estado();
    assert.deepEqual(e.abiertos.map(x => x.buttonId).sort(), [21, 22]);
    assert.equal(e.eventos.find(x => x.buttonId === 20).end, 13, 'el reloj arrancó en 1 s: 12 + 1 de posterior');
    assert.equal(e.eventos.find(x => x.buttonId === 20).line, 'L1');
    r.ms = 14000; m.tocar(30);               // J2 (de L1 también) en cancha: L1 se baja
    assert.deepEqual(m.estado().abiertos.map(x => x.buttonId), [22]);
    r.ms = 15000; m.tocar(31);               // J3 en cancha: se baja L2
    assert.equal(m.estado().abiertos.length, 0);

    // Posesión: A de 15 a 19, B de 19 a 25 (reloj del partido).
    r.ms = 16000; assert.deepEqual(m.tocar(40), { ok: false, error: 'falta-equipo' });
    m.tocar(40, { equipo: 'A' });
    r.ms = 20000; m.tocar(40, { equipo: 'B' });
    // Contador: los dos tiros (enlazados con flecha) y un toque directo.
    m.tocar(12);
    assert.equal(m.estado().contadores[12], 3);
    r.ms = 26000;
    const fin = m.terminar();
    assert.equal(fin.abiertos.length, 0, 'terminar cierra los turnos');
    assert.deepEqual(fin.tramosPos.map(t => [t.equipo, t.start, t.end]), [['A', 15, 19], ['B', 19, 25]]);
    const pos = posesionDe(normalizar(PLANTILLA), fin);
    assert.ok(pos.B > pos.A);
    // Borrar un evento baja su contador.
    const tiro = fin.eventos.find(x => x.buttonId === 2);
    m.borrarEvento(tiro.id);
    assert.equal(m.estado().contadores[12], 2);
});

test('motor: exportar e importar el estado sigue donde estaba', () => {
    const r = relojes(0);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    m.play();
    r.ms = 3000; m.tocar(8);
    const guardado = JSON.parse(JSON.stringify(m.exportarEstado()));
    r.ms = 5000;                             // pasaron 2 s hasta que se importa
    const otro = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    otro.importarEstado(guardado);
    assert.equal(otro.tiempo(), 5);
    assert.equal(otro.estado().abiertos.length, 1);
    otro.tocar(8);
    assert.equal(otro.estado().eventos[0].end, 6, 'se corta en 5, más el posterior de 1');
    assert.equal(otro.estado().mapa[0].m1, Infinity, 'el tramo abierto vuelve a ser infinito');
});

test('motor: eventosParaPartido en orden, con equipo y segundos de video', () => {
    const r = relojes(0);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    m.play();
    r.ms = 10000; m.tocar(1);
    r.ms = 4000;                             // (el reloj no retrocede en la vida real; acá ordena)
    r.ms = 12000; m.tocar(8);
    r.ms = 14000;
    const est = m.terminar();
    const evs = eventosParaPartido(PLANTILLA, est, { A: 'Norte', B: 'Sur' });
    assert.deepEqual(evs.map(e => e.nombre), ['Gol', 'Ataque A']);
    assert.equal(evs[1].equipo, 'Norte');
    assert.equal(evs[0].botonId, '1');
    assert.deepEqual([evs[0].inicio, evs[0].fin, evs[0].vInicio, evs[0].vFin], [5, 13, 5, 13]);
});

// ─────────────────────────────────────────────
// XML: el mismo que el del iPad, byte a byte
// ─────────────────────────────────────────────
// Saca una función de app.js por su nombre. Son todas de primer nivel: la
// de una línea termina en su propia línea; las otras, en la primera "}" que
// está al principio de un renglón.
function funcionDeApp(src, nombre) {
    const i = src.search(new RegExp('^function ' + nombre + '\\(', 'm'));
    assert.ok(i >= 0, 'app.js no tiene ' + nombre);
    const primera = src.slice(i, src.indexOf('\n', i));
    if (/\}\s*$/.test(primera)) return primera;
    const fin = src.indexOf('\n}', i);
    return src.slice(i, fin + 2);
}

function xmlDelIpad(elementos, eventos, inicio) {
    const src = fs.readFileSync(path.join(aqui, '..', '..', 'app.js'), 'utf8');
    const nombres = ['fechaSportscode', 'a16bits', 'rgbDeEvento', 'blobUtf16', 'xmlEsc', 'defaultColor', 'coloresEquipos', 'exportCustomXML'];
    const salida = {};
    const ctx = vm.createContext({
        state: { elements: elementos },
        Blob, ArrayBuffer, DataView, Date, Map, Set, Number, String, Math,
        encolarArchivo: (nombre, xml) => { salida.nombre = nombre; salida.xml = xml; },
        saveBlobToFiles: (nombre, blob) => { salida.blob = blob; return Promise.resolve(); },
        customAlert: m => { salida.alerta = m; }
    });
    vm.runInContext(nombres.map(n => funcionDeApp(src, n)).join('\n'), ctx);
    ctx.exportCustomXML(eventos, 'Norte vs Sur', inicio);
    return salida;
}

test('XML: igual al de exportCustomXML() del iPad, byte a byte', async () => {
    const r = relojes(null);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora });
    const toques = [[1000, 1], [2000, 2], [2100, '2#1'], [3000, 30], [9000, 30], [9500, 4], [9600, 5],
                    [11000, 8], [15000, 9], [16000, 40, 'A'], [21000, 13], [21500, 14], [21600, 15], [30000, 12]];
    for (const [ms, id, eq] of toques) {
        r.ms = ms;
        if (String(id).includes('#')) m.elegirEmergente(id); else m.tocar(id, { equipo: eq });
    }
    r.ms = 33000;
    const est = m.terminar();
    // Casos raros: nombre con signos, evento sin fin, uno cuyo botón ya no
    // existe (se busca por nombre) y un tramo de posesión viejo (va afuera).
    const eventos = [...est.eventos,
        { name: 'Gol & "raro" <x>', start: 40, end: null, buttonId: 999, descriptors: ['a<b'], line: null },
        { name: 'Gol', start: 41.257, end: 45, buttonId: 12345, descriptors: [] },
        { name: 'Posesión Norte', start: 1, end: 3, buttonId: 40, equipo: 'A', posesionDe: 'A' }];
    const inicio = new Date(Date.UTC(2026, 8, 27, 18, 5, 9));

    const ipad = xmlDelIpad(copia(PLANTILLA.elements), copia(eventos), inicio);
    const nuestro = xmlSportscode({ inicioReal: inicio.toISOString(), eventos: copia(eventos) }, PLANTILLA);
    assert.equal(nuestro, ipad.xml);
    assert.ok(nuestro.includes('<code>Gol &amp; &quot;raro&quot; &lt;x&gt;</code>'));
    assert.ok(!nuestro.includes('Posesión Norte'));

    const bytesIpad = new Uint8Array(await ipad.blob.arrayBuffer());
    assert.deepEqual(bytesUtf16(nuestro), bytesIpad, 'UTF-16 LE con BOM, igual al del iPad');

    // Las otras dos formas de evento (PARTIDO y fila de la base) dan lo mismo.
    const partido = eventosParaPartido(PLANTILLA, { ...est, eventos: est.eventos }, { A: 'Norte', B: 'Sur' });
    const soloMotor = xmlDelIpad(copia(PLANTILLA.elements), copia(est.eventos), inicio).xml;
    assert.equal(xmlSportscode({ inicioReal: inicio, eventos: partido }, PLANTILLA), soloMotor);
    const filas = partido.map(e => ({ nombre: e.nombre, inicio: e.inicio, fin: e.fin, boton_id: e.botonId, etiquetas: e.etiquetas }));
    assert.equal(xmlSportscode({ inicio_real: inicio.toISOString(), eventos: filas }, PLANTILLA), soloMotor);
    assert.equal(xmlSportscode({ eventos: [] }, PLANTILLA), null, 'sin eventos no hay archivo');
});

test('CSV: tiempo en hielo y posesión', () => {
    const r = relojes(null);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora });
    r.ms = 0; m.tocar(30);
    r.ms = 10000; m.tocar(31);
    r.ms = 12000; m.tocar(40, { equipo: 'A' });
    r.ms = 18000; m.tocar(40, { equipo: 'B' });
    r.ms = 20000;
    const est = m.terminar();
    const evs = eventosParaPartido(PLANTILLA, est, { A: 'Norte', B: 'Sur' });
    const hielo = csvTiempoEnHielo({ eventos: evs }, PLANTILLA);
    assert.equal(hielo.split('\n')[0], 'Jugador,Turnos,Total (s),Total (mm:ss)');
    // L2 con J2 en cancha baja a J2 (10 + 1 de posterior); J1 sigue hasta el final.
    assert.ok(hielo.includes('"J1",1,20.0,00:20'), hielo);
    assert.ok(hielo.includes('"J2",1,11.0,00:11'), hielo);
    const pos = csvPosesion({ eventos: evs, tramosPos: est.tramosPos, local: 'Norte', visitante: 'Sur' }, PLANTILLA);
    assert.ok(pos.includes('"Norte",75,6.0,00:06'));
    assert.ok(pos.includes('"Sur",25,2.0,00:02'));
});

// ─────────────────────────────────────────────
// grabadora.js
// ─────────────────────────────────────────────
// El moof del último fragmento de una grabación real de Electron 33 (3 min,
// cámara falsa de Chromium): una pista de video con 1 muestra y una de audio
// con 0. Con ese traf vacío, el ffprobe 4 de la app no abría el archivo.
const MOOF_FINAL = ('000000ac6d6f6f66000000106d666864000000000000' + '00b200000050747261660000001474666864000200200000000101010000' +
    '000000147466647401000000000000000037d4da0000002074727' + '56e0100030500000001000000b402000000000003e800003b9300000044' +
    '747261660000001474666864000200200000000202000000000000147466' + '64740100000000000000000000000000001474' + '72756e010003010000000000003c47');

test('grabadora: repararFragmento saca el traf de audio vacío del último fragmento', () => {
    const moof = Uint8Array.from(MOOF_FINAL.match(/../g).map(h => parseInt(h, 16)));
    assert.equal(moof.length, 172);
    const datos = Uint8Array.from({ length: 15251 }, (_, i) => i % 251);
    const mdat = new Uint8Array(8 + datos.length);
    new DataView(mdat.buffer).setUint32(0, mdat.length);
    mdat.set([0x6d, 0x64, 0x61, 0x74], 4);
    mdat.set(datos, 8);
    const trozo = new Uint8Array(moof.length + mdat.length);
    trozo.set(moof); trozo.set(mdat, moof.length);

    const r = repararFragmento(trozo);
    const dv = new DataView(r.buffer, r.byteOffset, r.byteLength);
    assert.equal(r.length, trozo.length - 68, 'se va el traf de audio (68 bytes)');
    assert.equal(dv.getUint32(0), 104, 'tamaño del moof corregido');
    assert.equal(Buffer.from(r.subarray(0, 104)).toString('latin1').split('traf').length - 1, 1, 'queda un solo traf');
    const trun = Buffer.from(r).indexOf('trun', 0, 'latin1') - 4;
    assert.equal(dv.getUint32(trun + 16), 112, 'data_offset = moof (104) + cabecera del mdat (8)');
    assert.deepEqual(r.subarray(112), datos, 'los datos del video no se tocan');

    // Lo que no es una secuencia completa de cajas, o no tiene nada vacío, pasa igual.
    assert.equal(repararFragmento(trozo.subarray(0, 100)).length, 100);
    const sano = repararFragmento(r);
    assert.equal(sano, r);
});

test('grabadora: calidad de tv.ajustes en bits por segundo', () => {
    assert.equal(bitsDeCalidad('alta'), 10000000);
    assert.equal(bitsDeCalidad(6), 6000000);
    assert.equal(bitsDeCalidad('16000000'), 16000000);
    assert.equal(bitsDeCalidad(undefined), 6000000);
});
