// Pruebas de la lógica pura de la rama Base de datos.
//   node --test escritorio/test/base*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/ramas/base/logica.js';

// Una botonera del iPad chiquita: dos eventos, un descriptor, equipos.
const DATOS = {
    elements: [
        { id: 111, type: 'event', name: 'Tiro', color: '#ff0000', x: 200, y: 0, w: 100, h: 50 },
        { id: 222, type: 'event', name: 'Córner', color: null, x: 0, y: 0, w: 100, h: 50 },
        { id: 333, type: 'descriptor', name: 'Gol', x: 0, y: 100, w: 100, h: 50, atajo: 'g' },
        { id: 444, type: 'possession', name: 'Posesión', x: 0, y: 200, w: 200, h: 50 },
        { id: 555, type: 'teams', colorA: '#00ff00', colorB: '#0000ff', x: 0, y: 300, w: 300, h: 50 },
        { id: 666, type: 'event', name: 'Falta', x: 0, y: 0, w: 100, h: 50, hoja: 'h2', atajo: 'G' }
    ],
    links: [],
    hojas: [{ id: 'h2', name: 'Defensa' }]
};

const ev = (id, nombre, vi, vf, extra = {}) =>
    ({ id, nombre, inicio: vi, fin: vf, v_inicio: vi, v_fin: vf, etiquetas: [], ...extra });

const EVENTOS = [
    ev(1, 'Tiro', 10, 14, { boton_id: '111', equipo: 'A', etiquetas: [{ grupo: 'Resultado', texto: 'Gol' }, { grupo: 'Zona', texto: 'Área' }] }),
    ev(2, 'Tiro', 50, 52, { boton_id: '111', equipo: 'B', etiquetas: [{ grupo: 'Resultado', texto: 'Afuera' }] }),
    ev(3, 'Córner', 30, 35, { boton_id: '222', equipo: 'A', etiquetas: [{ grupo: 'Zona', texto: 'Área' }] }),
    ev(4, 'Falta', 5, 6, { equipo: 'B', linea: 'Línea 1' }),
    ev(5, 'Tiro', 70, 71, { boton_id: '111', equipo: 'A', etiquetas: [{ grupo: 'Resultado', texto: 'Atajado' }] })
];

test('formatoTiempo y parsearTiempo van y vuelven', () => {
    assert.equal(L.formatoTiempo(0), '0:00');
    assert.equal(L.formatoTiempo(65), '1:05');
    assert.equal(L.formatoTiempo(3723), '1:02:03');
    assert.equal(L.formatoTiempo(62.54, { decimas: true }), '1:02.5');
    assert.equal(L.parsearTiempo('1:02:03'), 3723);
    assert.equal(L.parsearTiempo('1:02,5'), 62.5);
    assert.equal(L.parsearTiempo('90'), 90);
    assert.equal(L.parsearTiempo('a:b'), null);
    assert.equal(L.parsearTiempo(''), null);
});

test('nombreLimpio y subcarpeta del partido', () => {
    assert.equal(L.nombreLimpio('LOMAS vs GEBA: 15/09 20h30?'), 'LOMAS vs GEBA_ 15_09 20h30_');
    assert.equal(L.nombreLimpio('  Partido. '), 'Partido');
    assert.equal(L.nombreLimpio(''), 'Partido');
    assert.equal(L.subcarpetaDePartido({ nombre: 'A vs B', video_ruta: 'C:\\V\\Partidos\\A vs B (2)\\A vs B (2).mp4' }), 'Partidos/A vs B (2)');
    assert.equal(L.subcarpetaDePartido({ nombre: 'A/B', video_ruta: 'D:\\otro\\x.mp4' }), 'Partidos/A_B');
    assert.equal(L.nombreBaseDePartido({ nombre: 'X', video_ruta: 'C:\\P\\A vs B (2).mp4' }), 'A vs B (2)');
    assert.equal(L.nombreBaseDePartido({ nombre: 'X', xml_ruta: 'C:/P/Final.v2.xml' }), 'Final.v2');
    assert.equal(L.nombreBaseDePartido({ nombre: 'A: B' }), 'A_ B');
});

test('color del evento: por id, por nombre, por defecto y por equipo', () => {
    assert.equal(L.colorDeEvento(DATOS, { nombre: 'Tiro', boton_id: '111' }), '#ff0000');
    assert.equal(L.colorDeEvento(DATOS, { nombre: 'Tiro' }), '#ff0000');           // por nombre
    assert.equal(L.colorDeEvento(DATOS, { nombre: 'Córner', boton_id: 222 }), '#3a8fd6'); // color por defecto
    assert.equal(L.colorDeEvento(DATOS, { nombre: 'Posesión', boton_id: 444, equipo: 'B' }), '#0000ff');
    assert.equal(L.colorDeEvento(L.datosDePlantilla('{roto'), { nombre: 'X' }), '#3a8fd6');
    assert.equal(L.textoSobre('#fef08a'), '#000');
    assert.equal(L.textoSobre('#1c1c1e'), '#fff');
});

test('filtro: O dentro del grupo, Y entre grupos', () => {
    const ids = f => L.filtrarEventos(EVENTOS, { ...L.filtroVacio(), ...f }).map(e => e.id);
    assert.deepEqual(ids({}), [1, 2, 3, 4, 5]);
    assert.deepEqual(ids({ categorias: ['Tiro', 'Córner'] }), [1, 2, 3, 5]);
    // Dos textos del mismo grupo: O
    assert.deepEqual(ids({ etiquetas: [{ grupo: 'Resultado', texto: 'Gol' }, { grupo: 'Resultado', texto: 'Atajado' }] }), [1, 5]);
    // Dos grupos: Y
    assert.deepEqual(ids({ etiquetas: [{ grupo: 'Resultado', texto: 'Gol' }, { grupo: 'Zona', texto: 'Área' }] }), [1]);
    assert.deepEqual(ids({ etiquetas: [{ grupo: 'Zona', texto: 'Área' }], categorias: ['Córner'] }), [3]);
    assert.deepEqual(ids({ equipos: ['B'] }), [2, 4]);
    assert.deepEqual(ids({ categorias: ['Tiro'], equipos: ['A'] }), [1, 5]);
    // Texto sin importar tildes ni mayúsculas, en nombre, línea y etiquetas
    assert.deepEqual(ids({ texto: 'corner' }), [3]);
    assert.deepEqual(ids({ texto: 'linea' }), [4]);
    assert.deepEqual(ids({ texto: 'tiro afuera' }), [2]);
    assert.equal(L.filtroActivo(L.filtroVacio()), false);
    assert.equal(L.filtroActivo({ texto: '  ' }), false);
    assert.equal(L.filtroActivo({ equipos: ['A'] }), true);
});

test('opciones del filtro con conteos y en el orden de la botonera', () => {
    const o = L.opcionesDeFiltro(EVENTOS, L.ordenDePlantilla(DATOS));
    assert.deepEqual(o.categorias.map(c => c.nombre + c.n), ['Córner1', 'Tiro3', 'Falta1']);
    assert.deepEqual(o.etiquetas.map(e => e.grupo + ':' + e.texto + e.n),
        ['Resultado:Afuera1', 'Resultado:Atajado1', 'Resultado:Gol1', 'Zona:Área2']);
    assert.deepEqual(o.equipos.map(e => e.equipo + e.n), ['A3', 'B2']);
});

test('orden de la plantilla: hoja principal primero, de arriba abajo y de izquierda a derecha', () => {
    assert.deepEqual(L.ordenDePlantilla(DATOS), ['Córner', 'Tiro', 'Falta']);
    assert.deepEqual(L.ordenarCategorias(['Zeta', 'Tiro', 'Alfa', 'Córner'], ['Córner', 'Tiro']),
        ['Córner', 'Tiro', 'Alfa', 'Zeta']);
});

test('agrupar para la matriz: filas en orden, barras por tiempo, con desfase si falta v_inicio', () => {
    const conDesfase = [...EVENTOS, { id: 9, nombre: 'Falta', inicio: 100, fin: 102, etiquetas: [] }];
    const filas = L.agruparMatriz(conDesfase, { datos: DATOS, desfase: 20 });
    assert.deepEqual(filas.map(f => f.nombre), ['Córner', 'Tiro', 'Falta']);
    assert.deepEqual(filas[1].barras.map(b => b.ev.id), [1, 2, 5]);
    assert.equal(filas[1].color, '#ff0000');
    const falta = filas[2].barras.find(b => b.ev.id === 9);
    assert.deepEqual([falta.desde, falta.hasta], [120, 122]);
    // Barras que tocan un instante, con tolerancia
    assert.deepEqual(L.barrasEn(filas[1], 12, 0).map(b => b.ev.id), [1]);
    assert.deepEqual(L.barrasEn(filas[1], 14.5, 1).map(b => b.ev.id), [1]);
    assert.deepEqual(L.barrasEn(filas[1], 40, 0), []);
});

test('matriz fluida: 800 eventos en 2 h se agrupan rápido', () => {
    const muchos = Array.from({ length: 800 }, (_, i) =>
        ev(i + 1, ['Tiro', 'Córner', 'Falta', 'Saque', 'Lateral'][i % 5], i * 9, i * 9 + 6));
    const t0 = performance.now();
    const filas = L.agruparMatriz(muchos, { datos: DATOS });
    const ms = performance.now() - t0;
    assert.equal(filas.reduce((n, f) => n + f.barras.length, 0), 800);
    assert.ok(ms < 100, `tardó ${ms} ms`);
});

test('regla y zoom', () => {
    assert.equal(L.pasoDeRegla(10), 10);
    assert.equal(L.pasoDeRegla(0.1), 900);
    const z = L.zoomEn({ pxPorSeg: 10, scroll: 100 }, 2, 50);   // bajo el mouse: segundo 15
    assert.equal(z.pxPorSeg, 20);
    assert.equal((z.scroll + 50) / z.pxPorSeg, 15);
    assert.equal(L.zoomEn({ pxPorSeg: 10, scroll: 0 }, 0.001, 0).pxPorSeg, 0.05);
});

test('estadísticas: categoría × etiqueta, por equipo y posesión', () => {
    const est = L.estadisticas(EVENTOS, {
        orden: L.ordenDePlantilla(DATOS),
        posesion: [{ equipo: 'A', inicio: 0, fin: 30 }, { equipo: 'B', inicio: 30, fin: 40 }, { equipo: 'A', inicio: 40, fin: 50 }]
    });
    assert.equal(est.total, 5);
    const tiro = est.filas.find(f => f.nombre === 'Tiro');
    assert.equal(tiro.total, 3);
    assert.equal(tiro.porEtiqueta['Resultado: Gol'], 1);
    assert.equal(tiro.porEtiqueta['Zona: Área'], 1);
    assert.deepEqual(tiro.porEquipo, { A: 2, B: 1 });
    assert.equal(tiro.duracion, 7);
    assert.deepEqual(est.posesion, [
        { equipo: 'A', segundos: 40, porcentaje: 80 },
        { equipo: 'B', segundos: 10, porcentaje: 20 }
    ]);
    const csv = L.csvEstadisticas(est, { local: 'LOMAS', visitante: 'GEBA' });
    const lineas = csv.trim().split('\r\n');
    assert.equal(lineas[0], 'Categoría;Total;Duración (s);LOMAS;GEBA;Resultado: Afuera;Resultado: Atajado;Resultado: Gol;Zona: Área');
    assert.ok(lineas.includes('Tiro;3;7,00;2;1;1;1;1;1'));
    assert.ok(lineas.includes('LOMAS;40,00;80,00'));
});

test('CSV de eventos escapa separadores y comillas', () => {
    const csv = L.csvEventos([ev(1, 'Tiro; "raro"', 1, 2)], { nombre: 'P' });
    assert.ok(csv.split('\r\n')[1].startsWith('P;"Tiro; ""raro""";'));
});

test('cola de reproducción: margen, sin video afuera, mezclando archivos', () => {
    const eventos = [
        { ...ev(1, 'Tiro', 10, 14), video_ruta: 'a.mp4', partido_nombre: 'P1' },
        { ...ev(2, 'Tiro', 1, 2), video_ruta: null },
        { ...ev(3, 'Córner', 1, 1), video_ruta: 'b.mp4', partido_nombre: 'P2' }
    ];
    const { items, sinVideo } = L.armarCola(eventos, { margen: 3 });
    assert.equal(sinVideo, 1);
    assert.deepEqual(items.map(i => [i.ruta, i.desde, i.hasta]), [['a.mp4', 7, 17], ['b.mp4', 0, 4]]);
    assert.equal(items[0].titulo, 'Tiro · P1');
    assert.equal(L.pasoCola(items, 0, 1), 1);
    assert.equal(L.pasoCola(items, 1, 1), -1);
    assert.equal(L.pasoCola(items, 0, -1), -1);
    // Cortes agrupados por archivo, numerados en el orden de la lista
    const cortes = L.cortesPorVideo([...items, { ...items[0], desde: 30.123, hasta: 31 }]);
    assert.deepEqual(cortes.map(c => [c.ruta, c.cortes.map(x => x.nombre)]),
        [['a.mp4', ['1 Tiro · P1', '3 Tiro · P1']], ['b.mp4', ['2 Córner · P2']]]);
    assert.equal(cortes[0].cortes[1].desde, 30.12);
});

test('selección con clic, Ctrl y Shift', () => {
    const ids = [1, 2, 3, 4, 5];
    let r = L.seleccionar(new Set(), ids, 2);
    assert.deepEqual([...r.seleccion], [2]);
    r = L.seleccionar(r.seleccion, ids, 4, { shift: true, ancla: r.ancla });
    assert.deepEqual([...r.seleccion].sort(), [2, 3, 4]);
    r = L.seleccionar(r.seleccion, ids, 3, { ctrl: true, ancla: r.ancla });
    assert.deepEqual([...r.seleccion].sort(), [2, 4]);
    r = L.seleccionar(r.seleccion, ids, 1, { shift: true, ctrl: true, ancla: 3 });
    assert.deepEqual([...r.seleccion].sort(), [1, 2, 3, 4]);
    r = L.seleccionar(r.seleccion, ids, 5);
    assert.deepEqual([...r.seleccion], [5]);
});

test('mover para reordenar la playlist', () => {
    assert.deepEqual(L.mover(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(L.mover(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(L.mover(['a', 'b'], 5, 0), ['a', 'b']);
});

test('historial de deshacer con cambio de id', () => {
    const h = L.crearHistorial(2);
    h.apilar({ id: 1 }); h.apilar({ id: 2 }); h.apilar({ id: 3 });
    assert.equal(h.largo, 2);
    h.cambiarId(3, 30);
    assert.equal(h.sacar().id, 30);
    assert.equal(h.sacar().id, 2);
    assert.equal(h.sacar(), null);
});

test('plantillas: botones, atajos repetidos y cambiar un atajo', () => {
    const botones = L.botonesDePlantilla(DATOS);
    assert.deepEqual(botones.map(b => b.nombre), ['Tiro', 'Córner', 'Gol', 'Posesión', 'Falta']);
    assert.equal(botones.find(b => b.nombre === 'Falta').hoja, 'Defensa');
    const rep = L.atajosRepetidos(DATOS);
    assert.deepEqual(rep.get('g'), [333, 666]);
    const d2 = L.conAtajo(DATOS, 666, 'F');
    assert.equal(d2.elements.find(e => e.id === 666).atajo, 'f');
    assert.equal(DATOS.elements.find(e => e.id === 666).atajo, 'G');   // no toca el original
    assert.equal(L.atajosRepetidos(d2).size, 0);
    const d3 = L.conAtajo(d2, 333, '');
    assert.equal('atajo' in d3.elements.find(e => e.id === 333), false);
    assert.equal(L.atajoValido('q'), true);
    assert.equal(L.atajoValido('F5'), true);
    assert.equal(L.atajoValido(' '), false);
    assert.equal(L.atajoValido('ArrowLeft'), false);
});

test('miniatura de respaldo: solo la hoja principal, dentro del recuadro', () => {
    const r = L.rectangulosMiniatura(DATOS, 150, 100);
    assert.equal(r.length, 5);
    r.forEach(x => {
        assert.ok(x.x >= 0 && x.y >= 0);
        assert.ok(x.x + x.w <= 150.001 && x.y + x.h <= 100.001);
    });
    assert.deepEqual(L.rectangulosMiniatura({ elements: [] }, 10, 10), []);
});

test('partido de la base al formato del contrato', () => {
    const p = L.partidoAContrato({
        id: 7, nombre: 'P', inicio_real: '2026-09-01T20:00:00Z', video_ruta: 'v.mp4', xml_ruta: 'x.xml',
        plantilla: { elements: [] }, desfase: 2,
        posesion: [{ id: 1, partido_id: 7, equipo: 'A', inicio: 0, fin: 3 }]
    }, [ev(1, 'Tiro', 10, 12, { boton_id: '111', etiquetas: [{ id: 5, evento_id: 1, grupo: 'G', texto: 'T' }] })]);
    assert.equal(p.videoRuta, 'v.mp4');
    assert.equal(p.xmlRuta, 'x.xml');
    assert.equal(p.plantilla, '{"elements":[]}');
    assert.deepEqual(p.eventos[0], { nombre: 'Tiro', botonId: '111', equipo: null, linea: null,
        inicio: 10, fin: 12, vInicio: 10, vFin: 12, etiquetas: [{ grupo: 'G', texto: 'T' }] });
    assert.deepEqual(p.posesion, [{ equipo: 'A', inicio: 0, fin: 3 }]);
});

test('el XML lleva tiempos de video, no de reloj de partido', () => {
    const p = { id: 1, nombre: 'P', desfase: 5, plantilla: null };
    const x = L.partidoParaXml(p, [
        { id: 1, nombre: 'Tiro', inicio: 10, fin: 12, v_inicio: 40.123, v_fin: 43, etiquetas: [] },
        { id: 2, nombre: 'Sin video', inicio: 20, fin: 21, etiquetas: [] }
    ]);
    assert.deepEqual(x.eventos.map(e => [e.inicio, e.fin]), [[40.12, 43], [25, 26]]);
});

test('filtrar y ordenar partidos', () => {
    const P = [
        { id: 1, nombre: 'Lomas vs GEBA', local: 'Lomas', visitante: 'GEBA', creado: '2026-09-01T12:00:00', video_ruta: 'a', origen: 'captura', duracion: 100 },
        { id: 2, nombre: 'San Isidro vs Lomas', local: 'San Isidro', visitante: 'Lomas', creado: '2026-09-10T12:00:00', video_ruta: null, origen: 'ipad-vivo', duracion: 50 },
        { id: 3, nombre: 'Náutico', local: 'Náutico', visitante: 'X', creado: '2026-08-01T12:00:00', video_ruta: 'b', origen: 'importado', duracion: null }
    ];
    const ids = f => L.filtrarPartidos(P, f).map(p => p.id);
    assert.deepEqual(ids({ texto: 'lomas' }), [1, 2]);
    assert.deepEqual(ids({ texto: 'nautico' }), [3]);
    assert.deepEqual(ids({ equipo: 'Lomas' }), [1, 2]);
    assert.deepEqual(ids({ desde: '2026-09-01', hasta: '2026-09-05' }), [1]);
    assert.deepEqual(ids({ conVideo: false }), [2]);
    assert.deepEqual(ids({ conVideo: true, origen: 'importado' }), [3]);
    assert.deepEqual(L.ordenarPartidos(P).map(p => p.id), [2, 1, 3]);
    assert.deepEqual(L.ordenarPartidos(P, 'duracion', true).map(p => p.id), [2, 1, 3]);
    assert.deepEqual(L.ordenarPartidos(P, 'duracion', false).map(p => p.id), [1, 2, 3]);   // vacío al final
});
