// Pruebas de la sincronización de plantillas (sincro.js de la raíz, el mismo
// archivo que usa el iPad).
//   node --test escritorio/test/sincro.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../sincro.js');

const botones = (...n) => ({ elements: n.map((x, i) => ({ id: i + 1, type: 'event', name: x })), links: [], hojas: [] });
const p = (uid, nombre, fecha, extra = {}) => ({ uid, nombre, datos: botones(nombre), actualizado: fecha, ...extra });
const T1 = '2026-09-28T10:00:00.000Z', T2 = '2026-09-28T11:00:00.000Z', T3 = '2026-09-28T12:00:00.000Z';
const HOY = Date.parse('2026-09-28T13:00:00.000Z');

test('sincro: lo que falta de cada lado viaja', () => {
    const r = S.fusionar([p('a', 'Hockey', T1)], [p('b', 'Fútbol', T1)], HOY);
    assert.deepEqual(r.plantillas.map(x => x.uid), ['a', 'b']);
    assert.deepEqual(r.poner.map(x => x.uid), ['b'], 'la de la nube se escribe acá');
    assert.equal(r.subir, true, 'la de acá se sube');
    assert.deepEqual(r.borrar, []);
});

test('sincro: gana el cambio más nuevo, de cualquier lado', () => {
    const vieja = p('a', 'Hockey', T1), nueva = { ...p('a', 'Hockey', T2), datos: botones('Gol', 'Tiro') };
    const r1 = S.fusionar([vieja], [nueva], HOY);
    assert.deepEqual(r1.poner.map(x => x.datos.elements.length), [2]);
    assert.equal(r1.subir, false);
    const r2 = S.fusionar([nueva], [vieja], HOY);
    assert.deepEqual(r2.poner, []);
    assert.equal(r2.subir, true);
});

test('sincro: los borrados viajan y le ganan a una copia vieja', () => {
    const lapida = { uid: 'a', nombre: 'Hockey', actualizado: T2, borrado: true };
    const r1 = S.fusionar([p('a', 'Hockey', T1)], [lapida], HOY);
    assert.deepEqual(r1.borrar, ['a'], 'borrada en el otro lado: se borra acá');
    const r2 = S.fusionar([lapida], [p('a', 'Hockey', T1)], HOY);
    assert.equal(r2.subir, true, 'borrada acá: se avisa a la nube');
    assert.equal(r2.plantillas[0].borrado, true);
    // Editarla después de borrarla en el otro lado la revive: gana lo más nuevo.
    const r3 = S.fusionar([p('a', 'Hockey', T3)], [lapida], HOY);
    assert.deepEqual(r3.borrar, []);
    assert.equal(r3.subir, true);
});

test('sincro: la primera vez, la misma plantilla en los dos lados no se duplica', () => {
    const r = S.fusionar(
        [p('local1', 'Hockey', T3, { nueva: true }), p('local2', 'Solo acá', T3, { nueva: true })],
        [p('nube1', 'Hockey', T1), p('nube2', 'Básquet', T1)], HOY);
    assert.deepEqual(r.uids, { local1: 'nube1' }, 'toma el uid de la nube');
    assert.deepEqual(r.plantillas.map(x => x.uid).sort(), ['local2', 'nube1', 'nube2']);
    assert.deepEqual(r.poner.map(x => x.uid), ['nube2']);
    // Mismo nombre pero otros botones: no es la misma, quedan las dos.
    const r2 = S.fusionar([{ ...p('l', 'Hockey', T3, { nueva: true }), datos: botones('Otro') }], [p('n', 'Hockey', T1)], HOY);
    assert.deepEqual(r2.uids, {});
    assert.equal(r2.plantillas.length, 2);
});

test('sincro: con todo igual no hay nada que hacer', () => {
    const r = S.fusionar([p('a', 'Hockey', T1)], [p('a', 'Hockey', T1)], HOY);
    assert.deepEqual(r.poner, []);
    assert.deepEqual(r.borrar, []);
    assert.equal(r.subir, false);
});

test('sincro: un empate de fecha lo resuelven igual los dos lados', () => {
    const x = p('a', 'Hockey', T1), y = { ...p('a', 'Hockey', T1), datos: botones('Otro') };
    const desdeX = S.fusionar([x], [y], HOY), desdeY = S.fusionar([y], [x], HOY);
    assert.deepEqual(desdeX.plantillas, desdeY.plantillas);
});

test('sincro: las lápidas viejas se olvidan y lo roto no rompe', () => {
    const vieja = { uid: 'a', nombre: 'x', actualizado: '2026-01-01T00:00:00.000Z', borrado: true };
    const r = S.fusionar([], [vieja], HOY);
    assert.deepEqual(r.plantillas, []);
    assert.equal(r.subir, true, 'se sube la lista sin la lápida');
    assert.deepEqual(S.leerArchivo('no es json'), []);
    assert.deepEqual(S.leerArchivo(''), []);
    assert.deepEqual(S.leerArchivo(JSON.stringify({ kind: 'backup' })), []);
    const ida = S.leerArchivo(S.armarArchivo([p('a', 'Hockey', T1)], 'test'));
    assert.equal(ida[0].nombre, 'Hockey');
    assert.equal(S.fusionar([null, { nombre: 'sin uid' }], [], HOY).plantillas.length, 0);
});
