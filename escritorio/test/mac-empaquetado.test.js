// package.json → build: el .dmg de Mac tiene lo que pide macOS, y el .exe de
// Windows sigue igual. Tambien los permisos de la grabadora y la ayuda del
// firewall. Corre en cualquier sistema.
//   node --test escritorio/test/mac*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import remoto from '../main/remoto.js';
import { asegurarPermisos } from '../src/nucleo/grabadora.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
const b = pkg.build;

test('mac: dmg y zip, Info.plist con las tres descripciones', () => {
    assert.deepEqual(b.mac.target, ['dmg', 'zip']);
    for (const k of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSLocalNetworkUsageDescription']) {
        assert.ok(typeof b.mac.extendInfo[k] === 'string' && b.mac.extendInfo[k].length > 20, k);
    }
    assert.equal(b.mac.category, 'public.app-category.sports');
    assert.equal(b.mac.hardenedRuntime, true);
    // Electron 33 no corre en macOS 10.15.
    assert.equal(b.mac.minimumSystemVersion, '11.0');
});

test('mac: entitlements y hook de firma ad-hoc existen', () => {
    for (const f of [b.mac.entitlements, b.mac.entitlementsInherit, b.afterPack]) {
        assert.ok(fs.existsSync(path.join(RAIZ, f)), f);
    }
    const plist = fs.readFileSync(path.join(RAIZ, b.mac.entitlements), 'utf8');
    for (const k of ['device.camera', 'device.audio-input', 'cs.allow-jit', 'cs.allow-unsigned-executable-memory']) {
        assert.match(plist, new RegExp(`com\\.apple\\.security\\.${k.replace(/\./g, '\\.')}`), k);
    }
});

test('ffprobe: cada instalador lleva solo lo suyo', () => {
    assert.ok(!b.files.some(f => f.includes('ffprobe-static/bin')), 'las exclusiones van por plataforma');
    assert.ok(b.win.files.includes('!node_modules/ffprobe-static/bin/darwin/**'));
    assert.ok(b.win.files.includes('!node_modules/ffprobe-static/bin/win32/ia32/**'));
    assert.ok(b.mac.files.includes('!node_modules/ffprobe-static/bin/win32/**'));
});

// El "files" de plataforma REEMPLAZA al de la raíz. Si trae solo exclusiones,
// electron-builder le antepone "**/*" y el instalador se lleva todo (test/,
// los .md…). Por eso cada plataforma repite la lista blanca de la raíz.
test('files por plataforma: arrancan con la lista blanca de la raíz', () => {
    for (const plat of ['win', 'mac']) {
        assert.deepEqual(b[plat].files.slice(0, b.files.length), b.files, plat);
    }
});

test('windows: dist, dist:win y nsis como antes', () => {
    assert.equal(pkg.scripts.dist, 'node build/preparar.js && electron-builder --win nsis --x64');
    assert.equal(pkg.scripts['dist:win'], pkg.scripts.dist);
    assert.match(pkg.scripts['dist:mac'], /electron-builder --mac/);
    assert.equal(b.win.target, 'nsis');
    assert.equal(b.win.icon, 'build/icon.png');
    assert.equal(b.nsis.oneClick, false);
    assert.equal(b.nsis.shortcutName, 'Tag & View Pro');
});

// ── Permisos (src/nucleo/grabadora.js) ──
function sysFalso(estados) {
    const pedidos = [];
    return {
        pedidos,
        async permiso(t) { return estados[t]; },
        async pedirPermiso(t) { pedidos.push(t); estados[t] = estados.responde || 'concedido'; return estados[t] === 'concedido'; }
    };
}

test('permisos: sin sys (Windows viejo, pruebas) no se chequea nada', async () => {
    assert.deepEqual(await asegurarPermisos(null), { camara: 'concedido', microfono: 'concedido' });
});

test('permisos: no-determinado se pide; denegado tira con .permiso', async () => {
    const s = sysFalso({ camara: 'no-determinado', microfono: 'no-determinado' });
    assert.deepEqual(await asegurarPermisos(s), { camara: 'concedido', microfono: 'concedido' });
    assert.deepEqual(s.pedidos, ['camara', 'microfono']);

    await assert.rejects(asegurarPermisos(sysFalso({ camara: 'denegado' })), e => e.permiso === 'camara' && e.estado === 'denegado');
    await assert.rejects(asegurarPermisos(sysFalso({ camara: 'restringido' })), e => e.estado === 'restringido');
});

test('permisos: micrófono negado con cámara sí → sigue (graba sin audio)', async () => {
    const r = await asegurarPermisos(sysFalso({ camara: 'concedido', microfono: 'denegado' }));
    assert.equal(r.microfono, 'denegado');
    const sinAudio = sysFalso({ camara: 'concedido', microfono: 'no-determinado' });
    await asegurarPermisos(sinAudio, { audio: false });
    assert.deepEqual(sinAudio.pedidos, []);
});

// ── Firewall (main/remoto.js) ──
test('ayudaRed: en Mac nombra Firewall y Red local; en Windows, el Firewall de Windows', () => {
    const mac = remoto.ayudaRed('darwin');
    assert.equal(mac.pagina, 'firewall');
    assert.equal(mac.paginaExtra, 'red-local');
    assert.match(mac.texto, /Firewall/);
    assert.match(mac.texto, /Red local/);
    assert.match(remoto.ayudaRed('win32').texto, /Firewall de Windows/);
});
