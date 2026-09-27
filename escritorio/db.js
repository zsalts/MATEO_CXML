// Base de datos local: un archivo tagview.sqlite en la carpeta de trabajo.
//
// Usa sql.js — SQLite compilado a WebAssembly — y no un modulo nativo a
// proposito: el archivo que queda en el disco es un SQLite de verdad, que se
// abre con DB Browser o con cualquier cosa que lea .sqlite, pero instalarlo no
// pide compilador ni herramientas de build en la maquina.
//
// La base vive en memoria y se escribe entera al disco. Con 50 partidos de
// 800 eventos pesa unos pocos MB: escribirla cuesta milisegundos, pero no en
// cada toque de la botonera. Por eso las escrituras se agrupan (a lo sumo una
// cada 500 ms) y al cerrar se escribe siempre.
//
// Versiones del esquema (PRAGMA user_version):
//   v1  partidos, eventos, etiquetas, posesion — la base de la primera version
//       de escritorio, que no marcaba version (user_version = 0 con tablas).
//   v2  plantillas, equipos, playlists; partidos suma plantilla_id, origen,
//       desfase, xml_ruta y huella; indices para buscar.
// Antes de migrar una base que ya tiene datos se deja una copia
// tagview.antes-vN.sqlite al lado: si algo sale mal, lo del usuario sigue ahi.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 2;
const DEMORA_PERSISTIR = 500;

const ESQUEMA_V1 = `
CREATE TABLE IF NOT EXISTS partidos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL,
    creado        TEXT    NOT NULL,   -- ISO, cuando se guardo
    inicio_real   TEXT,               -- ISO del primer PLAY
    duracion      REAL,               -- segundos de reloj de partido
    video_ruta    TEXT,               -- archivo de video, si se grabo
    video_mime    TEXT,
    video_bytes   INTEGER,
    local         TEXT,
    visitante     TEXT,
    plantilla     TEXT                -- JSON de la botonera con la que se codifico
);

CREATE TABLE IF NOT EXISTS eventos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    partido_id    INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    orden         INTEGER NOT NULL,   -- cronologico, 1..n
    nombre        TEXT    NOT NULL,   -- el <code> del XML
    boton_id      TEXT,
    equipo        TEXT,
    linea         TEXT,
    inicio        REAL    NOT NULL,   -- reloj del partido, segundos
    fin           REAL,
    v_inicio      REAL,               -- segundos dentro del archivo de video
    v_fin         REAL
);

CREATE TABLE IF NOT EXISTS etiquetas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id     INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    grupo         TEXT    NOT NULL,
    texto         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS posesion (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    partido_id    INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    equipo        TEXT,
    inicio        REAL,
    fin           REAL
);

CREATE INDEX IF NOT EXISTS ix_eventos_partido ON eventos(partido_id, orden);
CREATE INDEX IF NOT EXISTS ix_etiquetas_evento ON etiquetas(evento_id);
CREATE INDEX IF NOT EXISTS ix_posesion_partido ON posesion(partido_id);
`;

const ESQUEMA_V2 = `
CREATE TABLE IF NOT EXISTS plantillas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL,
    datos         TEXT    NOT NULL,   -- JSON {elements, links, hojas}, igual que el iPad
    origen        TEXT,               -- 'local' | 'ipad' | 'nube'
    huella        TEXT,               -- sha1 de los datos normalizados: no reimportar
    creado        TEXT    NOT NULL,
    actualizado   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS equipos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL UNIQUE,
    color         TEXT
);

CREATE TABLE IF NOT EXISTS playlists (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL,
    creado        TEXT    NOT NULL,
    actualizado   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id   INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    evento_id     INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    orden         INTEGER NOT NULL,
    nota          TEXT
);

ALTER TABLE partidos ADD COLUMN plantilla_id INTEGER;
ALTER TABLE partidos ADD COLUMN origen       TEXT;
ALTER TABLE partidos ADD COLUMN desfase      REAL;
ALTER TABLE partidos ADD COLUMN xml_ruta     TEXT;
ALTER TABLE partidos ADD COLUMN huella       TEXT;

CREATE INDEX IF NOT EXISTS ix_eventos_nombre     ON eventos(nombre);
CREATE INDEX IF NOT EXISTS ix_etiquetas_grupo    ON etiquetas(grupo, texto, evento_id);
CREATE INDEX IF NOT EXISTS ix_partidos_creado    ON partidos(creado);
CREATE INDEX IF NOT EXISTS ix_partidos_huella    ON partidos(huella);
CREATE INDEX IF NOT EXISTS ix_plantillas_huella  ON plantillas(huella);
CREATE INDEX IF NOT EXISTS ix_playlist_items     ON playlist_items(playlist_id, orden);
CREATE INDEX IF NOT EXISTS ix_playlist_evento    ON playlist_items(evento_id);
`;

// En orden: MIGRACIONES[n] lleva de la version n a la n+1.
const MIGRACIONES = [
    ESQUEMA_V1,
    ESQUEMA_V2
];

let SQL = null;
let db = null;
let rutaDB = null;
let temporizador = null;
let pendiente = false;

// ─────────────────────────────────────────────
// ABRIR, MIGRAR, PERSISTIR
// ─────────────────────────────────────────────
async function cargarSqlJs() {
    if (SQL) return SQL;
    const initSqlJs = require('sql.js');
    // El .wasm viaja dentro de node_modules; en la app empaquetada queda en
    // app.asar y sql.js lo lee con fs, que sabe leer de ahi adentro.
    let dist;
    try {
        dist = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    } catch (_) {
        dist = path.join(path.dirname(require.resolve('sql.js')), '..', 'dist');
    }
    SQL = await initSqlJs({ locateFile: f => path.join(dist, f) });
    return SQL;
}

async function abrir(ruta) {
    await cargarSqlJs();

    // Cambiar de carpeta cambia de base: la que estaba abierta se cierra
    // (escribiendo lo pendiente).
    if (db && rutaDB !== ruta) cerrar();
    if (db) return db;

    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const existia = fs.existsSync(ruta) && fs.statSync(ruta).size > 0;
    db = existia ? new SQL.Database(fs.readFileSync(ruta)) : new SQL.Database();
    rutaDB = ruta;
    activarClaves();

    try {
        migrar(existia);
    } catch (err) {
        // Una migracion a medias no se guarda: el archivo del disco queda como
        // estaba y la copia antes-vN tambien.
        db.close(); db = null; rutaDB = null;
        throw err;
    }
    return db;
}

// sql.js cierra y reabre la base en cada export(): el PRAGMA se pierde y hay
// que volver a ponerlo despues de cada persistencia.
function activarClaves() {
    db.run('PRAGMA foreign_keys = ON;');
}

function versionActual() {
    let v = unaFila('PRAGMA user_version').user_version || 0;
    // La primera version de escritorio no marcaba version: si hay tablas,
    // es una v1.
    if (v === 0 && unaFila("SELECT name FROM sqlite_master WHERE type='table' AND name='partidos'")) v = 1;
    return v;
}

function migrar(existia) {
    let v = versionActual();
    if (v > VERSION) {
        throw new Error(`La base es de una version mas nueva de la app (v${v}). Actualiza Tag & View Pro.`);
    }
    if (v === VERSION) {
        db.run(`PRAGMA user_version = ${VERSION}`);
        return;
    }

    for (; v < VERSION; v++) {
        const destino = v + 1;
        if (existia && v >= 1) copiaAntesDe(destino);
        db.run('BEGIN');
        try {
            db.exec(MIGRACIONES[v]);
            db.run(`PRAGMA user_version = ${destino}`);
            db.run('COMMIT');
        } catch (err) {
            db.run('ROLLBACK');
            throw new Error(`No se pudo actualizar la base a v${destino}: ${err.message}`);
        }
    }
    persistirYa();
}

// La copia se saca del archivo tal como esta en el disco, antes de tocarlo.
function copiaAntesDe(version) {
    let copia = path.join(path.dirname(rutaDB), `tagview.antes-v${version}.sqlite`);
    if (fs.existsSync(copia)) {
        const sello = new Date().toISOString().replace(/[:.]/g, '-');
        copia = path.join(path.dirname(rutaDB), `tagview.antes-v${version}.${sello}.sqlite`);
    }
    fs.copyFileSync(rutaDB, copia);
    return copia;
}

// Pide una escritura. Si ya hay una en espera, se suma a esa: cien eventos
// marcados en un segundo son una sola escritura.
function persistir() {
    pendiente = true;
    if (temporizador) return;
    temporizador = setTimeout(() => {
        temporizador = null;
        if (pendiente) persistirYa();
    }, DEMORA_PERSISTIR);
    // No tener la app viva solo por esto (importa en las pruebas).
    if (temporizador.unref) temporizador.unref();
}

function persistirYa() {
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    pendiente = false;
    if (!db || !rutaDB) return;
    // Escritura atomica: si se corta la luz en la mitad, el .sqlite viejo sigue
    // entero y no queda una base a medio escribir.
    const datos = Buffer.from(db.export());
    activarClaves();
    const tmp = rutaDB + '.tmp';
    fs.writeFileSync(tmp, datos);
    fs.renameSync(tmp, rutaDB);
}

function cerrar() {
    if (!db) return;
    try { persistirYa(); } finally {
        db.close(); db = null; rutaDB = null;
    }
}

function abierta() { return !!db; }
function ruta() { return rutaDB; }

// ─────────────────────────────────────────────
// AYUDANTES
// ─────────────────────────────────────────────
function filas(sql, params) {
    const st = db.prepare(sql);
    try {
        if (params) st.bind(params);
        const out = [];
        while (st.step()) out.push(st.getAsObject());
        return out;
    } finally {
        st.free();
    }
}

function unaFila(sql, params) {
    const r = filas(sql, params);
    return r.length ? r[0] : null;
}

function ultimoId() {
    return unaFila('SELECT last_insert_rowid() AS id').id;
}

// Todo lo que escribe pasa por aca: una transaccion y una persistencia.
function transaccion(fn) {
    if (!db) throw new Error('La base no esta abierta');
    db.run('BEGIN');
    let r;
    try {
        r = fn();
        db.run('COMMIT');
    } catch (err) {
        try { db.run('ROLLBACK'); } catch (_) {}
        throw err;
    }
    persistir();
    return r;
}

const ahora = () => new Date().toISOString();
const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
const txt = (v) => (v === null || v === undefined || v === '') ? null : String(v);
const pick = (o, ...claves) => { for (const k of claves) if (o && o[k] !== undefined) return o[k]; return undefined; };

function comoJSON(v) {
    if (v === null || v === undefined) return null;
    return typeof v === 'string' ? v : JSON.stringify(v);
}

// JSON con las claves ordenadas: dos plantillas iguales dan el mismo texto
// aunque el iPad haya guardado las claves en otro orden.
function jsonEstable(v) {
    if (Array.isArray(v)) return '[' + v.map(jsonEstable).join(',') + ']';
    if (v && typeof v === 'object') {
        return '{' + Object.keys(v).sort()
            .filter(k => v[k] !== undefined)
            .map(k => JSON.stringify(k) + ':' + jsonEstable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
}

function huella(v) {
    return crypto.createHash('sha1').update(jsonEstable(v)).digest('hex');
}

// Una plantilla es exactamente {elements, links, hojas}; lo demas no cuenta
// para decidir si dos son la misma.
function datosNormalizados(d) {
    if (typeof d === 'string') d = JSON.parse(d);
    d = d || {};
    return { elements: d.elements || [], links: d.links || [], hojas: d.hojas || [] };
}

function huellaPlantilla(datos) { return huella(datosNormalizados(datos)); }

// ─────────────────────────────────────────────
// PARTIDOS
// ─────────────────────────────────────────────
function insertarEvento(partidoId, ev, orden) {
    db.run(`INSERT INTO eventos
                (partido_id, orden, nombre, boton_id, equipo, linea,
                 inicio, fin, v_inicio, v_fin)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [partidoId, orden, String(ev.nombre ?? ''), txt(pick(ev, 'botonId', 'boton_id')),
         txt(ev.equipo), txt(ev.linea), num(ev.inicio) ?? 0, num(ev.fin),
         num(pick(ev, 'vInicio', 'v_inicio')), num(pick(ev, 'vFin', 'v_fin'))]);
    const id = ultimoId();
    ponerEtiquetas(id, ev.etiquetas);
    return id;
}

function ponerEtiquetas(eventoId, etiquetas) {
    db.run('DELETE FROM etiquetas WHERE evento_id=?', [eventoId]);
    (etiquetas || []).forEach(et => {
        if (!et) return;
        const texto = typeof et === 'string' ? et : et.texto;
        if (texto === undefined || texto === null || texto === '') return;
        db.run('INSERT INTO etiquetas (evento_id, grupo, texto) VALUES (?,?,?)',
            [eventoId, (typeof et === 'object' && et.grupo) || 'Etiqueta', String(texto)]);
    });
}

// Borrar eventos a mano (y no solo por la cascada) porque las bases v1 se
// pudieron haber creado sin claves foraneas activas.
function borrarEventos(ids) {
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 500) {
        const tramo = ids.slice(i, i + 500);
        const q = tramo.map(() => '?').join(',');
        db.run(`DELETE FROM playlist_items WHERE evento_id IN (${q})`, tramo);
        db.run(`DELETE FROM etiquetas WHERE evento_id IN (${q})`, tramo);
        db.run(`DELETE FROM eventos WHERE id IN (${q})`, tramo);
    }
}

// Guarda (o reemplaza) un partido entero. `p.id` presente = sobrescribe ese.
//
// Al sobrescribir, los eventos que vienen con `id` de este partido se
// actualizan en su lugar en vez de borrarse y crearse de nuevo: asi no se
// caen de las playlists que los usan.
function guardarPartido(p) {
    if (!p || typeof p !== 'object') throw new Error('Partido invalido');
    if (!p.nombre || !String(p.nombre).trim()) throw new Error('El partido necesita un nombre');

    return transaccion(() => {
        const cols = {
            nombre:       String(p.nombre).trim(),
            inicio_real:  txt(pick(p, 'inicioReal', 'inicio_real')),
            duracion:     num(p.duracion) ?? 0,
            video_ruta:   txt(pick(p, 'videoRuta', 'video_ruta')),
            video_mime:   txt(pick(p, 'videoMime', 'video_mime')),
            video_bytes:  num(pick(p, 'videoBytes', 'video_bytes')),
            local:        txt(p.local),
            visitante:    txt(p.visitante),
            plantilla:    comoJSON(p.plantilla),
            plantilla_id: num(pick(p, 'plantillaId', 'plantilla_id')),
            origen:       txt(p.origen) || 'captura',
            desfase:      num(p.desfase) ?? 0,
            xml_ruta:     txt(pick(p, 'xmlRuta', 'xml_ruta')),
            huella:       txt(p.huella)
        };
        const nombres = Object.keys(cols);

        let id = num(p.id);
        if (id && !unaFila('SELECT id FROM partidos WHERE id=?', [id])) {
            throw new Error(`No existe el partido ${id}`);
        }

        if (id) {
            db.run(`UPDATE partidos SET ${nombres.map(n => n + '=?').join(', ')} WHERE id=?`,
                [...nombres.map(n => cols[n]), id]);
            db.run('DELETE FROM posesion WHERE partido_id=?', [id]);
        } else {
            db.run(`INSERT INTO partidos (creado, ${nombres.join(', ')})
                    VALUES (?, ${nombres.map(() => '?').join(', ')})`,
                [ahora(), ...nombres.map(n => cols[n])]);
            id = ultimoId();
        }

        const previos = new Set(filas('SELECT id FROM eventos WHERE partido_id=?', [id]).map(r => r.id));
        const conservados = new Set();
        (p.eventos || []).forEach((ev, i) => {
            const evId = num(ev.id);
            if (evId && previos.has(evId) && !conservados.has(evId)) {
                actualizarEventoFila(evId, ev, i + 1);
                conservados.add(evId);
            } else {
                insertarEvento(id, ev, i + 1);
            }
        });
        borrarEventos([...previos].filter(x => !conservados.has(x)));

        (p.posesion || []).forEach(t => {
            db.run('INSERT INTO posesion (partido_id, equipo, inicio, fin) VALUES (?,?,?,?)',
                [id, txt(t.equipo), num(t.inicio), num(t.fin)]);
        });
        return id;
    });
}

function actualizarEventoFila(id, ev, orden) {
    db.run(`UPDATE eventos SET orden=?, nombre=?, boton_id=?, equipo=?, linea=?,
                inicio=?, fin=?, v_inicio=?, v_fin=? WHERE id=?`,
        [orden, String(ev.nombre ?? ''), txt(pick(ev, 'botonId', 'boton_id')), txt(ev.equipo),
         txt(ev.linea), num(ev.inicio) ?? 0, num(ev.fin),
         num(pick(ev, 'vInicio', 'v_inicio')), num(pick(ev, 'vFin', 'v_fin')), id]);
    ponerEtiquetas(id, ev.etiquetas);
}

// filtro = {texto?, equipo?, desde?, hasta?, conVideo?, origen?}
// desde/hasta comparan contra la fecha del partido (primer PLAY, o cuando se
// guardo si no hay PLAY); pueden ser 'AAAA-MM-DD' o ISO completo.
function listarPartidos(filtro) {
    const f = filtro || {};
    const donde = [], params = [];
    const fecha = 'COALESCE(p.inicio_real, p.creado)';
    if (f.texto) {
        const t = '%' + String(f.texto).trim() + '%';
        donde.push('(p.nombre LIKE ? OR p.local LIKE ? OR p.visitante LIKE ?)');
        params.push(t, t, t);
    }
    if (f.equipo) {
        donde.push('(p.local = ? COLLATE NOCASE OR p.visitante = ? COLLATE NOCASE)');
        params.push(String(f.equipo), String(f.equipo));
    }
    if (f.desde) { donde.push(`${fecha} >= ?`); params.push(String(f.desde)); }
    if (f.hasta) {
        // "hasta 2026-09-26" incluye todo ese dia.
        const h = /^\d{4}-\d{2}-\d{2}$/.test(String(f.hasta)) ? f.hasta + 'T99' : String(f.hasta);
        donde.push(`${fecha} <= ?`); params.push(h);
    }
    if (f.conVideo === true)  donde.push("(p.video_ruta IS NOT NULL AND p.video_ruta <> '')");
    if (f.conVideo === false) donde.push("(p.video_ruta IS NULL OR p.video_ruta = '')");
    if (f.origen) {
        const o = Array.isArray(f.origen) ? f.origen : [f.origen];
        donde.push(`p.origen IN (${o.map(() => '?').join(',')})`); params.push(...o.map(String));
    }
    return filas(`
        SELECT p.id, p.nombre, p.creado, p.inicio_real, p.duracion, p.video_ruta,
               p.video_mime, p.xml_ruta, p.local, p.visitante, p.origen, p.desfase,
               p.plantilla_id,
               (SELECT COUNT(*) FROM eventos e WHERE e.partido_id = p.id) AS eventos
        FROM partidos p
        ${donde.length ? 'WHERE ' + donde.join(' AND ') : ''}
        ORDER BY ${fecha} DESC, p.id DESC`, params);
}

function etiquetasDe(eventoIdsSql, params) {
    const porEvento = new Map();
    filas(`SELECT evento_id, grupo, texto FROM etiquetas
           WHERE evento_id IN (${eventoIdsSql}) ORDER BY id`, params)
        .forEach(et => {
            if (!porEvento.has(et.evento_id)) porEvento.set(et.evento_id, []);
            porEvento.get(et.evento_id).push({ grupo: et.grupo, texto: et.texto });
        });
    return porEvento;
}

function leerPartido(id) {
    const p = unaFila('SELECT * FROM partidos WHERE id=?', [num(id)]);
    if (!p) return null;
    const eventos = filas('SELECT * FROM eventos WHERE partido_id=? ORDER BY orden, id', [p.id]);
    const porEvento = etiquetasDe('SELECT id FROM eventos WHERE partido_id=?', [p.id]);
    eventos.forEach(e => { e.etiquetas = porEvento.get(e.id) || []; });
    p.eventos = eventos;
    p.posesion = filas('SELECT * FROM posesion WHERE partido_id=? ORDER BY inicio', [p.id]);
    return p;
}

const CAMPOS_PARTIDO = {
    nombre: 'nombre', local: 'local', visitante: 'visitante',
    video_ruta: 'video_ruta', videoRuta: 'video_ruta',
    xml_ruta: 'xml_ruta', xmlRuta: 'xml_ruta',
    desfase: 'desfase', video_mime: 'video_mime', videoMime: 'video_mime',
    video_bytes: 'video_bytes', videoBytes: 'video_bytes',
    duracion: 'duracion', plantilla_id: 'plantilla_id', plantillaId: 'plantilla_id',
    origen: 'origen', inicio_real: 'inicio_real', inicioReal: 'inicio_real'
};
const NUMERICOS = new Set(['desfase', 'video_bytes', 'duracion', 'plantilla_id']);

function actualizarPartido(id, cambios) {
    id = num(id);
    if (!unaFila('SELECT id FROM partidos WHERE id=?', [id])) throw new Error(`No existe el partido ${id}`);
    const sets = [], params = [];
    const vistos = new Set();
    Object.keys(cambios || {}).forEach(k => {
        const col = CAMPOS_PARTIDO[k];
        if (!col || vistos.has(col)) return;
        vistos.add(col);
        let v = cambios[k];
        if (col === 'nombre') {
            if (!v || !String(v).trim()) throw new Error('El partido necesita un nombre');
            v = String(v).trim();
        } else {
            v = NUMERICOS.has(col) ? num(v) : txt(v);
        }
        sets.push(col + '=?'); params.push(v);
    });
    if (!sets.length) return leerPartidoCorto(id);
    transaccion(() => db.run(`UPDATE partidos SET ${sets.join(', ')} WHERE id=?`, [...params, id]));
    return leerPartidoCorto(id);
}

function leerPartidoCorto(id) {
    return unaFila(`SELECT id, nombre, creado, duracion, video_ruta, xml_ruta, local,
                           visitante, origen, desfase, plantilla_id FROM partidos WHERE id=?`, [id]);
}

function borrarPartido(id) {
    id = num(id);
    transaccion(() => {
        borrarEventos(filas('SELECT id FROM eventos WHERE partido_id=?', [id]).map(r => r.id));
        db.run('DELETE FROM posesion WHERE partido_id=?', [id]);
        db.run('DELETE FROM partidos WHERE id=?', [id]);
    });
    return true;
}

function partidoPorHuella(h) {
    return h ? unaFila('SELECT id FROM partidos WHERE huella=?', [h]) : null;
}

// ─────────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────────
function agregarEvento(partidoId, ev) {
    partidoId = num(partidoId);
    if (!unaFila('SELECT id FROM partidos WHERE id=?', [partidoId])) throw new Error(`No existe el partido ${partidoId}`);
    if (!ev || !ev.nombre) throw new Error('El evento necesita un nombre');
    return transaccion(() => {
        const orden = (unaFila('SELECT MAX(orden) AS m FROM eventos WHERE partido_id=?', [partidoId]).m || 0) + 1;
        return insertarEvento(partidoId, ev, orden);
    });
}

const CAMPOS_EVENTO = {
    nombre: 'nombre', v_inicio: 'v_inicio', vInicio: 'v_inicio', v_fin: 'v_fin', vFin: 'v_fin',
    inicio: 'inicio', fin: 'fin', equipo: 'equipo', linea: 'linea',
    boton_id: 'boton_id', botonId: 'boton_id'
};
const EVENTO_NUM = new Set(['v_inicio', 'v_fin', 'inicio', 'fin']);

function actualizarEventoSinTx(id, cambios) {
    const sets = [], params = [];
    const vistos = new Set();
    Object.keys(cambios || {}).forEach(k => {
        const col = CAMPOS_EVENTO[k];
        if (!col || vistos.has(col)) return;
        vistos.add(col);
        let v = cambios[k];
        if (col === 'nombre') {
            if (!v) throw new Error('El evento necesita un nombre');
            v = String(v);
        } else if (col === 'inicio') {
            v = num(v) ?? 0;
        } else {
            v = EVENTO_NUM.has(col) ? num(v) : txt(v);
        }
        sets.push(col + '=?'); params.push(v);
    });
    if (sets.length) db.run(`UPDATE eventos SET ${sets.join(', ')} WHERE id=?`, [...params, id]);
    if (Array.isArray(cambios && cambios.etiquetas)) ponerEtiquetas(id, cambios.etiquetas);
}

function actualizarEvento(id, cambios) {
    id = num(id);
    if (!unaFila('SELECT id FROM eventos WHERE id=?', [id])) throw new Error(`No existe el evento ${id}`);
    transaccion(() => actualizarEventoSinTx(id, cambios));
    return true;
}

// Cientos de eventos de una (re-sincronizar un video): una transaccion y una
// sola escritura al disco. Si uno falla, no cambia ninguno.
function actualizarVarios(lista) {
    if (!Array.isArray(lista)) throw new Error('actualizarVarios espera una lista');
    return transaccion(() => {
        const st = db.prepare('UPDATE eventos SET v_inicio=?, v_fin=? WHERE id=?');
        let n = 0;
        try {
            lista.forEach(c => {
                const id = num(c && c.id);
                if (!id) throw new Error('Falta el id de un evento');
                const vi = num(pick(c, 'v_inicio', 'vInicio'));
                const vf = num(pick(c, 'v_fin', 'vFin'));
                st.run([vi, vf, id]);
                n += db.getRowsModified();
            });
        } finally {
            st.free();
        }
        return n;
    });
}

function borrarEvento(id) {
    transaccion(() => borrarEventos([num(id)]));
    return true;
}

// filtro = {nombres?, etiquetas?:[{grupo,texto}], equipo?, partidos?, texto?}
//
// Etiquetas: Y entre grupos distintos, O dentro del mismo grupo. "Linea: 1 o 2,
// y Resultado: Gol" = eventos de la linea 1 o 2 que ademas fueron gol.
//
// equipo: el del evento tal cual ('A', 'B' o un nombre) o, si el evento dice
// A/B, el nombre del local/visitante de su partido.
function armarBusqueda(filtro) {
    const f = filtro || {};
    const donde = [], params = [];

    if (Array.isArray(f.nombres) && f.nombres.length) {
        donde.push(`e.nombre IN (${f.nombres.map(() => '?').join(',')})`);
        params.push(...f.nombres.map(String));
    }
    if (Array.isArray(f.partidos) && f.partidos.length) {
        donde.push(`e.partido_id IN (${f.partidos.map(() => '?').join(',')})`);
        params.push(...f.partidos.map(num));
    }
    if (f.equipo) {
        donde.push(`(e.equipo = ? COLLATE NOCASE
                     OR (e.equipo IN ('A','local') AND p.local = ? COLLATE NOCASE)
                     OR (e.equipo IN ('B','visitante') AND p.visitante = ? COLLATE NOCASE))`);
        params.push(String(f.equipo), String(f.equipo), String(f.equipo));
    }
    if (Array.isArray(f.etiquetas) && f.etiquetas.length) {
        const porGrupo = new Map();
        f.etiquetas.forEach(et => {
            if (!et || et.texto === undefined || et.texto === null) return;
            const g = et.grupo || 'Etiqueta';
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g).push(String(et.texto));
        });
        // "e.id IN (subconsulta)" y no EXISTS por fila: SQLite arma el
        // conjunto una vez con el indice (grupo, texto, evento_id) y despues
        // cada evento es una busqueda. Con 40.000 eventos es 5 veces mas rapido.
        porGrupo.forEach((textos, grupo) => {
            donde.push(`e.id IN (SELECT t.evento_id FROM etiquetas t
                        WHERE t.grupo = ? AND t.texto IN (${textos.map(() => '?').join(',')}))`);
            params.push(grupo, ...textos);
        });
    }
    if (f.texto && String(f.texto).trim()) {
        const t = '%' + String(f.texto).trim() + '%';
        donde.push(`(e.nombre LIKE ? OR p.nombre LIKE ? OR e.linea LIKE ?
                     OR EXISTS (SELECT 1 FROM etiquetas t WHERE t.evento_id = e.id AND t.texto LIKE ?))`);
        params.push(t, t, t, t);
    }
    return { where: donde.length ? 'WHERE ' + donde.join(' AND ') : '', params };
}

function buscarEventos(filtro) {
    const { where, params } = armarBusqueda(filtro);
    // Las etiquetas vienen en la misma consulta, pegadas con separadores de
    // control (\x1f entre grupo y texto, \x1e entre etiquetas): repetir el
    // filtro en una segunda consulta duplicaba el tiempo.
    const lista = filas(`
        SELECT e.*, p.nombre AS partido_nombre, p.video_ruta, p.desfase AS partido_desfase,
               (SELECT group_concat(t.grupo || char(31) || t.texto, char(30))
                  FROM etiquetas t WHERE t.evento_id = e.id) AS _etiquetas
        FROM eventos e JOIN partidos p ON p.id = e.partido_id
        ${where}
        ORDER BY COALESCE(p.inicio_real, p.creado) DESC, p.id DESC, e.orden, e.id`, params);
    lista.forEach(e => {
        e.etiquetas = e._etiquetas
            ? e._etiquetas.split('\x1e').map(s => { const [grupo, texto] = s.split('\x1f'); return { grupo, texto }; })
            : [];
        delete e._etiquetas;
    });
    return lista;
}

// ─────────────────────────────────────────────
// PLANTILLAS
// ─────────────────────────────────────────────
function listarPlantillas() {
    return filas(`SELECT id, nombre, actualizado, creado, origen FROM plantillas
                  ORDER BY actualizado DESC, id DESC`);
}

function leerPlantilla(id) {
    const t = unaFila('SELECT * FROM plantillas WHERE id=?', [num(id)]);
    if (!t) return null;
    let datos;
    try { datos = JSON.parse(t.datos); } catch (_) { datos = { elements: [], links: [], hojas: [] }; }
    return { id: t.id, nombre: t.nombre, datos, origen: t.origen, creado: t.creado, actualizado: t.actualizado };
}

function guardarPlantilla(t) {
    if (!t || !t.nombre || !String(t.nombre).trim()) throw new Error('La plantilla necesita un nombre');
    const datos = datosNormalizados(t.datos);
    const texto = JSON.stringify(datos);
    const h = huellaPlantilla(datos);
    const cuando = ahora();
    return transaccion(() => {
        const id = num(t.id);
        if (id) {
            if (!unaFila('SELECT id FROM plantillas WHERE id=?', [id])) throw new Error(`No existe la plantilla ${id}`);
            db.run('UPDATE plantillas SET nombre=?, datos=?, huella=?, actualizado=?' +
                   (t.origen ? ', origen=?' : '') + ' WHERE id=?',
                t.origen ? [String(t.nombre).trim(), texto, h, cuando, String(t.origen), id]
                         : [String(t.nombre).trim(), texto, h, cuando, id]);
            return id;
        }
        db.run(`INSERT INTO plantillas (nombre, datos, origen, huella, creado, actualizado)
                VALUES (?,?,?,?,?,?)`,
            [String(t.nombre).trim(), texto, txt(t.origen) || 'local', h, cuando, cuando]);
        return ultimoId();
    });
}

function borrarPlantilla(id) {
    transaccion(() => {
        db.run('UPDATE partidos SET plantilla_id=NULL WHERE plantilla_id=?', [num(id)]);
        db.run('DELETE FROM plantillas WHERE id=?', [num(id)]);
    });
    return true;
}

function plantillaPorHuella(h) {
    return unaFila('SELECT id, nombre FROM plantillas WHERE huella=?', [h]);
}

function plantillaPorNombre(nombre) {
    return unaFila('SELECT id, nombre, huella FROM plantillas WHERE nombre=? COLLATE NOCASE', [nombre]);
}

// ─────────────────────────────────────────────
// EQUIPOS
// ─────────────────────────────────────────────
function listarEquipos() {
    return filas('SELECT id, nombre, color FROM equipos ORDER BY nombre COLLATE NOCASE');
}

// Sin id y con un nombre que ya existe: se actualiza ese (el nombre es unico).
function guardarEquipo(e) {
    if (!e || !e.nombre || !String(e.nombre).trim()) throw new Error('El equipo necesita un nombre');
    const nombre = String(e.nombre).trim();
    return transaccion(() => {
        let id = num(e.id);
        const mismo = unaFila('SELECT id FROM equipos WHERE nombre=? COLLATE NOCASE', [nombre]);
        if (id) {
            if (mismo && mismo.id !== id) throw new Error(`Ya hay un equipo "${nombre}"`);
            db.run('UPDATE equipos SET nombre=?, color=? WHERE id=?', [nombre, txt(e.color), id]);
            return id;
        }
        if (mismo) {
            db.run('UPDATE equipos SET color=? WHERE id=?', [txt(e.color), mismo.id]);
            return mismo.id;
        }
        db.run('INSERT INTO equipos (nombre, color) VALUES (?,?)', [nombre, txt(e.color)]);
        return ultimoId();
    });
}

function equipoPorNombre(nombre) {
    return unaFila('SELECT id, nombre, color FROM equipos WHERE nombre=? COLLATE NOCASE', [String(nombre || '')]);
}

function borrarEquipo(id) {
    transaccion(() => db.run('DELETE FROM equipos WHERE id=?', [num(id)]));
    return true;
}

// ─────────────────────────────────────────────
// PLAYLISTS
// ─────────────────────────────────────────────
function listarPlaylists() {
    return filas(`SELECT pl.id, pl.nombre, pl.creado, pl.actualizado,
                         (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = pl.id) AS items
                  FROM playlists pl ORDER BY pl.actualizado DESC, pl.id DESC`);
}

function leerPlaylist(id) {
    const pl = unaFila('SELECT * FROM playlists WHERE id=?', [num(id)]);
    if (!pl) return null;
    pl.items = filas(`
        SELECT i.id AS item_id, i.orden, i.nota, i.evento_id,
               e.nombre, e.partido_id, e.equipo, e.linea, e.inicio, e.fin, e.v_inicio, e.v_fin,
               p.nombre AS partido_nombre, p.video_ruta, p.desfase AS partido_desfase
        FROM playlist_items i
        JOIN eventos e ON e.id = i.evento_id
        JOIN partidos p ON p.id = e.partido_id
        WHERE i.playlist_id = ?
        ORDER BY i.orden, i.id`, [pl.id]);
    const porEvento = etiquetasDe('SELECT evento_id FROM playlist_items WHERE playlist_id=?', [pl.id]);
    pl.items.forEach(it => { it.etiquetas = porEvento.get(it.evento_id) || []; });
    return pl;
}

function guardarPlaylist(pl) {
    if (!pl || !pl.nombre || !String(pl.nombre).trim()) throw new Error('La playlist necesita un nombre');
    const cuando = ahora();
    return transaccion(() => {
        let id = num(pl.id);
        if (id) {
            if (!unaFila('SELECT id FROM playlists WHERE id=?', [id])) throw new Error(`No existe la playlist ${id}`);
            db.run('UPDATE playlists SET nombre=?, actualizado=? WHERE id=?', [String(pl.nombre).trim(), cuando, id]);
            db.run('DELETE FROM playlist_items WHERE playlist_id=?', [id]);
        } else {
            db.run('INSERT INTO playlists (nombre, creado, actualizado) VALUES (?,?,?)',
                [String(pl.nombre).trim(), cuando, cuando]);
            id = ultimoId();
        }
        (pl.items || []).forEach((it, i) => {
            const ev = num(it && it.evento_id);
            if (!ev || !unaFila('SELECT id FROM eventos WHERE id=?', [ev])) return;   // evento que ya no esta
            db.run('INSERT INTO playlist_items (playlist_id, evento_id, orden, nota) VALUES (?,?,?,?)',
                [id, ev, i + 1, txt(it.nota)]);
        });
        return id;
    });
}

function borrarPlaylist(id) {
    transaccion(() => {
        db.run('DELETE FROM playlist_items WHERE playlist_id=?', [num(id)]);
        db.run('DELETE FROM playlists WHERE id=?', [num(id)]);
    });
    return true;
}

module.exports = {
    VERSION,
    abrir, cerrar, abierta, ruta, persistir, persistirYa,
    huella, huellaPlantilla, datosNormalizados, jsonEstable,
    guardarPartido, listarPartidos, leerPartido, actualizarPartido, borrarPartido, partidoPorHuella,
    agregarEvento, actualizarEvento, actualizarVarios, borrarEvento, buscarEventos,
    listarPlantillas, leerPlantilla, guardarPlantilla, borrarPlantilla, plantillaPorHuella, plantillaPorNombre,
    listarEquipos, guardarEquipo, borrarEquipo, equipoPorNombre,
    listarPlaylists, leerPlaylist, guardarPlaylist, borrarPlaylist,
    // Para las pruebas y para quien necesite una consulta propia (remoto.js).
    _filas: (sql, params) => filas(sql, params)
};
