// Logica pura de la captura desde iPad: reloj compartido, cola de toques,
// reloj del partido y estado espejo.
//   node --test escritorio/test/ipad*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { crearReloj } from '../remoto/reloj.js';
import { crearCola } from '../remoto/cola.js';
import { crearRelojPartido } from '../src/ramas/ipad/reloj-partido.js';
import { resumir, crearEmisor } from '../src/ramas/ipad/espejo.js';
import { crearPartido } from '../src/ramas/ipad/partido.js';

// Generador con semilla: la prueba da siempre lo mismo.
function azar(semilla) {
    let s = semilla >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('reloj: desfase con latencias simuladas (mediana de 8)', () => {
    const r = azar(42);
    const DESFASE = -73_210;           // la compu va 73 s "atrasada" contra el iPad
    const reloj = crearReloj();
    let tIpad = 5_000_000;
    for (let i = 0; i < 30; i++) {
        // Ida y vuelta de 5 a 80 ms, con algun pico de wifi de 600 ms que la
        // mediana tiene que ignorar.
        const ida = 5 + r() * 75 + (i % 7 === 3 ? 600 : 0);
        const vuelta = 5 + r() * 75;
        const t0 = tIpad;
        const tServidor = t0 + ida + DESFASE;
        const t1 = t0 + ida + vuelta;
        reloj.muestra(t0, tServidor, t1);
        tIpad += 2000;
    }
    // El error de este metodo es la mitad de la asimetria ida/vuelta: con
    // estas latencias, menos de 40 ms. Un toque cae en el cuadro correcto.
    assert.ok(Math.abs(reloj.desfase() - DESFASE) < 40, `desfase ${reloj.desfase()}`);
    assert.ok(reloj.latencia() > 5 && reloj.latencia() < 80, `latencia ${reloj.latencia()}`);
    const toque = 9_999_000;
    assert.ok(Math.abs(reloj.aServidor(toque) - (toque + DESFASE)) < 40);
});

test('reloj: sin muestras no inventa; muestras invalidas no cuentan', () => {
    const reloj = crearReloj();
    assert.equal(reloj.aServidor(1000), null);
    assert.equal(reloj.listo(), false);
    assert.equal(reloj.muestra(10, 20, 5), false);      // vuelta antes de la ida
    assert.equal(reloj.muestra(NaN, 20, 30), false);
    assert.equal(reloj.listo(), false);
    reloj.muestra(0, 1010, 20);                          // latencia 10, desfase 1000
    assert.equal(reloj.aServidor(500), 1500);
});

test('cola: un toque antes del primer pong se retiene y se completa con el desfase', () => {
    const reloj = crearReloj();
    let t = 1000;
    const cola = crearCola({ reloj, ahora: () => t });
    const m1 = cola.agregar({ tipo: 'tocar', elementoId: 1 });
    assert.equal(m1.accion.momento, null);
    assert.equal(cola.pendientes().length, 0);          // no se manda sin hora
    t = 3000;
    reloj.muestra(2900, 12_950, 3000);                  // desfase +10000
    const p = cola.pendientes();
    assert.equal(p.length, 1);
    assert.equal(p[0].accion.momento, 11_000);          // el toque fue en t=1000 del iPad
    const m2 = cola.agregar({ tipo: 'tocar', elementoId: 2 });
    assert.equal(m2.accion.momento, 13_000);
    assert.equal(m2.n, 2);
});

test('cola: acciones sin momento (emergentes) no frenan la cola', () => {
    const reloj = crearReloj();
    reloj.muestra(0, 0, 0);
    const cola = crearCola({ reloj, ahora: () => 50 });
    cola.agregar({ tipo: 'tocar', elementoId: 1 });
    cola.agregar({ tipo: 'elegirEmergente', elementoId: 7 }, { conMomento: false });
    assert.deepEqual(cola.pendientes().map(m => m.accion.tipo), ['tocar', 'elegirEmergente']);
    assert.equal(cola.pendientes()[1].accion.momento, undefined);
});

test('cola: sobrevive a recargar la pagina; sesion nueva descarta lo viejo pero no reinicia n', () => {
    const g = new Map();
    const almacen = { getItem: k => g.get(k) ?? null, setItem: (k, v) => g.set(k, v) };
    const reloj = crearReloj();
    reloj.muestra(0, 0, 0);
    let cola = crearCola({ almacen, reloj });
    cola.sesion('A');
    for (let i = 0; i < 5; i++) cola.agregar({ tipo: 'tocar', elementoId: i });
    cola.confirmar(2);
    cola = crearCola({ almacen, reloj });
    assert.deepEqual(cola.pendientes().map(m => m.n), [3, 4, 5]);
    assert.equal(cola.sesion('A'), false);
    assert.equal(cola.cantidad(), 3);
    assert.equal(cola.sesion('B'), true);
    assert.equal(cola.cantidad(), 0);
    assert.equal(cola.agregar({ tipo: 'tocar', elementoId: 9 }).n, 6);
});

test('cola: un almacen que tira (Safari privado) no rompe nada', () => {
    const almacen = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    const reloj = crearReloj();
    reloj.muestra(0, 0, 0);
    const cola = crearCola({ almacen, reloj });
    cola.agregar({ tipo: 'tocar', elementoId: 1 });
    assert.equal(cola.pendientes().length, 1);
});

test('reloj del partido: pausas, toques que llegan tarde y toques en pausa', () => {
    const rp = crearRelojPartido();
    assert.equal(rp.en(5000), 0);                      // antes del PLAY
    rp.play(10_000);
    assert.equal(rp.en(10_000), 0);
    assert.equal(rp.en(40_000), 30);
    rp.pausa(70_000);                                   // 60 s jugados
    assert.equal(rp.en(80_000), 60);                    // en la pausa: reloj quieto
    rp.play(100_000);
    assert.equal(rp.en(130_000), 90);
    // Toque hecho a los 40 s de compu pero que llega cuando ya van 90 s de
    // partido (wifi cortado): cae igual en el 30.
    assert.equal(rp.en(40_000), 30);
    assert.equal(rp.corriendo(), true);
    assert.equal(rp.play(131_000), false);              // PLAY doble no abre otro tramo
    rp.pausa(150_000);
    assert.equal(rp.en(999_999), 110);
    assert.equal(rp.pausa(160_000), false);
    assert.equal(rp.tramos().length, 2);
});

// Botonera de prueba en el formato del iPad: un evento con emergentes
// escritas, uno manual, uno que abre una pestaña de detalle, una etiqueta
// fija y un contador enlazado.
const DATOS = {
    elements: [
        { id: 1, type: 'event', name: 'Tiro', x: 0, y: 0, w: 120, h: 52, timeMode: 'fixed', lead: 5, lag: 3, popups: ['Gol', 'Afuera'] },
        { id: 2, type: 'event', name: 'Ataque', x: 130, y: 0, w: 120, h: 52, timeMode: 'manual', lead: 0, lag: 0 },
        { id: 3, type: 'event', name: 'Corner', x: 260, y: 0, w: 120, h: 52, timeMode: 'fixed', lead: 2, lag: 2, subHojaId: 'h1' },
        { id: 4, type: 'sticky_label', name: 'Superioridad', x: 0, y: 60, w: 120, h: 52 },
        { id: 5, type: 'counter', name: '0', x: 130, y: 60, w: 80, h: 60 },
        { id: 10, type: 'descriptor', name: 'Primer palo', x: 0, y: 0, w: 120, h: 52, hoja: 'h1' },
        { id: 11, type: 'descriptor', name: 'Segundo palo', x: 130, y: 0, w: 120, h: 52, hoja: 'h1' }
    ],
    links: [{ fromId: 1, toId: 5 }],
    hojas: [{ id: 'h1', name: 'Detalle corner', etiquetas: 1 }]
};

test('partido: toques del iPad en su segundo real, aunque lleguen tarde y con pausa en el medio', () => {
    let t = 1_000_000;
    const p = crearPartido(DATOS, { ahora: () => t });
    p.play();                                   // reloj de partido 0 en t=1.000.000
    t += 60_000;                                // 60 s de partido
    // Toque en el iPad a los 50 s, llega a los 60 (wifi lento)
    let r = p.aplicarRemota({ tipo: 'tocar', elementoId: 1, momento: 1_050_000 });
    assert.equal(r.ok, true);
    assert.equal(r.nuevos.length, 1);
    p.aplicarRemota({ tipo: 'elegirEmergente', id: '1#0' });
    let e = p.motor.estado();
    assert.equal(e.eventos[0].name, 'Tiro');
    assert.equal(e.eventos[0].start, 45);       // 50 - previo 5
    assert.equal(e.eventos[0].end, 53);         // 50 + posterior 3
    assert.deepEqual(e.eventos[0].descriptors, ['Gol']);
    assert.equal(p.origenDe(e.eventos[0].id), 'ipad');

    // PAUSA a los 70 s; el wifi se corta. En el iPad se toca a los 65 s
    // (antes de la pausa) y los toques llegan recien a los 130 s de compu,
    // con el partido ya reanudado.
    t = 1_070_000; p.aplicarRemota({ tipo: 'pausa' });
    t = 1_100_000; p.play();                    // 30 s de pausa
    t = 1_130_000;
    r = p.aplicarRemota({ tipo: 'tocar', elementoId: 2, momento: 1_065_000 });   // manual abre en 65
    r = p.aplicarRemota({ tipo: 'tocar', elementoId: 2, momento: 1_110_000 });   // y cierra en 80 de partido
    e = p.motor.estado();
    const ataque = e.eventos.find(x => x.name === 'Ataque');
    assert.equal(ataque.start, 65);
    assert.equal(ataque.end, 80);
    assert.equal(p.tiempo(), 100);              // 70 + 30 despues de la pausa

    // Un toque de la compu queda marcado como de la compu.
    p.tocarLocal(5);
    assert.equal(p.motor.estado().contadores[5], 2);   // 1 del Tiro enlazado + 1 directo
    // El iPad no puede pedir acciones del motor que no le corresponden.
    assert.equal(p.aplicarRemota({ tipo: 'borrarEvento', id: 1 }).ok, false);
});

test('partido: tocar un evento con el partido parado arranca los dos relojes', () => {
    let t = 0;
    const p = crearPartido(DATOS, { ahora: () => t });
    p.aplicarRemota({ tipo: 'tocar', elementoId: 2, momento: 0 });
    assert.equal(p.reloj.corriendo(), true);
    assert.equal(p.motor.estado().andando, true);
    t = 10_000;
    assert.equal(p.tiempo(), 10);
    p.terminar();
    assert.equal(p.reloj.corriendo(), false);
    assert.equal(p.motor.estado().eventos[0].end, 10);
});

test('espejo: resume el estado del motor para el iPad', () => {
    let t = 0;
    const p = crearPartido(DATOS, { ahora: () => t });
    p.play();
    t = 5000;
    p.tocarLocal(4);                            // fija encendida
    p.tocarLocal(2);                            // manual grabando
    p.tocarLocal(1);                            // Tiro: esperando emergente
    let e = resumir(p.motor.estado(), { datos: DATOS, rec: true });
    assert.equal(e.tipo, 'estado');
    assert.equal(e.corriendo, true);
    assert.equal(e.reloj, 5);
    assert.equal(e.rec, true);
    assert.equal(e.enCurso, true);
    assert.deepEqual(e.marcas, { 2: 'activo', 4: 'fijo' });
    assert.deepEqual(e.textos, {});
    assert.deepEqual(e.emergentes, { id: 1, lista: [{ id: '1#0', nombre: 'Gol', indice: 0 }, { id: '1#1', nombre: 'Afuera', indice: 1 }] });
    assert.equal(e.hoja, null);

    p.aplicarRemota({ tipo: 'elegirEmergente', id: '1#1' });
    e = resumir(p.motor.estado(), { datos: DATOS });
    assert.equal(e.emergentes, null);
    assert.deepEqual(e.textos, { 5: '1' });
    assert.equal(e.ultimo.nombre, 'Tiro');

    // Corner abre la pestaña de detalle.
    p.tocarLocal(3);
    e = resumir(p.motor.estado(), { datos: DATOS });
    assert.equal(e.hoja, 'h1');
    assert.equal(e.marcas[3], 'abierto');
    p.aplicarRemota({ tipo: 'tocar', elementoId: 11, momento: t });   // elige una: se cierra sola
    e = resumir(p.motor.estado(), { datos: DATOS });
    assert.equal(e.hoja, null);
    assert.deepEqual(p.motor.estado().eventos[0].descriptors, ['Superioridad', 'Segundo palo']);

    // Terminado: el iPad ya no puede tocar.
    p.terminar();
    assert.equal(resumir(p.motor.estado(), { datos: DATOS }).enCurso, false);
    const v = resumir(null);
    assert.equal(v.corriendo, false);
    assert.deepEqual(v.marcas, {});
});

test('espejo: el emisor no repite estados iguales (salvo el reloj)', () => {
    const enviados = [];
    const emitir = crearEmisor(m => enviados.push(m));
    assert.equal(emitir({ tipo: 'estado', reloj: 1, corriendo: true }), true);
    assert.equal(emitir({ tipo: 'estado', reloj: 2, corriendo: true }), false);
    assert.equal(emitir({ tipo: 'estado', reloj: 3, corriendo: false }), true);
    assert.equal(emitir({ tipo: 'estado', reloj: 4, corriendo: false }, { forzar: true }), true);
    assert.equal(enviados.length, 3);
});

// ── Clips en vivo para el iPad que mira ──
import { planClipsEnVivo } from '../src/ramas/ipad/clips-vivo.js';

test('clips en vivo: corta los cerrados con video, reenvía etiquetas, quita los borrados', () => {
    // Video = partido + 100 s (la cámara arrancó antes).
    const clipDe = ev => ({ vInicio: ev.sinVideo ? null : ev.start + 100, vFin: ev.end == null ? null : ev.end + 100 });
    const eventos = [
        { id: 5, name: 'Tiro', start: 50, end: 58, buttonId: 1, descriptors: ['Al arco'] },
        { id: 4, name: 'Abierto', start: 40, end: null, buttonId: 1 },
        { id: 3, name: 'Jugador 7', start: 30, end: 45, buttonId: 2, line: 'Línea 1' },
        { id: 2, name: 'Posesión', start: 20, end: 30, posesionDe: 'A' },
        { id: 1, name: 'Falta', start: 10, end: 10, buttonId: 3 },
        { id: 0, name: 'Antes', start: 0, end: 5, sinVideo: true }
    ];
    const hechos = new Map();
    const p = planClipsEnVivo(eventos, hechos, { clipDe, equipoDe: ev => (ev.buttonId === 1 ? 'Local' : null) });
    assert.deepEqual(p.cortar.map(x => x.ev.id), [5, 1], 'el más nuevo primero; sin abiertos, líneas, posesión ni sin video');
    assert.deepEqual(p.cortar[0].tiempos, { desde: 150, hasta: 158 });
    assert.deepEqual(p.cortar[0].meta, { nombre: 'Tiro', etiquetas: ['Al arco'], equipo: 'Local', inicio: 50 });
    assert.deepEqual(p.cortar[1].tiempos, { desde: 110, hasta: 111 }, 'un evento de cero segundos dura uno');
    assert.deepEqual(p.quitar, []);

    for (const x of p.cortar) hechos.set(x.ev.id, { tiempos: x.tiempos, meta: x.meta });
    const igual = planClipsEnVivo(eventos, hechos, { clipDe, equipoDe: ev => (ev.buttonId === 1 ? 'Local' : null) });
    assert.deepEqual([igual.cortar.length, igual.actualizar.length, igual.quitar.length], [0, 0, 0]);

    // Etiqueta nueva: solo se reenvía. Otro fin: se vuelve a cortar. Borrado: se quita.
    const despues = [
        { ...eventos[0], descriptors: ['Al arco', 'Gol'] },
        { ...eventos[4], end: 14 }
    ].filter(ev => ev.id !== 99);
    const p2 = planClipsEnVivo(despues, hechos, { clipDe, equipoDe: ev => (ev.buttonId === 1 ? 'Local' : null) });
    assert.deepEqual(p2.actualizar.map(x => x.ev.id), [5]);
    assert.deepEqual(p2.cortar.map(x => x.ev.id), [1]);
    assert.deepEqual(p2.cortar[0].tiempos, { desde: 110, hasta: 114 });
    const p3 = planClipsEnVivo([despues[0]], hechos, { clipDe });
    assert.deepEqual(p3.quitar, [1]);
});

import { crearClipsEnVivo } from '../src/ramas/ipad/clips-vivo.js';

test('crearClipsEnVivo: avisa "cortando", corta, publica, no repite, quita y apaga', async () => {
    const cortes = [], enviados = [];
    const api = {
        clips: { exportar: async o => { cortes.push(o); return { rutas: ['/t/' + o.cortes[0].nombre + '.mp4'] }; } },
        remoto: { enviar: async m => { enviados.push(m); return true; } }
    };
    let eventos = [{ id: 1, name: 'Tiro', start: 10, end: 15, buttonId: 1 }];
    let grabando = true;
    const cv = crearClipsEnVivo({
        api, eventos: () => eventos,
        clipDe: ev => ({ vInicio: ev.start, vFin: ev.end }),
        video: () => (grabando ? '/t/partido.mp4' : null),
        subcarpeta: () => 'Partidos/Demo',
        equipoDe: () => 'Local',
        nombreClip: m => m.nombre
    });
    cv.revisar(); cv.revisar();          // dos cambios seguidos: un solo corte
    await cv.esperar();
    assert.equal(cortes.length, 1);
    assert.deepEqual(cortes[0].cortes[0], { desde: 10, hasta: 15, nombre: 'Tiro' });
    assert.equal(cortes[0].subcarpeta, 'Partidos/Demo');
    // Primero aparece como "cortando…", después llega el mismo id con el archivo.
    assert.deepEqual(enviados[0], { tipo: 'clip', clip: { id: 'c1', pendiente: true, nombre: 'Tiro', etiquetas: [], equipo: 'Local', inicio: 10, duracion: 5 } });
    assert.deepEqual(enviados[1], { tipo: 'clip', clip: { id: 'c1', ruta: '/t/Tiro.mp4', nombre: 'Tiro', etiquetas: [], equipo: 'Local', inicio: 10, duracion: 5 } });
    enviados.shift();

    eventos = [];                        // borrado
    cv.revisar();
    assert.deepEqual(enviados[1], { tipo: 'quitarClip', id: 'c1' });

    grabando = false;                    // sin grabación no se corta
    eventos = [{ id: 2, name: 'Gol', start: 20, end: 25 }];
    cv.revisar();
    await cv.esperar();
    assert.equal(cortes.length, 1);
    grabando = true;
    cv.apagar();
    cv.revisar();
    await cv.esperar();
    assert.equal(cortes.length, 1, 'apagado no corta más');
});

test('crearClipsEnVivo: uno que espera su video no frena a los demás; si falla, sale de la lista', async () => {
    const enviados = [];
    let soltarLargo;
    const api = {
        clips: {
            exportar: o => o.cortes[0].nombre === 'Largo'
                ? new Promise(ok => { soltarLargo = () => ok({ rutas: ['/t/Largo.mp4'] }); })
                : o.cortes[0].nombre === 'Roto' ? Promise.reject(new Error('ffmpeg'))
                : Promise.resolve({ rutas: ['/t/' + o.cortes[0].nombre + '.mp4'] })
        },
        remoto: { enviar: async m => { enviados.push(m); return true; } }
    };
    const eventos = [{ id: 1, name: 'Largo', start: 0, end: 30 }, { id: 2, name: 'Corto', start: 5, end: 8 }, { id: 3, name: 'Roto', start: 9, end: 10 }];
    let fallos = 0;
    const cv = crearClipsEnVivo({
        api, eventos: () => eventos,
        clipDe: ev => ({ vInicio: ev.start, vFin: ev.end }),
        video: () => '/t/partido.mp4', subcarpeta: () => 'x', nombreClip: m => m.nombre,
        alFallar: () => { fallos++; }
    });
    cv.revisar();
    await new Promise(r => setTimeout(r, 10));
    const listos = enviados.filter(m => m.tipo === 'clip' && m.clip.ruta).map(m => m.clip.nombre);
    assert.deepEqual(listos, ['Corto'], 'el corto sale sin esperar al largo');
    assert.ok(enviados.some(m => m.tipo === 'quitarClip'), 'el que falló no queda como "cortando…"');
    assert.equal(fallos, 1);
    let termino = false;
    const espera = cv.esperar().then(() => { termino = true; });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(termino, false, 'esperar() espera al largo');
    soltarLargo();
    await espera;
    assert.ok(enviados.some(m => m.tipo === 'clip' && m.clip.nombre === 'Largo' && m.clip.ruta));
});
