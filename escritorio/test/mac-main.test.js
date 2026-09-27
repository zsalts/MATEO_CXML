// Lo de Mac del proceso principal (main/mac.js), sin Electron.
//   node --test escritorio/test/mac*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mac from '../main/mac.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// Recorre el menu y junta todos los items.
function items(plantilla) {
    const out = [];
    for (const m of plantilla) {
        out.push(m);
        if (Array.isArray(m.submenu)) out.push(...items(m.submenu));
    }
    return out;
}

test('menu: Edicion con los roles que hacen andar ⌘C/⌘V en los campos', () => {
    const roles = items(mac.plantillaMenu()).map(i => i.role).filter(Boolean);
    for (const r of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'hide', 'minimize', 'about']) {
        assert.ok(roles.includes(r), `falta el rol ${r}`);
    }
});

test('menu: ⌘, abre Ajustes y ⌘Q pasa por el cierre de la app, no por app.quit', () => {
    const llamados = [];
    const plantilla = mac.plantillaMenu({ acciones: {
        abrirAjustes: () => llamados.push('ajustes'),
        salir: () => llamados.push('salir')
    } });
    const todos = items(plantilla);
    const ajustes = todos.find(i => i.accelerator === 'Cmd+,');
    const salir = todos.find(i => i.accelerator === 'Cmd+Q');
    assert.ok(ajustes && salir);
    assert.ok(!todos.some(i => i.role === 'quit'), 'el role quit se saltea la confirmacion de grabacion');
    ajustes.click();
    salir.click();
    assert.deepEqual(llamados, ['ajustes', 'salir']);
});

test('menu: DevTools solo en desarrollo', () => {
    const conDev = items(mac.plantillaMenu({ desarrollo: true })).some(i => i.role === 'toggleDevTools');
    const sinDev = items(mac.plantillaMenu({ desarrollo: false })).some(i => i.role === 'toggleDevTools');
    assert.equal(conDev, true);
    assert.equal(sinDev, false);
});

test('ventana: semaforo en Mac, nada en Windows', () => {
    const m = mac.opcionesVentana('darwin');
    assert.equal(m.titleBarStyle, 'hiddenInset');
    assert.equal(m.trafficLightPosition.y, 11);   // centrado en la barra de 36 px
    assert.deepEqual(mac.opcionesVentana('win32'), {});
    assert.equal(mac.preferenciasWeb().backgroundThrottling, false);
});

test('permisos: estados de macOS traducidos; Windows siempre concedido', async () => {
    const sp = estado => ({
        getMediaAccessStatus: () => estado,
        askForMediaAccess: async () => estado === 'granted'
    });
    assert.equal(mac.estadoPermiso(sp('denied'), 'camara', 'darwin'), 'denegado');
    assert.equal(mac.estadoPermiso(sp('not-determined'), 'microfono', 'darwin'), 'no-determinado');
    assert.equal(mac.estadoPermiso(sp('restricted'), 'camara', 'darwin'), 'restringido');
    assert.equal(mac.estadoPermiso(sp('granted'), 'camara', 'darwin'), 'concedido');
    assert.equal(mac.estadoPermiso(sp('denied'), 'camara', 'win32'), 'concedido');
    assert.equal(await mac.pedirPermiso(sp('denied'), 'camara', 'darwin'), false);
    assert.equal(await mac.pedirPermiso(sp('denied'), 'camara', 'win32'), true);
    assert.throws(() => mac.estadoPermiso(sp('granted'), 'pantalla', 'darwin'));
});

test('ajustes del sistema: una url por pagina en Mac, validadas', () => {
    for (const p of mac.PAGINAS_AJUSTES) {
        assert.match(mac.urlAjustes(p, 'darwin'), /^x-apple\.systempreferences:/);
    }
    assert.match(mac.urlAjustes('camara', 'darwin'), /Privacy_Camera$/);
    assert.equal(mac.urlAjustes('camara', 'win32'), 'ms-settings:privacy-webcam');
    assert.equal(mac.urlAjustes('firewall', 'win32'), null);
    assert.throws(() => mac.urlAjustes('file:///etc/passwd', 'darwin'));
});

test('energia: un solo bloqueo para varios motivos, se suelta con el ultimo', () => {
    const activos = new Set();
    let n = 0;
    const psb = {
        start: () => { activos.add(++n); return n; },
        stop: id => activos.delete(id),
        isStarted: id => activos.has(id)
    };
    const e = mac.crearEnergia(psb);
    e.sostener('grabacion');
    e.sostener('remoto');
    assert.equal(activos.size, 1);
    e.soltar('grabacion');
    assert.equal(e.activo(), true);
    e.soltar('remoto');
    assert.equal(e.activo(), false);
    assert.equal(activos.size, 0);
});

test('entitlements: camara, microfono y lo que Electron necesita', () => {
    const plist = fs.readFileSync(path.join(AQUI, '..', 'build', 'mac', 'entitlements.mac.plist'), 'utf8');
    for (const k of ['device.camera', 'device.audio-input', 'cs.allow-jit', 'cs.allow-unsigned-executable-memory']) {
        assert.ok(plist.includes(`com.apple.security.${k}`), `falta ${k}`);
    }
});
