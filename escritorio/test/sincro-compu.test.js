// La sincronización de plantillas del lado de la compu, de punta a punta:
// base de verdad, main/sincro.js y una nube de mentira en memoria.
//   node --test escritorio/test/sincro-compu.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bd = require('../db');
const regla = require('../../sincro.js');
const { crearSincro } = require('../main/sincro');

// Una nube con un solo lugar para archivos, y sesión o no.
function nubeDeMentira({ conSesion = true } = {}) {
    const archivos = {};
    return {
        archivos,
        estado: () => ({ configurada: true, conSesion, email: 'yo@club.com' }),
        async bajar(nombre) { return archivos[nombre] === undefined ? null : archivos[nombre]; },
        async subir(nombre, texto) { archivos[nombre] = texto; },
        entrar: async () => ({}), salir() {}
    };
}

const botones = (...n) => ({ elements: n.map((x, i) => ({ id: i + 1, type: 'event', name: x })), links: [], hojas: [] });

async function armar(nube) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-sincro-'));
    const ruta = path.join(dir, 'tagview.sqlite');
    const abrirBase = () => bd.abrir(ruta);
    await abrirBase();
    const avisos = [];
    const ventana = () => ({ isDestroyed: () => false, webContents: { send: (c, d) => avisos.push([c, d]) } });
    const s = crearSincro({ app: { on() {} }, bd, nube, abrirBase, ventana });
    return { s, avisos, cerrar: () => bd.cerrar() };
}

test('sincro compu: sube lo de acá, trae lo del iPad y los borrados viajan', async () => {
    const nube = nubeDeMentira();
    const { s, avisos, cerrar } = await armar(nube);
    try {
        const idHockey = bd.guardarPlantilla({ nombre: 'Hockey', datos: botones('Gol', 'Tiro') });
        let e = await s.sincronizar();
        assert.equal(e.fase, 'ok');
        let enNube = regla.leerArchivo(nube.archivos[regla.ARCHIVO]);
        assert.deepEqual(enNube.map(x => x.nombre), ['Hockey'], 'la de la compu subió');
        const uidHockey = enNube[0].uid;

        // El iPad agrega una y edita la de hockey: después de la compu, pero
        // antes del borrado de más abajo (gana lo más nuevo).
        const despues = new Date(Date.parse(enNube[0].actualizado) + 1).toISOString();
        enNube = enNube.map(x => ({ ...x, datos: botones('Gol', 'Tiro', 'Corner'), actualizado: despues }));
        enNube.push({ uid: 'pIPAD1', nombre: 'Fútbol', datos: botones('Pase'), actualizado: despues });
        nube.archivos[regla.ARCHIVO] = regla.armarArchivo(enNube, 'el iPad');
        e = await s.sincronizar();
        const locales = bd.listarPlantillas().map(p => p.nombre).sort();
        assert.deepEqual(locales, ['Fútbol', 'Hockey'], 'llegó la del iPad');
        assert.equal(bd.leerPlantilla(idHockey).datos.elements.length, 3, 'llegó el cambio del iPad');
        assert.ok(avisos.some(([c]) => c === 'plantillas:cambiaron'), 'la pantalla se entera');

        // Se borra en la compu: la lápida sube.
        bd.borrarPlantilla(idHockey);
        await s.sincronizar();
        enNube = regla.leerArchivo(nube.archivos[regla.ARCHIVO]);
        assert.equal(enNube.find(x => x.uid === uidHockey).borrado, true);

        // Se borra en el iPad: desaparece de la compu.
        nube.archivos[regla.ARCHIVO] = regla.armarArchivo(enNube.map(x => x.uid === 'pIPAD1'
            ? { uid: 'pIPAD1', nombre: 'Fútbol', actualizado: new Date(Date.now() + 120000).toISOString(), borrado: true } : x), 'el iPad');
        await s.sincronizar();
        assert.deepEqual(bd.listarPlantillas(), []);
    } finally { cerrar(); }
});

test('sincro compu: la misma plantilla que ya estaba en los dos lados no se duplica', async () => {
    const nube = nubeDeMentira();
    nube.archivos[regla.ARCHIVO] = regla.armarArchivo([
        { uid: 'pIPAD9', nombre: 'Hockey', datos: botones('Gol'), actualizado: '2026-01-01T00:00:00.000Z' }], 'el iPad');
    const { s, cerrar } = await armar(nube);
    try {
        bd.guardarPlantilla({ nombre: 'Hockey', datos: botones('Gol') });
        await s.sincronizar();
        assert.equal(bd.listarPlantillas().length, 1);
        const enNube = regla.leerArchivo(nube.archivos[regla.ARCHIVO]);
        assert.deepEqual(enNube.map(x => x.uid), ['pIPAD9'], 'la de la compu tomó el uid del iPad');
    } finally { cerrar(); }
});

test('sincro compu: sin sesión no toca nada', async () => {
    const nube = nubeDeMentira({ conSesion: false });
    const { s, cerrar } = await armar(nube);
    try {
        bd.guardarPlantilla({ nombre: 'Hockey', datos: botones('Gol') });
        const e = await s.sincronizar();
        assert.equal(e.fase, 'sin-sesion');
        assert.deepEqual(nube.archivos, {});
    } finally { cerrar(); }
});
