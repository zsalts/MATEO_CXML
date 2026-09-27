// La lógica de la rama Captura en vivo que no toca pantalla
// (src/ramas/captura/logica.js).
//   node --test escritorio/test/captura*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { crearCodificacion } from '../src/nucleo/codificacion.js';
import {
    limpiarNombre, nombrePropuesto, nombreUnico, subcarpetaDe, subcarpetaDeRuta, nombreDeClip,
    rangoDeClip, armarPartido, eventosParaXml, archivosDelPartido, crearColaCortes,
    armarRespaldo, leerRespaldo, estadoParaRecuperar
} from '../src/ramas/captura/logica.js';

const PLANTILLA = {
    elements: [
        { id: 1, type: 'event', name: 'Gol', lead: 5, lag: 3, color: '#ff0000' },
        { id: 2, type: 'event', name: 'Ataque', timeMode: 'manual', equipo: 'A', lag: 0 },
        { id: 3, type: 'event', name: 'Contra', timeMode: 'manual', equipo: 'B', lag: 0 },
        { id: 4, type: 'teams', equipoA: 'Norte', equipoB: 'Sur' }
    ],
    links: [],
    hojas: []
};

function relojes(videoDesdeMs) {
    const r = { ms: 0 };
    r.ahora = () => r.ms;
    r.video = () => (videoDesdeMs != null && r.ms >= videoDesdeMs ? (r.ms - videoDesdeMs) / 1000 : null);
    return r;
}

test('nombres: limpios para Windows, propuestos y sin repetir', () => {
    assert.equal(limpiarNombre('Norte: "A" / Sur*?'), 'Norte A Sur');
    assert.equal(limpiarNombre('  final.  '), 'final');
    assert.equal(limpiarNombre('CON'), 'CON_');
    assert.equal(limpiarNombre('<>|'), 'Partido');
    assert.equal(nombrePropuesto('Norte', 'Sur'), 'Norte vs Sur');
    assert.equal(nombrePropuesto('Norte', ''), 'Norte');
    assert.match(nombrePropuesto('', '', new Date(2026, 8, 27, 20, 30)), /^Partido 27-09-2026 20h30$/);
    assert.equal(nombreUnico('Norte vs Sur', ['otro']), 'Norte vs Sur');
    assert.equal(nombreUnico('Norte vs Sur', ['norte vs sur', 'Norte vs Sur (2)']), 'Norte vs Sur (3)');
    assert.equal(subcarpetaDe('A/B'), 'Partidos/A B');
    assert.equal(nombreDeClip(7, 'Gol', 754.2), '007 Gol 12m34s');
});

test('subcarpetaDeRuta: relativa a la carpeta de trabajo, o null si está afuera', () => {
    const c = 'C:\\Users\\x\\Tag & View Pro';
    assert.equal(subcarpetaDeRuta('C:\\Users\\x\\Tag & View Pro\\Partidos\\A vs B\\A vs B.mp4', c), 'Partidos/A vs B');
    assert.equal(subcarpetaDeRuta('c:/users/x/tag & view pro/v.mp4', c + '\\'), '');
    assert.equal(subcarpetaDeRuta('D:\\Videos\\v.mp4', c), null);
    assert.equal(subcarpetaDeRuta('C:\\Users\\x\\Tag & View Pro 2\\v.mp4', c), null, 'una carpeta hermana con el mismo principio no es adentro');
});

test('rangoDeClip: margen, manual en curso y sin video', () => {
    const r = relojes(0);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    m.play();
    r.ms = 10000; m.tocar(1);                // Gol en 10: video 5..13
    r.ms = 12000; m.tocar(2);                // Ataque abierto desde 12
    r.ms = 20000;
    const e = m.estado();
    const gol = e.eventos.find(x => x.name === 'Gol');
    assert.deepEqual(rangoDeClip(gol, e.mapa, { margen: 2 }), { desde: 3, hasta: 15, vInicio: 5, vFin: 13 });
    assert.equal(rangoDeClip(gol, e.mapa, { margen: 10 }).desde, 0, 'nunca antes del cero');
    const abierto = e.abiertos[0];
    assert.deepEqual(rangoDeClip(abierto, e.mapa, { margen: 0, vAhora: 20 }), { desde: 12, hasta: 20, vInicio: 12, vFin: 20 });
    assert.equal(rangoDeClip({ start: 3, end: 4, vAncla: { m: 3, v: null } }, []), null);
    // Un evento del PARTIDO (con vInicio/vFin) también sirve.
    assert.deepEqual(rangoDeClip({ vInicio: 30, vFin: 31 }, null, { margen: 0, minimo: 3 }), { desde: 30, hasta: 33, vInicio: 30, vFin: 31 });
});

// Un partido de prueba: cámara que arranca 2 s tarde, una pausa de 5 s,
// un evento marcado antes de conectar la cámara.
function partidoDePrueba() {
    const r = relojes(null);
    const video = { desde: null };
    const m = crearCodificacion(PLANTILLA, {
        ahora: r.ahora,
        relojVideo: () => (video.desde != null && r.ms >= video.desde ? (r.ms - video.desde) / 1000 : null)
    });
    m.play();
    r.ms = 1000; m.tocar(1);                 // Gol sin video (la cámara no estaba)
    r.ms = 30000;                            // la cámara se conecta en 30: el archivo arranca ahí
    video.desde = 30000; m.sincronizarVideo();
    r.ms = 40000; m.tocar(2);                // Ataque (Norte) de 40…
    r.ms = 45000; m.tocar(3);                // …a 45, lo corta Contra (Sur)
    r.ms = 50000; m.pausa();                 // pausa en 50 (video 20)
    r.ms = 55000; m.play();                  // vuelve (video 25)
    r.ms = 60000; m.tocar(1);                // Gol en 55 → video 30
    r.ms = 70000;
    return m.terminar();
}

test('armarPartido: el PARTIDO del contrato, con equipos y segundos de video', () => {
    const est = partidoDePrueba();
    const p = armarPartido({
        datos: PLANTILLA, estado: est, nombre: 'Norte vs Sur', local: 'Norte', visitante: 'Sur', plantillaId: 7,
        video: { ruta: 'C:\\x\\Partidos\\Norte vs Sur\\Norte vs Sur.mp4', mime: 'video/mp4', bytes: 1234 },
        xmlRuta: 'C:\\x\\Partidos\\Norte vs Sur\\Norte vs Sur.xml'
    });
    assert.equal(p.nombre, 'Norte vs Sur');
    assert.equal(p.origen, 'captura');
    assert.equal(p.plantillaId, 7);
    assert.equal(p.duracion, 65);
    assert.equal(p.videoBytes, 1234);
    assert.ok(p.xmlRuta.endsWith('.xml'));
    assert.deepEqual(p.eventos.map(e => [e.nombre, e.inicio, e.fin, e.vInicio, e.vFin, e.equipo]), [
        ['Gol', 0, 4, null, null, null],     // sin video
        ['Ataque', 40, 45, 10, 15, 'Norte'],
        ['Contra', 45, 65, 15, 40, 'Sur'],
        ['Gol', 50, 58, 25, 33, null]        // previo de 5 s REALES antes del toque (video 30)
    ]);
    assert.equal(typeof p.inicioReal, 'string');
    assert.ok(p.plantilla.elements.length);
});

test('XML al lado del video: tiempos del video, sin los eventos sin video', () => {
    const est = partidoDePrueba();
    const p = armarPartido({ datos: PLANTILLA, estado: est, nombre: 'N', local: 'Norte', visitante: 'Sur', video: { ruta: 'v.mp4' } });
    const xml = eventosParaXml(p.eventos, true);
    assert.deepEqual(xml.map(e => [e.nombre, e.inicio, e.fin]), [['Ataque', 10, 15], ['Contra', 15, 40], ['Gol', 25, 33]]);
    assert.equal(eventosParaXml(p.eventos, false), p.eventos, 'sin video, el reloj del partido');

    const archivos = archivosDelPartido({ datos: PLANTILLA, estado: est, partido: p, nombre: 'Norte vs Sur', conVideo: true });
    const x = archivos.find(a => a.tipo === 'xml');
    assert.equal(x.nombre, 'Norte vs Sur');
    assert.ok(x.contenido.includes('<start>25.00</start>'), 'el gol cae en el segundo del video');
    assert.ok(!x.contenido.includes('<start>0.00</start>'), 'el gol sin video no va');
    // Tiempo en hielo (los manuales) → <nombre>.csv; posesión → "- Posesion".
    assert.deepEqual(archivos.filter(a => a.tipo === 'csv').map(a => a.nombre), ['Norte vs Sur', 'Norte vs Sur - Posesion']);
    assert.ok(archivos.find(a => a.nombre.endsWith('Posesion')).contenido.includes('"Norte"'));
});

test('cola de cortes: de a uno, espera lo que no está escrito, reintenta los fallidos', async () => {
    let escrito = 10;
    const hechos = [];
    let fallar = new Set(['B']);
    let enCurso = 0, maxEnCurso = 0;
    const cola = crearColaCortes({
        cortar: async c => {
            enCurso++; maxEnCurso = Math.max(maxEnCurso, enCurso);
            await new Promise(r => setTimeout(r, 5));
            enCurso--;
            if (fallar.has(c.nombre)) throw new Error('ffmpeg dijo que no');
            hechos.push(c.nombre);
            return ['Clips/' + c.nombre + '.mp4'];
        },
        listo: c => c.hasta <= escrito
    });
    cola.agregar({ nombre: 'FUTURO', desde: 15, hasta: 25 });   // todavía no está en el disco
    cola.agregar({ nombre: 'A', desde: 0, hasta: 5 });
    cola.agregar({ nombre: 'B', desde: 5, hasta: 9 });
    await new Promise(r => setTimeout(r, 60));
    assert.deepEqual(hechos, ['A'], 'el que espera el futuro no traba a los demás');
    let res = cola.resumen();
    assert.equal(res.fallidos, 1);
    assert.equal(res.pendientes, 1);

    escrito = 30;                            // llegó al disco
    await new Promise(r => setTimeout(r, 700));
    assert.deepEqual(hechos, ['A', 'FUTURO']);

    // Al terminar: frenar (se mueve el archivo), reintentar y vaciar.
    await cola.frenar();
    fallar = new Set();
    assert.equal(cola.reintentarFallidos(), 1);
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(hechos, ['A', 'FUTURO'], 'frenada no corta');
    cola.seguir();
    await cola.vaciar();
    assert.deepEqual(hechos, ['A', 'FUTURO', 'B']);
    res = cola.resumen();
    assert.deepEqual([res.hechos, res.fallidos, res.pendientes], [3, 0, 0]);
    assert.equal(maxEnCurso, 1, 'nunca dos ffmpeg a la vez sobre el mismo archivo');
    assert.deepEqual(res.cortes.find(c => c.nombre === 'B').rutas, ['Clips/B.mp4']);
    cola.destruir();
});

test('cola de cortes: vaciar sin nada pendiente se resuelve enseguida', async () => {
    const cola = crearColaCortes({ cortar: async () => [] });
    await cola.vaciar();
    cola.destruir();
});

test('respaldo: ida y vuelta, y el reloj queda congelado al recuperar', () => {
    const r = relojes(0);
    const m = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: r.video });
    m.play();
    r.ms = 10000; m.tocar(1);
    r.ms = 12000; m.tocar(2);                // queda un manual abierto
    r.ms = 20000;
    const texto = armarRespaldo({ meta: { nombre: 'Norte vs Sur', plantillaId: 1 }, motor: m.exportarEstado(), ruta: 'C:\\x\\Norte vs Sur.mp4', ahora: 123 });
    const resp = leerRespaldo(texto);
    assert.equal(resp.meta.nombre, 'Norte vs Sur');
    assert.equal(resp.guardadoEn, 123);
    assert.equal(leerRespaldo('no es json'), null);
    assert.equal(leerRespaldo(JSON.stringify({ version: 9 })), null);

    // Se abre de nuevo "tres horas después": el partido no dura tres horas más.
    r.ms = 20000 + 3 * 3600 * 1000;
    const otro = crearCodificacion(PLANTILLA, { ahora: r.ahora, relojVideo: () => null });
    otro.importarEstado(estadoParaRecuperar(resp.motor));
    assert.equal(otro.tiempo(), 20);
    const fin = otro.terminar();
    assert.equal(fin.eventos.find(e => e.name === 'Ataque').end, 20, 'el turno abierto se cierra donde quedó');
    assert.ok(fin.mapa.every(t => t.m1 !== Infinity && t.m1 != null));
    const p = armarPartido({ datos: PLANTILLA, estado: fin, nombre: 'Norte vs Sur', video: { ruta: 'v.mp4' } });
    assert.deepEqual(p.eventos.map(e => [e.nombre, e.vInicio, e.vFin]), [['Gol', 5, 13], ['Ataque', 12, 20]]);
});
