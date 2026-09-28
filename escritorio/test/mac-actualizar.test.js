// Actualización sola en Mac sin firma de Apple (main/actualizar-mac.js).
//   node --test escritorio/test/mac-actualizar.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { esMasNueva, nombreZip, bundleActual, sePuedeReemplazar, scriptReemplazo } = require('../main/actualizar-mac.js');
const pkg = require('../package.json');

test('esMasNueva: por números, no por texto', () => {
    assert.equal(esMasNueva('2.1.10', '2.1.9'), true);
    assert.equal(esMasNueva('v2.2.0', '2.1.9'), true);
    assert.equal(esMasNueva('2.1.7', '2.1.7'), false);
    assert.equal(esMasNueva('2.1.6', '2.1.7'), false);
    assert.equal(esMasNueva('3', '2.9.9'), true);
    assert.equal(esMasNueva('', '2.1.7'), false);
});

test('nombreZip: el mismo que arma electron-builder con el artifactName del package.json', () => {
    assert.equal(nombreZip('2.1.7', 'arm64'), 'Tag-View-Pro-2.1.7-arm64-mac.zip');
    assert.equal(nombreZip('v2.1.7', 'x64'), 'Tag-View-Pro-2.1.7-x64-mac.zip');
    const plantilla = pkg.build.mac.artifactName;
    for (const arch of ['arm64', 'x64']) {
        const armado = plantilla.replace('${version}', '2.1.7').replace('${arch}', arch).replace('${ext}', 'zip');
        assert.equal(armado, nombreZip('2.1.7', arch));
    }
    assert.ok(pkg.build.mac.target.includes('zip'), 'sin el .zip no hay de dónde actualizarse');
});

test('bundleActual y sePuedeReemplazar: nunca desde el .dmg ni trasladada', () => {
    assert.equal(bundleActual('/Applications/Tag & View Pro.app/Contents/MacOS/Tag & View Pro'), path.resolve('/Applications/Tag & View Pro.app'));
    assert.equal(bundleActual('/usr/local/bin/node'), null);
    assert.equal(sePuedeReemplazar(null), false);
    assert.equal(sePuedeReemplazar('/Volumes/Tag & View Pro 2.1.7/Tag & View Pro.app'), false);
    assert.equal(sePuedeReemplazar('/private/var/folders/x/AppTranslocation/ABC/d/Tag & View Pro.app'), false);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-mac-'));
    const app = path.join(tmp, 'Tag & View Pro.app');
    fs.mkdirSync(app);
    assert.equal(sePuedeReemplazar(app), true);
    fs.rmSync(tmp, { recursive: true, force: true });
});

const haySh = spawnSync('sh', ['-c', 'exit 0']).status === 0;

test('script: cambia la .app vieja por la nueva cuando la app ya cerró', { skip: !haySh && 'sin sh' }, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-mac-'));
    const vieja = path.join(tmp, 'Aplicaciones', 'Tag & View Pro.app');
    const nueva = path.join(tmp, 'bajada', 'Tag & View Pro.app');
    fs.mkdirSync(vieja, { recursive: true });
    fs.mkdirSync(nueva, { recursive: true });
    fs.writeFileSync(path.join(vieja, 'version'), '2.1.6');
    fs.writeFileSync(path.join(nueva, 'version'), '2.1.7');
    const script = path.join(tmp, 'reemplazar.sh');
    fs.writeFileSync(script, scriptReemplazo());
    // Un pid que ya no existe: la app "ya cerró".
    const r = spawnSync('sh', [script, '999999', vieja, nueva, '0'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(vieja, 'version'), 'utf8'), '2.1.7');
    assert.equal(fs.existsSync(nueva), false);
    assert.equal(fs.existsSync(vieja + '.anterior'), false, 'no queda la copia vieja');
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('script: si la nueva no está, la vieja queda donde estaba', { skip: !haySh && 'sin sh' }, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-mac-'));
    const vieja = path.join(tmp, 'Tag & View Pro.app');
    fs.mkdirSync(vieja);
    fs.writeFileSync(path.join(vieja, 'version'), '2.1.6');
    const script = path.join(tmp, 'reemplazar.sh');
    fs.writeFileSync(script, scriptReemplazo());
    spawnSync('sh', [script, '999999', vieja, path.join(tmp, 'no-existe.app'), '0']);
    assert.equal(fs.readFileSync(path.join(vieja, 'version'), 'utf8'), '2.1.6');
    fs.rmSync(tmp, { recursive: true, force: true });
});
