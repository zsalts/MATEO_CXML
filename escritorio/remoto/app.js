// La pagina que abre el iPad: un control remoto con espejo.
//
// El motor de codificacion corre en la compu. Aca solo se dibuja la botonera
// (la misma de siempre, con src/nucleo/botonera-vista.js), se manda cada
// toque con la hora en que ocurrio, y se pinta el estado que devuelve la
// compu. Si el wifi se corta, los toques quedan en la cola (memoria +
// localStorage) y entran en orden al volver.
//
// Por que no es la PWA del iPad: ver el comentario de main/remoto.js
// (HTTPS → ws:// de la red local = contenido mixto, Safari lo bloquea).
//
// Tiene que correr en el Safari de un iPad viejo: sin ?? ni ?. (iPadOS
// 13.4). Si algo no arranca, la trampa de index.html lo muestra en pantalla.

import { crearVista } from '/nucleo/botonera-vista.js';
import * as plantillaNucleo from '/nucleo/plantilla.js';
import { crearReloj } from './reloj.js';
import { crearCola } from './cola.js';

const $ = id => document.getElementById(id);

// ─────────────────────────────────────────────
// ALMACEN: localStorage si se puede (Safari privado puede tirar)
// ─────────────────────────────────────────────
const almacen = (() => {
    try { localStorage.setItem('tv-prueba', '1'); localStorage.removeItem('tv-prueba'); return localStorage; }
    catch (_) { return null; }
})();
const leer = k => { try { return almacen ? almacen.getItem(k) : null; } catch (_) { return null; } };
const escribir = (k, v) => { try { if (almacen) v == null ? almacen.removeItem(k) : almacen.setItem(k, v); } catch (_) {} };

// Abierta en /clips, la pagina solo mira los clips: nunca codifica, llegue
// primero o ultimo. Es otra direccion justamente para que no se pisen.
const MIRAR = /^\/clips\/?$/.test(location.pathname);
const sufijo = MIRAR ? '-mirar' : '';

// Id de este iPad: la compu lo usa para no aplicar dos veces el mismo toque.
// Mirando es otro id: el mismo iPad puede tener las dos pestañas abiertas
// sin que una cierre a la otra.
let dispositivo = leer('tv-remoto-dispositivo' + sufijo);
if (!dispositivo || !/^[\w-]{6,64}$/.test(dispositivo)) {
    const r = crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(3)) : [Date.now(), Math.random() * 1e9, 7];
    dispositivo = 'ipad-' + Array.from(r, n => Math.floor(n).toString(36)).join('') + sufijo;
    escribir('tv-remoto-dispositivo' + sufijo, dispositivo);
}
// El token vale para ESTA compu y ESTE arranque del servidor: se guarda por
// host, asi dos compus distintas no se pisan.
const claveToken = 'tv-remoto-token:' + location.host + sufijo;

const reloj = crearReloj();
const cola = crearCola({ almacen, clave: 'tv-remoto-cola:' + location.host, reloj });

const S = {
    ws: null,
    conectado: false,      // hay socket y la compu nos acepto
    activo: false,         // este iPad codifica (o solo mira)
    plantilla: null,       // {nombre, datos}
    vista: null,
    estado: null,          // ultimo estado de la compu
    estadoEn: 0,           // performance.now() cuando llego
    emergentes: null,      // {id, lista:[{nombre, elemento?, indice?}]} abiertas ahora
    intentos: 0,
    pinEscrito: '',
    reintento: null,
    pingTimer: null,
    ultimaVista: 0,        // cuando se vio a la compu por ultima vez
    terminado: false,
    clips: [],             // los que corto la compu: {id, nombre, etiquetas, equipo, inicio, duracion}
    clipActual: null       // id del que se esta viendo
};

// ─────────────────────────────────────────────
// CONEXION
// ─────────────────────────────────────────────
function conectar(pin) {
    clearTimeout(S.reintento);
    if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch (_) {} }

    // Mismo host y puerto que la pagina: nada de contenido mixto.
    const ws = new WebSocket(`ws://${location.host}/ws`);
    S.ws = ws;
    pintarConexion();

    ws.onopen = () => {
        const token = leer(claveToken);
        const hola = { tipo: 'hola', dispositivo, nombre: nombreDispositivo() };
        if (MIRAR) hola.rol = 'mirar';
        if (pin) hola.pin = pin;
        else if (token) hola.token = token;
        else { ws.close(); mostrarPin(); return; }
        ws.send(JSON.stringify(hola));
    };

    ws.onmessage = e => {
        let m;
        try { m = JSON.parse(e.data); } catch (_) { return; }
        S.ultimaVista = Date.now();
        recibir(m);
    };

    ws.onclose = () => alCerrar(ws);

    // Con el wifi caido, un socket nuevo puede quedar "conectando" hasta que
    // venza el TCP (un minuto o mas). A los 5 s se abandona y se reintenta.
    setTimeout(() => {
        if (S.ws === ws && !S.conectado) {
            try { ws.close(); } catch (_) {}
            alCerrar(ws);
        }
    }, 5000);
}

// Tambien se llama a mano cuando el socket parece vivo pero no llega nada.
function alCerrar(ws) {
    if (ws !== S.ws) return;          // uno viejo que cerro tarde
    ws.onclose = null;
    const estaba = S.conectado;
    S.conectado = false;
    S.ws = null;
    clearInterval(S.pingTimer);
    pintarConexion();
    // Sin token (PIN pendiente) no se reintenta: se espera al usuario. Con
    // el partido guardado, tampoco: la compu ya cerro el servidor.
    if (!leer(claveToken) || S.terminado) return;
    // Reintento con espera creciente, hasta 5 s: el wifi del iPad tarda unos
    // segundos en volver despues de un corte.
    const espera = Math.min(5000, 500 * 2 ** Math.min(S.intentos++, 4));
    S.reintento = setTimeout(() => conectar(), estaba ? 300 : espera);
}

function mandar(m) {
    if (S.ws && S.ws.readyState === 1 && S.conectado) {
        try { S.ws.send(JSON.stringify(m)); return true; } catch (_) {}
    }
    return false;
}

function nombreDispositivo() {
    const ua = navigator.userAgent;
    if (/iPad|Macintosh/.test(ua) && 'ontouchend' in document) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    return 'Navegador';
}

function recibir(m) {
    switch (m.tipo) {
        case 'bienvenida':
            S.conectado = true;
            S.intentos = 0;
            escribir(claveToken, m.token);
            // Sesion nueva de la compu = otro partido: lo que haya quedado en
            // la cola era del anterior y no se mezcla.
            cola.sesion(m.sesion);
            cola.confirmar(m.aplicado || 0);
            S.activo = !!m.activo;
            // La compu dice si este solo mira (entro por /clips, o la compu
            // codifica sola): entonces no hay "Codificar desde acá".
            S.soloMira = MIRAR || m.rol === 'mirar';
            if (m.plantilla) ponerPlantilla(m.plantilla);
            if (m.estado) ponerEstado(m.estado);
            ponerClips(m.clips || []);
            empezarPings();
            mostrarBotonera();
            vaciarCola();
            break;

        case 'rechazo':
            if (m.motivo === 'token') {
                // El servidor se reinicio: hace falta el PIN nuevo.
                escribir(claveToken, null);
                mostrarPin('La compu empezó una conexión nueva. Escribí el PIN otra vez.');
            } else if (m.motivo === 'bloqueado') {
                escribir(claveToken, null);
                const s = Math.ceil((m.esperaMs || 60000) / 1000);
                mostrarPin(`Demasiados intentos. Probá de nuevo en ${s} s.`, true);
                bloquearTeclado(m.esperaMs || 60000);
            } else {
                mostrarPin(`PIN incorrecto${m.quedan != null ? ` (quedan ${m.quedan} intentos)` : ''}.`, true);
            }
            break;

        case 'pong': {
            reloj.muestra(m.t0, m.tServidor, Date.now());
            pintarConexion();
            // Con el primer pong se completan los toques hechos antes.
            vaciarCola();
            break;
        }

        case 'ack':
            cola.confirmar(m.n);
            pintarCola();
            break;

        case 'control':
            S.activo = !!m.activo;
            if (m.negado) avisar('La compu no dio el control.');
            if (S.activo) vaciarCola();
            mostrarBotonera();
            break;

        case 'plantilla':
            if (m.plantilla) ponerPlantilla(m.plantilla);
            break;

        case 'estado':
            ponerEstado(m);
            break;

        case 'guardado':
            S.terminado = true;
            // El que mira se queda con sus clips: se siguen viendo mientras
            // la compu no salga de la pantalla de captura.
            if (!S.activo) { avisar('La compu terminó el partido. Los clips se siguen viendo.'); break; }
            mostrarMensaje('Partido guardado en la compu',
                m.nombre ? `“${m.nombre}” quedó con el video y el XML en la compu.` : 'Quedó con el video y el XML en la compu.');
            break;

        case 'clip':
            if (m.clip) agregarClip(m.clip);
            break;

        case 'quitarClip':
            quitarClip(m.id);
            break;

        case 'aviso':
            avisar(m.texto || '');
            break;
    }
}

function empezarPings() {
    clearInterval(S.pingTimer);
    const ping = () => mandar({ tipo: 'ping', t0: Date.now(), latenciaMs: reloj.latencia() });
    ping();
    S.pingTimer = setInterval(ping, 2000);
}

function vaciarCola() {
    if (!S.conectado || !S.activo) return pintarCola();
    for (const m of cola.pendientes()) if (!mandar(m)) break;
    pintarCola();
}

// ─────────────────────────────────────────────
// ACCIONES
// ─────────────────────────────────────────────
function accion(a, opciones) {
    if (!S.activo) { avisar('Otro iPad está codificando. Pedí el control para usar la botonera.'); return; }
    const m = cola.agregar(a, opciones);
    // Si hay cosas antes en la cola, se respeta el orden: vaciarCola manda
    // todo lo pendiente, este incluido.
    if (cola.cantidad() === 1 && m.accion.momento != null) {
        mandar(m);
        pintarCola();
    } else {
        vaciarCola();
    }
}

function alTocar(elemento, evento, extra) {
    if (!elemento || S.terminado) return;
    if (!S.estado || !S.estado.enCurso) {
        avisar('La compu todavía no empezó el partido.');
        return;
    }
    const id = elemento.id;
    destello(evento);
    haptico();

    const emergente = cualEmergente(elemento);
    if (emergente) {
        // Elegir una emergente no tiene hora propia: se pega al evento que
        // la abrio. Las escritas en el evento no son botones: van por indice.
        // El motor las identifica por id: el del boton si es un boton de la
        // plantilla, "<evento>#<indice>" si esta escrita en el evento.
        accion({ tipo: 'elegirEmergente', id: emergente.id }, { conMomento: false });
        cerrarEmergentes();
        return;
    }

    const a = { tipo: 'tocar', elementoId: id };
    // Posesion: la vista dice que mitad se toco ('A' o 'B') en el tercer
    // argumento, como a la captura de la compu.
    const equipo = extra && extra.equipo;
    if (equipo === 'A' || equipo === 'B') a.equipo = equipo;
    // En una pestaña de detalle se elige una opcion: no tiene hora propia.
    accion(a, { conMomento: !(S.estado && S.estado.hoja) });

    // Respuesta inmediata (optimista); el estado de la compu la corrige.
    optimista(elemento);
}

// Misma forma que la lista del motor: cada una con su id.
function conIds(eventoId, lista) {
    return lista.map(o => o.id != null ? o
        : { ...o, id: o.elemento ? String(o.elemento.id) : eventoId + '#' + o.indice });
}

function abrirEmergentes(id, lista) {
    lista = conIds(id, lista);
    // Cada estado que llega las repite: si ya estan esas, no se redibujan.
    const firma = String(id) + '|' + lista.map(o => o.nombre).join('|');
    if (S.emergentes && S.emergentes.firma === firma) return;
    S.emergentes = { id, lista, firma };
    S.vista.mostrarEmergentes(id, lista);
}

function cerrarEmergentes() {
    S.emergentes = null;
    try { S.vista.ocultarEmergentes(); } catch (_) {}
}

// La vista avisa el toque de una emergente con el objeto de la lista o con
// el boton de la plantilla: se aceptan las dos cosas.
function cualEmergente(tocado) {
    if (!S.emergentes) return null;
    return S.emergentes.lista.find(o => o === tocado
        || (tocado.id != null && String(o.id) === String(tocado.id))
        || (o.elemento && o.elemento === tocado)
        || (o.indice != null && tocado.indice === o.indice && tocado.nombre === o.nombre)) || null;
}

function optimista(elemento) {
    const datos = S.plantilla && S.plantilla.datos;
    if (!datos) return;
    try {
        const hoja = plantillaNucleo.hojaQueAbre ? plantillaNucleo.hojaQueAbre(datos, elemento.id) : null;
        if (hoja) S.vista.mostrarHoja(hoja.id != null ? hoja.id : hoja);
        const emerg = plantillaNucleo.emergentesDe ? plantillaNucleo.emergentesDe(datos, elemento.id) : [];
        if (emerg && emerg.length) abrirEmergentes(elemento.id, emerg);
    } catch (e) { console.warn('optimista', e); }
    const nombre = elemento.name || elemento.nombre;
    if (nombre && (elemento.type === 'event' || !elemento.type)) $('ultimo').textContent = nombre;
}

// ─────────────────────────────────────────────
// PLANTILLA Y ESTADO
// ─────────────────────────────────────────────
function ponerPlantilla(p) {
    let datos = p.datos;
    try { if (plantillaNucleo.normalizar) datos = plantillaNucleo.normalizar(datos); } catch (_) {}
    S.plantilla = { ...p, datos };
    const cont = $('botonera');
    if (S.vista) { try { S.vista.destruir(); } catch (_) {} }
    cont.textContent = '';
    S.vista = crearVista(cont, datos, { hoja: null, alTocar, ajustar: true, tactil: true });
    S.emergentes = null;
    if (S.estado) ponerEstado(S.estado);
}

// Estado resumido que manda la compu (ver src/ramas/ipad/espejo.js):
//   {tipo:'estado', enCurso, corriendo, reloj, tServidor, rec, hoja,
//    marcas:{id: 'activo'|'fijo'|'abierto'}, textos:{id: texto},
//    emergentes:{id, lista:[{nombre, elementoId?, indice?}]}|null,
//    ultimo:{nombre}|null}
let marcasPintadas = {};
function ponerEstado(e) {
    S.estado = e;
    S.estadoEn = performance.now();
    $('rec').hidden = !e.rec;
    $('btnVolver').hidden = !e.hoja || !S.activo;
    $('btnPlay').textContent = e.corriendo ? '❚❚ PAUSA' : '▶ PLAY';
    $('btnPlay').classList.toggle('boton--primario', !e.corriendo);
    if (e.ultimo && e.ultimo.nombre) $('ultimo').textContent = e.ultimo.nombre;
    pintarReloj();

    if (!S.vista) return;
    // Con toques todavia sin confirmar, el estado que llega es de antes de
    // ellos: pintarlo borraria la respuesta optimista y el boton "parpadea".
    // El reloj si se actualiza.
    if (cola.cantidad() > 0) return;

    try {
        S.vista.mostrarHoja(e.hoja != null ? e.hoja : null);
        const nuevas = e.marcas || {};
        for (const id of Object.keys(marcasPintadas)) if (!(id in nuevas)) S.vista.marcar(id, null);
        for (const [id, v] of Object.entries(nuevas)) if (marcasPintadas[id] !== v) S.vista.marcar(id, v);
        marcasPintadas = { ...nuevas };
        for (const [id, t] of Object.entries(e.textos || {})) S.vista.ponerTexto(id, t);
        if (e.emergentes && e.emergentes.lista && e.emergentes.lista.length) {
            // Vuelven a la misma forma que emergentesDe(): {nombre, elemento}
            // para los botones de la plantilla, {nombre, indice} para las
            // escritas en el evento.
            const porId = new Map((S.plantilla.datos.elements || []).map(x => [String(x.id), x]));
            const lista = e.emergentes.lista.map(o => o.elementoId != null
                ? { id: o.id, nombre: o.nombre, elemento: porId.get(String(o.elementoId)) }
                : { id: o.id, nombre: o.nombre, indice: o.indice });
            abrirEmergentes(e.emergentes.id, lista);
        } else if (S.emergentes) {
            cerrarEmergentes();
        }
    } catch (err) { console.warn('estado', err); }
}

function pintarReloj() {
    const e = S.estado;
    if (!e) return;
    let s = e.reloj || 0;
    if (e.corriendo) s += (performance.now() - S.estadoEn) / 1000;
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
    $('reloj').textContent = (h ? h + ':' + String(mm).padStart(2, '0') : String(mm).padStart(2, '0')) + ':' + String(ss).padStart(2, '0');
}
setInterval(pintarReloj, 250);

// ─────────────────────────────────────────────
// CLIPS (el iPad que mira)
// ─────────────────────────────────────────────
// La compu corta cada evento que se cierra y avisa {tipo:'clip'}. El video
// se pide a /clip/<id> con el token de este iPad: sin él, la compu no lo da.
function urlClip(id) {
    return `/clip/${encodeURIComponent(id)}?d=${encodeURIComponent(dispositivo)}&t=${encodeURIComponent(leer(claveToken) || '')}`;
}

function ponerClips(lista) {
    S.clips = lista.filter(c => c && c.id);
    pintarClips();
}

// Mismo id = el mismo evento con otras etiquetas o vuelto a cortar.
function agregarClip(c) {
    if (!c.id) return;
    const i = S.clips.findIndex(x => x.id === c.id);
    if (i >= 0) S.clips[i] = c; else S.clips.push(c);
    pintarClips(i < 0 ? c.id : null);
    // Si justo se estaba viendo ese y se volvio a cortar, se recarga.
    if (i >= 0 && S.clipActual === c.id) verClip(c.id, { seguir: true });
}

function quitarClip(id) {
    S.clips = S.clips.filter(c => c.id !== id);
    if (S.clipActual === id) {
        S.clipActual = null;
        const v = $('clipsVideo');
        v.pause();
        v.removeAttribute('src');
        v.load();
    }
    pintarClips();
}

function minuto(seg) {
    const s = Math.max(0, Math.floor(Number(seg) || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// Los textos van con textContent: los nombres vienen de la plantilla.
function pintarClips(nuevo) {
    const ul = $('clipsLista');
    const orden = S.clips.slice().sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
    const scroll = ul.scrollTop;
    ul.textContent = '';
    for (const c of orden) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'clip' + (c.id === S.clipActual ? ' es-actual' : '') + (c.id === nuevo ? ' es-nuevo' : '');
        b.dataset.id = c.id;
        const min = document.createElement('span');
        min.className = 'clip__minuto';
        min.textContent = minuto(c.inicio);
        const texto = document.createElement('span');
        texto.className = 'clip__texto';
        const n = document.createElement('span');
        n.className = 'clip__nombre';
        n.textContent = c.nombre || 'Clip';
        texto.appendChild(n);
        const detalle = [c.equipo].concat(c.etiquetas || []).filter(Boolean).join(' · ');
        if (detalle) {
            const d = document.createElement('span');
            d.className = 'clip__detalle';
            d.textContent = detalle;
            texto.appendChild(d);
        }
        const dur = document.createElement('span');
        dur.className = 'clip__dur';
        dur.textContent = c.duracion != null ? Math.round(c.duracion) + ' s' : '';
        b.appendChild(min); b.appendChild(texto); b.appendChild(dur);
        li.appendChild(b);
        ul.appendChild(li);
    }
    ul.scrollTop = scroll;
    $('clipsVacio').hidden = S.clips.length > 0;
    $('clipsCuenta').textContent = S.clips.length ? String(S.clips.length) : '';
}

function verClip(id, { seguir = false } = {}) {
    const c = S.clips.find(x => x.id === id);
    if (!c) return;
    const v = $('clipsVideo');
    const donde = seguir ? v.currentTime : 0;
    const andar = !seguir || !v.paused;
    S.clipActual = id;
    v.src = urlClip(id);
    if (donde) v.addEventListener('loadedmetadata', () => { try { v.currentTime = donde; } catch (_) {} }, { once: true });
    // Dentro del toque: asi Safari lo deja arrancar con sonido.
    if (andar) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    $('clipsVacioVisor').hidden = true;
    $('clipsTitulo').textContent = minuto(c.inicio) + '  ' + (c.nombre || 'Clip') +
        ((c.etiquetas || []).length ? ' · ' + c.etiquetas.join(' · ') : '');
    const previo = $('clipsLista').querySelector('.es-actual');
    if (previo) previo.classList.remove('es-actual');
    const actual = $('clipsLista').querySelector(`[data-id="${id}"]`);   // ids de [\w-]: sin escapar
    if (actual) actual.classList.add('es-actual');
}

$('clipsLista').addEventListener('click', e => {
    const b = e.target.closest('.clip');
    if (b) verClip(b.dataset.id);
});

$('clipsVideo').addEventListener('error', () => {
    if (S.clipActual) avisar('No se pudo abrir el clip. Revisá la conexión con la compu.');
});

$('btnPedirControl').addEventListener('click', () => {
    if (!mandar({ tipo: 'pedirControl' })) return avisar('Sin conexión con la compu.');
    avisar('Pedido enviado. Aceptalo en la compu: el otro iPad pasa a mirar.');
});

// ─────────────────────────────────────────────
// PANTALLAS
// ─────────────────────────────────────────────
function mostrarPin(error = '', sacudir = false) {
    clearInterval(S.pingTimer);
    S.pinEscrito = '';
    pintarPin();
    $('pinError').textContent = error;
    if (sacudir) { const p = $('pinPuntos'); p.classList.remove('sacudir'); void p.offsetWidth; p.classList.add('sacudir'); }
    $('pantallaPin').hidden = false;
    $('pantallaMensaje').hidden = true;
    $('franja').hidden = true;
    $('botonera').hidden = true;
}

function mostrarMensaje(titulo, texto, boton) {
    $('mensajeTitulo').textContent = titulo;
    $('mensajeTexto').textContent = texto;
    const b = $('mensajeBoton');
    b.hidden = !boton;
    if (boton) { b.textContent = boton.texto; b.onclick = boton.accion; }
    $('pantallaMensaje').hidden = false;
    $('pantallaPin').hidden = true;
}

// El que codifica ve la botonera; el que mira, los clips. Pasar el control
// de uno a otro da vuelta las dos pantallas.
function mostrarBotonera() {
    $('pantallaPin').hidden = true;
    $('franja').hidden = false;
    const mira = !S.activo;
    $('botonera').hidden = mira;
    $('clips').hidden = !mira;
    $('btnPlay').hidden = mira;
    $('btnTerminar').hidden = mira;
    $('btnPedirControl').hidden = !mira || S.terminado || S.soloMira;
    if (mira) $('btnVolver').hidden = true;
    else { const v = $('clipsVideo'); if (!v.paused) v.pause(); }
    if (S.terminado && !mira) return;
    $('pantallaMensaje').hidden = true;
    pedirWakeLock();
}

function pintarConexion() {
    const c = $('conexion');
    let nivel = 'rojo', texto = 'Sin conexión';
    if (S.conectado) {
        const lat = reloj.latencia();
        nivel = lat == null || lat < 150 ? 'verde' : 'amarillo';
        texto = lat == null ? 'Conectado' : `${Math.round(lat)} ms`;
    } else if (S.ws) {
        nivel = 'amarillo'; texto = 'Conectando…';
    }
    c.dataset.nivel = nivel;
    $('conexionTexto').textContent = texto;
}

function pintarCola() {
    const n = cola.cantidad();
    const el = $('cola');
    el.hidden = n === 0;
    el.textContent = n === 1 ? '1 toque sin enviar' : `${n} toques sin enviar`;
}

let avisoTimer = null;
function avisar(texto) {
    const a = $('aviso');
    a.textContent = texto;
    a.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { a.hidden = true; }, 3500);
}

// Circulo que se expande donde toco el dedo: la confirmacion visual es
// inmediata aunque la compu tarde en contestar.
function destello(ev) {
    const x = ev && (ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX));
    const y = ev && (ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const d = document.createElement('i');
    d.className = 'destello';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 450);
}

function haptico() {
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) {}
}

// ─────────────────────────────────────────────
// PIN
// ─────────────────────────────────────────────
function pintarPin() {
    [...$('pinPuntos').children].forEach((p, i) => p.classList.toggle('lleno', i < S.pinEscrito.length));
}

let tecladoBloqueado = false;
function bloquearTeclado(ms) {
    tecladoBloqueado = true;
    $('teclado').classList.add('bloqueado');
    setTimeout(() => { tecladoBloqueado = false; $('teclado').classList.remove('bloqueado'); $('pinError').textContent = ''; }, ms);
}

$('teclado').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || tecladoBloqueado) return;
    const t = b.dataset.t;
    if (t === 'borrar') S.pinEscrito = S.pinEscrito.slice(0, -1);
    else if (S.pinEscrito.length < 4) S.pinEscrito += t;
    $('pinError').textContent = '';
    pintarPin();
    if (S.pinEscrito.length === 4) {
        const pin = S.pinEscrito;
        setTimeout(() => conectar(pin), 120);   // que se vea el cuarto punto
    }
});

// ─────────────────────────────────────────────
// BOTONES DE LA FRANJA
// ─────────────────────────────────────────────
$('btnPlay').addEventListener('click', () => {
    if (!S.estado || !S.estado.enCurso) return avisar('La compu todavía no empezó el partido.');
    // PLAY/PAUSA tambien van por la cola: si el wifi esta cortado, entran
    // en orden con los toques.
    accion({ tipo: S.estado.corriendo ? 'pausa' : 'play' });
    // Optimista: se da vuelta ya; el estado de la compu lo confirma.
    ponerEstado({ ...S.estado, corriendo: !S.estado.corriendo, reloj: relojActual() });
});

// Volver de una pestaña de detalle sin elegir (el evento queda sin etiqueta).
$('btnVolver').addEventListener('click', () => {
    accion({ tipo: 'cerrarDetalle' }, { conMomento: false });
    S.vista.mostrarHoja(null);
});

$('btnTerminar').addEventListener('click', () => {
    if (!mandar({ tipo: 'pedirTerminar' })) return avisar('Sin conexión con la compu.');
    avisar('Confirmá en la compu para terminar el partido.');
});

function relojActual() {
    const e = S.estado;
    return (e.reloj || 0) + (e.corriendo ? (performance.now() - S.estadoEn) / 1000 : 0);
}

// ─────────────────────────────────────────────
// PARA EL DEDO
// ─────────────────────────────────────────────
// Pellizco y doble toque (Safari ignora user-scalable=no desde iOS 10).
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// Sin rebote: solo se deja scrollear lo que tiene su propio scroll (y la
// barra del video, que se arrastra con el dedo).
document.addEventListener('touchmove', e => {
    if (!e.target.closest('.scroll, video')) e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// Que la pantalla no se apague a mitad del partido.
let wakeLock = null, avisoBloqueo = false;
async function pedirWakeLock() {
    if (wakeLock) return;
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
            return;
        } catch (_) { /* sin permiso: cae al aviso */ }
    }
    if (!avisoBloqueo) {
        avisoBloqueo = true;
        avisar('Desactivá el bloqueo automático (Ajustes → Pantalla y brillo) para que el iPad no se apague.');
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (S.conectado) pedirWakeLock();
        // Al volver de segundo plano el socket puede estar muerto sin
        // haberse enterado: si hace 5 s que no llega nada, se reconecta.
        if (leer(claveToken) && Date.now() - S.ultimaVista > 5000) conectar();
    }
});

// Un socket "abierto" que no recibe nada (wifi caido sin aviso) no dispara
// onclose hasta mucho despues. Si en 6 s no llega ni un pong, se da por
// cortado y se reintenta.
setInterval(() => {
    if (S.conectado && S.ws && Date.now() - S.ultimaVista > 6000) {
        const ws = S.ws;
        try { ws.close(); } catch (_) {}
        alCerrar(ws);   // sin esperar al onclose, que puede tardar un minuto
    }
}, 1000);

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
window.__remotoOk = true;   // para la trampa de index.html: el modulo corrio entero
pintarCola();
if (leer(claveToken)) {
    mostrarMensaje('Conectando con la compu…', '');
    conectar();
} else {
    mostrarPin();
}
