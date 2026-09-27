// Rutas y nombres en Mac y Windows (main/rutas.js): NFD/NFC, mayusculas,
// ".." y "%2e%2e". La plataforma entra por parametro.
//   node --test escritorio/test/mac*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import rutas from '../main/rutas.js';

const { dentroDe, archivoDeUrl, nombreSeguro } = rutas;

const RAIZ = path.resolve('Partidos', 'Peñarol vs Nacional');
const NFD = s => s.normalize('NFD');

test('dentroDe: la misma ruta en NFD entra en Mac y en Windows', () => {
    const adentro = path.join(NFD(RAIZ), 'Clips', 'Gol.mp4');
    assert.notEqual(NFD(RAIZ), RAIZ);   // de verdad son bytes distintos
    assert.ok(dentroDe(RAIZ, adentro, 'darwin'));
    assert.ok(dentroDe(NFD(RAIZ), path.join(RAIZ, 'x.mp4'), 'darwin'));
    assert.ok(dentroDe(RAIZ, adentro, 'win32'));
});

test('dentroDe: sin mayusculas en Mac y Windows, con mayusculas en Linux', () => {
    const otra = path.join(RAIZ.toUpperCase(), 'video.mp4');
    assert.ok(dentroDe(RAIZ, otra, 'darwin'));
    assert.ok(dentroDe(RAIZ, otra, 'win32'));
    assert.ok(!dentroDe(RAIZ, otra, 'linux'));
});

test('dentroDe: hermanas y ".." no, en ninguna plataforma', () => {
    for (const plat of ['darwin', 'win32', 'linux']) {
        assert.ok(!dentroDe(RAIZ, RAIZ + '2', plat), plat);
        assert.ok(!dentroDe(RAIZ, path.join(RAIZ, '..', 'otro.mp4'), plat), plat);
        assert.ok(!dentroDe(RAIZ, path.join(NFD(RAIZ), '..', '..', 'x'), plat), plat);
    }
});

test('archivoDeUrl: "%2e%2e" y tildes codificadas', () => {
    assert.equal(archivoDeUrl(RAIZ, '/%2e%2e/%2e%2e/secreto'), null);
    assert.equal(archivoDeUrl(RAIZ, '/..%2f..%2fsecreto'), null);
    const r = archivoDeUrl(RAIZ, '/' + encodeURIComponent('Peñarol & Cía.mp4'));
    assert.equal(r, path.join(RAIZ, 'Peñarol & Cía.mp4'));
});

test('nombreSeguro: ":" y "/" (Mac), punto inicial y NFC', () => {
    assert.equal(nombreSeguro('Final: A/B'), 'Final_ A_B');
    assert.equal(nombreSeguro('.oculto'), 'oculto');
    assert.equal(nombreSeguro('...'), 'Partido');
    const n = nombreSeguro(NFD('Peñarol vs Nacional (ñ, á, ü)'));
    assert.equal(n, 'Peñarol vs Nacional (ñ, á, ü)');
    assert.equal(n, n.normalize('NFC'));
    // Mismo nombre escrito de las dos formas → mismo archivo, sin "(2)".
    assert.equal(nombreSeguro(NFD('Peñarol')), nombreSeguro('Peñarol'));
});
