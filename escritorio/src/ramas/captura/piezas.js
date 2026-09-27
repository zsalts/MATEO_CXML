// Piezas de pantalla de la Captura en vivo, sueltas para reusar.
//
// La Captura desde iPad (Agente 5) muestra lo mismo: la cámara, el reloj
// con el ● REC, el registro, la tira, el visor de clips y la cola de cortes.
// Las importa de acá en vez de copiarlas. Cada pieza recibe un contenedor y
// devuelve un objeto con lo que se le puede pedir, y destruir().
//
// No saben de ramas ni de ctx: reciben el motor (nucleo/codificacion.js),
// la grabadora (nucleo/grabadora.js) o callbacks. Solo usan las clases de
// estilo.css de esta rama (prefijo tv-captura-) y las base de la app.

import { crearIcono, escapar, estadoGlobal } from '../../ui/index.js';
import { panelPermiso } from '../../ui/permisos.js';
import { listarEntradas, esPlaca, CALIDADES, formatoBytes } from '../../nucleo/grabadora.js';
import { fmt, clipDeVideo } from '../../nucleo/codificacion.js';
import { normalizar } from '../../nucleo/plantilla.js';
import { colorDeEvento } from './logica.js';

// el('div', {class, texto, onClick, ...atributos}, ...hijos)
export function el(tag, attrs = {}, ...hijos) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'texto') n.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in n && typeof v !== 'string') n[k] = v;
        else n.setAttribute(k, v === true ? '' : String(v));
    });
    hijos.flat(Infinity).forEach(h => { if (h != null && h !== false) n.append(h instanceof Node ? h : String(h)); });
    return n;
}

export const icono = nombre => crearIcono(nombre);

// Reloj de partido: "12:34"; con horas, "1:02:03" (partidos largos, o un
// video de archivo).
export function reloj(seg) {
    const s = Math.max(0, Math.floor(seg || 0));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : fmt(s);
}

// Pone en un <video> la vista previa de la grabadora, y la vuelve a poner
// cuando la cámara cambia (reconexión, otra entrada). Devuelve quitar().
export function enlazarVistaPrevia(video, grabadora) {
    video.muted = true;
    video.playsInline = true;
    const poner = () => {
        const s = grabadora.vistaPrevia();
        if (video.srcObject !== s) {
            video.srcObject = s || null;
            if (s) video.play().catch(() => {});
        }
    };
    poner();
    return grabadora.on('estado', poner);
}

// ─────────────────────────────────────────────
// PANEL DE CÁMARA
// ─────────────────────────────────────────────
/**
 * Elegir entrada de video y de audio, calidad, y ver la vista previa con la
 * resolución y los fps reales. Cambiar la entrada grabando sigue en el mismo
 * archivo (lo resuelve la grabadora).
 * @param o.grabadora
 * @param o.calidad       la de tv.ajustes (se puede cambiar antes de grabar)
 * @param o.compacto      sin vista previa (en la codificación el video grande ya la muestra)
 * @param o.alConectar    ({ancho, alto, fps, conAudio}) => void
 * @param o.alError       (mensaje) => void
 * @param o.api           tv (para "Abrir Configuración" si falta el permiso)
 */
export function crearPanelCamara(contenedor, o) {
    const g = o.grabadora;
    const selVideo = el('select', { class: 'tv-campo', 'aria-label': 'Entrada de video' });
    const selAudio = el('select', { class: 'tv-campo', 'aria-label': 'Entrada de audio' });
    const selCalidad = el('select', { class: 'tv-campo', 'aria-label': 'Calidad' });
    const niveles = [['baja', '3 Mb/s'], ['media', '6 Mb/s'], ['alta', '10 Mb/s'], ['maxima', '16 Mb/s']];
    niveles.forEach(([v, t]) => selCalidad.append(el('option', { value: v, texto: t })));
    selCalidad.value = calidadANivel(o.calidad);
    g.ponerCalidad(selCalidad.value);

    const vista = el('video', { class: 'tv-captura-cam__vista', muted: true, playsInline: true });
    const sinSenal = el('div', { class: 'tv-captura-cam__sinsenal' }, icono('camara'), el('span', { texto: 'Sin cámara' }));
    const info = el('div', { class: 'tv-captura-cam__info tv-chica tv-mono' });
    // Sin permiso (Mac, o Windows con la cámara bloqueada) getUserMedia deja
    // la vista previa negra sin decir nada: panel que explica y reintenta.
    const huecoPermiso = el('div', { class: 'tv-captura-cam__permiso', hidden: true });
    let quitarPermiso = null;
    const btnConectar = el('button', { type: 'button', class: 'tv-btn', onClick: () => conectar() }, icono('camara'), el('span', { texto: 'Conectar' }));
    const btnListar = el('button', { type: 'button', class: 'tv-btn tv-btn--icono', title: 'Buscar entradas de nuevo', onClick: () => listar() }, icono('buscar'));

    const raiz = el('div', { class: 'tv-captura-cam' + (o.compacto ? ' tv-captura-cam--compacto' : '') },
        huecoPermiso,
        o.compacto ? null : el('div', { class: 'tv-captura-cam__marco' }, vista, sinSenal),
        el('label', { class: 'tv-captura-cam__fila' }, el('span', { class: 'tv-etiqueta', texto: 'Video' }), selVideo, btnListar),
        el('label', { class: 'tv-captura-cam__fila' }, el('span', { class: 'tv-etiqueta', texto: 'Audio' }), selAudio),
        el('label', { class: 'tv-captura-cam__fila' }, el('span', { class: 'tv-etiqueta', texto: 'Calidad' }), selCalidad),
        el('div', { class: 'tv-captura-cam__pie' }, info, btnConectar));
    contenedor.append(raiz);

    const quitar = [];
    if (!o.compacto) quitar.push(enlazarVistaPrevia(vista, g));

    async function listar() {
        let e;
        try { e = await listarEntradas(); } catch (_) { e = { video: [], audio: [] }; }
        // Las placas de captura primero: es lo que se quiere casi siempre.
        const videos = [...e.video].sort((a, b) => Number(esPlaca(b.nombre)) - Number(esPlaca(a.nombre)));
        const antesV = selVideo.value, antesA = selAudio.value;
        selVideo.textContent = '';
        if (!videos.length) selVideo.append(el('option', { value: '', texto: 'No se encontró ninguna cámara' }));
        videos.forEach(v => selVideo.append(el('option', { value: v.id, texto: v.nombre + (esPlaca(v.nombre) ? '  · placa' : '') })));
        selAudio.textContent = '';
        selAudio.append(el('option', { value: '', texto: 'El de la cámara / por defecto' }));
        e.audio.forEach(a => selAudio.append(el('option', { value: a.id, texto: a.nombre })));
        selAudio.append(el('option', { value: 'no', texto: 'Sin audio' }));
        const actual = g.estado();
        if (antesV && videos.some(v => v.id === antesV)) selVideo.value = antesV;
        else if (actual.conectada && actual.etiqueta) {
            const x = videos.find(v => v.nombre === actual.etiqueta);
            if (x) selVideo.value = x.id;
        }
        if (antesA && [...selAudio.options].some(op => op.value === antesA)) selAudio.value = antesA;
        return videos;
    }

    function pedido() {
        return { videoId: selVideo.value || undefined, audioId: selAudio.value || undefined };
    }

    let conectando = false;
    async function conectar() {
        if (conectando) return null;
        conectando = true;
        btnConectar.disabled = true;
        info.textContent = 'Conectando…';
        try {
            const r = await g.conectar(pedido());
            huecoPermiso.hidden = true;
            if (quitarPermiso) { quitarPermiso(); quitarPermiso = null; }
            // Los nombres de las entradas recién aparecen con el permiso dado.
            await listar();
            if (r.aviso && o.alError) o.alError(r.aviso);
            if (o.alConectar) o.alConectar(r);
            return r;
        } catch (err) {
            if (err && err.permiso) {
                huecoPermiso.hidden = false;
                if (quitarPermiso) quitarPermiso();
                quitarPermiso = panelPermiso(huecoPermiso, {
                    api: o.api, tipo: err.permiso, estado: err.estado,
                    alReintentar: () => { huecoPermiso.hidden = true; conectar(); }
                });
                info.textContent = 'Sin permiso para usar la cámara.';
                return null;
            }
            const m = mensajeCamara(err);
            info.textContent = m;
            if (o.alError) o.alError(m);
            return null;
        } finally {
            conectando = false;
            btnConectar.disabled = false;
            pintar();
        }
    }

    function pintar() {
        const s = g.estado();
        raiz.classList.toggle('es-conectada', !!s.conectada);
        raiz.classList.toggle('es-caida', !!s.desconectada);
        btnConectar.querySelector('span').textContent = s.desconectada ? 'Reconectar' : s.conectada ? 'Reconectar' : 'Conectar';
        selCalidad.disabled = !!s.grabando;
        selCalidad.title = s.grabando ? 'La calidad no se cambia en medio de la grabación' : '';
        if (conectando) return;
        if (s.desconectada) info.textContent = 'Se desconectó. Enchufala de nuevo o elegí otra entrada.';
        else if (s.conectada) {
            info.textContent = [
                s.ancho && s.alto ? `${s.ancho}×${s.alto}` : null,
                s.fps ? `${s.fps} fps` : null,
                s.conAudio ? 'con audio' : 'sin audio'
            ].filter(Boolean).join(' · ');
        } else info.textContent = 'Sin cámara conectada';
    }

    selVideo.addEventListener('change', () => { if (selVideo.value) conectar(); });
    selAudio.addEventListener('change', () => { if (g.estado().conectada) conectar(); });
    selCalidad.addEventListener('change', () => g.ponerCalidad(selCalidad.value));
    quitar.push(g.on('estado', pintar));
    const alCambiarDisp = () => listar();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', alCambiarDisp);
        quitar.push(() => navigator.mediaDevices.removeEventListener('devicechange', alCambiarDisp));
    }
    pintar();

    return {
        raiz,
        listar,
        conectar,
        pedido,
        calidad: () => selCalidad.value,
        pintar,
        destruir() { quitar.forEach(f => { try { f(); } catch (_) {} }); raiz.remove(); }
    };
}

// tv.ajustes.calidad puede ser 'alta', 6 (Mb/s) o 6000000: el nivel más cercano.
function calidadANivel(c) {
    if (typeof c === 'string' && CALIDADES[c.toLowerCase()]) return c.toLowerCase();
    let bits = Number(c);
    if (!Number.isFinite(bits) || bits <= 0) return 'alta';
    if (bits < 100) bits *= 1000000;
    let mejor = 'alta', dif = Infinity;
    Object.entries(CALIDADES).forEach(([k, v]) => { const d = Math.abs(v - bits); if (d < dif) { dif = d; mejor = k; } });
    return mejor;
}

export function mensajeCamara(err) {
    const n = err && err.name;
    if (n === 'NotAllowedError') return 'No hay permiso para usar la cámara.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encuentra esa cámara. ¿Está enchufada?';
    if (n === 'NotReadableError') return 'La cámara está ocupada por otro programa (OBS, Zoom, el software de la placa…).';
    return 'No se pudo abrir la cámara: ' + ((err && err.message) || err);
}

// ─────────────────────────────────────────────
// RELOJ + ● REC
// ─────────────────────────────────────────────
/**
 * El reloj grande del partido, PLAY/PAUSA y el ● REC con tiempo y tamaño.
 * Avisa a la carcasa (estadoGlobal 'grabando') para el REC de la barra.
 * @param o.motor, o.grabadora (puede ser null: codificar un archivo)
 * @param o.alAlternar  () => void   (PLAY/PAUSA)
 * @param o.rama        'captura' | 'ipad'
 */
export function crearRelojRec(contenedor, o) {
    const g = o.grabadora;
    const tiempo = el('div', { class: 'tv-captura-reloj__tiempo tv-numeros', texto: '0:00' });
    const btn = el('button', { type: 'button', class: 'tv-btn tv-btn--primario tv-captura-reloj__play', title: 'PLAY / PAUSA (espacio)', onClick: () => o.alAlternar && o.alAlternar() });
    const rec = el('div', { class: 'tv-captura-rec', hidden: !g });
    const recTexto = el('span', { class: 'tv-captura-rec__texto tv-numeros' });
    rec.append(el('span', { class: 'tv-captura-rec__punto' }), recTexto);
    const raiz = el('div', { class: 'tv-captura-reloj' }, btn, tiempo, rec);
    contenedor.append(raiz);

    let grabandoAntes = false, andandoAntes = null;
    function pintar() {
        const t = o.motor.tiempo();
        const txt = reloj(t);
        if (tiempo.textContent !== txt) tiempo.textContent = txt;
        const andando = o.motor.estado ? estadoRapido(o.motor) : false;
        if (andando !== andandoAntes) {
            andandoAntes = andando;
            btn.replaceChildren(icono(andando ? 'pausa' : 'play'), el('span', { texto: andando ? 'PAUSA' : 'PLAY' }));
            raiz.classList.toggle('es-pausa', !andando);
        }
        if (!g) return;
        const s = g.estado();
        rec.hidden = false;
        rec.classList.toggle('es-grabando', !!s.grabando);
        rec.classList.toggle('es-error', !!s.errorDisco);
        if (s.grabando) {
            recTexto.textContent = `REC ${reloj(s.vAhora || 0)} · ${formatoBytes(s.bytes)}`;
        } else if (s.deteniendo) {
            recTexto.textContent = 'Cerrando el video…';
        } else if (s.ultima) {
            recTexto.textContent = `Grabado ${formatoBytes(s.ultima.bytes)}`;
        } else {
            recTexto.textContent = s.conectada ? 'REC con PLAY' : 'Sin cámara';
        }
        if (s.grabando !== grabandoAntes) {
            grabandoAntes = !!s.grabando;
            estadoGlobal.poner('grabando', s.grabando
                ? { desde: Date.now() - (s.vAhora || 0) * 1000, rama: o.rama || 'captura' }
                : null);
        }
    }
    const intervalo = setInterval(pintar, 200);
    pintar();
    return {
        raiz,
        pintar,
        destruir() {
            clearInterval(intervalo);
            if (grabandoAntes) estadoGlobal.poner('grabando', null);
            raiz.remove();
        }
    };
}

// motor.estado() copia todo el registro: el reloj pregunta cinco veces por
// segundo si anda, así que se guarda lo último que avisó el motor.
const cacheAndando = new WeakMap();
function estadoRapido(motor) {
    if (!cacheAndando.has(motor)) {
        cacheAndando.set(motor, motor.estado().andando);
        motor.alCambiar(e => cacheAndando.set(motor, e.andando));
    }
    return cacheAndando.get(motor);
}

// ─────────────────────────────────────────────
// REGISTRO
// ─────────────────────────────────────────────
/**
 * Lo marcado, el último arriba. Clic → ver el clip.
 * @param o.datos       plantilla (para los colores)
 * @param o.alVer(ev), o.alCortar(ev), o.alBorrar(ev)   ev = evento del motor
 * @param o.origenDe(ev) => 'iPad' | 'Compu' | null   (captura desde iPad)
 */
export function crearRegistro(contenedor, o) {
    const datos = normalizar(o.datos);
    const lista = el('div', { class: 'tv-captura-registro__lista', role: 'list' });
    const vacio = el('div', { class: 'tv-vacio tv-chica' }, el('span', { texto: 'Lo que marques aparece acá. Clic para ver el clip.' }));
    const cuenta = el('span', { class: 'tv-chip' });
    const raiz = el('div', { class: 'tv-captura-registro' },
        el('div', { class: 'tv-captura-panel__cab' }, el('span', { texto: 'Registro' }), cuenta),
        lista, vacio);
    contenedor.append(raiz);

    let ultimo = { estado: null, cortes: null };
    const porId = new Map();

    lista.addEventListener('click', e => {
        const f = e.target.closest('[data-ev]');
        if (!f) return;
        const ev = porId.get(f.dataset.ev);
        if (!ev) return;
        const acc = e.target.closest('[data-accion]');
        if (acc) {
            e.stopPropagation();
            if (acc.dataset.accion === 'cortar' && o.alCortar) o.alCortar(ev);
            if (acc.dataset.accion === 'borrar' && o.alBorrar) o.alBorrar(ev);
            return;
        }
        if (o.alVer) o.alVer(ev);
    });

    function pintar(estado, cortes) {
        ultimo = { estado, cortes };
        if (!estado) return;
        const abiertos = estado.abiertos || [];
        const eventos = (estado.eventos || []).filter(ev => !ev.posesionDe);
        const estadoCorte = new Map();
        (cortes || []).forEach(c => { if (c.evId != null) estadoCorte.set(String(c.evId), c.estado); });
        porId.clear();
        cuenta.textContent = String(eventos.length);
        vacio.hidden = !!(eventos.length || abiertos.length);

        const fila = (ev, grabando) => {
            porId.set(String(ev.id), ev);
            const conVideo = grabando || clipDeVideo(ev, estado.mapa || []).vInicio != null;
            const etiquetas = [ev.line, ...(ev.descriptors || [])].filter(Boolean);
            const dura = ev.end != null ? ev.end - ev.start : estado.tiempo - ev.start;
            const corte = estadoCorte.get(String(ev.id));
            const origen = o.origenDe ? o.origenDe(ev) : null;
            return `<div class="tv-captura-ev${grabando ? ' es-grabando' : ''}${conVideo ? '' : ' es-sinvideo'}" role="listitem" data-ev="${escapar(ev.id)}"
                        title="${conVideo ? 'Ver el clip' : 'Se marcó sin video'}">
                <span class="tv-captura-ev__color" style="background:${escapar(colorDeEvento(datos, ev))}"></span>
                <span class="tv-captura-ev__texto">
                    <span class="tv-captura-ev__nombre tv-recortar">${escapar(ev.name)}</span>
                    ${etiquetas.length ? `<span class="tv-captura-ev__etq tv-recortar">${escapar(etiquetas.join(' · '))}</span>` : ''}
                </span>
                ${origen ? `<span class="tv-chip">${escapar(origen)}</span>` : ''}
                ${!conVideo ? '<span class="tv-chip">sin video</span>' : ''}
                ${corte === 'hecho' ? `<span class="tv-captura-ev__corte" title="Clip guardado">${icono('check')}</span>` : ''}
                ${corte === 'pendiente' || corte === 'cortando' ? '<span class="tv-captura-ev__corte es-cortando" title="Cortando…">…</span>' : ''}
                ${corte === 'fallido' ? `<span class="tv-captura-ev__corte es-error" title="No se pudo cortar: se reintenta al terminar">${icono('alerta')}</span>` : ''}
                <span class="tv-captura-ev__tiempo tv-mono tv-numeros">${reloj(ev.start)}<small>${grabando ? '● ' : ''}${Math.max(0, Math.round(dura))} s</small></span>
                <span class="tv-captura-ev__acciones">
                    ${conVideo && !grabando && o.alCortar ? `<button type="button" class="tv-btn tv-btn--chico tv-btn--icono tv-btn--fantasma" data-accion="cortar" title="Guardar clip">${icono('tijera')}</button>` : ''}
                    ${!grabando && o.alBorrar ? `<button type="button" class="tv-btn tv-btn--chico tv-btn--icono tv-btn--fantasma" data-accion="borrar" title="Borrar">${icono('basura')}</button>` : ''}
                </span>
            </div>`;
        };
        lista.innerHTML = [...abiertos].reverse().map(ev => fila(ev, true)).join('') + eventos.map(ev => fila(ev, false)).join('');
    }

    return {
        raiz,
        pintar,
        repintar: () => pintar(ultimo.estado, ultimo.cortes),
        destruir() { raiz.remove(); }
    };
}

// ─────────────────────────────────────────────
// TIRA DE EVENTOS
// ─────────────────────────────────────────────
// Todo el partido de izquierda a derecha, cada evento en el color de su
// botón. Se ve de un vistazo dónde hubo actividad; clic → el clip.
export function crearTira(contenedor, o) {
    const datos = normalizar(o.datos);
    const pista = el('div', { class: 'tv-captura-tira__pista' });
    const ahora = el('div', { class: 'tv-captura-tira__ahora' });
    const raiz = el('div', { class: 'tv-captura-tira', title: 'Eventos del partido' }, pista, ahora);
    contenedor.append(raiz);
    const porId = new Map();
    pista.addEventListener('click', e => {
        const b = e.target.closest('[data-ev]');
        if (b && o.alVer && porId.has(b.dataset.ev)) o.alVer(porId.get(b.dataset.ev));
    });

    let firma = '';
    function pintar(estado) {
        if (!estado) return;
        // La escala crece de a 5 minutos: así los bloques no se corren a
        // cada segundo y se puede apuntar con el mouse.
        const total = Math.max(300, Math.ceil((estado.tiempo + 1) / 300) * 300);
        const evs = [...(estado.eventos || []).filter(e => !e.posesionDe), ...(estado.abiertos || [])];
        const f = total + '|' + evs.map(e => e.id + ':' + (e.end == null ? 'x' : Math.round(e.end))).join(',');
        ahora.style.left = Math.min(100, estado.tiempo / total * 100) + '%';
        if (f === firma) return;
        firma = f;
        porId.clear();
        pista.innerHTML = evs.map(ev => {
            porId.set(String(ev.id), ev);
            const fin = ev.end != null ? ev.end : estado.tiempo;
            const izq = ev.start / total * 100;
            const ancho = Math.max(0.25, (fin - ev.start) / total * 100);
            return `<button type="button" class="tv-captura-tira__ev" data-ev="${escapar(ev.id)}" title="${escapar(ev.name)} · ${reloj(ev.start)}"
                style="left:${izq.toFixed(3)}%;width:${ancho.toFixed(3)}%;background:${escapar(colorDeEvento(datos, ev))}"></button>`;
        }).join('');
    }
    return { raiz, pintar, destruir() { raiz.remove(); } };
}

// ─────────────────────────────────────────────
// VISOR DE CLIP
// ─────────────────────────────────────────────
/**
 * Superpuesto a la pantalla, sin tapar la botonera del todo (se puede seguir
 * marcando con el teclado). ±5 s, 0,5×/1×/2×, cuadro a cuadro y ✂.
 * @param o.alGuardarClip(info)  info = lo que se pasó en abrir()
 */
export function crearVisor(contenedor, o = {}) {
    const video = el('video', { class: 'tv-captura-visor__video', playsInline: true, controls: true });
    const titulo = el('span', { class: 'tv-captura-visor__titulo tv-recortar' });
    const rango = el('span', { class: 'tv-captura-visor__rango tv-chica tv-mono tv-texto-2' });
    const mensaje = el('div', { class: 'tv-captura-visor__mensaje', hidden: true });
    const btnGuardar = el('button', { type: 'button', class: 'tv-btn tv-btn--primario', onClick: () => { if (o.alGuardarClip && actual) o.alGuardarClip(actual.info); } },
        icono('tijera'), el('span', { texto: 'Guardar clip' }));
    const b = (texto, titulo, fn) => el('button', { type: 'button', class: 'tv-btn tv-btn--chico', title: titulo, onClick: fn, texto });
    const velocidades = [0.5, 1, 2].map(v => b(String(v).replace('.', ',') + '×', `Velocidad ${v}×`, () => velocidad(v)));
    velocidades.forEach((x, i) => { x.dataset.vel = [0.5, 1, 2][i]; });

    const raiz = el('div', { class: 'tv-captura-visor', hidden: true, role: 'dialog', 'aria-label': 'Clip' },
        el('div', { class: 'tv-captura-visor__caja' },
            el('div', { class: 'tv-captura-visor__cab' }, titulo, rango,
                el('button', { type: 'button', class: 'tv-btn tv-btn--icono tv-btn--fantasma', title: 'Cerrar (Esc)', onClick: () => cerrar() }, icono('cerrar'))),
            el('div', { class: 'tv-captura-visor__marco' }, video, mensaje),
            el('div', { class: 'tv-captura-visor__pie' },
                b('−5 s', 'Atrás 5 segundos (←)', () => saltar(-5)),
                b('◀ cuadro', 'Cuadro anterior (,)', () => cuadro(-1)),
                b('cuadro ▶', 'Cuadro siguiente (.)', () => cuadro(1)),
                b('+5 s', 'Adelante 5 segundos (→)', () => saltar(5)),
                el('span', { class: 'tv-captura-visor__sep' }),
                ...velocidades,
                b('↻ Otra vez', 'Desde el principio del clip', () => desdeElPrincipio()),
                el('span', { class: 'tv-barra__espacio' }),
                btnGuardar)));
    contenedor.append(raiz);
    raiz.addEventListener('pointerdown', e => { if (e.target === raiz) cerrar(); });

    let actual = null;   // { desde, hasta, fps, info }

    video.addEventListener('timeupdate', () => {
        if (actual && !video.paused && video.currentTime >= actual.hasta) video.pause();
    });
    video.addEventListener('error', () => {
        if (!actual) return;
        mensaje.hidden = false;
        mensaje.textContent = 'No se pudo abrir el video en ese tramo.';
    });

    function velocidad(v) {
        video.playbackRate = v;
        velocidades.forEach(x => x.classList.toggle('es-activo', Number(x.dataset.vel) === v));
    }
    function saltar(s) { video.currentTime = Math.max(0, video.currentTime + s); }
    function cuadro(n) {
        video.pause();
        video.currentTime = Math.max(0, video.currentTime + n / ((actual && actual.fps) || 30));
    }
    function desdeElPrincipio() {
        if (!actual) return;
        video.currentTime = actual.desde;
        video.play().catch(() => {});
    }

    /**
     * @param a.url     del archivo (tv.video.url) o null si todavía no hay
     * @param a.desde, a.hasta  segundos del archivo
     * @param a.titulo, a.fps, a.info (lo que vuelve en alGuardarClip)
     * @param a.puedeGuardar
     * @param a.sinVideo  texto a mostrar si no hay url
     */
    function abrir(a) {
        actual = { desde: a.desde, hasta: a.hasta, fps: a.fps || 30, info: a.info };
        titulo.textContent = a.titulo || 'Clip';
        rango.textContent = `${reloj(a.desde)} → ${reloj(a.hasta)} del video`;
        btnGuardar.hidden = !a.puedeGuardar;
        raiz.hidden = false;
        mensaje.hidden = true;
        velocidad(1);
        if (!a.url) {
            video.removeAttribute('src');
            video.load();
            mensaje.hidden = false;
            mensaje.textContent = a.sinVideo || 'Este evento no tiene video.';
            return;
        }
        video.pause();
        // El archivo en curso crece: la dirección cambia cada vez para que
        // el <video> pida el tamaño de ahora y no el que tenía la última vez.
        video.src = a.url + (a.url.includes('?') ? '&' : '?') + 'v=' + Date.now();
        video.addEventListener('loadedmetadata', () => {
            if (!actual) return;
            try { video.currentTime = actual.desde; } catch (_) {}
            video.play().catch(() => {});
        }, { once: true });
        video.load();
    }

    function cerrar() {
        if (raiz.hidden) return;
        actual = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        raiz.hidden = true;
        if (o.alCerrar) o.alCerrar();
    }

    // Teclas del visor abierto. Devuelve true si la usó.
    function teclas(e) {
        if (raiz.hidden) return false;
        const k = e.key;
        if (k === 'Escape') { cerrar(); return true; }
        if (k === 'ArrowLeft') { saltar(-5); return true; }
        if (k === 'ArrowRight') { saltar(5); return true; }
        if (k === ',') { cuadro(-1); return true; }
        if (k === '.') { cuadro(1); return true; }
        return false;
    }

    return { raiz, abrir, cerrar, teclas, abierto: () => !raiz.hidden, destruir() { cerrar(); raiz.remove(); } };
}

// ─────────────────────────────────────────────
// "▶ Ver" (aparece 6 s al marcar)
// ─────────────────────────────────────────────
export function crearAvisoVer(contenedor, o) {
    const btn = el('button', { type: 'button', class: 'tv-captura-ver', hidden: true, title: 'Ver el clip (R repite el último)' });
    contenedor.append(btn);
    let ev = null, t = null;
    btn.addEventListener('click', () => { btn.hidden = true; if (ev && o.alVer) o.alVer(ev); });
    return {
        mostrar(nuevo) {
            ev = nuevo;
            btn.replaceChildren(icono('play'), el('span', { texto: 'Ver: ' + nuevo.name }));
            btn.hidden = false;
            btn.classList.remove('es-entrando');
            void btn.offsetWidth;
            btn.classList.add('es-entrando');
            clearTimeout(t);
            t = setTimeout(() => { btn.hidden = true; }, 6000);
        },
        ultimo: () => ev,
        ocultar() { btn.hidden = true; },
        destruir() { clearTimeout(t); btn.remove(); }
    };
}

// ─────────────────────────────────────────────
// COLA DE CORTES (lo que se ve)
// ─────────────────────────────────────────────
export function crearColaVista(contenedor, cola) {
    const raiz = el('div', { class: 'tv-captura-cola', hidden: true });
    contenedor.append(raiz);
    function pintar(r) {
        const partes = [];
        const enCurso = r.pendientes + r.cortando;
        if (enCurso) partes.push(`<span class="tv-captura-cola__girando"></span> ${enCurso === 1 ? '1 clip cortándose…' : enCurso + ' clips cortándose…'}`);
        if (r.hechos) partes.push(`${icono('tijera')} ${r.hechos === 1 ? '1 clip' : r.hechos + ' clips'}`);
        if (r.fallidos) partes.push(`<span class="tv-captura-cola__error">${icono('alerta')} ${r.fallidos} sin cortar</span>`);
        raiz.hidden = !partes.length;
        raiz.innerHTML = partes.join('<span class="tv-captura-cola__sep"></span>');
        const errores = r.cortes.filter(c => c.estado === 'fallido').map(c => `${c.nombre}: ${c.error}`);
        raiz.title = errores.length ? 'Se reintentan al terminar.\n' + errores.join('\n') : 'Clips en Partidos/<nombre>/Clips';
    }
    const quitar = cola.alCambiar(pintar);
    pintar(cola.resumen());
    return { raiz, destruir() { quitar(); raiz.remove(); } };
}

// ─────────────────────────────────────────────
// CARTEL GRANDE (cámara caída, disco con error)
// ─────────────────────────────────────────────
export function crearCartel(contenedor) {
    const texto = el('span', { class: 'tv-captura-cartel__texto' });
    const acciones = el('span', { class: 'tv-captura-cartel__acciones' });
    const raiz = el('div', { class: 'tv-captura-cartel', hidden: true, role: 'alert' }, icono('alerta'), texto, acciones);
    contenedor.append(raiz);
    return {
        raiz,
        mostrar(msg, botones = []) {
            texto.textContent = msg;
            acciones.replaceChildren(...botones.map(bt => el('button', { type: 'button', class: 'tv-btn tv-btn--chico', onClick: bt.alHacer, texto: bt.texto })));
            raiz.hidden = false;
        },
        ocultar() { raiz.hidden = true; },
        visible: () => !raiz.hidden,
        destruir() { raiz.remove(); }
    };
}
