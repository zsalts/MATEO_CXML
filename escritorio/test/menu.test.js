// Pruebas de la lógica pura del menú y de src/ui/ (Agente 2).
// Correr: node --test escritorio/test/menu*.test.js
//
// src/ es ES modules y package.json no dice "type": "module": se importan con
// import() dinámico, que Node resuelve por la sintaxis del archivo.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = rel => pathToFileURL(path.join(__dirname, '..', 'src', rel)).href;

test('formatoTiempo: m:ss por debajo de la hora, h:mm:ss arriba', async () => {
    const { formatoTiempo } = await import(src('ui/util.js'));
    assert.equal(formatoTiempo(0), '0:00');
    assert.equal(formatoTiempo(5), '0:05');
    assert.equal(formatoTiempo(123), '2:03');
    assert.equal(formatoTiempo(2530), '42:10');
    assert.equal(formatoTiempo(3723), '1:02:03');
    assert.equal(formatoTiempo(3723.9), '1:02:03', 'trunca, no redondea: el reloj no se adelanta');
    assert.equal(formatoTiempo(36000), '10:00:00');
});

test('formatoTiempo: basura y negativos dan 0:00; largo da hh:mm:ss', async () => {
    const { formatoTiempo } = await import(src('ui/util.js'));
    assert.equal(formatoTiempo(-4), '0:00');
    assert.equal(formatoTiempo(NaN), '0:00');
    assert.equal(formatoTiempo(undefined), '0:00');
    assert.equal(formatoTiempo('90'), '1:30');
    assert.equal(formatoTiempo(2530, { largo: true }), '00:42:10');
    assert.equal(formatoTiempo(3723, { largo: true }), '01:02:03');
});

test('escapar: nada de HTML pasa crudo', async () => {
    const { escapar } = await import(src('ui/util.js'));
    assert.equal(escapar('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
    assert.equal(escapar("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
    assert.equal(escapar(null), '');
    assert.equal(escapar(12), '12');
});

test('aFecha: ISO, SQLite, milisegundos y segundos Unix', async () => {
    const { aFecha } = await import(src('ui/util.js'));
    const ms = Date.UTC(2026, 8, 26, 18, 30);
    assert.equal(aFecha(new Date(ms).toISOString()).getTime(), ms);
    assert.equal(aFecha(ms).getTime(), ms);
    assert.equal(aFecha(ms / 1000).getTime(), ms);
    assert.equal(aFecha(String(ms)).getTime(), ms);
    assert.ok(aFecha('2026-09-26 18:30:00') instanceof Date);
    assert.equal(aFecha(''), null);
    assert.equal(aFecha('cualquier cosa'), null);
});

test('fechaCorta: hoy, ayer, este año, otro año', async () => {
    const { fechaCorta } = await import(src('ui/util.js'));
    const ahora = new Date(2026, 8, 26, 20, 0);
    assert.equal(fechaCorta(new Date(2026, 8, 26, 18, 5), ahora), 'hoy 18:05');
    assert.equal(fechaCorta(new Date(2026, 8, 25, 21, 0), ahora), 'ayer 21:00');
    assert.equal(fechaCorta(new Date(2026, 1, 3, 9, 7), ahora), '03/02 09:07');
    assert.equal(fechaCorta(new Date(2025, 11, 20), ahora), '20/12/25');
    assert.equal(fechaCorta(null, ahora), '');
});

test('recientes: los 8 más nuevos, del más nuevo al más viejo', async () => {
    const { recientes } = await import(src('ramas/inicio/logica.js'));
    const partidos = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, creado: new Date(2026, 0, i + 1).toISOString() }));
    const r = recientes(partidos);
    assert.equal(r.length, 8);
    assert.deepEqual(r.map(p => p.id), [12, 11, 10, 9, 8, 7, 6, 5]);
    assert.equal(partidos[0].id, 1, 'no desordena la lista original');
});

test('recientes: formatos de fecha mezclados y sin fecha al final', async () => {
    const { recientes } = await import(src('ramas/inicio/logica.js'));
    const r = recientes([
        { id: 1, creado: null },
        { id: 2, creado: '2026-09-20 10:00:00' },         // SQLite
        { id: 3, creado: Date.UTC(2026, 8, 25) },           // ms
        { id: 4, creado: Date.UTC(2026, 8, 22) / 1000 },    // segundos
        { id: 5, creado: '2026-09-26T08:00:00Z' }
    ], 10);
    assert.deepEqual(r.map(p => p.id), [5, 3, 4, 2, 1]);
    assert.deepEqual(recientes(null), []);
    assert.equal(recientes([{ id: 1 }, { id: 2 }], 1).length, 1);
});

test('esPrimeraVez: solo si no hay ni plantillas ni partidos', async () => {
    const { esPrimeraVez } = await import(src('ramas/inicio/logica.js'));
    assert.equal(esPrimeraVez([], []), true);
    assert.equal(esPrimeraVez(null, undefined), true);
    assert.equal(esPrimeraVez([{ id: 1 }], []), false);
    assert.equal(esPrimeraVez([], [{ id: 1 }]), false);
});

test('pideLogin: reconoce las tres formas en que la nube pide sesión', async () => {
    const { pideLogin } = await import(src('ramas/inicio/logica.js'));
    assert.equal(pideLogin({ necesitaLogin: true }), true);
    assert.equal(pideLogin(Object.assign(new Error('x'), { necesitaLogin: true })), true);
    // Así llega un rechazo de ipcRenderer.invoke: solo el mensaje sobrevive.
    assert.equal(pideLogin(new Error("Error invoking remote method 'plantillas:importarNube': Error: necesitaLogin")), true);
    assert.equal(pideLogin({ plantillas: 3, equipos: 0, partidos: 0 }), false);
    assert.equal(pideLogin(new Error('Sin conexión')), false);
    assert.equal(pideLogin(null), false);
});

test('estadoGlobal: poner, leer, alCambiar y dejar de escuchar', async () => {
    const { crearEstado } = await import(src('ui/estado.js'));
    const e = crearEstado();
    const vistos = [];
    const quitar = e.alCambiar((clave, valor, anterior) => vistos.push([clave, valor, anterior]));

    assert.equal(e.leer('grabando'), null);
    const rec = { desde: 1000 };
    e.poner('grabando', rec);
    assert.equal(e.leer('grabando'), rec);
    e.poner('grabando', rec);                 // mismo valor: no avisa de nuevo
    e.poner('grabando', null);
    assert.equal(e.leer('grabando'), null);
    assert.deepEqual(vistos, [['grabando', rec, null], ['grabando', null, rec]]);

    quitar();
    e.poner('tema', 'claro');
    assert.equal(vistos.length, 2, 'después de quitar() no llegan más avisos');
    assert.equal(e.leer('tema'), 'claro');
});

test('estadoGlobal: un oyente que falla no deja sin aviso a los demás', async () => {
    const { crearEstado } = await import(src('ui/estado.js'));
    const e = crearEstado();
    let llego = false;
    const errorOriginal = console.error;
    console.error = () => {};
    try {
        e.alCambiar(() => { throw new Error('roto'); });
        e.alCambiar(() => { llego = true; });
        e.poner('grabando', { desde: 1 });
    } finally { console.error = errorOriginal; }
    assert.equal(llego, true);
});

test('miniaturaSVG: la Principal a escala, sin emergentes ni otras pestañas', async () => {
    const { miniaturaSVG, resumenPlantilla } = await import(src('ui/plantillas.js'));
    const datos = {
        elements: [
            { id: 1, type: 'event', name: 'Gol', x: 100, y: 100, w: 120, h: 52, color: '#16a34a' },
            { id: 2, type: 'popup_label', name: 'Conv', x: 300, y: 100, w: 120, h: 52 },
            { id: 3, type: 'descriptor', name: 'Detalle', x: 900, y: 900, w: 120, h: 52, hoja: 'h1' },
            { id: 4, type: 'event', name: 'Malo', x: 0, y: 0, w: 10, h: 10, color: 'red;"><script>' }
        ],
        links: [], hojas: [{ id: 'h1', name: 'Detalle' }]
    };
    const svg = miniaturaSVG(datos);
    assert.match(svg, /^<svg /);
    assert.match(svg, /fill="#16a34a"/);
    assert.equal((svg.match(/<rect /g) || []).length, 2, 'solo los dos eventos de la Principal');
    assert.doesNotMatch(svg, /<script/, 'un color raro no se cuela en el SVG');
    assert.match(svg, /viewBox="0 0 244 176"/, 'recorta al contenido con 12 de margen');
    assert.equal(resumenPlantilla(datos), '3 botones · 1 pestaña');
    assert.match(miniaturaSVG(null), /stroke-dasharray/, 'plantilla vacía = recuadro punteado');
});

test('resumenImportacion: el texto del aviso', async () => {
    const { resumenImportacion } = await import(src('ui/plantillas.js'));
    assert.equal(resumenImportacion({ plantillas: 3, equipos: 2, partidos: 5 }), 'Importado: 3 plantillas, 2 equipos, 5 partidos');
    assert.equal(resumenImportacion({ plantillas: 1, equipos: 0, partidos: 1 }), 'Importado: 1 plantilla, 1 partido');
    assert.equal(resumenImportacion({ plantillas: 0, equipos: 0, partidos: 0 }), 'No había nada nuevo para importar.');
});
