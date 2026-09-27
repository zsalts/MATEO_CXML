// window.tv FALSO, en memoria. Se carga SOLO si no hay window.tv real (app.js
// lo importa cuando falta el preload): así cada rama se puede probar abriendo
// src/index.html en un servidor estático, sin Electron y sin el Agente 1.
//
// Cumple el contrato entero de window.tv con datos de ejemplo: 3 plantillas
// con el formato del iPad, 2 equipos y 4 partidos. Nada se guarda en disco;
// al recargar vuelve todo a como estaba (salvo los ajustes, que quedan en
// localStorage para no tener que elegir el tema cada vez).
//
// Diferencias con la real, a propósito:
//  - video.elegirArchivo / archivos.elegir abren el selector del navegador.
//    La "ruta" es el nombre del archivo, y video.url(ruta) da un blob: que
//    se puede reproducir. Así se prueba un reproductor sin Electron.
//  - video.url de un partido de ejemplo da null: esos videos no existen.
//  - importarNube pide login la primera vez (rechaza con necesitaLogin) para
//    poder probar ese camino.
//  - window.tv.__simulada === true, y window.tv.__simular trae ganchos para
//    pruebas: mensajeRemoto(msg), clienteRemoto(info), errorVideo(err).

const LATENCIA = 60;
const esperar = (ms = LATENCIA) => new Promise(r => setTimeout(r, ms));
const copia = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
let ultimoId = 100;
let copiaCancelada = false;   // video.cancelarCopia
const nuevoId = () => ++ultimoId;
const ahoraISO = () => new Date().toISOString();
const haceDias = (d, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000).toISOString();
const CARPETA = 'C:\\Users\\Usuario\\Videos\\Tag & View Pro';

// ─────────────────────────────────────────────
// PLANTILLAS DE EJEMPLO (formato del iPad: { elements, links, hojas })
// ─────────────────────────────────────────────
// Los campos son los que createElement() de app.js le pone a cada elemento.
function el(id, type, name, x, y, extra = {}) {
    const tam = { event: [120, 52], descriptor: [120, 52], sticky_label: [120, 52], popup_label: [120, 52],
                  counter: [80, 60], container: [200, 180], line: [140, 52], possession: [260, 72],
                  text: [180, 44], teams: [300, 56] }[type] || [120, 52];
    return Object.assign({
        id, type, name, color: null, x, y, w: tam[0], h: tam[1],
        timeMode: 'fixed', exclusiveIds: [], isExclusive: false, lead: 0, lag: 1,
        popups: [], lineMemberIds: [], lineExclusive: true
    }, extra);
}

function plantillaHockey() {
    const elements = [
        el(1, 'teams', 'Equipos', 20, 20, { equipoA: 'Norte', equipoB: 'Sur', colorA: '#1f6feb', colorB: '#d9480f' }),
        el(2, 'container', 'Ataque', 20, 100, { w: 400, h: 200, color: '#1f6feb' }),
        el(3, 'event', 'Gol', 40, 130, { color: '#16a34a', lead: 8, lag: 4, atajo: 'g' }),
        el(4, 'event', 'Tiro', 180, 130, { color: '#2563eb', lead: 5, lag: 3, subHojaId: 'h_tiro', atajo: 't' }),
        el(5, 'event', 'Corner corto', 40, 200, { color: '#7c3aed', timeMode: 'manual', atajo: 'c' }),
        el(6, 'popup_label', 'Convertido', 180, 200, { color: '#f8d022' }),
        el(7, 'event', 'Recuperación', 460, 130, { color: '#0891b2', atajo: 'r' }),
        el(8, 'event', 'Pérdida', 460, 200, { color: '#dc2626', atajo: 'p' }),
        el(9, 'descriptor', 'Local', 620, 130, { color: '#93c5fd' }),
        el(10, 'descriptor', 'Visitante', 620, 200, { color: '#fdba74' }),
        el(11, 'sticky_label', 'Superioridad', 20, 330, { atajo: 's' }),
        el(12, 'counter', '0', 180, 320),
        el(13, 'line', 'Línea 1', 300, 330, { lineMemberIds: [] }),
        el(14, 'text', 'Hockey — partido', 460, 30, { fontSize: 18 }),
        // Pestaña de detalle del tiro
        el(20, 'descriptor', 'Al arco', 20, 20, { hoja: 'h_tiro', color: '#86efac' }),
        el(21, 'descriptor', 'Afuera', 160, 20, { hoja: 'h_tiro', color: '#fca5a5' }),
        el(22, 'descriptor', 'Bloqueado', 300, 20, { hoja: 'h_tiro', color: '#fde68a' })
    ];
    return { elements, links: [{ id: 'lnk_1', fromId: 5, toId: 6 }], hojas: [{ id: 'h_tiro', name: 'Detalle Tiro' }] };
}

function plantillaFutbol() {
    const pos = ['Izquierda', 'Centro', 'Derecha'];
    const elements = [
        el(1, 'possession', 'Posesión', 20, 20, { equipoA: 'Norte', equipoB: 'Sur' }),
        el(2, 'container', 'Ataque', 20, 110, { w: 420, h: 150, color: '#16a34a' }),
        el(3, 'event', 'Ataque posicional', 40, 140, { color: '#16a34a', popups: pos, lead: 6, lag: 2 }),
        el(4, 'event', 'Contraataque', 180, 140, { color: '#22c55e', popups: pos, lead: 4, lag: 2 }),
        el(5, 'event', 'Pelota parada', 320, 140, { color: '#15803d', lead: 3, lag: 6 }),
        el(6, 'event', 'Remate', 40, 200, { color: '#0ea5e9', lead: 5, lag: 2 }),
        el(7, 'container', 'Defensa', 470, 110, { w: 420, h: 150, color: '#dc2626' }),
        el(8, 'event', 'Presión alta', 490, 140, { color: '#ef4444', timeMode: 'manual', isExclusive: true }),
        el(9, 'event', 'Bloque bajo', 630, 140, { color: '#b91c1c', timeMode: 'manual', isExclusive: true }),
        el(10, 'event', 'Transición def.', 770, 140, { color: '#f97316' }),
        el(11, 'descriptor', 'Primer tiempo', 20, 290, { color: '#e5e7eb' }),
        el(12, 'descriptor', 'Segundo tiempo', 160, 290, { color: '#e5e7eb' })
    ];
    elements[7].exclusiveIds = [9];
    elements[8].exclusiveIds = [8];
    return { elements, links: [], hojas: [] };
}

function plantillaBasquet() {
    const elements = [
        el(1, 'event', '2 puntos', 20, 20, { color: '#ea580c', atajo: '2' }),
        el(2, 'event', '3 puntos', 160, 20, { color: '#c2410c', atajo: '3' }),
        el(3, 'event', 'Libre', 300, 20, { color: '#fb923c', atajo: 'l' }),
        el(4, 'popup_label', 'Convertido', 20, 90, { color: '#86efac' }),
        el(5, 'popup_label', 'Errado', 160, 90, { color: '#fca5a5' }),
        el(6, 'event', 'Rebote', 20, 170, { color: '#0284c7' }),
        el(7, 'event', 'Asistencia', 160, 170, { color: '#0369a1' }),
        el(8, 'event', 'Pérdida', 300, 170, { color: '#dc2626' }),
        el(9, 'counter', '0', 460, 20),
        el(10, 'counter', '0', 460, 100)
    ];
    const links = [1, 2, 3].flatMap(ev => [4, 5].map(pl => ({ id: `lnk_${ev}_${pl}`, fromId: ev, toId: pl })));
    return { elements, links, hojas: [] };
}

// ─────────────────────────────────────────────
// PARTIDOS DE EJEMPLO
// ─────────────────────────────────────────────
// Eventos repartidos a lo largo del partido con los botones de la plantilla.
// Pseudoaleatorio con semilla: los mismos datos cada vez que se recarga.
function eventosDe(datos, cantidad, duracion, semilla, { conVideo = true, desfase = 0 } = {}) {
    let s = semilla;
    const azar = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const botones = datos.elements.filter(e => e.type === 'event');
    const etiquetas = datos.elements.filter(e => e.type === 'descriptor' || e.type === 'popup_label');
    const eventos = [];
    for (let i = 0; i < cantidad; i++) {
        const b = botones[Math.floor(azar() * botones.length)];
        const centro = Math.round(((i + azar()) / cantidad) * (duracion - 30)) + 10;
        const inicio = Math.max(0, centro - (b.lead || 5));
        const fin = centro + (b.lag || 3) + Math.round(azar() * 6);
        const et = azar() < 0.6 && etiquetas.length ? [{ grupo: '', texto: etiquetas[Math.floor(azar() * etiquetas.length)].name }] : [];
        if (b.popups && b.popups.length && azar() < 0.7) et.push({ grupo: b.name, texto: b.popups[Math.floor(azar() * b.popups.length)] });
        eventos.push({
            id: nuevoId(), nombre: b.name, boton_id: b.id, equipo: azar() < 0.5 ? 'A' : 'B', linea: null,
            inicio, fin,
            v_inicio: conVideo ? inicio + desfase : null, v_fin: conVideo ? fin + desfase : null,
            etiquetas: et
        });
    }
    return eventos;
}

// ─────────────────────────────────────────────
// ESTADO EN MEMORIA
// ─────────────────────────────────────────────
const db = {
    plantillas: [
        { id: 1, nombre: 'Hockey — Partido completo', actualizado: haceDias(1), origen: 'ipad', datos: plantillaHockey() },
        { id: 2, nombre: 'Fútbol — Ataque y defensa', actualizado: haceDias(6), origen: 'nube', datos: plantillaFutbol() },
        { id: 3, nombre: 'Básquet — Tiros', actualizado: haceDias(20), origen: 'archivo', datos: plantillaBasquet() }
    ],
    equipos: [
        { id: 1, nombre: 'Club Atlético Norte', color: '#1f6feb' },
        { id: 2, nombre: 'Deportivo Sur', color: '#d9480f' }
    ],
    partidos: [],
    playlists: []
};

function partidoEjemplo(p, plantilla, cant, semilla) {
    const conVideo = !!p.video_ruta;
    const eventos = eventosDe(plantilla.datos, cant, p.duracion, semilla, { conVideo, desfase: p.desfase || 0 });
    return Object.assign({
        id: nuevoId(), xml_ruta: null, video_ruta: null, video_mime: conVideo ? 'video/mp4' : null,
        video_bytes: conVideo ? Math.round(p.duracion * 750000) : null,
        inicio_real: p.creado, desfase: 0,
        plantilla: copia(plantilla.datos), plantilla_id: plantilla.id,
        posesion: [], eventos
    }, p);
}

const rutaPartido = (nombre, ext) => `${CARPETA}\\Partidos\\${nombre}\\${nombre}.${ext}`;
db.partidos.push(
    partidoEjemplo({ nombre: 'Norte vs Sur — Fecha 12', creado: haceDias(0, 3), duracion: 4380, local: 'Club Atlético Norte', visitante: 'Deportivo Sur', origen: 'captura',
                     video_ruta: rutaPartido('Norte vs Sur — Fecha 12', 'mp4'), xml_ruta: rutaPartido('Norte vs Sur — Fecha 12', 'xml') },
                   db.plantillas[0], 38, 7),
    partidoEjemplo({ nombre: 'Entrenamiento martes', creado: haceDias(2, 5), duracion: 3100, local: 'Club Atlético Norte', visitante: '', origen: 'ipad-importado' },
                   db.plantillas[1], 22, 11),
    partidoEjemplo({ nombre: 'Sur vs Oeste', creado: haceDias(5), duracion: 5220, local: 'Deportivo Sur', visitante: 'Oeste', origen: 'ipad-vivo',
                     video_ruta: rutaPartido('Sur vs Oeste', 'mp4'), xml_ruta: rutaPartido('Sur vs Oeste', 'xml') },
                   db.plantillas[0], 45, 23),
    partidoEjemplo({ nombre: 'Final 2025', creado: haceDias(290), duracion: 2880, local: 'Deportivo Sur', visitante: 'Club Atlético Norte', origen: 'importado', desfase: 12.5,
                     video_ruta: 'D:\\Archivo\\final-2025.mp4', xml_ruta: 'D:\\Archivo\\final-2025.xml' },
                   db.plantillas[2], 30, 5)
);
db.playlists.push({ id: nuevoId(), nombre: 'Goles de la fecha', creado: haceDias(0, 2),
    items: db.partidos[0].eventos.filter(e => e.nombre === 'Gol').slice(0, 5).map(e => ({ evento_id: e.id, nota: '' })) });

// ─────────────────────────────────────────────
// OYENTES (onError, onProgreso, remoto)
// ─────────────────────────────────────────────
function canal() {
    const oyentes = new Set();
    return {
        on(cb) { oyentes.add(cb); return () => oyentes.delete(cb); },
        emitir(...a) { oyentes.forEach(cb => { try { cb(...a); } catch (e) { console.error(e); } }); }
    };
}
const canales = { errorVideo: canal(), progreso: canal(), mensaje: canal(), cliente: canal(), pantallaCompleta: canal(), irA: canal() };

// Plataforma simulada: la del navegador, o ?plataforma=mac / ?plataforma=win
// para ver la otra cara sin cambiar de compu. Permisos: ?camara=denegado,
// ?microfono=no-determinado… para probar los paneles de permiso.
const paramSim = nombre => { try { return new URLSearchParams(location.search).get(nombre); } catch { return null; } };
const PLATAFORMA_SIM = (() => {
    const p = paramSim('plataforma');
    if (p === 'mac' || p === 'darwin') return 'darwin';
    if (p === 'win' || p === 'win32') return 'win32';
    return /Mac/i.test(navigator.platform || navigator.userAgent || '') ? 'darwin' : 'win32';
})();
const permisosSim = {
    camara: paramSim('camara') || 'concedido',
    microfono: paramSim('microfono') || 'concedido'
};

// ─────────────────────────────────────────────
// ARCHIVOS DEL NAVEGADOR (para elegirArchivo y archivos.elegir)
// ─────────────────────────────────────────────
const blobs = new Map();   // "ruta" (nombre del archivo) → blob: URL

function elegirDelNavegador(accept) {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        if (accept) input.accept = accept;
        input.style.display = 'none';
        document.body.appendChild(input);
        const listo = f => { input.remove(); resolve(f || null); };
        input.addEventListener('change', () => listo(input.files && input.files[0]));
        input.addEventListener('cancel', () => listo(null));
        input.click();
    });
}

const extension = nombre => (String(nombre).match(/\.([^.\\/]+)$/) || [, ''])[1].toLowerCase();
const limpiarNombre = s => String(s || 'Partido').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Partido';

// ─────────────────────────────────────────────
// AJUSTES (lo único que persiste, en localStorage)
// ─────────────────────────────────────────────
const AJUSTES_DEF = { carpeta: CARPETA, tema: 'oscuro', calidad: 6, margen: 2, puertoRemoto: 8787, copiarVideosImportados: true };
function leerAjustesGuardados() {
    try { return Object.assign({}, AJUSTES_DEF, JSON.parse(localStorage.getItem('tv_sim_ajustes') || '{}')); }
    catch { return Object.assign({}, AJUSTES_DEF); }
}
let ajustes = leerAjustesGuardados();

// ─────────────────────────────────────────────
// Ayudas de la base
// ─────────────────────────────────────────────
const buscarPartido = id => db.partidos.find(p => String(p.id) === String(id));
const noEsta = que => Promise.reject(new Error(`No existe ${que}`));

function resumenPartido(p) {
    return {
        id: p.id, nombre: p.nombre, creado: p.creado, duracion: p.duracion,
        video_ruta: p.video_ruta, xml_ruta: p.xml_ruta, local: p.local, visitante: p.visitante,
        eventos: p.eventos.length, origen: p.origen
    };
}

const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// PARTIDO (camelCase, como lo manda la captura) → fila de la base (snake_case).
function partidoDesdeContrato(x, id) {
    return {
        id, nombre: x.nombre || 'Partido', creado: x.inicioReal || ahoraISO(), inicio_real: x.inicioReal || ahoraISO(),
        duracion: x.duracion || 0, video_ruta: x.videoRuta || null, video_mime: x.videoMime || null,
        video_bytes: x.videoBytes || null, xml_ruta: x.xmlRuta || null,
        local: x.local || '', visitante: x.visitante || '',
        plantilla: typeof x.plantilla === 'string' ? JSON.parse(x.plantilla) : copia(x.plantilla || null),
        plantilla_id: x.plantillaId ?? null, origen: x.origen || 'captura', desfase: x.desfase || 0,
        eventos: (x.eventos || []).map(e => ({
            id: nuevoId(), nombre: e.nombre, boton_id: e.botonId ?? null, equipo: e.equipo ?? null, linea: e.linea ?? null,
            inicio: e.inicio, fin: e.fin, v_inicio: e.vInicio ?? null, v_fin: e.vFin ?? null,
            etiquetas: copia(e.etiquetas || [])
        })),
        posesion: copia(x.posesion || [])
    };
}

// Lo que trae un archivo del iPad (plantilla suelta o copia de seguridad).
function importarDatosDelIpad(data, origen) {
    const r = { plantillas: 0, equipos: 0, partidos: 0 };
    const agregarPlantilla = t => {
        if (!t || !Array.isArray(t.elements)) return;
        db.plantillas.unshift({ id: nuevoId(), nombre: t.name || 'Plantilla importada', actualizado: ahoraISO(), origen,
                                datos: { elements: copia(t.elements), links: copia(t.links || []), hojas: copia(t.hojas || []) } });
        r.plantillas++;
    };
    if (data.kind === 'template') agregarPlantilla(data);
    else if (data.kind === 'backup') {
        (data.templates || []).forEach(agregarPlantilla);
        (data.equipos || []).forEach(eq => {
            const nombre = eq.nombre || eq.name;
            if (nombre && !db.equipos.some(x => x.nombre === nombre)) { db.equipos.push({ id: nuevoId(), nombre, color: eq.color || '#888888' }); r.equipos++; }
        });
        (data.sessions || []).forEach(s => {
            db.partidos.push(partidoDesdeContrato({ nombre: s.name || 'Sesión del iPad', origen: 'ipad-importado',
                                                     duracion: s.time || 0, inicioReal: ahoraISO() }, nuevoId()));
            r.partidos++;
        });
    } else if (data.kind === 'session') {
        db.partidos.push(partidoDesdeContrato({ nombre: data.name || 'Sesión del iPad', origen: 'ipad-importado', duracion: data.time || 0 }, nuevoId()));
        r.partidos++;
    } else {
        throw new Error('El archivo no es de Tag & View (ni plantilla, ni sesión, ni copia de seguridad)');
    }
    return r;
}

// ─────────────────────────────────────────────
// LA API
// ─────────────────────────────────────────────
let grabando = null;        // { ruta, nombre, mime, bytes }
let nubeConSesion = false;
let remoto = null;

const tv = {
    __simulada: true,

    plantillas: {
        async listar() {
            await esperar();
            return db.plantillas.map(p => ({ id: p.id, nombre: p.nombre, actualizado: p.actualizado, origen: p.origen }))
                .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
        },
        async leer(id) {
            await esperar();
            const p = db.plantillas.find(x => String(x.id) === String(id));
            return p ? { id: p.id, nombre: p.nombre, datos: copia(p.datos) } : noEsta('esa plantilla');
        },
        async guardar({ id, nombre, datos }) {
            await esperar();
            const p = id != null && db.plantillas.find(x => String(x.id) === String(id));
            if (p) { p.nombre = nombre ?? p.nombre; p.datos = copia(datos ?? p.datos); p.actualizado = ahoraISO(); return p.id; }
            const nuevo = { id: nuevoId(), nombre: nombre || 'Plantilla', actualizado: ahoraISO(), origen: 'escritorio', datos: copia(datos || { elements: [], links: [], hojas: [] }) };
            db.plantillas.unshift(nuevo);
            return nuevo.id;
        },
        async borrar(id) { await esperar(); db.plantillas = db.plantillas.filter(x => String(x.id) !== String(id)); },
        async importarArchivo() {
            const f = await elegirDelNavegador('.json,application/json');
            if (!f) return null;
            let data;
            try { data = JSON.parse(await f.text()); }
            catch { throw new Error('Ese archivo no es un JSON válido'); }
            return importarDatosDelIpad(data, 'archivo');
        },
        async importarNube(credenciales) {
            await esperar(400);
            if (!nubeConSesion) {
                if (!credenciales || !credenciales.correo || !credenciales.clave) {
                    const e = new Error('necesitaLogin: hace falta iniciar sesión en la nube');
                    e.necesitaLogin = true;
                    throw e;
                }
                if (credenciales.clave.length < 4) throw new Error('Correo o contraseña incorrectos');
                nubeConSesion = true;
            }
            db.plantillas.unshift({ id: nuevoId(), nombre: 'Hockey — Salida (nube)', actualizado: ahoraISO(), origen: 'nube', datos: plantillaHockey() });
            return { plantillas: 1, equipos: 0, partidos: 0 };
        },
        async exportarArchivo(id) {
            await esperar();
            const p = db.plantillas.find(x => String(x.id) === String(id));
            return p ? `${CARPETA}\\Plantillas\\${limpiarNombre(p.nombre)}.json` : null;
        }
    },

    equipos: {
        async listar() { await esperar(); return copia(db.equipos); },
        async guardar({ id, nombre, color }) {
            await esperar();
            const e = id != null && db.equipos.find(x => String(x.id) === String(id));
            if (e) { if (nombre != null) e.nombre = nombre; if (color != null) e.color = color; return e.id; }
            const n = { id: nuevoId(), nombre: nombre || 'Equipo', color: color || '#888888' };
            db.equipos.push(n);
            return n.id;
        },
        async borrar(id) { await esperar(); db.equipos = db.equipos.filter(x => String(x.id) !== String(id)); }
    },

    partidos: {
        async guardar(partido) {
            await esperar();
            if (partido.id != null && buscarPartido(partido.id)) {
                const i = db.partidos.findIndex(p => String(p.id) === String(partido.id));
                db.partidos[i] = partidoDesdeContrato(partido, db.partidos[i].id);
                return db.partidos[i].id;
            }
            const p = partidoDesdeContrato(partido, nuevoId());
            db.partidos.push(p);
            return p.id;
        },
        async listar(filtro = {}) {
            await esperar();
            const f = filtro || {};
            const texto = norm(f.texto);
            return db.partidos
                .filter(p => !texto || norm(`${p.nombre} ${p.local} ${p.visitante}`).includes(texto))
                .filter(p => !f.equipo || norm(p.local) === norm(f.equipo) || norm(p.visitante) === norm(f.equipo))
                .filter(p => !f.desde || String(p.creado) >= String(f.desde))
                .filter(p => !f.hasta || String(p.creado) <= String(f.hasta))
                .filter(p => f.conVideo == null || !!p.video_ruta === !!f.conVideo)
                .filter(p => !f.origen || p.origen === f.origen)
                .sort((a, b) => String(b.creado).localeCompare(String(a.creado)))
                .map(resumenPartido);
        },
        async leer(id) { await esperar(); const p = buscarPartido(id); return p ? copia(p) : noEsta('ese partido'); },
        async actualizar(id, cambios = {}) {
            await esperar();
            const p = buscarPartido(id);
            if (!p) return noEsta('ese partido');
            ['nombre', 'local', 'visitante', 'video_ruta', 'xml_ruta', 'desfase'].forEach(k => { if (k in cambios) p[k] = cambios[k]; });
        },
        async borrar(id) { await esperar(); db.partidos = db.partidos.filter(p => String(p.id) !== String(id)); }
    },

    eventos: {
        async agregar(partidoId, e) {
            await esperar();
            const p = buscarPartido(partidoId);
            if (!p) return noEsta('ese partido');
            const n = partidoDesdeContrato({ eventos: [e] }, 0).eventos[0];
            p.eventos.push(n);
            return n.id;
        },
        async actualizar(id, cambios = {}) {
            await esperar();
            for (const p of db.partidos) {
                const e = p.eventos.find(x => String(x.id) === String(id));
                if (!e) continue;
                ['nombre', 'v_inicio', 'v_fin'].forEach(k => { if (k in cambios) e[k] = cambios[k]; });
                if (cambios.etiquetas) e.etiquetas = copia(cambios.etiquetas);
                return;
            }
            return noEsta('ese evento');
        },
        async actualizarVarios(lista = []) {
            await esperar();
            const porId = new Map(lista.map(x => [String(x.id), x]));
            db.partidos.forEach(p => p.eventos.forEach(e => {
                const c = porId.get(String(e.id));
                if (c) { e.v_inicio = c.v_inicio; e.v_fin = c.v_fin; }
            }));
        },
        async borrar(id) { await esperar(); db.partidos.forEach(p => { p.eventos = p.eventos.filter(e => String(e.id) !== String(id)); }); },
        async buscar(filtro = {}) {
            await esperar();
            const f = filtro || {};
            const nombres = f.nombres && f.nombres.length ? new Set(f.nombres.map(norm)) : null;
            const partidos = f.partidos && f.partidos.length ? new Set(f.partidos.map(String)) : null;
            const texto = norm(f.texto);
            const res = [];
            db.partidos.forEach(p => {
                if (partidos && !partidos.has(String(p.id))) return;
                p.eventos.forEach(e => {
                    if (nombres && !nombres.has(norm(e.nombre))) return;
                    if (f.equipo && norm(e.equipo) !== norm(f.equipo)) return;
                    if (f.etiquetas && f.etiquetas.length && !f.etiquetas.every(t =>
                        e.etiquetas.some(x => norm(x.texto) === norm(t.texto) && (!t.grupo || norm(x.grupo) === norm(t.grupo))))) return;
                    if (texto && !norm(`${e.nombre} ${e.etiquetas.map(x => x.texto).join(' ')}`).includes(texto)) return;
                    res.push(Object.assign(copia(e), { partido_id: p.id, partido_nombre: p.nombre, video_ruta: p.video_ruta }));
                });
            });
            return res;
        }
    },

    playlists: {
        async listar() { await esperar(); return db.playlists.map(p => ({ id: p.id, nombre: p.nombre, creado: p.creado, items: p.items.length })); },
        async leer(id) { await esperar(); const p = db.playlists.find(x => String(x.id) === String(id)); return p ? copia(p) : noEsta('esa playlist'); },
        async guardar({ id, nombre, items }) {
            await esperar();
            const p = id != null && db.playlists.find(x => String(x.id) === String(id));
            if (p) { if (nombre != null) p.nombre = nombre; if (items) p.items = copia(items); return p.id; }
            const n = { id: nuevoId(), nombre: nombre || 'Playlist', creado: ahoraISO(), items: copia(items || []) };
            db.playlists.push(n);
            return n.id;
        },
        async borrar(id) { await esperar(); db.playlists = db.playlists.filter(p => String(p.id) !== String(id)); }
    },

    video: {
        async iniciar(nombre, mime) {
            await esperar();
            const n = limpiarNombre(nombre) + (String(mime || '').includes('webm') ? '.webm' : '.mp4');
            grabando = { ruta: `${CARPETA}\\${n}`, nombre: n, mime: mime || 'video/mp4', bytes: 0 };
            return { ruta: grabando.ruta, nombre: grabando.nombre };
        },
        async trozo(datos) {
            if (!grabando) throw new Error('No hay grabación abierta');
            grabando.bytes += (datos && (datos.byteLength ?? datos.length)) || 0;
            return { bytes: grabando.bytes };
        },
        async finalizar() {
            await esperar();
            if (!grabando) return null;
            const r = { ruta: grabando.ruta, bytes: grabando.bytes, mime: grabando.mime };
            grabando = null;
            return r;
        },
        async descartar() { await esperar(); grabando = null; },
        async ubicar(ruta, { nombre, subcarpeta } = {}) {
            await esperar();
            const ext = extension(ruta) || 'mp4';
            return { ruta: `${CARPETA}\\${subcarpeta ? subcarpeta.replace(/\//g, '\\') + '\\' : ''}${limpiarNombre(nombre)}.${ext}` };
        },
        async url(ruta) { return blobs.get(ruta) || null; },
        async elegirArchivo() {
            const f = await elegirDelNavegador('video/*,.mp4,.mov,.mkv,.webm,.avi');
            if (!f) return null;
            blobs.set(f.name, URL.createObjectURL(f));
            return f.name;
        },
        async copiarACarpeta(ruta, { nombre, subcarpeta } = {}) {
            // Simula una copia de 1,5 s con progreso, para ver la barra.
            const total = 100 * 1024 * 1024;
            copiaCancelada = false;
            for (let i = 1; i <= 10; i++) {
                await esperar(150);
                if (copiaCancelada) throw new Error('Copia cancelada');
                canales.progreso.emitir({ hecho: total * i / 10, total });
            }
            const destino = (await tv.video.ubicar(ruta, { nombre, subcarpeta })).ruta;
            if (blobs.has(ruta)) blobs.set(destino, blobs.get(ruta));
            return { ruta: destino };
        },
        async cancelarCopia() { copiaCancelada = true; return true; },
        async info(ruta) {
            const url = blobs.get(ruta);
            if (!url) {
                const p = db.partidos.find(x => x.video_ruta === ruta);
                return p ? { duracion: p.duracion + (p.desfase || 0), ancho: 1920, alto: 1080, bytes: p.video_bytes } : null;
            }
            return new Promise(resolve => {
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.onloadedmetadata = () => resolve({ duracion: v.duration, ancho: v.videoWidth, alto: v.videoHeight, bytes: null });
                v.onerror = () => resolve(null);
                v.src = url;
            });
        },
        onError: cb => canales.errorVideo.on(cb),
        onProgreso: cb => canales.progreso.on(cb)
    },

    clips: {
        async disponible() { return true; },
        async exportar({ ruta, cortes = [], destino = 'carpeta', subcarpeta } = {}) {
            await esperar(300);
            if (!ruta) throw new Error('Falta el video');
            const base = `${CARPETA}\\${subcarpeta ? subcarpeta.replace(/\//g, '\\') + '\\' : ''}Clips`;
            if (destino === 'uno') return { rutas: [`${base}\\Compilado.mp4`] };
            return { rutas: cortes.map((c, i) => `${base}\\${String(i + 1).padStart(3, '0')} ${limpiarNombre(c.nombre || 'Clip')}.mp4`) };
        }
    },

    archivos: {
        async elegir({ filtros = [] } = {}) {
            const exts = filtros.flatMap(f => f.extensiones || []).filter(e => e !== '*');
            const f = await elegirDelNavegador(exts.map(e => '.' + e).join(','));
            if (!f) return null;
            if (f.size > 20 * 1024 * 1024) throw new Error('El archivo pasa de 20 MB');
            blobs.set(f.name, URL.createObjectURL(f));
            return { ruta: f.name, nombre: f.name.replace(/\.[^.]+$/, ''), extension: extension(f.name), contenido: await f.text() };
        },
        async guardarTexto({ nombre, extension: ext, contenido, subcarpeta }) {
            await esperar();
            const ruta = `${CARPETA}\\${subcarpeta ? subcarpeta.replace(/\//g, '\\') + '\\' : ''}${limpiarNombre(nombre)}.${ext || 'txt'}`;
            console.info('[api simulada] guardarTexto →', ruta, `(${String(contenido || '').length} caracteres)`);
            return ruta;
        },
        async mostrar(ruta) { console.info('[api simulada] mostrar en el Explorador:', ruta); },
        async abrirCarpeta(subcarpeta) { console.info('[api simulada] abrir carpeta:', subcarpeta || CARPETA); },
        async respaldarBase() { await esperar(300); return `${CARPETA}\\Respaldos\\tagview ${new Date().toISOString().slice(0, 10)}.sqlite`; }
    },

    remoto: {
        async iniciar({ plantillaId } = {}) {
            await esperar(200);
            remoto = { plantillaId, url: 'http://192.168.0.23:' + ajustes.puertoRemoto, ips: ['192.168.0.23'], puerto: ajustes.puertoRemoto,
                       pin: String(1000 + Math.floor(Math.random() * 9000)) };
            // QR de mentira: un cuadro con el texto. El real lo arma el Agente 5.
            remoto.qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><rect x="8" y="8" width="24" height="24" fill="#000"/><rect x="68" y="8" width="24" height="24" fill="#000"/><rect x="8" y="68" width="24" height="24" fill="#000"/><text x="50" y="54" font-size="8" text-anchor="middle">QR simulado</text></svg>`;
            return copia(remoto);
        },
        async detener() { await esperar(); remoto = null; },
        async estado() { return remoto ? Object.assign(copia(remoto), { activo: true, clientes: 0 }) : { activo: false }; },
        async enviar(mensaje) { console.debug('[api simulada] remoto.enviar', mensaje); },
        onMensaje: cb => canales.mensaje.on(cb),
        onCliente: cb => canales.cliente.on(cb)
    },

    ajustes: {
        async leer() { await esperar(20); return copia(ajustes); },
        async guardar(parcial = {}) {
            await esperar(20);
            ajustes = Object.assign({}, ajustes, parcial);
            try { localStorage.setItem('tv_sim_ajustes', JSON.stringify(ajustes)); } catch {}
            return copia(ajustes);
        }
    },

    sys: {
        async info() {
            const chrome = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [, '—'])[1];
            return { version: '2.0.0 (simulada)', electron: '—', chrome, carpeta: ajustes.carpeta, base: ajustes.carpeta + '\\tagview.sqlite',
                     plataforma: PLATAFORMA_SIM, arquitectura: 'x64' };
        },
        async permiso(tipo) {
            if (!(tipo in permisosSim)) throw new Error('tipo de permiso no valido');
            return PLATAFORMA_SIM === 'darwin' ? permisosSim[tipo] : 'concedido';
        },
        async pedirPermiso(tipo) {
            if (!(tipo in permisosSim)) throw new Error('tipo de permiso no valido');
            if (PLATAFORMA_SIM !== 'darwin') return true;
            // Como macOS: si ya se nego, no vuelve a preguntar.
            if (permisosSim[tipo] === 'no-determinado') permisosSim[tipo] = 'concedido';
            return permisosSim[tipo] === 'concedido';
        },
        async abrirAjustesSistema(pagina) {
            if (!['camara', 'microfono', 'red-local', 'firewall'].includes(pagina)) throw new Error('pagina de ajustes no valida');
            console.info('[api simulada] abrir Ajustes del Sistema:', pagina);
            // Simula que el usuario tildo la app: el "Reintentar" ya anda.
            if (pagina in permisosSim) permisosSim[pagina] = 'concedido';
            return true;
        },
        async elegirCarpeta() {
            await esperar();
            const otra = ajustes.carpeta === CARPETA ? 'D:\\Análisis\\Tag & View Pro' : CARPETA;
            ajustes.carpeta = otra;
            try { localStorage.setItem('tv_sim_ajustes', JSON.stringify(ajustes)); } catch {}
            return { carpeta: otra, cambio: true };
        }
    },

    ventana: {
        async tema(colores) { console.debug('[api simulada] ventana.tema', colores); },
        onPantallaCompleta: cb => canales.pantallaCompleta.on(cb),
        async esPantallaCompleta() { return !!document.fullscreenElement; },
        onIrA: cb => canales.irA.on(cb)
    },

    // Ganchos para probar sin hardware ni iPad.
    __simular: {
        mensajeRemoto: m => canales.mensaje.emitir(m),
        clienteRemoto: info => canales.cliente.emitir(info),
        errorVideo: err => canales.errorVideo.emitir(err),
        pantallaCompleta: si => canales.pantallaCompleta.emitir(!!si),
        irA: rama => canales.irA.emitir(rama),
        datos: db
    }
};

if (!window.tv) {
    window.tv = tv;
    console.info('%c[Tag & View] API simulada: sin Electron, todo en memoria.', 'color:#f5b83d');
}

export default tv;
