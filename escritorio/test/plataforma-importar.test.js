// node --test test/plataforma-importar.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bd = require('../db');
const imp = require('../main/importar');

const fixture = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));

async function baseNueva() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-imp-'));
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
}

test('reconoce los tres formatos y rechaza lo demas', () => {
    assert.strictEqual(imp.tipoDe(fixture('plataforma-plantilla.json')), 'template');
    assert.strictEqual(imp.tipoDe(fixture('plataforma-sesion.json')), 'session');
    assert.strictEqual(imp.tipoDe(fixture('plataforma-copia.json')), 'backup');
    assert.strictEqual(imp.tipoDe({ app: 'otra', kind: 'backup' }), null);
    assert.throws(() => imp.importarDatos({ hola: 1 }), /no es una plantilla/);
});

test('plantilla suelta: entra una vez', async () => {
    await baseNueva();
    const t = fixture('plataforma-plantilla.json');
    assert.deepStrictEqual(imp.importarDatos(t), { tipo: 'template', plantillas: 1, equipos: 0, partidos: 0 });
    assert.deepStrictEqual(imp.importarDatos(t), { tipo: 'template', plantillas: 0, equipos: 0, partidos: 0 });
    const lista = bd.listarPlantillas();
    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].nombre, 'Hockey 5v5');
    assert.strictEqual(lista[0].origen, 'ipad');
    const leida = bd.leerPlantilla(lista[0].id);
    assert.deepStrictEqual(Object.keys(leida.datos), ['elements', 'links', 'hojas']);
    assert.strictEqual(leida.datos.elements.length, 4);
    assert.deepStrictEqual(leida.datos.links, [{ from: 'e1', to: 'l1' }]);
    bd.cerrar();
});

test('mismo nombre con otros datos: entra como "Nombre (iPad dd-mm)"', async () => {
    await baseNueva();
    const t = fixture('plataforma-plantilla.json');
    imp.importarDatos(t);
    const cambiada = { ...t, elements: t.elements.map(e => e.id === 'e1' ? { ...e, name: 'Remate' } : e) };
    assert.strictEqual(imp.importarDatos(cambiada).plantillas, 1);
    const otra = { ...t, elements: t.elements.map(e => e.id === 'e1' ? { ...e, name: 'Disparo' } : e) };
    assert.strictEqual(imp.importarDatos(otra).plantillas, 1);
    const nombres = bd.listarPlantillas().map(p => p.nombre).sort();
    const d = new Date(), dm = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    assert.deepStrictEqual(nombres, ['Hockey 5v5', `Hockey 5v5 (iPad ${dm})`, `Hockey 5v5 (iPad ${dm}) (2)`]);
    bd.cerrar();
});

test('sesion suelta: un partido sin video, una sola vez', async () => {
    await baseNueva();
    const s = fixture('plataforma-sesion.json');
    assert.strictEqual(imp.importarDatos(s).partidos, 1);
    assert.strictEqual(imp.importarDatos(s).partidos, 0);
    const [fila] = bd.listarPartidos();
    assert.strictEqual(fila.nombre, 'LOMAS vs GEBA 15-09-2026 20h30');
    assert.strictEqual(fila.origen, 'ipad-importado');
    assert.strictEqual(fila.video_ruta, null);
    assert.strictEqual(fila.local, 'LOMAS');
    assert.strictEqual(fila.visitante, 'GEBA');
    const p = bd.leerPartido(fila.id);
    assert.strictEqual(p.duracion, 4205);
    assert.strictEqual(p.inicio_real, '2026-09-15T23:30:12.000Z');
    assert.strictEqual(p.eventos.length, 3, 'la posesion no es un evento');
    assert.deepStrictEqual(p.eventos.map(e => e.nombre), ['Tiro', 'Gol', 'Tiro']);
    assert.strictEqual(p.eventos[0].linea, 'Linea 1');
    assert.strictEqual(p.eventos[2].fin, 301, 'sin fin dura un segundo, como en el XML');
    assert.strictEqual(p.eventos[0].v_inicio, null);
    assert.deepStrictEqual(p.eventos[1].etiquetas, [{ grupo: 'Etiqueta', texto: 'Contra' }, { grupo: 'Etiqueta', texto: 'Corner' }]);
    assert.strictEqual(p.posesion.length, 1);
    assert.strictEqual(p.posesion[0].fin, 40);
    bd.cerrar();
});

test('copia de seguridad: plantillas + equipos + partidos, sin duplicar con lo ya importado', async () => {
    await baseNueva();
    // Primero lo suelto: la copia trae lo mismo y no se tiene que repetir.
    imp.importarDatos(fixture('plataforma-plantilla.json'));
    imp.importarDatos(fixture('plataforma-sesion.json'));

    const c = fixture('plataforma-copia.json');
    const r = imp.importarDatos(c, 'nube');
    // Hockey (igual) y el lienzo actual (igual a Hockey, otro orden de claves) no entran.
    assert.deepStrictEqual(r, { tipo: 'backup', plantillas: 1, equipos: 2, partidos: 1 });
    assert.deepStrictEqual(bd.listarPlantillas().map(p => p.nombre).sort(), ['Futbol', 'Hockey 5v5']);
    assert.strictEqual(bd.listarPlantillas().find(p => p.nombre === 'Futbol').origen, 'nube');
    assert.deepStrictEqual(bd.listarEquipos().map(e => [e.nombre, e.color]), [['GEBA', '#dc2626'], ['LOMAS', '#1d4ed8']]);
    const partidos = bd.listarPartidos();
    assert.strictEqual(partidos.length, 2);
    const practica = bd.leerPartido(partidos.find(p => p.nombre === 'Practica martes').id);
    assert.strictEqual(practica.duracion, 2700);
    assert.strictEqual(practica.local, null);
    assert.deepStrictEqual(practica.posesion.map(t => [t.equipo, t.inicio, t.fin]), [['B', 0, 30]]);

    // Otra vez la misma copia: nada nuevo
    assert.deepStrictEqual(imp.importarDatos(c), { tipo: 'backup', plantillas: 0, equipos: 0, partidos: 0 });
    bd.cerrar();
});

test('plantillaComoArchivo: el formato que el iPad importa', async () => {
    await baseNueva();
    imp.importarDatos(fixture('plataforma-plantilla.json'));
    const t = bd.leerPlantilla(bd.listarPlantillas()[0].id);
    const archivo = imp.plantillaComoArchivo(t);
    assert.strictEqual(archivo.app, 'tagview');
    assert.strictEqual(archivo.kind, 'template');
    assert.strictEqual(archivo.name, 'Hockey 5v5');
    assert.strictEqual(archivo.elements.length, 4);
    // Y vuelve a entrar como la misma (no se duplica)
    assert.strictEqual(imp.importarDatos(archivo).plantillas, 0);
    bd.cerrar();
});

test('equiposDelNombre y segundosDe', () => {
    assert.deepStrictEqual(imp.equiposDelNombre('LOMAS vs GEBA 15-09-2026 20h30'), { local: 'LOMAS', visitante: 'GEBA' });
    assert.deepStrictEqual(imp.equiposDelNombre('San Isidro Club vs. C.A.S.I.'), { local: 'San Isidro Club', visitante: 'C.A.S.I.' });
    assert.deepStrictEqual(imp.equiposDelNombre('Practica'), { local: null, visitante: null });
    assert.strictEqual(imp.segundosDe('01:10:05'), 4205);
    assert.strictEqual(imp.segundosDe('45:00'), 2700);
    assert.strictEqual(imp.segundosDe(''), 0);
});
