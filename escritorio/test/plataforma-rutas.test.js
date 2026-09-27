// node --test test/plataforma-rutas.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const r = require('../main/rutas');

const RAIZ = path.resolve(os.tmpdir(), 'tv-raiz', 'src');

test('dentroDe: la raiz y lo de adentro si', () => {
    assert.ok(r.dentroDe(RAIZ, RAIZ));
    assert.ok(r.dentroDe(RAIZ, path.join(RAIZ, 'index.html')));
    assert.ok(r.dentroDe(RAIZ, path.join(RAIZ, 'ramas', 'base', 'index.js')));
    assert.ok(r.dentroDe(RAIZ + path.sep, path.join(RAIZ, 'a.js')));
});

test('dentroDe: carpetas hermanas y ".." no', () => {
    assert.ok(!r.dentroDe(RAIZ, RAIZ + '2'));
    assert.ok(!r.dentroDe(RAIZ, path.join(RAIZ + '2', 'secreto.txt')));
    assert.ok(!r.dentroDe(RAIZ, path.join(RAIZ, '..', 'main.js')));
    assert.ok(!r.dentroDe(RAIZ, path.join(RAIZ, 'ramas', '..', '..', 'db.js')));
    assert.ok(!r.dentroDe(RAIZ, path.dirname(RAIZ)));
    assert.ok(!r.dentroDe(RAIZ, 'C:\\Windows\\win.ini'));
    assert.ok(!r.dentroDe(RAIZ, ''));
    assert.ok(!r.dentroDe(RAIZ, path.join(RAIZ, 'a\0.js')));
    assert.ok(!r.dentroDe(RAIZ, null));
});

test('dentroDe: en Windows no distingue mayusculas', { skip: process.platform !== 'win32' }, () => {
    assert.ok(r.dentroDe(RAIZ, RAIZ.toUpperCase() + '\\X.JS'));
});

test('archivoDeUrl: rutas normales', () => {
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/'), path.join(RAIZ, 'index.html'));
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/ramas/base/index.js'), path.join(RAIZ, 'ramas', 'base', 'index.js'));
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/mi%20archivo.css'), path.join(RAIZ, 'mi archivo.css'));
});

test('archivoDeUrl: ".." y "%2e%2e" no salen de la raiz', () => {
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/../main.js'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/%2e%2e/main.js'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/%2E%2E/%2e%2e/db.js'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/ramas/%2e%2e/%2e%2e/%2e%2e/x'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/..%5c..%5cmain.js'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/..\\main.js'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/a%00.js'), null);
    assert.strictEqual(r.archivoDeUrl(RAIZ, '/%E0%A4%A'), null);       // mal codificado
    // Doble codificacion: queda como nombre literal "%2e%2e", adentro.
    assert.ok(r.dentroDe(RAIZ, r.archivoDeUrl(RAIZ, '/%252e%252e/x')));
    // "..." no es "..": es un nombre (raro) dentro de la raiz.
    assert.ok(r.dentroDe(RAIZ, r.archivoDeUrl(RAIZ, '/ramas/.../x')));
});

test('mimeDe: ES modules y demas', () => {
    assert.match(r.mimeDe('a.js'), /^text\/javascript/);
    assert.match(r.mimeDe('a.MJS'), /^text\/javascript/);
    assert.match(r.mimeDe('a.css'), /^text\/css/);
    assert.strictEqual(r.mimeDe('a.svg'), 'image/svg+xml');
    assert.strictEqual(r.mimeDe('a.png'), 'image/png');
    assert.strictEqual(r.mimeDe('a.woff2'), 'font/woff2');
    assert.match(r.mimeDe('a.json'), /^application\/json/);
    assert.strictEqual(r.mimeDe('a.xyz'), 'application/octet-stream');
});

test('nombreSeguro: limpio para Windows', () => {
    assert.strictEqual(r.nombreSeguro('LOMAS vs GEBA 15/09 20:30'), 'LOMAS vs GEBA 15_09 20_30');
    assert.strictEqual(r.nombreSeguro('a\\b*c?d"e<f>g|h'), 'a_b_c_d_e_f_g_h');
    assert.strictEqual(r.nombreSeguro('  final.  '), 'final');
    assert.strictEqual(r.nombreSeguro(''), 'Partido');
    assert.strictEqual(r.nombreSeguro('CON'), '_CON');
    assert.strictEqual(r.nombreSeguro('..'), 'Partido');
});

test('nombreLibre y subcarpetaSegura', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-rutas-'));
    fs.writeFileSync(path.join(dir, 'P.mp4'), '');
    fs.writeFileSync(path.join(dir, 'P (2).mp4'), '');
    assert.strictEqual(r.nombreLibre(dir, 'P.mp4'), path.join(dir, 'P (3).mp4'));
    assert.strictEqual(r.subcarpetaSegura(dir, 'Partidos/LOMAS vs GEBA'), path.join(dir, 'Partidos', 'LOMAS vs GEBA'));
    assert.strictEqual(r.subcarpetaSegura(dir, '../../Windows'), path.join(dir, 'Windows'));
    assert.strictEqual(r.subcarpetaSegura(dir, ''), dir);
    assert.ok(r.dentroDe(dir, r.subcarpetaSegura(dir, 'C:\\Windows\\System32')));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('decodificarTexto: UTF-8, BOM, UTF-16 y Windows-1252', () => {
    const t = 'Córner — ñandú';
    assert.strictEqual(r.decodificarTexto(Buffer.from(t, 'utf8')), t);
    assert.strictEqual(r.decodificarTexto(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(t)])), t);
    assert.strictEqual(r.decodificarTexto(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(t, 'utf16le')])), t);
    const be = Buffer.from(t, 'utf16le');
    for (let i = 0; i < be.length; i += 2) { const a = be[i]; be[i] = be[i + 1]; be[i + 1] = a; }
    assert.strictEqual(r.decodificarTexto(Buffer.concat([Buffer.from([0xFE, 0xFF]), be])), t);
    // "Córner" en Windows-1252: ó = 0xF3, que no es UTF-8 valido.
    assert.strictEqual(r.decodificarTexto(Buffer.from([0x43, 0xF3, 0x72, 0x6E, 0x65, 0x72])), 'Córner');
});

test('codificarTexto: XML en UTF-16 con BOM, CSV con BOM UTF-8', () => {
    const x = r.codificarTexto('<file/>', 'xml');
    assert.deepStrictEqual([...x.subarray(0, 2)], [0xFF, 0xFE]);
    assert.strictEqual(r.decodificarTexto(x), '<file/>');
    const c = r.codificarTexto('a;b', 'csv');
    assert.deepStrictEqual([...c.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    assert.strictEqual(r.codificarTexto('{}', 'json').toString(), '{}');
});
