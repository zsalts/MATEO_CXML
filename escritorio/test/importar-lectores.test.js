// Pruebas del lector de marcas de la rama Importar.
//   node --test escritorio/test/importar*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

import {
    detectarFormato, leerSportscode, leerSesionIpad, sesionesDeRespaldo,
    plantillaDesdeFilas, plantillaDeSesion, aplicarDesfase, eventosDesdeSportscode,
    resumir, clipsDeMuestra, decodificarTexto, segundos, nombreLimpio, ErrorLectura
} from '../src/ramas/importar/lectores.js';

const aca = path.dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(path.join(aca, 'fixtures', n), 'utf8');
const RAIZ = path.resolve(aca, '..', '..');

// ─────────────────────────────────────────────
// XML generado por la app del iPad, de verdad
// ─────────────────────────────────────────────
// Se sacan de app.js (sin tocarlo) las funciones que arman el XML y se corren
// en un sandbox con lo del navegador simulado. Si alguien cambia el formato
// en app.js, esta prueba lo agarra.
function xmlDeLaApp(eventos, elementos, titulo = 'Partido', inicio = new Date('2026-09-15T23:30:00Z')) {
    const fuente = readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
    const funcion = (nombre) => {
        const i = fuente.indexOf('function ' + nombre + '(');
        assert.ok(i >= 0, 'no encontré ' + nombre + ' en app.js');
        // Hasta la primera llave que cierra en la columna 0.
        const fin = fuente.indexOf('\n}', i);
        return fuente.slice(i, fin + 2);
    };
    const codigo = ['fechaSportscode', 'a16bits', 'rgbDeEvento', 'xmlEsc', 'defaultColor', 'coloresEquipos', 'exportCustomXML']
        .map(funcion).join('\n');
    const sandbox = {
        state: { elements: elementos },
        salida: null,
        customAlert: (m) => { throw new Error('customAlert: ' + m); },
        encolarArchivo: (nombre, xml) => { sandbox.salida = xml; },
        saveBlobToFiles: () => Promise.resolve(),
        blobUtf16: () => null
    };
    vm.createContext(sandbox);
    vm.runInContext(codigo + '\nexportCustomXML(__ev, __titulo, __inicio);',
        Object.assign(sandbox, { __ev: eventos, __titulo: titulo, __inicio: inicio }));
    return sandbox.salida;
}

const BOTONES = [
    { id: 11, type: 'event', name: 'Ataque', color: '#16a34a' },
    { id: 12, type: 'event', name: 'Corner & "penal"', color: '#f59e0b' },
    { id: 13, type: 'event', name: 'Sin color', color: null }
];
const EVENTOS_APP = [
    { buttonId: 11, name: 'Ataque', start: 10.5, end: 16.5, line: 'L1', descriptors: ['Derecha', 'Área <chica>'] },
    { buttonId: 12, name: 'Corner & "penal"', start: 3, end: 9, line: null, descriptors: [] },
    { buttonId: 11, name: 'Ataque', start: 200.25, end: 206.75, line: null, descriptors: ['Gol'] },
    { buttonId: 13, name: 'Sin color', start: 50, end: null, line: null, descriptors: [] },
    { posesionDe: 99, equipo: 'A', name: 'Posesión', start: 0, end: 40 }
];

test('ida y vuelta con el XML que exporta app.js: mismos eventos, etiquetas y colores', () => {
    const xml = xmlDeLaApp(EVENTOS_APP, BOTONES);
    assert.equal(detectarFormato(xml, 'Partido.xml'), 'sportscode');
    const r = leerSportscode(xml);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.eventos.length, 4, 'la posesión no va al XML');
    assert.deepEqual(r.eventos.map(e => [e.nombre, e.vInicio, e.vFin]), [
        ['Corner & "penal"', 3, 9],
        ['Ataque', 10.5, 16.5],
        ['Sin color', 50, 51],          // manual abierto: app.js le da 1 s
        ['Ataque', 200.25, 206.75]
    ]);
    assert.deepEqual(r.eventos[1].etiquetas, [
        { grupo: 'Linea', texto: 'L1' },
        { grupo: 'Etiqueta', texto: 'Derecha' },
        { grupo: 'Etiqueta', texto: 'Área <chica>' }
    ]);
    assert.deepEqual(r.eventos[3].etiquetas, [{ grupo: 'Etiqueta', texto: 'Gol' }]);
    assert.deepEqual(r.filas, [
        { nombre: 'Ataque', color: '#16a34a' },
        { nombre: 'Corner & "penal"', color: '#f59e0b' },
        { nombre: 'Sin color', color: '#3a8fd6' }
    ]);
    assert.equal(r.inicioReal, '2026-09-15T23:30:00.000Z');
});

test('el mismo XML en UTF-16 LE con BOM (como lo guarda el iPad)', () => {
    const xml = xmlDeLaApp(EVENTOS_APP, BOTONES);
    const bytes = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(xml, 'utf16le')]);
    const r = leerSportscode(new Uint8Array(bytes));
    assert.equal(r.eventos.length, 4);
    assert.equal(r.eventos[1].etiquetas[2].texto, 'Área <chica>');
    // Y si alguien lo decodificó como un byte por carácter: quedan ceros.
    const mal = new TextDecoder('windows-1252').decode(bytes);
    assert.equal(leerSportscode(mal).eventos.length, 4);
});

test('ida y vuelta con xmlSportscode del núcleo (Agente 4), si ya existe', async (t) => {
    const ruta = path.join(RAIZ, 'escritorio', 'src', 'nucleo', 'exportar.js');
    if (!existsSync(ruta)) { t.skip('src/nucleo/exportar.js todavía no existe'); return; }
    const { xmlSportscode } = await import(pathToFileURL(ruta).href);
    const plantilla = { elements: BOTONES, links: [], hojas: [] };
    const partido = {
        nombre: 'Prueba', inicioReal: '2026-09-15T23:30:00.000Z', duracion: 300,
        plantilla, local: null, visitante: null, origen: 'captura',
        eventos: EVENTOS_APP.filter(e => !e.posesionDe).map(e => ({
            nombre: e.name, botonId: String(e.buttonId), equipo: null, linea: e.line,
            inicio: e.start, fin: e.end, vInicio: e.start, vFin: e.end,
            etiquetas: [...(e.line ? [{ grupo: 'Linea', texto: e.line }] : []),
                        ...e.descriptors.map(d => ({ grupo: 'Etiqueta', texto: d }))]
        })),
        posesion: []
    };
    const r = leerSportscode(xmlSportscode(partido, plantilla));
    assert.equal(r.eventos.length, 4);
    const ataque = r.eventos.find(e => e.nombre === 'Ataque');
    assert.deepEqual([ataque.vInicio, ataque.vFin], [10.5, 16.5]);
    assert.deepEqual(r.filas.find(f => f.nombre === 'Ataque').color, '#16a34a');
});

test('fixture a mano con el formato de app.js: entidades y colores de 16 bits', () => {
    const r = leerSportscode(fixture('importar-app.xml'));
    assert.deepEqual(r.eventos.map(e => e.nombre), ['Corner', 'Ataque & contra', 'Corner']);
    assert.deepEqual(r.eventos[1].etiquetas[1], { grupo: 'Etiqueta', texto: 'Área <chica>' });
    assert.deepEqual(r.filas, [
        { nombre: 'Ataque & contra', color: '#3a8fd6' },
        { nombre: 'Corner', color: '#dc2626' }
    ]);
});

// ─────────────────────────────────────────────
// Archivos raros
// ─────────────────────────────────────────────
test('CDATA, entidades numéricas, mayúsculas, espacios, label sin group, varios text, coma decimal', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- exportado por Nacsport -->
<FILE>
  <ALL_INSTANCES>
    <Instance>
      <ID> 7 </ID>
      <START> 12,5 </START>
      <End>00:00:20.250</End>
      <CODE><![CDATA[Salida <rápida> & limpia]]></CODE>
      <label><text>Sin grupo</text></label>
      <LABEL><group>Jugador</group><text>N&#xBA; 5</text><text>N&#186; 8</text></LABEL>
      <label><group>Vacío</group><text></text><text/></label>
      <free_text>ojo acá</free_text>
      <pos_x>10</pos_x>
    </Instance>
  </ALL_INSTANCES>
  <ROWS><row><code>Salida &lt;rápida&gt; &amp; limpia</code><sort_order>1</sort_order><R>255</R><G>128</G><B>0</B></row></ROWS>
</FILE>`;
    const r = leerSportscode(xml);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.eventos.length, 1);
    const ev = r.eventos[0];
    assert.equal(ev.nombre, 'Salida <rápida> & limpia');
    assert.equal(ev.vInicio, 12.5);
    assert.equal(ev.vFin, 20.25);
    assert.deepEqual(ev.etiquetas, [
        { grupo: '', texto: 'Sin grupo' },
        { grupo: 'Jugador', texto: 'Nº 5' },
        { grupo: 'Jugador', texto: 'Nº 8' },
        { grupo: 'Nota', texto: 'ojo acá' }
    ]);
    // Todos los canales ≤ 255 → colores de 8 bits (LongoMatch).
    assert.deepEqual(r.filas, [{ nombre: 'Salida <rápida> & limpia', color: '#ff8000' }]);
});

test('BOM UTF-8 en texto y en bytes', () => {
    const xml = fixture('importar-app.xml');
    assert.equal(leerSportscode('﻿' + xml).eventos.length, 3);
    const bytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(xml, 'utf8')]);
    assert.equal(leerSportscode(new Uint8Array(bytes)).eventos.length, 3);
    assert.equal(detectarFormato(new Uint8Array(bytes), 'x.xml'), 'sportscode');
});

test('Windows-1252: con y sin declaración', () => {
    const xml = '<file><ALL_INSTANCES><instance><start>1</start><end>2</end><code>Presión alta</code>' +
                '<label><group>Zona</group><text>Área</text></label></instance></ALL_INSTANCES></file>';
    // Pasado a bytes de un solo byte: á = 0xE1, que no es UTF-8 válido.
    const bytes = Uint8Array.from([...xml].map(c => c.charCodeAt(0)));
    let r = leerSportscode(bytes);
    assert.equal(r.eventos[0].nombre, 'Presión alta');
    assert.equal(r.eventos[0].etiquetas[0].texto, 'Área');

    const conDecl = '<?xml version="1.0" encoding="windows-1252"?>\n' + xml.replace('alta', 'alta “€”');
    const tabla = { '“': 0x93, '”': 0x94, '€': 0x80 };
    const b2 = Uint8Array.from([...conDecl].map(c => tabla[c] || c.charCodeAt(0)));
    r = leerSportscode(b2);
    assert.equal(r.eventos[0].nombre, 'Presión alta “€”');
});

test('eventos rotos: se saltan y se avisa cuántos y en qué renglón', () => {
    const xml = [
        '<file><ALL_INSTANCES>',
        '<instance><start>10</start><end>5</end><code>Al revés</code></instance>',
        '<instance><start>1</start><end>3</end><code></code></instance>',
        '<instance><start/><end>3</end><code>Sin inicio</code></instance>',
        '<instance><start>abc</start><end>3</end><code>Letras</code></instance>',
        '<instance><start>2</start><code>Sin fin</code></instance>',
        '<instance><start>20</start><end>25</end><code>Bueno</code></instance>',
        '<instance><start>30</start><end>28</end><code>Al revés 2</code></instance>',
        '</ALL_INSTANCES></file>'
    ].join('\n');
    const r = leerSportscode(xml);
    assert.deepEqual(r.eventos.map(e => e.nombre), ['Bueno']);
    assert.equal(r.avisos.length, 1);
    const aviso = r.avisos[0];
    assert.match(aviso, /Se saltaron 6 eventos/);
    assert.match(aviso, /2 con el fin antes del inicio \(renglones 2, 8\)/);
    assert.match(aviso, /1 sin código \(renglón 3\)/);
    assert.match(aviso, /1 sin fin/);
});

test('XML mal formado: error claro con el renglón', () => {
    const xml = '<file>\n<ALL_INSTANCES>\n<instance>\n<start>1</start>\n<end>2</fin>\n</instance>\n</ALL_INSTANCES>\n</file>';
    assert.throws(() => leerSportscode(xml), (err) => {
        assert.ok(err instanceof ErrorLectura);
        assert.equal(err.renglon, 5);
        assert.match(err.message, /Se cierra <\/fin> pero correspondía cerrar <\/end>.*renglón 5/);
        return true;
    });
    assert.throws(() => leerSportscode('<file>\n<ALL_INSTANCES>\n<instance <start>1</start>'),/no se cierra con ">".*renglón 3/);
});

test('roto después de las marcas o cortado: se rescata lo leído, con aviso', () => {
    const base = fixture('importar-app.xml');
    const roto = base.replace('<R>14906</R>', '<R>14906</G>');
    let r = leerSportscode(roto);
    assert.equal(r.eventos.length, 3);
    assert.match(r.avisos[0], /roto a partir del renglón \d+/);

    const cortado = base.slice(0, base.indexOf('<instance>', base.indexOf('<ID>1</ID>') + 1) + 20);
    r = leerSportscode(cortado);
    assert.equal(r.eventos.length, 2);
    assert.match(r.avisos[0], /termina sin cerrar/);
});

test('lo que no es un XML de Sportscode', () => {
    assert.throws(() => leerSportscode(''), /vacío/);
    assert.throws(() => leerSportscode('Hola, esto es un txt'), /no es un XML/);
    assert.throws(() => leerSportscode('<plantilla><x/></plantilla>'), /falta <ALL_INSTANCES>/);
    const vacio = leerSportscode('<file><ALL_INSTANCES></ALL_INSTANCES></file>');
    assert.deepEqual(vacio.eventos, []);
    assert.match(vacio.avisos[0], /ninguna marca/);
});

// ─────────────────────────────────────────────
// iPad
// ─────────────────────────────────────────────
test('detectarFormato: los 4 casos', () => {
    assert.equal(detectarFormato(fixture('importar-app.xml'), 'a.xml'), 'sportscode');
    assert.equal(detectarFormato(fixture('importar-sesion.json'), 'Sesion.json'), 'ipad-sesion');
    assert.equal(detectarFormato(fixture('importar-respaldo.json'), 'TagView_copia.json'), 'ipad-respaldo');
    assert.equal(detectarFormato('{"app":"tagview","kind":"template","elements":[]}', 'p.json'), 'desconocido');
    assert.equal(detectarFormato('no es nada', 'x.txt'), 'desconocido');
    assert.equal(detectarFormato('{roto', 'x.json'), 'desconocido');
    // El array crudo de tv_sessions se trata como respaldo.
    assert.equal(detectarFormato(JSON.stringify([{ name: 'x', events: [] }]), 'x.json'), 'ipad-respaldo');
});

test('leerSesionIpad: PARTIDO sin video, reloj de partido + desfase', () => {
    const p = leerSesionIpad(JSON.parse(fixture('importar-sesion.json')), { desfase: 30 });
    assert.equal(p.nombre, 'LOMAS vs GEBA 15-09-2026 20h30');
    assert.equal(p.origen, 'importado');
    assert.equal(p.duracion, 70 * 60 + 5);
    assert.equal(p.videoRuta, null);
    assert.equal(p.eventos.length, 3, 'el roto y el de posesión no entran');
    assert.match(p.avisos[0], /saltó 1 evento roto/);
    const [a, c, g] = p.eventos;
    assert.deepEqual([a.nombre, a.inicio, a.fin, a.vInicio, a.vFin, a.linea], ['Ataque', 10.5, 16.5, 40.5, 46.5, 'L1']);
    assert.deepEqual(a.etiquetas, [{ grupo: 'Linea', texto: 'L1' }, { grupo: 'Etiqueta', texto: 'Derecha' }]);
    assert.equal(a.botonId, '1726000000001');
    assert.deepEqual([c.inicio, c.vInicio], [120, 150]);
    assert.deepEqual([g.fin, g.vFin], [901, 931], 'manual abierto: 1 s');
    assert.deepEqual(p.posesion, [{ equipo: 'A', inicio: 0, fin: 40 }]);
});

test('respaldo: lista de sesiones, plantilla que corresponde y equipo del botón', () => {
    const resp = JSON.parse(fixture('importar-respaldo.json'));
    const lista = sesionesDeRespaldo(resp);
    assert.deepEqual(lista, [
        { indice: 0, nombre: 'Partido A', fecha: '15/9/26, 20:30', eventos: 2 },
        { indice: 1, nombre: 'Partido B', fecha: '20/9/26, 18:00', eventos: 1 }
    ]);
    const sesion = resp.sessions[0];
    const pl = plantillaDeSesion(sesion, resp);
    assert.equal(pl.nombre, 'Hockey 5v5');
    assert.equal(pl.datos.elements.length, 2);
    const p = leerSesionIpad(sesion, { plantilla: pl.datos });
    assert.equal(p.plantilla, pl.datos);
    assert.equal(p.eventos[0].equipo, 'A');
    assert.equal(p.eventos[1].equipo, null);
    assert.equal(p.inicioReal, '2026-09-15T23:30:00.000Z');
    assert.deepEqual(p.posesion, [{ equipo: 'B', inicio: 3, fin: 30 }]);
    assert.equal(plantillaDeSesion({ events: [{ buttonId: 1 }] }, resp), null);
});

// ─────────────────────────────────────────────
// Plantilla, desfase y resumen
// ─────────────────────────────────────────────
test('plantillaDesdeFilas: un botón event por categoría, con su color', () => {
    const d = plantillaDesdeFilas([{ nombre: 'Ataque', color: '#16a34a' }, { nombre: 'Corner', color: null }]);
    assert.deepEqual(Object.keys(d).sort(), ['elements', 'hojas', 'links']);
    assert.equal(d.elements.length, 2);
    assert.deepEqual(d.elements.map(e => [e.type, e.name, e.color]), [
        ['event', 'Ataque', '#16a34a'], ['event', 'Corner', '#dc2626']
    ]);
    assert.notEqual(d.elements[0].id, d.elements[1].id);
    assert.deepEqual(plantillaDesdeFilas([]), { elements: [], links: [], hojas: [] });
});

test('recálculo por desfase, resumen y clips de muestra', () => {
    const eventos = eventosDesdeSportscode(leerSportscode(fixture('importar-app.xml')));
    assert.equal(eventos[1].linea, 'L1');
    const corrido = aplicarDesfase(eventos, 2.5);
    assert.deepEqual(corrido.map(e => [e.inicio, e.vInicio, e.vFin]), [[12.4, 14.9, 20.9], [30, 32.5, 39], [95.1, 97.6, 103.6]]);
    // Correr de ida y de vuelta no acumula error: siempre sale de `inicio`.
    assert.deepEqual(aplicarDesfase(aplicarDesfase(eventos, 0.1), 0).map(e => e.vInicio), [12.4, 30, 95.1]);
    assert.equal(aplicarDesfase(eventos, -20)[0].vInicio, 0, 'no hay tiempos negativos en el video');

    const r = resumir(eventos, 0, 100);
    assert.equal(r.eventos, 3);
    assert.deepEqual(r.categorias, [{ nombre: 'Corner', n: 2 }, { nombre: 'Ataque & contra', n: 1 }]);
    assert.equal(r.cortadosPorElFinal, 1);
    assert.equal(r.despuesDelVideo, 0);
    assert.equal(resumir(eventos, 10, 100).despuesDelVideo, 1);
    assert.equal(resumir(eventos, -20, 100).antesDelVideo, 1);

    const muchos = Array.from({ length: 9 }, (_, i) => ({ inicio: 90 - i * 10 }));
    assert.deepEqual(clipsDeMuestra(muchos).map(e => e.inicio), [10, 50, 90]);
    assert.equal(clipsDeMuestra(eventos.slice(0, 2)).length, 2);
});

test('utilidades: segundos, nombreLimpio, decodificarTexto', () => {
    assert.equal(segundos('12.40'), 12.4);
    assert.equal(segundos('12,4'), 12.4);
    assert.equal(segundos('1:02:03.5'), 3723.5);
    assert.ok(Number.isNaN(segundos('')));
    assert.ok(Number.isNaN(segundos('1.2.3')));
    assert.equal(nombreLimpio('LOMAS vs GEBA 15/09 20:30?'), 'LOMAS vs GEBA 15_09 20_30_');
    assert.equal(nombreLimpio('  ...  '), 'Partido');
    assert.equal(nombreLimpio('CON'), 'CON_');
    assert.equal(decodificarTexto(new Uint8Array([0xFE, 0xFF, 0, 0x41])), 'A');
});

test('xmlParaGuardar: corre los tiempos con el desfase y saca el encoding', async () => {
    const { xmlParaGuardar } = await import('../src/ramas/importar/lectores.js');
    const orig = '<?xml version="1.0" encoding="windows-1252"?>\n' + fixture('importar-app.xml');
    const igual = xmlParaGuardar(orig, 0);
    assert.ok(igual.startsWith('<?xml version="1.0"?>'));
    assert.equal(igual.slice(igual.indexOf('\n')), orig.slice(orig.indexOf('\n')));
    const corrido = xmlParaGuardar(orig, 2.5);
    const r = leerSportscode(corrido);
    assert.deepEqual(r.eventos.map(e => [e.vInicio, e.vFin]), [[14.9, 20.9], [32.5, 39], [97.6, 103.6]]);
    assert.match(corrido, /<start_time>2026-09-15 23:30:00 \+0000<\/start_time>/, 'lo de afuera no se toca');
    assert.deepEqual(r.filas, leerSportscode(orig).filas);
});

test('buscarDuplicados: mismo video, o mismo nombre y cantidad de eventos', async () => {
    const { buscarDuplicados } = await import('../src/ramas/importar/lectores.js');
    const base = [
        { id: 1, nombre: 'Lomas vs Geba', eventos: 40, video_ruta: 'C:\\Videos\\partido.mp4' },
        { id: 2, nombre: 'Otro', eventos: 3, video_ruta: null }
    ];
    assert.deepEqual(buscarDuplicados(base, { videoRuta: 'c:/videos/PARTIDO.mp4', nombre: 'x', eventos: 1 }).map(p => p.id), [1]);
    assert.deepEqual(buscarDuplicados(base, { videoRuta: null, nombre: ' lomas VS geba ', eventos: 40 }).map(p => p.id), [1]);
    assert.deepEqual(buscarDuplicados(base, { videoRuta: null, nombre: 'Lomas vs Geba', eventos: 41 }), []);
    assert.deepEqual(buscarDuplicados(base, { videoRuta: 'D:\\otro.mp4', nombre: 'Otro', eventos: 0 }), []);
});
