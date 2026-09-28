// Pruebas del editor de plantillas de la compu (lógica pura) y de que lo
// que arma se lee igual en la captura.
//   node --test escritorio/test/editor-logica.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/ramas/base/editor-logica.js';
import { normalizar, atajos, emergentesDe, contadoresDe, excluyentesDe, hojaQueAbre } from '../src/nucleo/plantilla.js';

const T = 1_700_000_000_000;

test('editor: crear botones sin pisar a los que ya están', () => {
    const d = E.plantillaVacia();
    const a = E.crearElemento(d, 'event', { ahora: T });
    const b = E.crearElemento(d, 'event', { ahora: T });
    assert.notEqual(a.id, b.id, 'ids distintos aunque se creen en el mismo milisegundo');
    assert.equal(a.name, 'Evento');
    assert.equal(a.lead, 5);
    assert.equal(a.lag, 5);
    const seTocan = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.equal(seTocan, false, 'el segundo va al hueco libre');
    const c = E.crearElemento(d, 'counter', { donde: { x: 101, y: 203 }, ahora: T });
    assert.deepEqual([c.x, c.y], [100, 204], 'soltado a mano cae en la rejilla');
    assert.throws(() => E.crearElemento(d, 'cualquiera'));
});

test('editor: lo que arma lo lee la captura igual', () => {
    const d = E.plantillaVacia();
    const tiro = E.crearElemento(d, 'event', { ahora: T });
    tiro.name = 'Tiro';
    const pase = E.crearElemento(d, 'event', { ahora: T });
    const em = E.crearElemento(d, 'popup_label', { ahora: T });
    const cont = E.crearElemento(d, 'counter', { ahora: T });
    E.enlazar(d, tiro.id, em.id);
    E.enlazar(d, tiro.id, cont.id);
    E.enlazar(d, tiro.id, cont.id);                 // dos veces = una flecha
    E.ponerExcluyente(d, tiro.id, pase.id);
    const hoja = E.agregarHoja(d, 'Resultado', { ahora: T });
    tiro.subHojaId = hoja.id;

    const n = normalizar(JSON.parse(JSON.stringify(d)));
    assert.equal(n.links.length, 2);
    assert.deepEqual(emergentesDe(n, tiro.id).map(x => x.elemento.id), [em.id]);
    assert.deepEqual(contadoresDe(n, tiro.id), [cont.id]);
    assert.deepEqual(excluyentesDe(n, pase.id), [tiro.id], 'excluyentes de a dos');
    assert.equal(hojaQueAbre(n, tiro.id).name, 'Resultado');

    E.enlazar(d, tiro.id, em.id, false);
    assert.equal(E.enlazado(d, tiro.id, em.id), false);
    E.ponerExcluyente(d, pase.id, tiro.id, false);
    assert.deepEqual(tiro.exclusiveIds, []);
    assert.deepEqual(pase.exclusiveIds, []);
});

test('editor: borrar no deja referencias colgando', () => {
    const d = E.plantillaVacia();
    const a = E.crearElemento(d, 'event', { ahora: T });
    const b = E.crearElemento(d, 'event', { ahora: T });
    const l = E.crearElemento(d, 'line', { ahora: T });
    E.ponerEnLinea(d, l.id, a.id);
    E.ponerEnLinea(d, l.id, b.id);
    E.ponerExcluyente(d, a.id, b.id);
    E.enlazar(d, b.id, a.id);
    E.borrarElementos(d, [String(b.id)]);           // el id llega como texto desde el DOM
    assert.equal(d.elements.length, 2);
    assert.deepEqual(l.lineMemberIds, [a.id]);
    assert.deepEqual(a.exclusiveIds, []);
    assert.equal(d.links.length, 0);
});

test('editor: una pestaña se borra con sus botones', () => {
    const d = E.plantillaVacia();
    const h = E.agregarHoja(d, 'Detalle', { ahora: T });
    const ev = E.crearElemento(d, 'event', { ahora: T });
    ev.subHojaId = h.id;
    E.crearElemento(d, 'descriptor', { hoja: h.id, ahora: T });
    E.crearElemento(d, 'descriptor', { hoja: h.id, ahora: T });
    E.borrarHoja(d, h.id);
    assert.equal(d.hojas.length, 0);
    assert.deepEqual(d.elements.map(e => e.id), [ev.id]);
    assert.equal(ev.subHojaId, null);
});

test('editor: duplicar copia sin la tecla y con las referencias internas', () => {
    const d = E.plantillaVacia();
    const a = E.crearElemento(d, 'event', { ahora: T });
    const em = E.crearElemento(d, 'popup_label', { ahora: T });
    E.enlazar(d, a.id, em.id);
    E.ponerAtajo(d, a.id, 'q');
    const [ca, cem] = E.duplicarElementos(d, [a.id, em.id], { ahora: T });
    assert.equal(ca.atajo, undefined, 'dos botones con la misma tecla no disparan ninguno');
    assert.equal(ca.x, a.x + 16);
    assert.ok(E.enlazado(d, ca.id, cem.id), 'la copia del evento abre la copia de la emergente');
    assert.ok(E.enlazado(d, a.id, em.id), 'el original sigue igual');
    assert.equal(new Set(d.elements.map(e => e.id)).size, 4);
});

test('editor: el contenedor arrastra lo que tiene adentro', () => {
    const d = E.plantillaVacia();
    const c = E.crearElemento(d, 'container', { donde: { x: 0, y: 0 }, ahora: T });
    const adentro = E.crearElemento(d, 'event', { donde: { x: 20, y: 20 }, ahora: T });
    const afuera = E.crearElemento(d, 'event', { donde: { x: 400, y: 20 }, ahora: T });
    const ids = E.idsQueSeMueven(d, [String(c.id)]);
    assert.deepEqual(ids.sort(), [c.id, adentro.id].sort());
    E.moverElementos(d, ids, 10, -50);
    assert.deepEqual([adentro.x, adentro.y], [30, 0], 'no se va del lienzo');
    assert.equal(afuera.x, 400);
});

test('editor: teclas', () => {
    const d = E.plantillaVacia();
    const a = E.crearElemento(d, 'event', { ahora: T });
    const b = E.crearElemento(d, 'event', { ahora: T });
    E.ponerAtajo(d, a.id, 'G');
    assert.equal(a.atajo, 'g');
    const antes = E.ponerAtajo(d, b.id, 'g');
    assert.equal(antes, a, 'la tecla se pasa al último que la eligió');
    assert.equal(a.atajo, undefined);
    E.ponerAtajo(d, a.id, 'f5');
    assert.equal(a.atajo, 'F5');
    assert.equal(E.quienUsa(d, 'F5'), a);
    E.ponerAtajo(d, a.id, '');
    assert.equal('atajo' in a, false);

    assert.equal(E.teclaDeEvento({ key: 'Q' }), 'q');
    assert.equal(E.teclaDeEvento({ key: 'F7' }), 'F7');
    assert.equal(E.teclaDeEvento({ key: ' ' }), '');
    assert.equal(E.teclaDeEvento({ key: 'ArrowLeft' }), '');
    assert.equal(E.teclaDeEvento({ key: 'c', ctrlKey: true }), '');
    assert.equal(E.teclaDeEvento({ key: 'œ', altKey: true, code: 'KeyQ' }), 'q', '⌥+Q en Mac');
});

test('editor: teclas solas, sin repetir y sin la R', () => {
    const d = E.plantillaVacia();
    const nombres = ['Tiro', 'Tackle', 'Recuperación', 'Gol'];
    nombres.forEach(n => { E.crearElemento(d, 'event', { ahora: T }).name = n; });
    E.crearElemento(d, 'possession', { ahora: T });
    E.crearElemento(d, 'text', { ahora: T });
    d.elements[3].atajo = 'g';
    const n = E.atajosAutomaticos(d);
    assert.equal(n, 3);
    const teclas = d.elements.filter(e => e.atajo).map(e => e.atajo);
    assert.equal(new Set(teclas).size, teclas.length);
    assert.equal(d.elements[0].atajo, 't');
    assert.notEqual(d.elements[2].atajo, 'r');
    assert.equal(d.elements.find(e => e.type === 'possession').atajo, undefined);
    assert.equal(atajos(normalizar(d)).repetidas.length, 0);
});

test('plantilla: F1–F12 sobreviven a normalizar y disparan en la captura', () => {
    const n = normalizar({ elements: [{ id: 1, type: 'event', name: 'A', atajo: 'F5' }, { id: 2, type: 'event', name: 'B', atajo: 'Qx' }] });
    assert.equal(n.elements[0].atajo, 'F5');
    assert.equal(n.elements[1].atajo, 'q');
    // La captura busca e.key tal cual para las teclas de función ("F5").
    assert.equal(atajos(n).mapa.get('F5'), 1);
});
