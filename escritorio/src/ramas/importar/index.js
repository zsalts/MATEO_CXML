// Rama Importar: un video ya grabado + su archivo de marcas → un partido en
// la base, con el video y el XML enlazados.
//
// Asistente de 4 pasos: 1. Video · 2. Archivo de marcas · 3. Revisar y
// sincronizar · 4. Guardar. Todo lo elegido vive en `st`: volver a un paso
// solo lo vuelve a dibujar, no pierde nada.
//
// Con `params.partidoId` es "vincular video": el partido ya está en la base
// (codificado en el iPad, importado sin video…). El paso 2 se saltea, se
// sincroniza con sus eventos y se actualizan en el lugar.
//
// Tiempos: cada evento guarda `inicio/fin` = el tiempo que trajo el archivo
// (en un XML ya es del video; en una sesión del iPad es reloj de partido) y
// recién al guardar se aplica `video = archivo + desfase` (lectores.js,
// aplicarDesfase). Mover el desfase veinte veces no acumula nada.

import {
    detectarFormato, leerSportscode, leerSesionIpad, sesionesDeRespaldo, plantillaDeSesion,
    plantillaDesdeFilas, filasDePlantilla, eventosDesdeSportscode, aplicarDesfase, resumir,
    clipsDeMuestra, xmlParaGuardar, buscarDuplicados, nombreLimpio, decodificarTexto
} from './lectores.js';

const EXTENSIONES_VIDEO = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mts', 'm4v'];
// Contenedores que Chromium casi nunca abre: se avisa antes de intentarlo.
const SIN_VISTA_PREVIA_PROBABLE = ['avi', 'mts'];
const MIME = {
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', mkv: 'video/x-matroska',
    webm: 'video/webm', avi: 'video/x-msvideo', mts: 'video/mp2t'
};

const PASOS = ['Video', 'Archivo de marcas', 'Revisar y sincronizar', 'Guardar'];

// ─────────────────────────────────────────────
// UTILIDADES DE DOM (locales a la rama)
// ─────────────────────────────────────────────
// h('div', {class, texto, onClick, ...atributos}, ...hijos). Todo texto entra
// como textContent: nunca se arma HTML con datos de un archivo.
function h(tag, props, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'texto') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;              // solo SVG fijo de este archivo
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat(Infinity)) {
        if (c == null || c === false) continue;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
}

// 83.4 → "1:23" · 3723 → "1:02:03" · con décimas si se pide.
function tiempo(seg, decimas) {
    if (seg == null || !isFinite(seg)) return '—';
    const neg = seg < 0;
    let s = Math.abs(seg);
    const hh = Math.floor(s / 3600); s -= hh * 3600;
    const mm = Math.floor(s / 60); s -= mm * 60;
    const ss = decimas ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
    return (neg ? '−' : '') + (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + ss;
}

function bytes(n) {
    if (!n) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i >= 2 ? 1 : 0).replace('.', ',') + ' ' + u[i];
}

const coma = (n, dec = 1) => Number(n).toFixed(dec).replace('.', ',');
const desfaseTexto = (d) => (d >= 0 ? '+' : '−') + coma(Math.abs(d), 1) + ' s';
const extDe = (ruta) => String(ruta || '').split(/[\\/]/).pop().split('.').pop().toLowerCase();
const nombreDe = (ruta) => String(ruta || '').split(/[\\/]/).pop();
const sinExt = (n) => String(n || '').replace(/\.[^.]+$/, '');

const ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v11"/><path d="m7 9 5 5 5-5"/><rect x="3" y="16" width="18" height="5" rx="1.5"/>' +
    '<path d="M7 18.5h.01M10.5 18.5h6"/></svg>';

// ─────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────
function estadoNuevo() {
    return {
        paso: 1,
        visitado: 1,                 // el paso más lejano al que se llegó
        vincular: null,              // PARTIDO de la base (modo vincular)
        video: null,                 // {ruta, nombre, ext, url, info, duracion, reproducible}
        marcas: null,                // ver elegirArchivoMarcas()
        eventos: [],                 // formato PARTIDO, con inicio/fin del archivo
        desfase: 0,
        datos: { nombre: '', local: '', visitante: '' },
        copiarVideo: null,           // null = lo que digan los ajustes
        guardando: false,
        copiando: false,
        cancelado: false,
        progreso: null,              // {hecho, total}
        resultado: null,             // {partidoId, videoRuta, xmlRuta, soloVideo}
        error: null
    };
}

// ─────────────────────────────────────────────
// LA RAMA
// ─────────────────────────────────────────────
let st = null;
let ctx = null;
let raiz = null;
let reproductor = null;             // un solo <video> que pasa de paso en paso
let finTramo = null;                // para cortar la reproducción de un clip de muestra
let quitarProgreso = null;
let equipos = [];
let ajustes = {};

export default {
    id: 'importar',
    titulo: 'Importar',
    icono: ICONO,
    descripcion: 'Un video ya grabado y su XML o sesión del iPad, a la base',

    async montar(contenedor, contexto) {
        ctx = contexto;
        st = estadoNuevo();
        raiz = h('div', { class: 'tv-importar' });
        contenedor.appendChild(raiz);
        crearReproductor();

        try { ajustes = (await ctx.api.ajustes.leer()) || {}; } catch (_) { ajustes = {}; }
        await cargarEquipos();

        const id = ctx.params && ctx.params.partidoId;
        if (id != null) {
            try {
                const p = await ctx.api.partidos.leer(id);
                if (!p) throw new Error('no está en la base');
                prepararVinculo(p);
            } catch (err) {
                ctx.ui.aviso('No se pudo abrir el partido para vincularle un video: ' + motivo(err), 'error');
            }
        }
        dibujar();
    },

    async desmontar() {
        if (st && st.copiando) {
            const salir = await ctx.ui.confirmar(
                'Se está copiando el video a la carpeta de trabajo. Si salís se cancela la copia y el partido no se guarda.',
                { titulo: 'Copia en curso', peligro: true });
            if (!salir) return false;
            await cancelarCopia();
        }
        if (st && st.guardando && !st.copiando) return false;   // escribiendo en la base: un segundo
        soltar();
        return true;
    }
};

function soltar() {
    if (quitarProgreso) { try { quitarProgreso(); } catch (_) { /* ya no estaba */ } quitarProgreso = null; }
    if (reproductor) {
        reproductor.pause();
        reproductor.removeAttribute('src');
        reproductor.load();
    }
    reproductor = null;
    raiz = null;
    st = null;
}

const motivo = (err) => (err && err.message) || String(err);

async function cargarEquipos() {
    try { equipos = (await ctx.api.equipos.listar()) || []; } catch (_) { equipos = []; }
}

function prepararVinculo(p) {
    st.vincular = p;
    st.datos = { nombre: p.nombre || '', local: p.local || '', visitante: p.visitante || '' };
    st.desfase = Number(p.desfase) || 0;
    // El reloj de base es `inicio` (partido). Uno viejo sin `inicio` se
    // reconstruye desde el video con el desfase que tenía.
    st.eventos = (p.eventos || []).map(ev => {
        const ini = ev.inicio != null ? Number(ev.inicio) : Number(ev.v_inicio) - st.desfase;
        const fin = ev.fin != null ? Number(ev.fin) : (ev.v_fin != null ? Number(ev.v_fin) - st.desfase : ini + 1);
        return { id: ev.id, nombre: ev.nombre, inicio: ini, fin, etiquetas: ev.etiquetas || [] };
    }).filter(ev => isFinite(ev.inicio));
    const filas = filasDePlantilla(p.plantilla ? parsear(p.plantilla) : null, st.eventos.map(e => e.nombre));
    // Un partido sin video casi siempre viene del iPad: sus tiempos son reloj
    // de partido y se sincroniza con "el partido arranca acá".
    st.marcas = { tipo: 'base', filas, avisos: [], sincronizarComo: 'ipad' };
}

const parsear = (x) => { if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch (_) { return null; } };

// ─────────────────────────────────────────────
// DIBUJO GENERAL: pasos, cuerpo, pie
// ─────────────────────────────────────────────
function pasosVisibles() {
    // En vincular el paso 2 es el partido de la base, ya "hecho".
    return PASOS.map((t, i) => ({
        n: i + 1,
        titulo: st.vincular && i === 1 ? 'Partido de la base' : t,
        salteado: (st.vincular && i === 1) || (i === 2 && soloVideo())
    }));
}

const soloVideo = () => !!(st.marcas && st.marcas.tipo === 'solo-video');

function dibujar() {
    if (!raiz) return;
    raiz.textContent = '';

    const cabeza = h('header', { class: 'tv-importar-cabeza' },
        h('h1', { texto: st.vincular ? 'Vincular video a un partido' : 'Importar video y marcas' }),
        st.vincular ? h('p', { class: 'tv-importar-sub', texto: `"${st.vincular.nombre}" · ${st.eventos.length} eventos` }) : null);

    const pasos = h('ol', { class: 'tv-importar-pasos' },
        pasosVisibles().map(p => {
            const alcanzable = !st.resultado && !st.guardando && p.n <= st.visitado && !p.salteado;
            return h('li', {
                class: 'tv-importar-paso' + (p.n === st.paso ? ' is-actual' : '') +
                       (p.n < st.visitado || st.resultado ? ' is-hecho' : '') + (p.salteado ? ' is-salteado' : ''),
            }, h('button', {
                class: 'tv-importar-paso__btn', disabled: !alcanzable,
                onClick: () => irA(p.n)
            }, h('span', { class: 'tv-importar-paso__n', texto: String(p.n) }), h('span', { texto: p.titulo })));
        }));

    const cuerpo = h('section', { class: 'tv-importar-cuerpo' });
    [null, paso1, paso2, paso3, paso4][st.paso](cuerpo);

    raiz.append(cabeza, pasos, cuerpo, pie());
}

function pie() {
    if (st.resultado) return h('footer', { class: 'tv-importar-pie' });
    const atras = anterior(st.paso);
    const siguiente = st.paso < 4 ? h('button', {
        class: 'tv-btn tv-btn--primario', texto: 'Siguiente',
        disabled: !!puedeSeguir(st.paso) || st.guardando,
        title: puedeSeguir(st.paso) || null,
        onClick: () => irA(proximo(st.paso))
    }) : null;
    const falta = st.paso < 4 ? puedeSeguir(st.paso) : null;
    return h('footer', { class: 'tv-importar-pie' },
        h('button', { class: 'tv-btn', texto: 'Atrás', disabled: !atras || st.guardando, onClick: () => irA(atras) }),
        h('span', { class: 'tv-importar-pie__falta', texto: falta || '' }),
        siguiente);
}

function proximo(n) {
    if (n === 1 && st.vincular) return 3;
    if (n === 2 && soloVideo()) return 4;
    return n + 1;
}
function anterior(n) {
    if (n <= 1) return null;
    if (n === 3 && st.vincular) return 1;
    if (n === 4 && soloVideo()) return 2;
    return n - 1;
}

// null = se puede seguir; si no, el texto de lo que falta.
function puedeSeguir(n) {
    if (n === 1) return st.video ? null : 'Elegí el video del partido';
    if (n === 2) {
        const m = st.marcas;
        if (!m) return 'Elegí el archivo de marcas o "Solo el video"';
        if (m.tipo === 'ipad-respaldo') return 'Elegí qué sesión del respaldo importar';
        if (m.tipo !== 'solo-video' && !st.eventos.length) return 'El archivo no trae ninguna marca que se pueda usar';
        return null;
    }
    if (n === 3) return st.vincular || st.datos.nombre.trim() ? null : 'Poné el nombre del partido';
    return null;
}

function irA(n) {
    if (!n || n === st.paso) return;
    // Hacia adelante solo si cada paso intermedio está completo.
    if (n > st.paso) {
        for (let k = st.paso; k < n; k = proximo(k)) if (puedeSeguir(k)) return;
    }
    finTramo = null;
    if (reproductor) reproductor.pause();
    st.paso = n;
    st.visitado = Math.max(st.visitado, n);
    dibujar();
}

// ─────────────────────────────────────────────
// REPRODUCTOR COMPARTIDO
// ─────────────────────────────────────────────
function crearReproductor() {
    reproductor = h('video', { class: 'tv-importar-video', controls: true, preload: 'metadata' });
    reproductor.addEventListener('loadedmetadata', () => {
        if (!st || !st.video) return;
        st.video.reproducible = true;
        if (!st.video.duracion && isFinite(reproductor.duration)) {
            st.video.duracion = reproductor.duration;
            if (st.paso === 1 || st.paso === 3) dibujar();
        }
        refrescarEstadoVideo();
    });
    reproductor.addEventListener('error', () => {
        if (!st || !st.video || !reproductor.getAttribute('src')) return;
        st.video.reproducible = false;
        refrescarEstadoVideo();
    });
    reproductor.addEventListener('timeupdate', () => {
        if (finTramo != null && reproductor.currentTime >= finTramo) {
            reproductor.pause();
            finTramo = null;
        }
        const rel = raiz && raiz.querySelector('.tv-importar-reloj');
        if (rel) rel.textContent = relojTexto();
    });
}

function relojTexto() {
    const t = reproductor ? reproductor.currentTime : 0;
    const marca = t - st.desfase;
    return `Video ${tiempo(t, true)} · marcas ${tiempo(marca, true)}`;
}

function refrescarEstadoVideo() {
    const caja = raiz && raiz.querySelector('.tv-importar-estado-video');
    if (caja) caja.replaceWith(estadoVideo());
}

function estadoVideo() {
    const v = st.video;
    if (!v) return h('div', { class: 'tv-importar-estado-video' });
    if (v.reproducible === false) {
        return h('div', { class: 'tv-importar-estado-video tv-importar-nota tv-importar-nota--aviso' },
            `Chromium no puede reproducir este archivo (.${v.ext}, probablemente por el códec). `,
            'Se puede importar igual y los clips quedan bien si los tiempos están bien, pero sin vista previa: ',
            'no vas a poder sincronizar mirando el video. Si podés, convertilo a .mp4 (H.264) antes.');
    }
    if (v.reproducible == null && SIN_VISTA_PREVIA_PROBABLE.includes(v.ext)) {
        return h('div', { class: 'tv-importar-estado-video tv-importar-nota' },
            `Los .${v.ext} a veces no se ven en la app (depende del códec). Probando…`);
    }
    return h('div', { class: 'tv-importar-estado-video' });
}

function ponerVideoEn(caja) {
    if (!st.video || !st.video.url) {
        caja.appendChild(h('div', { class: 'tv-importar-video tv-importar-video--vacio tv-vacio', texto: 'Sin vista previa' }));
        return;
    }
    caja.appendChild(reproductor);   // lo mueve: no recarga el archivo
}

function reproducirTramo(desde, hasta) {
    if (!reproductor || !st.video || st.video.reproducible === false) return;
    const margen = Number(ajustes.margen) || 0;
    reproductor.currentTime = Math.max(0, desde - margen);
    finTramo = hasta + margen;
    reproductor.play().catch(() => { /* el usuario lo frenó antes de arrancar */ });
}

// ─────────────────────────────────────────────
// PASO 1 — VIDEO
// ─────────────────────────────────────────────
function paso1(cuerpo) {
    const v = st.video;
    const elegir = h('button', {
        class: 'tv-btn' + (v ? '' : ' tv-btn--primario'),
        texto: v ? 'Elegir otro video…' : 'Elegir video…',
        onClick: elegirVideo
    });

    if (!v) {
        cuerpo.appendChild(h('div', { class: 'tv-importar-inicio tv-panel' },
            h('p', { class: 'tv-importar-grande', texto: 'Elegí el video del partido' }),
            h('p', { class: 'tv-importar-sub', texto: EXTENSIONES_VIDEO.map(e => '.' + e).join('  ') }),
            elegir));
        return;
    }

    const info = v.info || {};
    const vista = h('div', { class: 'tv-importar-vista' });
    ponerVideoEn(vista);
    cuerpo.appendChild(h('div', { class: 'tv-importar-dos' },
        vista,
        h('div', { class: 'tv-panel tv-importar-ficha' },
            h('h2', { texto: v.nombre }),
            h('dl', {},
                h('dt', { texto: 'Duración' }), h('dd', { texto: tiempo(v.duracion) }),
                h('dt', { texto: 'Resolución' }), h('dd', { texto: info.ancho ? `${info.ancho} × ${info.alto}` : '—' }),
                h('dt', { texto: 'Tamaño' }), h('dd', { texto: bytes(info.bytes) }),
                h('dt', { texto: 'Ubicación' }), h('dd', { class: 'tv-importar-ruta', texto: v.ruta })),
            estadoVideo(),
            st.vincular && st.vincular.video_ruta
                ? h('div', { class: 'tv-importar-nota tv-importar-nota--aviso',
                    texto: `El partido ya tiene un video enlazado (${nombreDe(st.vincular.video_ruta)}). Al guardar se reemplaza por este; el archivo viejo queda en el disco.` })
                : null,
            elegir)));
}

async function elegirVideo() {
    let ruta;
    try { ruta = await ctx.api.video.elegirArchivo(); } catch (err) {
        ctx.ui.aviso('No se pudo abrir el selector de archivos: ' + motivo(err), 'error');
        return;
    }
    if (!ruta) return;
    const ext = extDe(ruta);
    if (!EXTENSIONES_VIDEO.includes(ext)) {
        ctx.ui.aviso(`".${ext}" no es un formato de video que se pueda importar (${EXTENSIONES_VIDEO.join(', ')}).`, 'error');
        return;
    }

    finTramo = null;
    st.video = { ruta, nombre: nombreDe(ruta), ext, url: null, info: null, duracion: 0, reproducible: null };
    // Sin ffprobe no hay info: la duración la da el <video> al cargar.
    try { st.video.info = await ctx.api.video.info(ruta); } catch (_) { st.video.info = null; }
    if (st.video.info && st.video.info.duracion) st.video.duracion = st.video.info.duracion;
    try { st.video.url = await ctx.api.video.url(ruta); } catch (_) { st.video.url = null; }

    if (st.video.url) {
        reproductor.src = st.video.url;
        reproductor.load();
    } else {
        st.video.reproducible = false;
    }
    if (!st.datos.nombre && !st.vincular) st.datos.nombre = sinExt(st.video.nombre);
    dibujar();
}

// ─────────────────────────────────────────────
// PASO 2 — ARCHIVO DE MARCAS
// ─────────────────────────────────────────────
function paso2(cuerpo) {
    const m = st.marcas;
    const elegir = h('button', {
        class: 'tv-btn' + (m ? '' : ' tv-btn--primario'),
        texto: m && m.tipo !== 'solo-video' ? 'Elegir otro archivo…' : 'Elegir archivo…',
        onClick: elegirArchivoMarcas
    });
    const solo = h('button', {
        class: 'tv-btn' + (soloVideo() ? ' tv-btn--primario' : ''),
        texto: 'Solo el video',
        onClick: () => {
            st.marcas = { tipo: 'solo-video', filas: [], avisos: [] };
            st.eventos = [];
            st.desfase = 0;
            st.error = null;
            dibujar();
        }
    });

    cuerpo.appendChild(h('div', { class: 'tv-importar-opciones' },
        h('div', { class: 'tv-panel tv-importar-opcion' },
            h('h2', { texto: 'Archivo de marcas' }),
            h('p', { texto: 'XML de Sportscode, Nacsport o LongoMatch (el que exporta la app), una sesión del iPad (.json) o una copia de seguridad del iPad.' }),
            elegir),
        h('div', { class: 'tv-panel tv-importar-opcion' },
            h('h2', { texto: 'Solo el video' }),
            h('p', { texto: 'Se guarda el partido sin eventos, para codificarlo después con la Captura en vivo.' }),
            solo)));

    if (st.error) {
        cuerpo.appendChild(h('div', { class: 'tv-importar-nota tv-importar-nota--error' },
            h('strong', { texto: `No se pudo leer "${st.error.archivo}". ` }), st.error.texto));
    }
    if (!m || soloVideo()) return;

    if (m.tipo === 'ipad-respaldo' || m.sesiones) {
        cuerpo.appendChild(listaSesiones());
    }
    if (m.tipo !== 'ipad-respaldo') cuerpo.appendChild(resumenLeido());
}

async function elegirArchivoMarcas() {
    let a;
    try {
        a = await ctx.api.archivos.elegir({
            titulo: 'Archivo de marcas',
            filtros: [
                { nombre: 'Marcas (XML o sesión del iPad)', extensiones: ['xml', 'json'] },
                { nombre: 'XML de Sportscode / Nacsport / LongoMatch', extensiones: ['xml'] },
                { nombre: 'Sesión o copia del iPad', extensiones: ['json'] }
            ]
        });
    } catch (err) {
        ctx.ui.aviso('No se pudo abrir el archivo: ' + motivo(err), 'error');
        return;
    }
    if (!a) return;
    st.error = null;
    const nombre = a.nombre || nombreDe(a.ruta);
    if (a.contenido == null) {
        st.error = { archivo: nombre, texto: 'El archivo está vacío o es demasiado grande (más de 20 MB).' };
        dibujar();
        return;
    }
    const texto = decodificarTexto(a.contenido);
    const formato = detectarFormato(texto, nombre);

    try {
        if (formato === 'sportscode') {
            const leido = leerSportscode(texto);
            st.marcas = {
                tipo: 'sportscode', archivo: { ruta: a.ruta, nombre }, texto,
                filas: leido.filas, avisos: leido.avisos, inicioReal: leido.inicioReal
            };
            st.eventos = eventosDesdeSportscode(leido);
            // Los tiempos de un XML ya son del video.
            st.desfase = 0;
            if (!st.datos.nombre || st.datos.nombre === sinExt(st.video && st.video.nombre)) st.datos.nombre = sinExt(nombre);
        } else if (formato === 'ipad-sesion') {
            cargarSesion(JSON.parse(texto), null, { ruta: a.ruta, nombre });
        } else if (formato === 'ipad-respaldo') {
            const json = JSON.parse(texto);
            const sesiones = sesionesDeRespaldo(json);
            if (!sesiones.length) throw new Error('La copia de seguridad no tiene ninguna sesión guardada.');
            st.marcas = { tipo: 'ipad-respaldo', archivo: { ruta: a.ruta, nombre }, respaldo: json, sesiones, filas: [], avisos: [] };
            st.eventos = [];
            if (sesiones.length === 1) elegirSesion(sesiones[0].indice);
        } else {
            const ext = extDe(nombre);
            throw new Error(ext === 'json'
                ? 'Es un JSON, pero no es una sesión ni una copia de seguridad del iPad (¿es una plantilla? Esas se importan desde la Base de datos).'
                : 'No se reconoce el formato: no es un XML de Sportscode (le falta <ALL_INSTANCES>) ni una sesión del iPad.');
        }
    } catch (err) {
        st.marcas = null;
        st.eventos = [];
        st.error = { archivo: nombre, texto: err instanceof SyntaxError ? 'El JSON está roto: ' + err.message : motivo(err) };
    }
    dibujar();
}

// Una sesión del iPad (suelta o sacada de un respaldo) pasa a ser las marcas.
function cargarSesion(sesion, respaldo, archivo, extra) {
    const pl = plantillaDeSesion(sesion, respaldo);
    const p = leerSesionIpad(sesion, { plantilla: pl ? pl.datos : null });
    const filas = pl
        ? filasDePlantilla(pl.datos, p.eventos.map(e => e.nombre))
        : filasDePlantilla(null, p.eventos.map(e => e.nombre));
    st.marcas = Object.assign({
        tipo: 'ipad-sesion', archivo, sesion, partidoIpad: p, plantilla: pl,
        filas, avisos: p.avisos, inicioReal: p.inicioReal
    }, extra || {});
    st.eventos = p.eventos.map(ev => ({ ...ev }));
    // El desfase de una sesión no se sabe: arranca en 0 y se fija en el paso 3.
    st.desfase = 0;
    st.datos.nombre = p.nombre;
    const eq = equiposDePlantilla(pl && pl.datos);
    if (eq.A && !st.datos.local) st.datos.local = eq.A;
    if (eq.B && !st.datos.visitante) st.datos.visitante = eq.B;
}

function elegirSesion(indice) {
    const m = st.marcas;
    const lista = Array.isArray(m.respaldo) ? m.respaldo : m.respaldo.sessions;
    cargarSesion(lista[indice], m.respaldo, m.archivo,
        { respaldo: m.respaldo, sesiones: m.sesiones, indiceSesion: indice });
    dibujar();
}

// Nombres de los equipos que tiene la botonera (tarjeta Equipos o Posesión).
function equiposDePlantilla(datos) {
    const e = (datos && datos.elements || []).find(x => (x.type === 'teams' || x.type === 'possession') && (x.equipoA || x.equipoB));
    return e ? { A: e.equipoA || '', B: e.equipoB || '' } : {};
}

function listaSesiones() {
    const m = st.marcas;
    return h('div', { class: 'tv-panel tv-importar-sesiones' },
        h('h2', { texto: `Copia de seguridad del iPad · ${m.sesiones.length} sesiones` }),
        h('p', { class: 'tv-importar-sub', texto: 'Elegí cuál es la de este video.' }),
        h('ul', { class: 'tv-lista' }, m.sesiones.map(s => h('li', {
            class: 'tv-lista__fila tv-importar-sesion' + (m.indiceSesion === s.indice ? ' is-elegida' : ''),
            role: 'button', tabindex: '0',
            onClick: () => elegirSesion(s.indice),
            onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegirSesion(s.indice); } }
        },
            h('span', { class: 'tv-importar-sesion__nombre', texto: s.nombre }),
            h('span', { class: 'tv-importar-sub', texto: `${s.fecha || 'sin fecha'} · ${s.eventos} eventos` })))));
}

function resumenLeido() {
    const m = st.marcas;
    const r = resumir(st.eventos, 0, 0);
    const tipo = { sportscode: 'XML de Sportscode', 'ipad-sesion': 'Sesión del iPad' }[m.tipo] || '';
    return h('div', { class: 'tv-panel tv-importar-leido' },
        h('h2', { texto: m.archivo ? m.archivo.nombre : '' }),
        h('p', { class: 'tv-importar-sub' },
            `${tipo} · ${r.eventos} eventos · ${r.categorias.length} categorías · de ${tiempo(r.desde)} a ${tiempo(r.hasta)}`,
            m.plantilla ? ` · botonera "${m.plantilla.nombre}"` : ''),
        chipsCategorias(r.categorias),
        avisosLectura(m.avisos));
}

function chipsCategorias(categorias) {
    const color = new Map((st.marcas.filas || []).map(f => [f.nombre, f.color]));
    return h('ul', { class: 'tv-importar-chips' }, categorias.map(c => h('li', { class: 'tv-importar-chip' },
        h('span', { class: 'tv-importar-chip__color', style: color.get(c.nombre) ? `background:${color.get(c.nombre)}` : null }),
        h('span', { texto: c.nombre }),
        h('span', { class: 'tv-importar-chip__n', texto: String(c.n) }))));
}

function avisosLectura(avisos) {
    if (!avisos || !avisos.length) return null;
    return h('ul', { class: 'tv-importar-avisos' }, avisos.map(a => h('li', { class: 'tv-importar-nota tv-importar-nota--aviso', texto: a })));
}

// ─────────────────────────────────────────────
// PASO 3 — REVISAR Y SINCRONIZAR
// ─────────────────────────────────────────────
function paso3(cuerpo) {
    const r = resumir(st.eventos, st.desfase, st.video && st.video.duracion);
    const dur = st.video && st.video.duracion;

    // Resumen
    const alertas = [];
    if (r.despuesDelVideo) alertas.push(`${r.despuesDelVideo} ${r.despuesDelVideo === 1 ? 'evento cae' : 'eventos caen'} después del final del video: van a quedar sin imagen. ¿Es el video correcto, o hay que correr el desfase?`);
    if (r.cortadosPorElFinal) alertas.push(`${r.cortadosPorElFinal} ${r.cortadosPorElFinal === 1 ? 'evento queda cortado' : 'eventos quedan cortados'} por el final del video.`);
    if (r.antesDelVideo) alertas.push(`${r.antesDelVideo} ${r.antesDelVideo === 1 ? 'evento queda' : 'eventos quedan'} antes del comienzo del video con este desfase.`);

    const resumen = h('div', { class: 'tv-panel tv-importar-resumen' },
        h('div', { class: 'tv-importar-cifras' },
            cifra(String(r.eventos), 'eventos'),
            cifra(String(r.categorias.length), 'categorías'),
            cifra(`${tiempo(r.desde)} – ${tiempo(r.hasta)}`, 'marcas en el video'),
            cifra(dur ? tiempo(dur) : '—', 'duración del video')),
        chipsCategorias(r.categorias),
        avisosLectura([...(st.marcas.avisos || []), ...alertas]));

    // Sincronización
    const vista = h('div', { class: 'tv-importar-vista' });
    ponerVideoEn(vista);
    const esIpad = st.marcas.tipo === 'ipad-sesion' || st.marcas.sincronizarComo === 'ipad';
    const sinVista = !st.video.url || st.video.reproducible === false;

    const campo = h('input', {
        class: 'tv-campo tv-importar-desfase__campo', type: 'number', step: '0.1',
        value: String(Math.round(st.desfase * 10) / 10),
        'aria-label': 'Desfase en segundos',
        onChange: (e) => { const v = Number(String(e.target.value).replace(',', '.')); if (isFinite(v)) ponerDesfase(v); }
    });
    const mover = (d) => h('button', { class: 'tv-btn', texto: (d > 0 ? '+' : '−') + coma(Math.abs(d), Math.abs(d) < 1 ? 1 : 0) + ' s', onClick: () => ponerDesfase(st.desfase + d) });

    const sincro = h('div', { class: 'tv-panel tv-importar-sincro' },
        h('h2', { texto: 'Sincronizar' }),
        h('p', { class: 'tv-importar-sub', texto: esIpad
            ? 'Los tiempos del iPad cuentan desde el PLAY del partido. Pausá el video justo en ese momento y tocá "El partido arranca acá".'
            : 'Los tiempos del XML ya son del video: normalmente no hay que tocar nada. Mirá los clips de muestra; si están corridos, ajustá.' }),
        h('div', { class: 'tv-importar-desfase' },
            h('button', {
                class: 'tv-btn tv-btn--primario', disabled: sinVista,
                texto: esIpad ? 'El partido arranca acá' : 'El tiempo 0 de las marcas está acá',
                onClick: () => ponerDesfase(reproductor.currentTime)
            }),
            h('span', { class: 'tv-importar-reloj', texto: relojTexto() })),
        h('div', { class: 'tv-importar-desfase' },
            mover(-1), mover(-0.1),
            h('label', { class: 'tv-importar-desfase__etiqueta' }, 'Desfase ', campo, ' s'),
            mover(0.1), mover(1),
            st.desfase ? h('button', { class: 'tv-btn', texto: 'A cero', onClick: () => ponerDesfase(0) }) : null),
        h('p', { class: 'tv-importar-sub', texto: `video = marcas ${desfaseTexto(st.desfase)}` }),
        h('h3', { texto: 'Clips de muestra' }),
        sinVista ? h('p', { class: 'tv-importar-nota', texto: 'Sin vista previa no se pueden mirar los clips; el desfase se puede escribir a mano.' }) : null,
        h('ul', { class: 'tv-lista tv-importar-muestras' }, clipsDeMuestra(aplicarDesfase(st.eventos, st.desfase)).map(ev => h('li', { class: 'tv-lista__fila tv-importar-muestra' },
            h('span', { class: 'tv-importar-chip__color', style: colorDe(ev.nombre) ? `background:${colorDe(ev.nombre)}` : null }),
            h('span', { class: 'tv-importar-muestra__nombre', texto: ev.nombre }),
            h('span', { class: 'tv-importar-sub', texto: `${tiempo(ev.vInicio, true)} – ${tiempo(ev.vFin, true)}` }),
            h('button', { class: 'tv-btn', texto: 'Ver', disabled: sinVista, onClick: () => reproducirTramo(ev.vInicio, ev.vFin) }),
            h('button', {
                class: 'tv-btn', texto: 'Empieza acá', disabled: sinVista,
                title: 'Pausá el video donde de verdad arranca esta jugada y tocá acá: todo se corre para que coincida',
                onClick: () => ponerDesfase(reproductor.currentTime - ev.inicio)
            })))));

    cuerpo.append(resumen, h('div', { class: 'tv-importar-dos' }, vista, sincro));
    if (!st.vincular) cuerpo.appendChild(formularioDatos());
}

const cifra = (valor, etiqueta) => h('div', { class: 'tv-importar-cifra' },
    h('strong', { texto: valor }), h('span', { texto: etiqueta }));

function colorDe(nombre) {
    const f = (st.marcas.filas || []).find(x => x.nombre === nombre);
    return f ? f.color : null;
}

function ponerDesfase(d) {
    st.desfase = Math.round(d * 1000) / 1000;
    // Redibujar mueve el <video> sin recargarlo: sigue en el mismo cuadro.
    dibujar();
}

// Nombre, local y visitante. En el paso 3, o en el 4 si es "Solo el video".
function formularioDatos() {
    const nombre = h('input', {
        class: 'tv-campo', type: 'text', value: st.datos.nombre, maxlength: '120',
        onInput: (e) => {
            st.datos.nombre = e.target.value;
            // Solo el pie y el botón Guardar dependen del nombre: no redibujar
            // todo mientras se escribe (se perdería el foco del campo).
            const viejo = raiz.querySelector('.tv-importar-pie');
            if (viejo) viejo.replaceWith(pie());
            const btn = raiz.querySelector('.tv-importar-btn-guardar');
            if (btn) btn.disabled = st.guardando || !st.datos.nombre.trim();
        }
    });
    return h('div', { class: 'tv-panel tv-importar-datos' },
        h('h2', { texto: 'Datos del partido' }),
        h('label', { class: 'tv-importar-fila' }, h('span', { texto: 'Nombre' }), nombre),
        h('label', { class: 'tv-importar-fila' }, h('span', { texto: 'Local' }), selectorEquipo('local')),
        h('label', { class: 'tv-importar-fila' }, h('span', { texto: 'Visitante' }), selectorEquipo('visitante')));
}

function selectorEquipo(cual) {
    const actual = st.datos[cual] || '';
    const nombres = equipos.map(e => e.nombre);
    // Un nombre que vino en la botonera y no está en Equipos igual se ofrece.
    if (actual && !nombres.includes(actual)) nombres.push(actual);
    const sel = h('select', { class: 'tv-campo', onChange: async (e) => {
        if (e.target.value === '__nuevo') {
            const n = await ctx.ui.pedirTexto('Nuevo equipo', '', { etiqueta: 'Nombre del equipo' });
            if (n && n.trim()) {
                try {
                    await ctx.api.equipos.guardar({ nombre: n.trim(), color: cual === 'local' ? '#3a8fd6' : '#dc2626' });
                    await cargarEquipos();
                    st.datos[cual] = n.trim();
                } catch (err) {
                    ctx.ui.aviso('No se pudo crear el equipo: ' + motivo(err), 'error');
                }
            }
            dibujar();
            return;
        }
        st.datos[cual] = e.target.value;
    } },
        h('option', { value: '', texto: '— sin equipo —' }),
        nombres.map(n => h('option', { value: n, texto: n })),
        h('option', { value: '__nuevo', texto: '+ Crear equipo…' }));
    sel.value = actual;
    return sel;
}

// ─────────────────────────────────────────────
// PASO 4 — GUARDAR
// ─────────────────────────────────────────────
const copiarVideo = () => st.copiarVideo != null ? st.copiarVideo : !!ajustes.copiarVideosImportados;

function paso4(cuerpo) {
    if (st.resultado) { cuerpo.appendChild(terminado()); return; }

    if (soloVideo()) cuerpo.appendChild(formularioDatos());

    const nombre = nombreLimpio(st.vincular ? st.vincular.nombre : st.datos.nombre);
    const destino = `Partidos/${nombre}/${nombre}.${st.video.ext}`;
    const xml = queXml();

    const casilla = h('input', {
        type: 'checkbox', checked: copiarVideo(), disabled: st.guardando,
        onChange: (e) => { st.copiarVideo = e.target.checked; dibujar(); }
    });

    const lineas = [
        ['Partido', st.vincular ? `${st.vincular.nombre} (ya está en la base: se actualiza)` : (st.datos.nombre.trim() || '—')],
        ['Eventos', soloVideo() ? 'ninguno (para codificar después)' : `${st.eventos.length}, con desfase ${desfaseTexto(st.desfase)}`],
        ['Video', copiarVideo() ? `se copia a ${destino} (${bytes(st.video.info && st.video.info.bytes)})` : `queda donde está: ${st.video.ruta}`],
        ['XML', xml.texto]
    ];
    if (!st.vincular && (st.datos.local || st.datos.visitante)) {
        lineas.splice(1, 0, ['Equipos', `${st.datos.local || '—'} vs ${st.datos.visitante || '—'}`]);
    }

    const panel = h('div', { class: 'tv-panel tv-importar-guardar' },
        h('h2', { texto: 'Guardar en la base' }),
        h('dl', {}, lineas.flatMap(([k, v]) => [h('dt', { texto: k }), h('dd', { texto: v })])),
        h('label', { class: 'tv-importar-casilla' }, casilla, ' Copiar el video a la carpeta de trabajo',
            h('span', { class: 'tv-importar-sub', texto: ' (se puede cambiar el valor por defecto en Ajustes)' })));

    if (st.copiando || st.progreso) {
        const p = st.progreso || { hecho: 0, total: 0 };
        const pct = p.total ? Math.min(100, Math.round(p.hecho / p.total * 100)) : 0;
        panel.appendChild(h('div', { class: 'tv-importar-progreso' },
            h('div', { class: 'tv-importar-progreso__barra' }, h('div', { class: 'tv-importar-progreso__lleno', style: `width:${pct}%` })),
            h('span', { class: 'tv-importar-progreso__texto', texto: p.total ? `Copiando el video… ${pct}% · ${bytes(p.hecho)} de ${bytes(p.total)}` : 'Copiando el video…' }),
            h('button', { class: 'tv-btn tv-btn--peligro', texto: 'Cancelar', disabled: st.cancelado, onClick: cancelarCopia })));
    } else if (st.guardando) {
        panel.appendChild(h('p', { class: 'tv-importar-sub', texto: 'Guardando en la base…' }));
    }

    panel.appendChild(h('div', { class: 'tv-importar-acciones' },
        h('button', {
            class: 'tv-btn tv-btn--primario tv-importar-btn-guardar',
            texto: st.vincular ? 'Vincular el video' : 'Guardar en la base',
            disabled: st.guardando || !!puedeSeguir(3),
            onClick: guardar
        })));
    cuerpo.appendChild(panel);
}

// Qué XML va a quedar enlazado al partido, para mostrarlo antes de guardar.
function queXml() {
    const m = st.marcas || {};
    if (st.vincular) return { tipo: 'nada', texto: st.vincular.xml_ruta ? 'queda el que ya tenía' : 'ninguno' };
    if (m.tipo === 'sportscode') return { tipo: 'original', texto: st.desfase ? 'el original, con los tiempos corridos por el desfase, al lado del video' : 'una copia del original, al lado del video' };
    if (m.tipo === 'ipad-sesion') return { tipo: 'generado', texto: 'se genera un XML de Sportscode con los tiempos del video' };
    return { tipo: 'nada', texto: 'ninguno' };
}

function terminado() {
    const r = st.resultado;
    return h('div', { class: 'tv-panel tv-importar-listo' },
        h('p', { class: 'tv-importar-grande', texto: st.vincular ? 'Video vinculado' : 'Partido importado' }),
        h('dl', {},
            h('dt', { texto: 'Video' }), h('dd', { class: 'tv-importar-ruta', texto: r.videoRuta || '—' }),
            r.xmlRuta ? [h('dt', { texto: 'XML' }), h('dd', { class: 'tv-importar-ruta', texto: r.xmlRuta })] : null),
        avisosLectura(r.avisos),
        h('div', { class: 'tv-importar-acciones' },
            h('button', { class: 'tv-btn tv-btn--primario', texto: 'Ver en la base', onClick: () => ctx.navegar('base', { partidoId: r.partidoId }) }),
            r.soloVideo ? h('button', { class: 'tv-btn', texto: 'Codificarlo ahora',
                onClick: () => ctx.navegar('captura', { videoRuta: r.videoRuta, partidoId: r.partidoId }) }) : null,
            r.videoRuta ? h('button', { class: 'tv-btn', texto: 'Mostrar en la carpeta', onClick: () => ctx.api.archivos.mostrar(r.videoRuta) }) : null,
            h('button', { class: 'tv-btn', texto: st.vincular ? 'Importar otro partido' : 'Importar otro', onClick: reiniciar })));
}

function reiniciar() {
    finTramo = null;
    if (reproductor) { reproductor.pause(); reproductor.removeAttribute('src'); reproductor.load(); }
    st = estadoNuevo();
    dibujar();
}

async function cancelarCopia() {
    if (!st || !st.copiando) return;
    st.cancelado = true;
    // tv.video.cancelarCopia corta la copia y borra lo copiado. Si no existe
    // (api vieja), la copia termina sola y el partido simplemente no se guarda.
    try { if (ctx.api.video.cancelarCopia) await ctx.api.video.cancelarCopia(); } catch (_) { /* ya había terminado */ }
    if (raiz) dibujar();
}

async function guardar() {
    if (st.guardando) return;
    const api = ctx.api;
    const nombreVisible = (st.vincular ? st.vincular.nombre : st.datos.nombre).trim();
    if (!nombreVisible) { ctx.ui.aviso('Poné el nombre del partido.', 'error'); return; }

    // Duplicados: se pregunta antes de copiar nada.
    if (!st.vincular) {
        try {
            const lista = await api.partidos.listar();
            const dup = buscarDuplicados(lista, { videoRuta: st.video.ruta, nombre: nombreVisible, eventos: st.eventos.length });
            if (dup.length) {
                const d = dup[0];
                const ok = await ctx.ui.confirmar(
                    `Ya hay un partido parecido en la base: "${d.nombre}" (${d.eventos} eventos` +
                    (d.video_ruta ? `, video ${nombreDe(d.video_ruta)}` : '') + '). ¿Importar igual?',
                    { titulo: 'Posible duplicado' });
                if (!ok) return;
            }
        } catch (_) { /* si no se puede listar, no se frena la importación por esto */ }
    }

    st.guardando = true;
    st.cancelado = false;
    st.progreso = null;
    const nombre = nombreLimpio(nombreVisible);
    const subcarpeta = `Partidos/${nombre}`;
    const avisos = [];
    dibujar();

    try {
        // 1) El video
        let videoRuta = st.video.ruta;
        if (copiarVideo()) {
            st.copiando = true;
            quitarProgreso = api.video.onProgreso ? api.video.onProgreso((p) => {
                if (!st || !st.copiando) return;
                st.progreso = p;
                pintarProgreso();
            }) : null;
            dibujar();
            try {
                const r = await api.video.copiarACarpeta(st.video.ruta, { nombre, subcarpeta });
                videoRuta = r && r.ruta;
            } catch (err) {
                // Cancelada: main ya borró la copia a medias; no es un error.
                if (!st || !st.cancelado) throw err;
                videoRuta = null;
            } finally {
                if (st) st.copiando = false;
                if (quitarProgreso) { quitarProgreso(); quitarProgreso = null; }
            }
            if (!st) return;   // salieron de la rama
            if (st.cancelado || !videoRuta) {
                st.guardando = false; st.progreso = null; st.cancelado = false;
                ctx.ui.aviso('Se canceló la copia. No se guardó nada en la base.', 'info');
                dibujar();
                return;
            }
        }

        const eventos = aplicarDesfase(st.eventos, st.desfase);

        if (st.vincular) {
            await api.partidos.actualizar(st.vincular.id, { video_ruta: videoRuta, desfase: st.desfase });
            const cambios = eventos.filter(ev => ev.id != null).map(ev => ({ id: ev.id, v_inicio: ev.vInicio, v_fin: ev.vFin }));
            if (cambios.length) await api.eventos.actualizarVarios(cambios);
            st.resultado = { partidoId: st.vincular.id, videoRuta, xmlRuta: st.vincular.xml_ruta || null, avisos };
        } else {
            // 2) La plantilla: la de la sesión del iPad, o una mínima con los
            //    colores de las filas del XML para que la base pinte la matriz.
            const m = st.marcas || {};
            const plantilla = m.plantilla ? m.plantilla.datos : plantillaDesdeFilas(m.filas || []);

            const partido = {
                nombre: nombreVisible,
                inicioReal: m.inicioReal || null,
                duracion: st.video.duracion || resumir(st.eventos, st.desfase, 0).hasta || 0,
                videoRuta,
                videoMime: MIME[st.video.ext] || null,
                videoBytes: (st.video.info && st.video.info.bytes) || null,
                xmlRuta: null,
                local: st.datos.local || null,
                visitante: st.datos.visitante || null,
                plantilla,
                origen: 'importado',
                desfase: st.desfase,
                eventos: eventos.map(ev => ({
                    nombre: ev.nombre, botonId: ev.botonId || null, equipo: ev.equipo || null,
                    linea: ev.linea || null, inicio: ev.inicio, fin: ev.fin,
                    vInicio: ev.vInicio, vFin: ev.vFin, etiquetas: ev.etiquetas || []
                })),
                posesion: (m.partidoIpad && m.partidoIpad.posesion) || []
            };

            // 3) El XML enlazado, con el mismo nombre que el video.
            try {
                const contenido = await xmlDelPartido(partido, plantilla);
                if (contenido) {
                    partido.xmlRuta = await api.archivos.guardarTexto({ nombre, extension: 'xml', contenido, subcarpeta });
                }
            } catch (err) {
                avisos.push('El partido se guardó, pero no el XML: ' + motivo(err));
            }

            const id = await api.partidos.guardar(partido);
            st.resultado = { partidoId: id, videoRuta, xmlRuta: partido.xmlRuta, soloVideo: soloVideo(), avisos };
        }
        ctx.ui.aviso(st.vincular ? 'Video vinculado al partido.' : 'Partido importado a la base.', 'ok');
    } catch (err) {
        ctx.ui.aviso('No se pudo guardar: ' + motivo(err), 'error');
    } finally {
        if (st) { st.guardando = false; st.progreso = null; }
    }
    if (st) dibujar();
}

async function xmlDelPartido(partido, plantilla) {
    const m = st.marcas || {};
    if (m.tipo === 'sportscode') return xmlParaGuardar(m.texto, st.desfase);
    if (m.tipo !== 'ipad-sesion' || !partido.eventos.length) return null;
    // El XML de una sesión lo arma el núcleo (Agente 4), igual que la
    // Captura en vivo: un solo lugar que sabe el formato byte a byte.
    let mod;
    try { mod = await import('../../nucleo/exportar.js'); } catch (_) {
        throw new Error('falta src/nucleo/exportar.js (xmlSportscode)');
    }
    return mod.xmlSportscode(partido, plantilla);
}

// La barra se actualiza sola, sin redibujar la pantalla en cada trozo.
function pintarProgreso() {
    const p = st.progreso;
    const barra = raiz && raiz.querySelector('.tv-importar-progreso__lleno');
    const texto = raiz && raiz.querySelector('.tv-importar-progreso__texto');
    if (!barra || !p) { if (raiz && p && st.paso === 4) dibujar(); return; }
    const pct = p.total ? Math.min(100, Math.round(p.hecho / p.total * 100)) : 0;
    barra.style.width = pct + '%';
    if (texto) texto.textContent = p.total ? `Copiando el video… ${pct}% · ${bytes(p.hecho)} de ${bytes(p.total)}` : 'Copiando el video…';
}
