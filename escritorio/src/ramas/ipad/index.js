// Rama Captura desde iPad: la compu graba, el iPad codifica por wifi.
//
// Tres fases, todo en `st`:
//   preparar  cámara, plantilla, equipos, nombre y "Conectar iPad" (QR + PIN)
//   vivo      video grande, reloj, REC, registro, botonera chica espejo
//   fin       guardado: video + XML en Partidos/<nombre>/ y en la base
//
// Si además hay un iPad que mira (el segundo que se conecta), cada evento que
// se cierra se corta como clip y le llega por el mismo servidor: ve los
// cortes del partido en vivo mientras el otro iPad sigue codificando.
//
// El motor (nucleo/codificacion.js, envuelto en partido.js) corre ACÁ y es la
// única fuente de verdad. El iPad manda acciones por main/remoto.js; cada una
// se aplica en el segundo real del toque y el estado resumido (espejo.js)
// vuelve al iPad para pintar.
//
// Las piezas de pantalla de la Captura en vivo (ramas/captura/piezas.js del
// Agente 4) todavía no existen: cámara, "▶ Ver" y "✂ Guardar clip" se arman
// acá con la grabadora y la API directamente. Cuando estén, se reemplazan.

import { escapar, formatoTiempo, elegirPlantilla, estadoGlobal } from '../../ui/index.js';
import { crearGrabadora, listarEntradas, formatoBytes } from '../../nucleo/grabadora.js';
import { crearVista } from '../../nucleo/botonera-vista.js';
import { eventosParaPartido, clipDeVideo } from '../../nucleo/codificacion.js';
import { xmlSportscode, csvTiempoEnHielo, csvPosesion, fechaPartido } from '../../nucleo/exportar.js';
import { nombresEquipos, equipoDeBoton } from '../../nucleo/plantilla.js';
import { crearPartido } from './partido.js';
import { resumir, crearEmisor } from './espejo.js';
import { planClipsEnVivo } from './clips-vivo.js';

const ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M11 18.5h2"/>' +
    '<path d="M9 9.5a4.5 4.5 0 0 1 6 0M10.5 12a2 2 0 0 1 3 0"/></svg>';

const SIN_IPAD_AVISO_MS = 10000;   // iPad caído más que esto → aviso grande
const FIREWALL_MS = 60000;         // nadie se conectó en este tiempo → ayuda
const REENVIO_MS = 5000;           // estado forzado: re-sincroniza el reloj

// h('div', {class, texto, onClick, ...}, ...hijos). El texto entra como
// textContent; 'html' solo para SVG fijo o generado acá (el QR).
function h(tag, props, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'texto') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat(Infinity)) {
        if (c == null || c === false) continue;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
}

// Windows no acepta \ / : * ? " < > | en un nombre de archivo. El "(2)" si
// ya existe lo pone tv.video.ubicar.
const nombreLimpio = t => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Partido';

let st = null;

function estadoNuevo(ctx) {
    return {
        ctx, api: ctx.api, ui: ctx.ui,
        raiz: null,
        fase: 'preparar',
        plantilla: null,          // {id, nombre, datos}
        local: '', visitante: '', nombre: '', nombreTocado: false,
        entradas: { video: [], audio: [] }, videoId: '', audioId: '',
        grab: null, camara: false,
        conexion: null,           // lo que devolvió tv.remoto.iniciar
        urlElegida: null,
        clientes: [],
        sinIpad: false,
        partido: null, emisor: null, vista: null,
        caidoDesde: null,         // Date.now() desde que no hay iPad activo conectado
        // Clips en vivo para el iPad que mira. porEvento: id del evento →
        // {id, tiempos, meta, ruta}; cola: los cortes, de a uno.
        enVivo: { ffmpeg: false, porEvento: new Map(), n: 0, cola: Promise.resolve(), fallo: false },
        timers: [], quitar: [],
        guardado: null
    };
}

// ─────────────────────────────────────────────
// CONEXIÓN CON EL SERVIDOR (tv.remoto)
// ─────────────────────────────────────────────
function iPadActivo() { return st.clientes.find(c => c.activo && c.conectado) || null; }
const hayIpad = () => st.clientes.some(c => c.conectado);

function plantillaParaIpad() {
    const p = st.plantilla;
    return p ? { id: p.id, nombre: p.nombre, datos: p.datos } : null;
}

async function conectarIpad() {
    if (!st.plantilla) return st.ui.aviso('Primero elegí la plantilla.', 'error');
    try {
        // El puerto sale de Ajustes → iPad (puertoRemoto); si no está, el
        // servidor usa 8787.
        let puerto;
        try { puerto = (await st.api.ajustes.leer()).puertoRemoto; } catch (_) {}
        st.conexion = await st.api.remoto.iniciar({ plantillaId: st.plantilla.id, plantilla: plantillaParaIpad(), puerto });
        st.urlElegida = st.conexion.url;
        st.clientes = [];
        vigilarClientes();
        // Si en un minuto no entra nadie, casi siempre es el firewall.
        const desde = Date.now();
        st.timers.push(setTimeout(() => {
            if (st && st.conexion && !st.clientes.length && Date.now() - desde >= FIREWALL_MS - 50) {
                st.firewall = true;
                pintar();
            }
        }, FIREWALL_MS));
    } catch (err) {
        st.ui.aviso('No se pudo abrir el servidor para el iPad: ' + ((err && err.message) || err), 'error');
    }
    pintar();
}

function alCliente(e) {
    if (!st) return;
    if (Array.isArray(e.clientes)) st.clientes = e.clientes;
    if (st.clientes.length) st.firewall = false;
    if (e.evento === 'pideControl') pedidoDeControl(e);
    if (e.evento === 'conectado' && st.partido) { emitir(true); revisarClipsEnVivo(); }
    seguirConexion();
    if (st.fase === 'preparar') pintarPreparar(); else pintarVivo();
}

// Además de los avisos (onCliente), se le pregunta al servidor cada 2 s
// quién está. En una Mac el iPad entraba (el servidor lo tenía, con su
// latencia) y la pantalla seguía en "Esperando un iPad…": el aviso no
// llegaba, y sin él no se habilita Empezar. La pregunta es un invoke, el
// mismo camino que Conectar iPad, que ahí sí anda. Solo repinta si cambió
// algo: repintar la preparación le saca el foco a un campo a medio escribir.
function vigilarClientes() {
    if (st.vigilando) return;
    st.vigilando = true;
    const firma = lista => JSON.stringify((lista || []).map(c => [c.dispositivo, c.conectado, c.activo]));
    st.timers.push(setInterval(async () => {
        if (!st || !st.conexion) return;
        let e = null;
        try { e = await st.api.remoto.estado(); } catch (_) { return; }
        if (!st || !e || !Array.isArray(e.clientes)) return;
        if (firma(e.clientes) === firma(st.clientes)) return;
        if (e.clientes.length > st.clientes.length) console.warn('Captura desde iPad: el servidor tiene iPads que no llegaron por onCliente', e.clientes);
        const antes = new Set(st.clientes.filter(c => c.conectado).map(c => c.dispositivo));
        const nuevo = e.clientes.find(c => c.conectado && !antes.has(c.dispositivo));
        alCliente({ clientes: e.clientes, ...(nuevo ? { evento: 'conectado', dispositivo: nuevo.dispositivo } : {}) });
    }, 2000));
}

async function pedidoDeControl(e) {
    const si = await st.ui.confirmar(`“${e.nombre || 'Otro iPad'}” pide codificar. El iPad que codifica ahora pasa a mirar.`,
        { titulo: 'Pasar el control' });
    await st.api.remoto.enviar({ tipo: si ? 'darControl' : 'negarControl', dispositivo: e.dispositivo });
}

function alMensaje(m) {
    if (!st || !m) return;
    if (m.tipo === 'accion') {
        // Antes de Empezar el iPad no deja tocar (enCurso = false). Si igual
        // llega algo, no hay partido donde ponerlo.
        if (!st.partido || st.fase !== 'vivo') return;
        // El registro se repinta solo (alCambiar del motor), pero eso pasa
        // DENTRO de motor.aplicar, antes de que aplicarRemota anote el origen
        // del evento nuevo: sin este repintado el último toque del iPad se ve
        // como "compu" hasta la acción siguiente.
        st.partido.aplicarRemota(m.accion, 'ipad');
        pintarRegistro();
        return;
    }
    if (m.tipo === 'pedirTerminar' && st.fase === 'vivo') terminar({ desdeIpad: m.nombre || 'el iPad' });
}

// Lleva la cuenta de cuánto hace que el iPad que codifica no está.
function seguirConexion() {
    if (st.fase !== 'vivo' || st.sinIpad) { st.caidoDesde = null; return; }
    if (iPadActivo()) st.caidoDesde = null;
    else if (st.caidoDesde == null) st.caidoDesde = Date.now();
}

// ─────────────────────────────────────────────
// ESPEJO → iPad
// ─────────────────────────────────────────────
function emitir(forzar = false) {
    if (!st || !st.partido || !st.emisor) return;
    const g = st.grab && st.grab.estado();
    const r = resumir(st.partido.motor.estado(), {
        datos: st.plantilla.datos, enCurso: st.fase === 'vivo', rec: !!(g && g.grabando)
    });
    st.emisor(r, { forzar });
}

// ─────────────────────────────────────────────
// CÁMARA
// ─────────────────────────────────────────────
async function prepararGrabadora() {
    let calidad;
    try { calidad = (await st.api.ajustes.leer()).calidad; } catch (_) {}
    st.grab = crearGrabadora({ destino: st.api.video, calidad });
    st.quitar.push(st.grab.on('error', e => st.ui.aviso(
        e.tipo === 'disco' ? 'No se puede escribir el video en el disco: ' + e.mensaje : 'Error de grabación: ' + e.mensaje, 'error')));
    st.quitar.push(st.grab.on('desconectada', () => st.ui.aviso('Se desconectó la cámara. Si vuelve, la grabación sigue en el mismo archivo.', 'error')));
    st.quitar.push(st.grab.on('reconectada', () => st.ui.aviso('La cámara volvió.', 'ok')));
    try { st.entradas = await listarEntradas(); } catch (_) {}
}

async function conectarCamara() {
    try {
        const info = await st.grab.conectar({ videoId: st.videoId || undefined, audioId: st.audioId || undefined });
        st.camara = true;
        if (info.aviso) st.ui.aviso(info.aviso, 'error');
        // Con el permiso dado ya aparecen los nombres de verdad.
        try { st.entradas = await listarEntradas(); } catch (_) {}
    } catch (err) {
        st.camara = false;
        st.ui.aviso('No se pudo abrir la cámara: ' + ((err && err.message) || err), 'error');
    }
    pintar();
}

function videoPrevio(clase) {
    const v = h('video', { class: clase, autoplay: true, playsinline: true });
    v.muted = true;
    const s = st.grab && st.grab.vistaPrevia();
    if (s) v.srcObject = s;
    return v;
}

// ─────────────────────────────────────────────
// PLANTILLA Y NOMBRE
// ─────────────────────────────────────────────
async function cargarPlantilla(id) {
    try {
        const p = await st.api.plantillas.leer(id);
        if (!p) throw new Error('no está en la base');
        st.plantilla = { id: p.id, nombre: p.nombre, datos: p.datos };
        const eq = nombresEquipos(p.datos) || {};
        if (!st.local) st.local = eq.A || '';
        if (!st.visitante) st.visitante = eq.B || '';
        nombrePorDefecto();
        // Si ya hay un iPad conectado, que redibuje con la nueva.
        if (st.conexion) await st.api.remoto.enviar({ tipo: 'plantilla', plantilla: plantillaParaIpad() });
    } catch (err) {
        st.ui.aviso('No se pudo leer la plantilla: ' + ((err && err.message) || err), 'error');
    }
}

async function cambiarPlantilla() {
    const id = await elegirPlantilla(st.ctx);
    if (id == null) return;
    await cargarPlantilla(id);
    pintar();
}

function nombrePorDefecto() {
    if (st.nombreTocado) return;
    const eq = [st.local, st.visitante].filter(Boolean).join(' vs ');
    st.nombre = (eq ? eq + ' ' : '') + fechaPartido(Date.now());
}

// ─────────────────────────────────────────────
// EMPEZAR
// ─────────────────────────────────────────────
async function empezar({ sinIpad = false } = {}) {
    if (!st.plantilla) return st.ui.aviso('Elegí la plantilla.', 'error');
    if (!sinIpad && !hayIpad()) return st.ui.aviso('Todavía no hay un iPad conectado.', 'error');
    if (!st.camara) {
        const si = await st.ui.confirmar('No hay cámara conectada: se codifica sin video. ¿Seguir igual?', { titulo: 'Sin cámara' });
        if (!si) return;
    }
    st.nombre = nombreLimpio(st.nombre);
    st.sinIpad = sinIpad && !hayIpad();

    if (st.camara) {
        try { await st.grab.grabar(st.nombre); }
        catch (err) { return st.ui.aviso('No se pudo empezar a grabar: ' + ((err && err.message) || err), 'error'); }
        estadoGlobal.poner('grabando', { desde: Date.now() });
    }

    // Reloj en ms de la compu: el mismo de los pongs de main/remoto.js, así el
    // "momento" de cada toque del iPad cae derecho en este reloj.
    st.partido = crearPartido(st.plantilla.datos, {
        ahora: () => Date.now(),
        relojVideo: () => (st && st.grab ? st.grab.vAhora() : null)
    });
    st.emisor = crearEmisor(m => st.api.remoto.enviar({ ...m, tServidor: Date.now() }).catch(() => {}));
    st.quitar.push(st.partido.motor.alCambiar(() => { emitir(); pintarEstadoVivo(); pintarRegistro(); revisarClipsEnVivo(); }));
    try { st.enVivo.ffmpeg = st.camara && await st.api.clips.disponible(); } catch (_) {}
    st.fase = 'vivo';
    seguirConexion();

    let ultimoForzado = 0;
    st.timers.push(setInterval(() => {
        if (!st || st.fase !== 'vivo') return;
        const ahora = Date.now();
        emitir(ahora - ultimoForzado >= REENVIO_MS);
        if (ahora - ultimoForzado >= REENVIO_MS) ultimoForzado = ahora;
        pintarEstadoVivo();
    }, 1000));

    pintar();
    emitir(true);
}

// ─────────────────────────────────────────────
// CLIPS
// ─────────────────────────────────────────────
function clipDe(ev) {
    const e = st.partido.motor.estado();
    return clipDeVideo(ev, e.mapa || []);
}

async function verClip(ev) {
    const g = st.grab && st.grab.estado();
    const c = clipDe(ev);
    if (!g || !g.ruta || c.vInicio == null) return st.ui.aviso('Ese evento no tiene video.', 'error');
    const url = await st.api.video.url(g.ruta);
    if (!url) return st.ui.aviso('No se pudo abrir el video.', 'error');
    const hasta = c.vFin != null ? c.vFin : c.vInicio + 6;
    const v = h('video', { class: 'tv-ipad-clip', controls: true, autoplay: true, src: url });
    v.addEventListener('loadedmetadata', () => { v.currentTime = c.vInicio; });
    v.addEventListener('timeupdate', () => { if (v.currentTime >= hasta) v.pause(); });
    await st.ui.modal({ titulo: ev.name || 'Clip', contenido: v, botones: [{ texto: 'Cerrar', valor: true, primario: true }] });
    v.pause();
    v.removeAttribute('src');
}

async function guardarClip(ev) {
    const g = st.grab && st.grab.estado();
    const c = clipDe(ev);
    if (!g || !g.ruta || c.vInicio == null) return st.ui.aviso('Ese evento no tiene video.', 'error');
    let disponible = false;
    try { disponible = await st.api.clips.disponible(); } catch (_) {}
    if (!disponible) return st.ui.aviso('Para cortar clips hace falta ffmpeg.', 'error');
    const hasta = c.vFin != null ? c.vFin : c.vInicio + 6;
    try {
        await st.api.clips.exportar({
            ruta: g.ruta,
            cortes: [{ desde: c.vInicio, hasta, nombre: `${ev.name || 'Clip'} ${formatoTiempo(ev.start)}` }],
            destino: 'carpeta',
            subcarpeta: `Partidos/${st.nombre}/Clips`
        });
        st.ui.aviso('Clip guardado.', 'ok');
    } catch (err) {
        st.ui.aviso('No se pudo guardar el clip: ' + ((err && err.message) || err), 'error');
    }
}

// ─────────────────────────────────────────────
// CLIPS EN VIVO → el iPad que mira
// ─────────────────────────────────────────────
// Recién cuando hay un iPad que mira: sin él, un partido no llena la carpeta
// Clips de cortes que nadie pidió. Si entra tarde, los eventos que ya
// estaban se cortan igual (planClipsEnVivo los ve como nuevos).
const hayQuienMire = () => st.clientes.some(c => !c.activo);

function revisarClipsEnVivo() {
    if (!st || st.fase !== 'vivo' || !st.enVivo.ffmpeg || !st.conexion || !hayQuienMire()) return;
    const g = st.grab && st.grab.estado();
    if (!g || !g.grabando || !g.ruta) return;
    const cv = st.enVivo;
    const eq = { A: st.local || 'Local', B: st.visitante || 'Visitante' };
    const plan = planClipsEnVivo(st.partido.motor.estado().eventos, cv.porEvento, {
        clipDe,
        equipoDe: ev => eq[equipoDeBoton(st.plantilla.datos, ev.buttonId)] || null
    });
    for (const { ev, tiempos, meta } of plan.cortar) {
        // Se anota ya, antes de cortar: el próximo cambio del motor no lo
        // tiene que volver a encolar. Si el corte falla no se reintenta.
        const previo = cv.porEvento.get(ev.id);
        const hecho = { id: previo ? previo.id : 'c' + (++cv.n), tiempos, meta, ruta: null };
        cv.porEvento.set(ev.id, hecho);
        encolarCorte(hecho, g.ruta, ev);
    }
    for (const { ev, meta } of plan.actualizar) {
        const hecho = cv.porEvento.get(ev.id);
        hecho.meta = meta;
        if (hecho.ruta) publicarClip(hecho);
    }
    for (const id of plan.quitar) {
        const hecho = cv.porEvento.get(id);
        cv.porEvento.delete(id);
        st.api.remoto.enviar({ tipo: 'quitarClip', id: hecho.id }).catch(() => {});
    }
}

function encolarCorte(hecho, video, ev) {
    const s = st;
    s.enVivo.cola = s.enVivo.cola.then(async () => {
        // Ya se volvió a cortar con otros segundos, o el evento se borró.
        if (s.enVivo.porEvento.get(ev.id) !== hecho) return;
        const r = await s.api.clips.exportar({
            ruta: video,
            cortes: [{ desde: hecho.tiempos.desde, hasta: hecho.tiempos.hasta, nombre: `${hecho.meta.nombre} ${formatoTiempo(hecho.meta.inicio)}` }],
            destino: 'carpeta',
            subcarpeta: `Partidos/${s.nombre}`
        });
        hecho.ruta = r && r.rutas && r.rutas[0];
        if (hecho.ruta && s.enVivo.porEvento.get(ev.id) === hecho) publicarClip(hecho, s);
    }).catch(err => {
        console.warn('Clip en vivo:', err);
        // Una vez por partido: si ffmpeg no puede con este video, no puede
        // con ninguno, y un aviso por evento taparía la pantalla.
        if (!s.enVivo.fallo && st === s) {
            s.enVivo.fallo = true;
            s.ui.aviso('No se pudo cortar un clip para el iPad que mira: ' + ((err && err.message) || err), 'error');
        }
    });
}

function publicarClip(hecho, s = st) {
    return s.api.remoto.enviar({
        tipo: 'clip',
        clip: { id: hecho.id, ruta: hecho.ruta, ...hecho.meta, duracion: hecho.tiempos.hasta - hecho.tiempos.desde }
    }).catch(() => {});
}

// ─────────────────────────────────────────────
// TERMINAR
// ─────────────────────────────────────────────
async function terminar({ desdeIpad = null } = {}) {
    if (st.fase !== 'vivo' || st.terminando) return;
    st.terminando = true;
    const si = await st.ui.confirmar(
        (desdeIpad ? `${desdeIpad} pide terminar el partido. ` : '') + 'Se cierra el video y se guarda todo en la base.',
        { titulo: 'Terminar el partido', si: 'Terminar' });
    if (!si) {
        st.terminando = false;
        if (desdeIpad) st.api.remoto.enviar({ tipo: 'aviso', texto: 'La compu no terminó el partido.' }).catch(() => {});
        return;
    }
    st.fase = 'guardando';
    pintar();
    try {
        st.guardado = await guardarPartido();
        st.fase = 'fin';
        estadoGlobal.poner('grabando', null);
        await st.api.remoto.enviar({ tipo: 'guardado', nombre: st.guardado.nombre }).catch(() => {});
    } catch (err) {
        // El motor ya terminó: no se vuelve a "vivo". Se deja reintentar.
        st.fase = 'error';
        st.error = (err && err.message) || String(err);
    }
    st.terminando = false;
    pintar();
}

async function guardarPartido() {
    const api = st.api;
    const datos = st.plantilla.datos;
    const fin = st.partido.terminar();

    // 1. El video: se cierra y va a Partidos/<nombre>/<nombre>.mp4.
    let video = null;
    if (st.grab && st.grab.estado().grabando) video = await st.grab.detener();
    else if (st.grab) video = st.grab.estado().ultima;
    // Los clips en vivo que falten se terminan de cortar antes de mover el
    // video: en Windows no se puede renombrar un archivo que ffmpeg está
    // leyendo. Con la grabación cerrada, ninguno espera a que llegue más.
    await st.enVivo.cola;
    const subcarpeta = 'Partidos/' + st.nombre;
    let videoRuta = null;
    if (video && video.ruta) videoRuta = (await api.video.ubicar(video.ruta, { nombre: st.nombre, subcarpeta })).ruta;

    // 2. Los eventos en formato PARTIDO (inicio/fin de partido, vInicio/vFin
    // de video).
    const eventos = eventosParaPartido(datos, fin, { A: st.local || 'A', B: st.visitante || 'B' });
    const posesion = (fin.tramosPos || []).map(t => ({
        equipo: t.equipo, inicio: t.start != null ? t.start : t.inicio, fin: t.end != null ? t.end : t.fin
    }));

    // 3. El XML va al lado del video con el mismo nombre, y por eso en
    // segundos del VIDEO: Sportscode/Nacsport lo emparejan y cada clip cae
    // donde tiene que caer. Sin video, en segundos del partido.
    const conVideo = eventos.map(ev => (videoRuta && ev.vInicio != null)
        ? { ...ev, inicio: ev.vInicio, fin: ev.vFin }
        : ev);
    let xmlRuta = null;
    const xml = xmlSportscode({ eventos: conVideo, inicioReal: fin.inicioReal }, datos);
    if (xml) xmlRuta = await api.archivos.guardarTexto({ nombre: st.nombre, extension: 'xml', contenido: xml, subcarpeta });

    const partidoCsv = { eventos, posesion, local: st.local, visitante: st.visitante };
    const csv = csvTiempoEnHielo(partidoCsv, datos) || csvPosesion(partidoCsv, datos);
    if (csv) { try { await api.archivos.guardarTexto({ nombre: st.nombre, extension: 'csv', contenido: csv, subcarpeta }); } catch (_) {} }

    // 4. La base.
    const id = await api.partidos.guardar({
        nombre: st.nombre,
        inicioReal: fin.inicioReal || Date.now(),
        duracion: Number(fin.tiempo) || 0,
        videoRuta,
        videoMime: video ? video.mime : null,
        videoBytes: video ? video.bytes : null,
        xmlRuta,
        local: st.local, visitante: st.visitante,
        plantilla: datos, plantillaId: st.plantilla.id,
        origen: 'ipad-vivo',
        eventos: eventos.map(ev => ({ ...ev })),
        posesion
    });
    return { id, nombre: st.nombre, videoRuta, xmlRuta, eventos: eventos.length };
}

// ─────────────────────────────────────────────
// PANTALLAS
// ─────────────────────────────────────────────
function pintar() {
    if (!st || !st.raiz) return;
    if (st.vista) { try { st.vista.destruir(); } catch (_) {} st.vista = null; }
    st.raiz.textContent = '';
    if (st.fase === 'preparar') return armarPreparar();
    if (st.fase === 'vivo') return armarVivo();
    return armarFin();
}

// ── Preparación ─────────────────────────────
function armarPreparar() {
    const r = st.raiz;
    r.append(
        h('header', { class: 'tv-barra tv-ipad-cabeza' },
            h('h1', { texto: 'Captura desde iPad' }),
            h('p', { class: 'tv-ipad-sub', texto: 'La compu graba; el iPad, en la misma wifi, codifica.' })),
        h('div', { class: 'tv-ipad-rejilla' },
            h('section', { class: 'tv-panel tv-ipad-bloque', id: 'tv-ipad-camara' }),
            h('section', { class: 'tv-panel tv-ipad-bloque', id: 'tv-ipad-partido' }),
            h('section', { class: 'tv-panel tv-ipad-bloque tv-ipad-conexion', id: 'tv-ipad-conexion' })),
        h('div', { class: 'tv-ipad-acciones', id: 'tv-ipad-acciones' }),
        h('section', { class: 'tv-panel tv-ipad-bloque tv-ipad-aparte' },
            h('h2', { texto: 'Codifiqué en el iPad sin la compu' }),
            h('p', { texto: 'En el iPad abrí Historial ▾ y tocá ⤓ para exportar la sesión (o subila a la nube). ' +
                'Después la importás acá con su video, y queda enlazada en la base.' }),
            h('button', { class: 'tv-btn', texto: 'Importar una sesión del iPad', onClick: () => st.ctx.navegar('importar') })));
    pintarPreparar();
}

function pintarPreparar() {
    if (!st || st.fase !== 'preparar') return;
    const $ = id => st.raiz.querySelector('#' + id);
    const cam = $('tv-ipad-camara'), par = $('tv-ipad-partido'), con = $('tv-ipad-conexion'), acc = $('tv-ipad-acciones');
    if (!cam) return;

    // Cámara
    cam.textContent = '';
    const opciones = (lista, elegido, extra) => [
        ...(extra ? [h('option', { value: extra.id, texto: extra.nombre })] : []),
        ...lista.map(d => { const o = h('option', { value: d.id, texto: d.nombre }); if (d.id === elegido) o.selected = true; return o; })
    ];
    cam.append(
        h('h2', { texto: '1. Cámara' }),
        st.camara ? videoPrevio('tv-ipad-previa') : h('div', { class: 'tv-vacio tv-ipad-previa', texto: 'Sin cámara conectada' }),
        h('label', { class: 'tv-campo' }, 'Video',
            h('select', { onChange: e => { st.videoId = e.target.value; } }, opciones(st.entradas.video, st.videoId))),
        h('label', { class: 'tv-campo' }, 'Audio',
            h('select', { onChange: e => { st.audioId = e.target.value; } },
                opciones(st.entradas.audio, st.audioId, { id: '', nombre: 'El de la cámara' }),
                h('option', { value: 'no', texto: 'Sin audio', selected: st.audioId === 'no' }))),
        h('button', { class: 'tv-btn' + (st.camara ? '' : ' tv-btn--primario'), texto: st.camara ? 'Reconectar' : 'Conectar', onClick: conectarCamara }));

    // Partido
    par.textContent = '';
    const campo = (etq, valor, alCambiar) => h('label', { class: 'tv-campo' }, etq,
        h('input', { type: 'text', value: valor, onInput: e => alCambiar(e.target.value) }));
    par.append(
        h('h2', { texto: '2. Partido' }),
        h('div', { class: 'tv-ipad-plantilla' },
            h('span', { texto: st.plantilla ? st.plantilla.nombre : 'Sin plantilla' }),
            h('button', { class: 'tv-btn', texto: st.plantilla ? 'Cambiar' : 'Elegir plantilla', onClick: cambiarPlantilla })),
        campo('Local', st.local, v => { st.local = v; nombrePorDefecto(); const n = par.querySelector('.tv-ipad-nombre input'); if (n) n.value = st.nombre; }),
        campo('Visitante', st.visitante, v => { st.visitante = v; nombrePorDefecto(); const n = par.querySelector('.tv-ipad-nombre input'); if (n) n.value = st.nombre; }),
        h('div', { class: 'tv-ipad-nombre' }, campo('Nombre del partido', st.nombre, v => { st.nombre = v; st.nombreTocado = true; })));

    // Conexión
    con.textContent = '';
    con.append(h('h2', { texto: '3. iPad' }));
    if (!st.conexion) {
        con.append(
            h('p', { texto: 'El iPad tiene que estar en la misma wifi que la compu.' }),
            h('button', { class: 'tv-btn tv-btn--primario', texto: 'Conectar iPad', disabled: !st.plantilla, onClick: conectarIpad }));
    } else {
        const c = st.conexion;
        const urls = c.urls && c.urls.length ? c.urls : [c.url];
        const qr = (c.qrs && c.qrs[st.urlElegida]) || c.qrSvg;
        con.append(
            h('p', { texto: 'En el iPad abrí la cámara y apuntá al código, o escribí la dirección en Safari:' }),
            // El SVG lo genera la librería qrcode en main a partir de la URL.
            qr ? h('div', { class: 'tv-ipad-qr', html: qr }) : null,
            urls.length > 1
                ? h('select', { class: 'tv-ipad-url', onChange: e => { st.urlElegida = e.target.value; pintarPreparar(); } },
                    urls.map((u, i) => h('option', { value: u, selected: u === st.urlElegida,
                        texto: u + (c.adaptadores && c.adaptadores[i] ? ` (${c.adaptadores[i].adaptador})` : '') })))
                : h('div', { class: 'tv-ipad-url', texto: urls[0] }),
            h('div', { class: 'tv-ipad-pin' }, h('span', { texto: 'PIN' }), h('strong', { texto: c.pin })),
            listaIpads());
        if (st.firewall) con.append(ayudaFirewall());
    }

    // Acciones
    acc.textContent = '';
    acc.append(
        h('button', { class: 'tv-btn', texto: 'Empezar sin iPad', disabled: !st.plantilla,
            title: 'Codificar desde la compu', onClick: () => empezar({ sinIpad: true }) }),
        h('button', { class: 'tv-btn tv-btn--primario', texto: 'Empezar', disabled: !st.plantilla || !hayIpad(),
            onClick: () => empezar() }));
}

function listaIpads() {
    if (!st.clientes.length) return h('div', { class: 'tv-vacio', texto: 'Esperando un iPad…' });
    return h('ul', { class: 'tv-lista tv-ipad-clientes' }, st.clientes.map(c => h('li', { class: 'tv-lista__fila' },
        h('span', { class: 'tv-ipad-punto ' + (c.conectado ? 'is-ok' : 'is-mal') }),
        h('span', { texto: c.nombre || 'iPad' }),
        h('span', { class: 'tv-ipad-tenue', texto: c.activo ? 'codifica' : 'mira los clips' }),
        h('span', { class: 'tv-ipad-tenue', texto: c.latenciaMs != null ? c.latenciaMs + ' ms' : '—' }))));
}

function ayudaFirewall() {
    return h('div', { class: 'tv-ipad-ayuda' },
        h('strong', { texto: 'Pasó un minuto y el iPad no llegó.' }),
        h('ol', {},
            h('li', { texto: 'Revisá que el iPad esté en la MISMA wifi que la compu (no en datos móviles).' }),
            h('li', { texto: 'Si Windows preguntó por el firewall, tocá “Permitir” con “Redes privadas” marcado. ' +
                'Si ya lo cerraste: Seguridad de Windows → Firewall → Permitir una aplicación → Tag & View Pro → Privada.' }),
            h('li', { texto: 'Marcá la wifi como red privada: Configuración → Red e Internet → Wi-Fi → (tu red) → Tipo de perfil de red: Privada.' }),
            h('li', { texto: 'Si la compu tiene varias direcciones, probá con la otra de la lista.' })));
}

// ── En vivo ─────────────────────────────────
function armarVivo() {
    const r = st.raiz;
    r.append(
        h('div', { class: 'tv-ipad-aviso-caido', id: 'tv-ipad-caido', hidden: true },
            h('strong', { texto: 'El iPad se desconectó' }),
            h('span', { texto: 'Los toques quedan guardados en el iPad y entran al reconectar, en su segundo.' })),
        h('header', { class: 'tv-barra tv-ipad-vivo-barra' },
            h('span', { class: 'tv-ipad-reloj', id: 'tv-ipad-reloj', texto: '00:00' }),
            h('span', { class: 'tv-ipad-rec', id: 'tv-ipad-rec', texto: '● REC', hidden: true }),
            h('span', { class: 'tv-ipad-tenue', id: 'tv-ipad-bytes' }),
            h('span', { class: 'tv-ipad-conectado', id: 'tv-ipad-conectado' }),
            h('span', { class: 'tv-ipad-espacio' }),
            h('button', { class: 'tv-btn', id: 'tv-ipad-play', onClick: () => st.partido.alternar() }),
            h('button', { class: 'tv-btn tv-btn--peligro', texto: 'Terminar', onClick: () => terminar() })),
        h('div', { class: 'tv-ipad-vivo' },
            h('div', { class: 'tv-ipad-video' }, st.camara ? videoPrevio('tv-ipad-video__v') : h('div', { class: 'tv-vacio', texto: 'Sin video' })),
            h('aside', { class: 'tv-ipad-lado' },
                h('div', { class: 'tv-panel tv-ipad-mini', id: 'tv-ipad-mini' }),
                h('div', { class: 'tv-panel tv-ipad-registro' },
                    h('h2', { texto: 'Registro' }),
                    h('ul', { class: 'tv-lista', id: 'tv-ipad-registro' })))));

    // Botonera chica: espeja al iPad. Solo se toca si no hay iPad
    // codificando (o se empezó sin iPad): dos manos a la vez sobre el mismo
    // partido confunden más de lo que ayudan.
    st.vista = crearVista(st.raiz.querySelector('#tv-ipad-mini'), st.plantilla.datos, {
        ajustar: true,
        mostrarAtajos: false,
        alTocar: (el, _ev, extra) => {
            if (iPadActivo() && !st.sinIpad) return st.ui.aviso('Está codificando el iPad. La botonera de la compu solo lo espeja.');
            if (el && el.emergente) st.partido.aplicarRemota({ tipo: 'elegirEmergente', id: el.id }, 'compu');
            else st.partido.tocarLocal(el.id, extra && extra.equipo ? { equipo: extra.equipo } : {});
        },
        alCerrarDetalle: () => st.partido.aplicarRemota({ tipo: 'cerrarDetalle' }, 'compu')
    });
    pintarEstadoVivo();
    pintarRegistro();
}

function pintarVivo() {
    if (st.fase === 'vivo') pintarEstadoVivo();
    else if (st.fase === 'preparar') pintarPreparar();
}

function pintarEstadoVivo() {
    if (!st || st.fase !== 'vivo' || !st.partido) return;
    const q = id => st.raiz.querySelector('#' + id);
    const e = st.partido.motor.estado();
    const g = st.grab ? st.grab.estado() : null;
    const reloj = q('tv-ipad-reloj');
    if (!reloj) return;
    reloj.textContent = formatoTiempo(e.tiempo);
    q('tv-ipad-rec').hidden = !(g && g.grabando);
    q('tv-ipad-bytes').textContent = g && g.grabando ? formatoBytes(g.bytes) : '';
    const play = q('tv-ipad-play');
    play.textContent = e.andando ? '❚❚ Pausa' : '▶ Play';
    play.classList.toggle('tv-btn--primario', !e.andando);

    const act = iPadActivo();
    const con = q('tv-ipad-conectado');
    const miran = st.clientes.filter(c => !c.activo && c.conectado).length;
    con.textContent = (st.sinIpad && !act ? 'Codificando en la compu'
        : act ? `● ${act.nombre || 'iPad'}${act.latenciaMs != null ? ' · ' + act.latenciaMs + ' ms' : ''}`
        : '● iPad desconectado') + (miran ? ` · ${miran} mirando clips` : '');
    con.className = 'tv-ipad-conectado ' + (act ? 'is-ok' : st.sinIpad ? '' : 'is-mal');

    seguirConexion();
    q('tv-ipad-caido').hidden = !(st.caidoDesde != null && Date.now() - st.caidoDesde > SIN_IPAD_AVISO_MS);

    if (st.vista) st.vista.pintar(e);
}

function pintarRegistro() {
    const ul = st && st.raiz && st.raiz.querySelector('#tv-ipad-registro');
    if (!ul) return;
    const e = st.partido.motor.estado();
    const todos = [...e.abiertos, ...e.eventos].filter(ev => !ev.posesionDe);
    ul.textContent = '';
    if (!todos.length) { ul.append(h('li', { class: 'tv-vacio', texto: 'Todavía no hay eventos.' })); return; }
    for (const ev of todos.slice(0, 200)) {
        const origen = st.partido.origenDe(ev.id);
        const c = clipDe(ev);
        ul.append(h('li', { class: 'tv-lista__fila tv-ipad-ev' },
            h('span', { class: 'tv-ipad-tenue', texto: formatoTiempo(ev.start) }),
            h('span', { class: 'tv-ipad-ev__nombre', texto: ev.name + (ev.end == null ? ' …' : '') }),
            h('span', { class: 'tv-ipad-origen', texto: origen === 'ipad' ? 'iPad' : 'compu' }),
            c.vInicio != null ? h('button', { class: 'tv-btn tv-btn--icono', title: 'Ver', texto: '▶', onClick: () => verClip(ev) }) : null,
            c.vInicio != null && ev.end != null ? h('button', { class: 'tv-btn tv-btn--icono', title: 'Guardar clip', texto: '✂', onClick: () => guardarClip(ev) }) : null));
    }
}

// ── Guardando / fin / error ─────────────────
function armarFin() {
    const r = st.raiz;
    if (st.fase === 'guardando') {
        r.append(h('div', { class: 'tv-vacio tv-ipad-fin' }, h('h2', { texto: 'Guardando el partido…' }),
            h('p', { texto: 'Cerrando el video y escribiendo el XML.' })));
        return;
    }
    if (st.fase === 'error') {
        r.append(h('div', { class: 'tv-panel tv-ipad-fin' },
            h('h2', { texto: 'No se pudo guardar' }),
            h('p', { texto: st.error }),
            h('button', { class: 'tv-btn tv-btn--primario', texto: 'Reintentar', onClick: async () => {
                st.fase = 'guardando'; pintar();
                try { st.guardado = await guardarPartido(); st.fase = 'fin'; estadoGlobal.poner('grabando', null); }
                catch (err) { st.fase = 'error'; st.error = (err && err.message) || String(err); }
                pintar();
            } })));
        return;
    }
    const g = st.guardado;
    r.append(h('div', { class: 'tv-panel tv-ipad-fin' },
        h('h2', { texto: 'Partido guardado' }),
        h('p', { texto: `“${g.nombre}”: ${g.eventos} eventos` + (g.videoRuta ? ', con el video y el XML enlazados.' : ', sin video.') }),
        h('div', { class: 'tv-ipad-acciones' },
            g.xmlRuta || g.videoRuta ? h('button', { class: 'tv-btn', texto: 'Abrir la carpeta',
                onClick: () => st.api.archivos.abrirCarpeta('Partidos/' + g.nombre) }) : null,
            h('button', { class: 'tv-btn tv-btn--primario', texto: 'Ver en la base', onClick: () => st.ctx.navegar('base', { partidoId: g.id }) }))));
}

// ─────────────────────────────────────────────
// LA RAMA
// ─────────────────────────────────────────────
async function limpiar() {
    if (!st) return;
    const s = st;
    st = null;
    s.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
    s.quitar.forEach(q => { try { q(); } catch (_) {} });
    if (s.vista) { try { s.vista.destruir(); } catch (_) {} }
    if (s.grab) { try { s.grab.destruir(); } catch (_) {} }
    try { await s.api.remoto.detener(); } catch (_) {}
}

export default {
    id: 'ipad',
    titulo: 'Captura desde iPad',
    icono: ICONO,
    descripcion: 'La compu graba; el iPad codifica por wifi',

    async montar(contenedor, ctx) {
        await limpiar();
        st = estadoNuevo(ctx);
        st.raiz = h('div', { class: 'tv-ipad' });
        contenedor.appendChild(st.raiz);

        const r = ctx.api.remoto;
        if (r && r.onCliente) st.quitar.push(r.onCliente(alCliente));
        if (r && r.onMensaje) st.quitar.push(r.onMensaje(alMensaje));

        await prepararGrabadora();
        let id = ctx.params && ctx.params.plantillaId;
        if (id == null) {
            try {
                const lista = await ctx.api.plantillas.listar();
                if (lista.length === 1) id = lista[0].id;   // una sola: no se pregunta
            } catch (_) {}
        }
        if (id != null) await cargarPlantilla(id);
        nombrePorDefecto();
        pintar();
    },

    async desmontar() {
        if (!st) return true;
        const grabando = st.grab && st.grab.estado().grabando;
        // 'error' = terminado pero sin guardar: salir perdería el partido.
        if (st.fase === 'vivo' || st.fase === 'guardando' || st.fase === 'error' || grabando) {
            st.ui.aviso('Hay un partido en curso. Terminalo antes de salir.', 'error');
            return false;
        }
        await limpiar();
        return true;
    }
};
