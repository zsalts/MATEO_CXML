// node --test test/plataforma-bd.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bd = require('../db');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tv-bd-'));

// Una base v1 como la que dejo la primera version de escritorio: sin
// user_version, con el esquema viejo y datos adentro.
async function armarBaseV1(ruta) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), f) });
    const d = new SQL.Database();
    d.exec(`
        CREATE TABLE partidos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, creado TEXT NOT NULL,
            inicio_real TEXT, duracion REAL, video_ruta TEXT, video_mime TEXT, video_bytes INTEGER,
            local TEXT, visitante TEXT, plantilla TEXT);
        CREATE TABLE eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
            orden INTEGER NOT NULL, nombre TEXT NOT NULL, boton_id TEXT, equipo TEXT, linea TEXT,
            inicio REAL NOT NULL, fin REAL, v_inicio REAL, v_fin REAL);
        CREATE TABLE etiquetas (id INTEGER PRIMARY KEY AUTOINCREMENT, evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
            grupo TEXT NOT NULL, texto TEXT NOT NULL);
        CREATE TABLE posesion (id INTEGER PRIMARY KEY AUTOINCREMENT, partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
            equipo TEXT, inicio REAL, fin REAL);
        CREATE INDEX ix_eventos_partido ON eventos(partido_id, orden);
        INSERT INTO partidos (nombre, creado, inicio_real, duracion, video_ruta, video_mime, video_bytes, local, visitante, plantilla)
            VALUES ('Viejo 1', '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z', 3600, 'C:\\v\\viejo.mp4', 'video/mp4', 1234, 'LOMAS', 'GEBA', '{"elements":[]}');
        INSERT INTO eventos (partido_id, orden, nombre, inicio, fin, v_inicio, v_fin) VALUES (1, 1, 'Tiro', 10, 15, 12, 17);
        INSERT INTO eventos (partido_id, orden, nombre, inicio, fin, v_inicio, v_fin) VALUES (1, 2, 'Gol', 20, 25, 22, 27);
        INSERT INTO etiquetas (evento_id, grupo, texto) VALUES (2, 'Etiqueta', 'Contra');
        INSERT INTO posesion (partido_id, equipo, inicio, fin) VALUES (1, 'A', 0, 30);
    `);
    fs.writeFileSync(ruta, Buffer.from(d.export()));
    d.close();
}

test('migra una base v1 sin perder nada y deja la copia antes-v2', async () => {
    const dir = tmp();
    const ruta = path.join(dir, 'tagview.sqlite');
    await armarBaseV1(ruta);
    const antes = fs.readFileSync(ruta);

    await bd.abrir(ruta);
    const copia = path.join(dir, 'tagview.antes-v2.sqlite');
    assert.ok(fs.existsSync(copia), 'falta la copia de seguridad');
    assert.ok(antes.equals(fs.readFileSync(copia)), 'la copia no es la base original');

    assert.strictEqual(bd._filas('PRAGMA user_version')[0].user_version, 2);
    const p = bd.leerPartido(1);
    assert.strictEqual(p.nombre, 'Viejo 1');
    assert.strictEqual(p.video_ruta, 'C:\\v\\viejo.mp4');
    assert.strictEqual(p.eventos.length, 2);
    assert.deepStrictEqual(p.eventos[1].etiquetas, [{ grupo: 'Etiqueta', texto: 'Contra' }]);
    assert.strictEqual(p.posesion.length, 1);
    // Columnas nuevas, vacias
    assert.ok('xml_ruta' in p && 'origen' in p && 'desfase' in p && 'plantilla_id' in p);
    // Tablas nuevas
    const tablas = bd._filas("SELECT name FROM sqlite_master WHERE type='table'").map(t => t.name);
    ['plantillas', 'equipos', 'playlists', 'playlist_items'].forEach(t => assert.ok(tablas.includes(t), 'falta ' + t));
    const indices = bd._filas("SELECT name FROM sqlite_master WHERE type='index'").map(t => t.name);
    ['ix_eventos_partido', 'ix_eventos_nombre', 'ix_etiquetas_grupo', 'ix_partidos_creado'].forEach(i => assert.ok(indices.includes(i), 'falta ' + i));

    // Cerrar y abrir de nuevo: ya no migra (no hay una segunda copia)
    bd.cerrar();
    await bd.abrir(ruta);
    assert.deepStrictEqual(fs.readdirSync(dir).filter(n => n.startsWith('tagview.antes')), ['tagview.antes-v2.sqlite']);
    assert.strictEqual(bd.leerPartido(1).eventos.length, 2);
    bd.cerrar();
});

test('base nueva: se crea en v2 sin copias', async () => {
    const dir = tmp();
    const ruta = path.join(dir, 'tagview.sqlite');
    await bd.abrir(ruta);
    assert.strictEqual(bd._filas('PRAGMA user_version')[0].user_version, 2);
    assert.ok(fs.existsSync(ruta));
    assert.deepStrictEqual(fs.readdirSync(dir).filter(n => n.includes('antes')), []);
    bd.cerrar();
});

test('una base de una version mas nueva no se toca', async () => {
    const dir = tmp();
    const ruta = path.join(dir, 'tagview.sqlite');
    await bd.abrir(ruta);
    bd._filas('PRAGMA user_version = 9');
    bd.cerrar();
    await assert.rejects(bd.abrir(ruta), /mas nueva/);
});

function partidoDePrueba(extra = {}) {
    return {
        nombre: 'LOMAS vs GEBA 15-09-2026 20h30',
        inicioReal: '2026-09-15T23:30:00.000Z',
        duracion: 4200,
        videoRuta: 'C:\\Partidos\\p.mp4', videoMime: 'video/mp4', videoBytes: 999,
        xmlRuta: 'C:\\Partidos\\p.xml',
        local: 'LOMAS', visitante: 'GEBA',
        plantilla: { elements: [], links: [], hojas: [] },
        origen: 'captura', desfase: 1.5,
        eventos: [
            { nombre: 'Tiro', botonId: 'e1', equipo: 'A', linea: 'Linea 1', inicio: 10, fin: 15, vInicio: 11.5, vFin: 16.5,
              etiquetas: [{ grupo: 'Etiqueta', texto: 'Contra' }, { grupo: 'Resultado', texto: 'Atajado' }] },
            { nombre: 'Gol', botonId: 'e2', equipo: 'A', inicio: 30, fin: 40, vInicio: 31.5, vFin: 41.5,
              etiquetas: [{ grupo: 'Etiqueta', texto: 'Corner' }, { grupo: 'Resultado', texto: 'Gol' }] },
            { nombre: 'Tiro', botonId: 'e1', equipo: 'B', inicio: 50, fin: 55, vInicio: 51.5, vFin: 56.5,
              etiquetas: [{ grupo: 'Etiqueta', texto: 'Contra' }, { grupo: 'Resultado', texto: 'Gol' }] }
        ],
        posesion: [{ equipo: 'A', inicio: 0, fin: 20 }, { equipo: 'B', inicio: 20, fin: 60 }],
        ...extra
    };
}

test('partidos: guardar, leer con xml_ruta, actualizar y borrar', async () => {
    const dir = tmp();
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
    const id = bd.guardarPartido(partidoDePrueba());
    const p = bd.leerPartido(id);
    assert.strictEqual(p.xml_ruta, 'C:\\Partidos\\p.xml');
    assert.strictEqual(p.video_ruta, 'C:\\Partidos\\p.mp4');
    assert.strictEqual(p.origen, 'captura');
    assert.strictEqual(p.desfase, 1.5);
    assert.strictEqual(p.eventos.length, 3);
    assert.ok(p.eventos.every(e => typeof e.id === 'number'));
    assert.strictEqual(p.eventos[0].v_inicio, 11.5);
    assert.deepStrictEqual(p.eventos[0].etiquetas, [{ grupo: 'Etiqueta', texto: 'Contra' }, { grupo: 'Resultado', texto: 'Atajado' }]);
    assert.strictEqual(p.posesion.length, 2);

    const lista = bd.listarPartidos();
    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].eventos, 3);
    assert.strictEqual(lista[0].xml_ruta, 'C:\\Partidos\\p.xml');
    assert.strictEqual(lista[0].origen, 'captura');

    bd.actualizarPartido(id, { xml_ruta: 'D:\\otro.xml', desfase: -2, nombre: 'Nuevo nombre', inventado: 'x' });
    const q = bd.leerPartido(id);
    assert.strictEqual(q.xml_ruta, 'D:\\otro.xml');
    assert.strictEqual(q.desfase, -2);
    assert.strictEqual(q.nombre, 'Nuevo nombre');
    assert.throws(() => bd.actualizarPartido(id, { nombre: '' }), /nombre/);

    // Re-guardar con los ids conserva los eventos (y sus playlists)
    const plId = bd.guardarPlaylist({ nombre: 'Goles', items: [{ evento_id: q.eventos[1].id, nota: 'bueno' }] });
    const reGuardar = { ...partidoDePrueba(), id, eventos: q.eventos.map(e => ({ ...e, vInicio: e.v_inicio + 1, vFin: e.v_fin + 1 })) };
    bd.guardarPartido(reGuardar);
    assert.strictEqual(bd.leerPlaylist(plId).items.length, 1);
    assert.strictEqual(bd.leerPartido(id).eventos[1].v_inicio, 32.5);

    // Filtros de listar
    bd.guardarPartido(partidoDePrueba({ nombre: 'Sin video', videoRuta: null, origen: 'ipad-importado', local: 'SIC', visitante: 'CASI', inicioReal: '2026-08-01T10:00:00Z' }));
    assert.strictEqual(bd.listarPartidos({ conVideo: true }).length, 1);
    assert.strictEqual(bd.listarPartidos({ conVideo: false })[0].nombre, 'Sin video');
    assert.strictEqual(bd.listarPartidos({ origen: 'ipad-importado' }).length, 1);
    assert.strictEqual(bd.listarPartidos({ equipo: 'casi' }).length, 1);
    assert.strictEqual(bd.listarPartidos({ texto: 'geba' }).length, 1);
    assert.strictEqual(bd.listarPartidos({ desde: '2026-09-01' }).length, 1);
    assert.strictEqual(bd.listarPartidos({ hasta: '2026-08-01' }).length, 1);
    assert.strictEqual(bd.listarPartidos({ desde: '2026-08-01', hasta: '2026-09-15' }).length, 2);

    bd.borrarPartido(id);
    assert.strictEqual(bd.leerPartido(id), null);
    assert.strictEqual(bd._filas('SELECT COUNT(*) n FROM eventos WHERE partido_id=?', [id])[0].n, 0);
    assert.strictEqual(bd._filas('SELECT COUNT(*) n FROM etiquetas')[0].n, 6);   // las del otro partido
    assert.strictEqual(bd.leerPlaylist(plId).items.length, 0);
    bd.cerrar();
});

test('eventos: agregar, actualizar, borrar (sale de las playlists) y actualizarVarios', async () => {
    const dir = tmp();
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
    const pid = bd.guardarPartido(partidoDePrueba());
    const nuevo = bd.agregarEvento(pid, { nombre: 'Corner', inicio: 70, fin: 75, vInicio: 71, vFin: 76, etiquetas: [{ grupo: 'Etiqueta', texto: 'Corto' }] });
    let p = bd.leerPartido(pid);
    assert.strictEqual(p.eventos.length, 4);
    assert.strictEqual(p.eventos[3].id, nuevo);
    assert.strictEqual(p.eventos[3].orden, 4);

    bd.actualizarEvento(nuevo, { nombre: 'Corner largo', v_inicio: 80, etiquetas: [{ grupo: 'Etiqueta', texto: 'Largo' }] });
    p = bd.leerPartido(pid);
    assert.strictEqual(p.eventos[3].nombre, 'Corner largo');
    assert.strictEqual(p.eventos[3].v_inicio, 80);
    assert.strictEqual(p.eventos[3].v_fin, 76);
    assert.deepStrictEqual(p.eventos[3].etiquetas, [{ grupo: 'Etiqueta', texto: 'Largo' }]);

    const pl = bd.guardarPlaylist({ nombre: 'Corners', items: [{ evento_id: nuevo }, { evento_id: p.eventos[0].id, nota: 'x' }] });
    bd.borrarEvento(nuevo);
    assert.strictEqual(bd._filas('SELECT COUNT(*) n FROM etiquetas WHERE evento_id=?', [nuevo])[0].n, 0);
    const items = bd.leerPlaylist(pl).items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].nota, 'x');

    // actualizarVarios: todos o ninguno, una sola escritura
    const ids = bd.leerPartido(pid).eventos.map(e => e.id);
    const n = bd.actualizarVarios(ids.map((id, i) => ({ id, v_inicio: 100 + i, v_fin: 110 + i })));
    assert.strictEqual(n, 3);
    assert.deepStrictEqual(bd.leerPartido(pid).eventos.map(e => e.v_inicio), [100, 101, 102]);
    assert.throws(() => bd.actualizarVarios([{ id: ids[0], v_inicio: 1 }, { v_inicio: 2 }]), /id/);
    assert.strictEqual(bd.leerPartido(pid).eventos[0].v_inicio, 100, 'no tenia que cambiar nada');
    bd.cerrar();
});

test('buscar: filtros combinados, Y entre grupos, O dentro del grupo', async () => {
    const dir = tmp();
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
    const a = bd.guardarPartido(partidoDePrueba());
    const b = bd.guardarPartido(partidoDePrueba({ nombre: 'SIC vs CASI', local: 'SIC', visitante: 'CASI' }));

    assert.strictEqual(bd.buscarEventos({}).length, 6);
    assert.strictEqual(bd.buscarEventos({ nombres: ['Tiro'] }).length, 4);
    assert.strictEqual(bd.buscarEventos({ nombres: ['Tiro'], partidos: [a] }).length, 2);
    // O dentro de Resultado
    assert.strictEqual(bd.buscarEventos({ etiquetas: [{ grupo: 'Resultado', texto: 'Gol' }, { grupo: 'Resultado', texto: 'Atajado' }] }).length, 6);
    // Y entre Etiqueta y Resultado
    const r = bd.buscarEventos({ etiquetas: [{ grupo: 'Etiqueta', texto: 'Contra' }, { grupo: 'Resultado', texto: 'Gol' }] });
    assert.strictEqual(r.length, 2);
    assert.ok(r.every(e => e.nombre === 'Tiro' && e.equipo === 'B'));
    assert.ok(r[0].partido_nombre && r[0].video_ruta);
    assert.strictEqual(r[0].etiquetas.length, 2);
    // Todo junto
    const t = bd.buscarEventos({ nombres: ['Tiro', 'Gol'], etiquetas: [{ grupo: 'Resultado', texto: 'Gol' }], partidos: [b], texto: 'corner' });
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].nombre, 'Gol');
    assert.strictEqual(t[0].partido_id, b);
    // Equipo: por el nombre del local cuando el evento dice "A"
    assert.strictEqual(bd.buscarEventos({ equipo: 'SIC' }).length, 2);
    assert.strictEqual(bd.buscarEventos({ equipo: 'casi' }).length, 1);
    assert.strictEqual(bd.buscarEventos({ equipo: 'B' }).length, 2);
    // Parametrizado de verdad: una comilla no rompe nada
    assert.strictEqual(bd.buscarEventos({ texto: "'; DROP TABLE eventos; --" }).length, 0);
    assert.strictEqual(bd.buscarEventos({ nombres: ["x') OR 1=1 --"] }).length, 0);
    assert.strictEqual(bd.buscarEventos({}).length, 6);
    bd.cerrar();
});

test('buscar: menos de 100 ms con 50 partidos x 800 eventos', async () => {
    const dir = tmp();
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
    const nombres = ['Tiro', 'Gol', 'Corner', 'Falta', 'Salida', 'Recupero', 'Perdida', 'Penal'];
    const grupos = { Etiqueta: ['Contra', 'Corner', 'Posicional', 'Rebote'], Resultado: ['Gol', 'Atajado', 'Afuera', 'Bloqueado'], Linea: ['Linea 1', 'Linea 2', 'Linea 3'] };
    const ids = [];
    for (let p = 0; p < 50; p++) {
        const eventos = [];
        for (let i = 0; i < 800; i++) {
            eventos.push({
                nombre: nombres[(i * 7 + p) % nombres.length], equipo: i % 2 ? 'A' : 'B',
                inicio: i * 5, fin: i * 5 + 4, vInicio: i * 5, vFin: i * 5 + 4,
                etiquetas: [
                    { grupo: 'Etiqueta', texto: grupos.Etiqueta[(i + p) % 4] },
                    { grupo: 'Resultado', texto: grupos.Resultado[(i * 3) % 4] },
                    { grupo: 'Linea', texto: grupos.Linea[i % 3] }
                ]
            });
        }
        ids.push(bd.guardarPartido({ nombre: `Partido ${p}`, local: `Local ${p % 5}`, visitante: `Visita ${p % 7}`, eventos }));
    }
    assert.strictEqual(bd._filas('SELECT COUNT(*) n FROM eventos')[0].n, 40000);

    const consultas = [
        { nombres: ['Tiro', 'Gol'], etiquetas: [{ grupo: 'Resultado', texto: 'Gol' }, { grupo: 'Etiqueta', texto: 'Contra' }] },
        { etiquetas: [{ grupo: 'Linea', texto: 'Linea 1' }, { grupo: 'Resultado', texto: 'Gol' }, { grupo: 'Resultado', texto: 'Atajado' }], equipo: 'Local 2' },
        { nombres: ['Penal'], partidos: ids.slice(0, 10) },
        { texto: 'Rebote', nombres: ['Gol'] }
    ];
    bd.buscarEventos(consultas[0]);   // calentar
    for (const f of consultas) {
        const t0 = process.hrtime.bigint();
        const r = bd.buscarEventos(f);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        console.log(`  buscar ${JSON.stringify(f).slice(0, 70)}… → ${r.length} eventos en ${ms.toFixed(1)} ms`);
        assert.ok(ms < 100, `tardo ${ms.toFixed(1)} ms`);
        assert.ok(r.length > 0);
    }
    bd.cerrar();
});

test('playlists: guardar, leer, listar y cascada al borrar', async () => {
    const dir = tmp();
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
    const pid = bd.guardarPartido(partidoDePrueba());
    const evs = bd.leerPartido(pid).eventos;
    const pl = bd.guardarPlaylist({ nombre: 'Lo mejor', items: [{ evento_id: evs[2].id, nota: 'primero' }, { evento_id: evs[0].id }, { evento_id: 99999 }] });
    let l = bd.leerPlaylist(pl);
    assert.strictEqual(l.items.length, 2, 'el evento inexistente no entra');
    assert.deepStrictEqual(l.items.map(i => i.evento_id), [evs[2].id, evs[0].id]);
    assert.strictEqual(l.items[0].nota, 'primero');
    assert.strictEqual(l.items[0].partido_nombre, 'LOMAS vs GEBA 15-09-2026 20h30');
    assert.strictEqual(l.items[0].etiquetas.length, 2);
    assert.strictEqual(bd.listarPlaylists()[0].items, 2);

    bd.guardarPlaylist({ id: pl, nombre: 'Renombrada', items: [{ evento_id: evs[1].id }] });
    l = bd.leerPlaylist(pl);
    assert.strictEqual(l.nombre, 'Renombrada');
    assert.strictEqual(l.items.length, 1);

    bd.borrarPlaylist(pl);
    assert.strictEqual(bd.leerPlaylist(pl), null);
    assert.strictEqual(bd._filas('SELECT COUNT(*) n FROM playlist_items')[0].n, 0);
    // Borrar el partido vacia las playlists que lo usaban
    const pl2 = bd.guardarPlaylist({ nombre: 'Otra', items: evs.map(e => ({ evento_id: e.id })) });
    bd.borrarPartido(pid);
    assert.strictEqual(bd.leerPlaylist(pl2).items.length, 0);
    bd.cerrar();
});

test('plantillas y equipos', async () => {
    const dir = tmp();
    await bd.abrir(path.join(dir, 'tagview.sqlite'));
    const datos = { elements: [{ id: 'e1', type: 'event', name: 'Tiro', atajo: 'q' }], links: [], hojas: [] };
    const id = bd.guardarPlantilla({ nombre: 'Hockey', datos });
    const t = bd.leerPlantilla(id);
    assert.deepStrictEqual(t.datos, datos);
    assert.strictEqual(bd.listarPlantillas()[0].origen, 'local');
    bd.guardarPlantilla({ id, nombre: 'Hockey 2', datos: JSON.stringify({ ...datos, extra: 1 }) });
    assert.strictEqual(bd.leerPlantilla(id).nombre, 'Hockey 2');
    assert.deepStrictEqual(Object.keys(bd.leerPlantilla(id).datos), ['elements', 'links', 'hojas']);
    bd.borrarPlantilla(id);
    assert.strictEqual(bd.leerPlantilla(id), null);

    const e = bd.guardarEquipo({ nombre: 'LOMAS', color: '#00f' });
    assert.strictEqual(bd.guardarEquipo({ nombre: 'lomas', color: '#f00' }), e, 'mismo nombre = mismo equipo');
    assert.strictEqual(bd.listarEquipos()[0].color, '#f00');
    const g = bd.guardarEquipo({ nombre: 'GEBA' });
    assert.throws(() => bd.guardarEquipo({ id: g, nombre: 'LOMAS' }), /Ya hay/);
    bd.borrarEquipo(e);
    assert.deepStrictEqual(bd.listarEquipos().map(x => x.nombre), ['GEBA']);
    bd.cerrar();
});

test('persistir: agrupa escrituras y escribe atomico', async () => {
    const dir = tmp();
    const ruta = path.join(dir, 'tagview.sqlite');
    await bd.abrir(ruta);
    const antes = fs.statSync(ruta).mtimeMs;
    const tam0 = fs.statSync(ruta).size;
    for (let i = 0; i < 50; i++) bd.guardarEquipo({ nombre: 'Equipo ' + i });
    // Todavia no se escribio (la escritura espera 500 ms)
    assert.strictEqual(fs.statSync(ruta).size, tam0);
    await new Promise(r => setTimeout(r, 700));
    assert.ok(fs.statSync(ruta).mtimeMs >= antes);
    assert.ok(!fs.existsSync(ruta + '.tmp'));
    bd.guardarEquipo({ nombre: 'Ultimo' });
    bd.cerrar();                      // al cerrar se escribe siempre
    await bd.abrir(ruta);
    assert.strictEqual(bd.listarEquipos().length, 51);
    bd.cerrar();
});
